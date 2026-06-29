#!/usr/bin/env node
/**
 * Probe GTFS-RT agency feeds and print availability summary.
 * Run: node scripts/probe-gtfs-rt-agencies.mjs
 *
 * Set env keys locally to probe authenticated feeds (never commit keys).
 */
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import bundledFeeds from '../config/gtfs-rt-rail-feeds.json' with { type: 'json' };
import bundled511 from '../config/511-rail-agencies.json' with { type: 'json' };
import { feedUrlWithAuth } from '../api/lib/transitAgencies.js';
import {
  extractVehiclePositions,
  flatten511Activities,
  isLikelyAuthOrTransportError,
  parse511VehicleActivity,
} from '../api/lib/gtfsRtClient.js';

async function countProtobufOrJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'homescope-probe/1.0', Accept: '*/*', ...headers },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const transportError = isLikelyAuthOrTransportError(buf);
  if (!res.ok) return { status: res.status, count: 0, withPos: 0, note: transportError || 'http-error' };
  if (transportError) return { status: res.status, count: 0, withPos: 0, note: transportError };

  if (buf[0] === 0x7b) {
    const body = JSON.parse(buf.toString());
    const entities = body.entity || body.vehicles || [];
    const withPos = (Array.isArray(entities) ? entities : []).filter((e) => {
      const lat = e.vehicle?.position?.latitude ?? e.latitude ?? e.lat;
      return Number.isFinite(lat) && lat !== 0;
    }).length;
    return { status: res.status, count: entities.length || 0, withPos };
  }

  try {
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);
    const positions = extractVehiclePositions(feed);
    return { status: res.status, count: feed.entity?.length || 0, withPos: positions.length };
  } catch {
    return { status: res.status, count: 0, withPos: 0, note: 'decode-failed' };
  }
}

async function count511(agencyCode, apiKey) {
  if (!apiKey) return { status: 'skip', count: 0, withPos: 0, note: 'API_511_KEY not set' };
  const url = `https://api.511.org/transit/VehicleMonitoring?api_key=${encodeURIComponent(apiKey)}&agency=${agencyCode}&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'homescope-probe/1.0', Accept: 'application/json' } });
  const body = await res.json();
  if (!res.ok) return { status: res.status, count: 0, withPos: 0, note: body?.message || 'http-error' };
  const withPos = flatten511Activities(body)
    .map((activity) => parse511VehicleActivity(activity))
    .filter(Boolean).length;
  return { status: res.status, count: flatten511Activities(body).length, withPos };
}

console.log('Agency\tStatus\tEntities\tWithGPS\tKeyEnv\tFormat\tConfigStatus\tNote');

for (const feed of bundledFeeds) {
  const auth = feedUrlWithAuth(feed);
  if (auth.skipped) {
    console.log(
      `${feed.name}\t-\t-\t-\t${feed.authEnv || 'none'}\t${feed.format}\t${feed.status || 'pending_key'}\t${auth.skipped}`
    );
    continue;
  }

  try {
    if (feed.format === 'metrolink-json') {
      const res = await fetch(auth.url, { headers: { ...auth.headers, Accept: 'application/json' } });
      const body = await res.json();
      const rows = body.vehicles || [];
      const withPos = rows.filter((row) => Number.isFinite(Number(row.latitude ?? row.lat))).length;
      console.log(
        `${feed.name}\t${res.status}\t${rows.length}\t${withPos}\t${feed.authEnv}\t${feed.format}\t${feed.status}\t`
      );
      continue;
    }

    const result = await countProtobufOrJson(auth.url, auth.headers);
    console.log(
      `${feed.name}\t${result.status}\t${result.count}\t${result.withPos}\t${feed.authEnv || 'none'}\t${feed.format}\t${feed.status || 'active'}\t${result.note || ''}`
    );
  } catch (err) {
    console.log(`${feed.name}\tERR\t0\t0\t${feed.authEnv || 'none'}\t${feed.format}\t${feed.status}\t${err.message}`);
  }
}

for (const agency of bundled511) {
  const result = await count511(agency.code, process.env.API_511_KEY);
  console.log(
    `511 ${agency.name}\t${result.status}\t${result.count}\t${result.withPos}\tAPI_511_KEY\tsiri-json\tpending_key\t${result.note || ''}`
  );
}
