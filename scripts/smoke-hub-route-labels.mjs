#!/usr/bin/env node
/**
 * Live smoke check for route sublabels at the five busiest US hubs.
 * Dev/diagnostic only — does not feed the map.
 *
 * Usage: node scripts/smoke-hub-route-labels.mjs [--limit=5]
 */
import { mapFlightRouteSubLabel } from '../lib/flightRouteLabels.js';

const HUBS = [
  { code: 'ATL', lat: 33.6367, lon: -84.428067 },
  { code: 'LAX', lat: 33.942501, lon: -118.407997 },
  { code: 'ORD', lat: 41.9786, lon: -87.9048 },
  { code: 'DFW', lat: 32.896828, lon: -97.037997 },
  { code: 'DEN', lat: 39.856111, lon: -104.673778 },
];

const limitArg = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 6);
const COMMERCIAL = /^[A-Z]{2,3}\d+[A-Z]?$/;

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function lookupRoute(callsign) {
  const cs = String(callsign || '').trim().toUpperCase();
  if (!cs) return null;
  try {
    const res = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const route = body?.response?.flightroute;
    if (!route?.origin || !route?.destination) return null;
    return {
      orig_city: route.origin.municipality || route.origin.name,
      orig_iata: route.origin.iata_code,
      orig_lat: route.origin.latitude,
      orig_lon: route.origin.longitude,
      dest_city: route.destination.municipality || route.destination.name,
      dest_iata: route.destination.iata_code,
      dest_lat: route.destination.latitude,
      dest_lon: route.destination.longitude,
    };
  } catch {
    return null;
  }
}

function summarize(label) {
  return label?.text ?? '(blank)';
}

let total = 0;
let withRoute = 0;
let withLabel = 0;

for (const hub of HUBS) {
  await sleep(1500);
  const url = `https://api.adsb.lol/v2/point/${hub.lat}/${hub.lon}/50`;
  let body;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    body = await res.json();
  } catch (err) {
    console.log(`\n=== ${hub.code} — ADSB fetch failed: ${err.message} ===`);
    continue;
  }

  const candidates = (body.ac || [])
    .filter((ac) => ac.alt_baro !== 'ground' && Number(ac.alt_baro) < 4000 && Number(ac.alt_baro) > 300)
    .filter((ac) => COMMERCIAL.test(String(ac.flight || '').trim()))
    .slice(0, limitArg);

  console.log(`\n=== ${hub.code} commercial low-alt (n=${candidates.length}) ===`);
  for (const ac of candidates) {
    const callsign = String(ac.flight || '').trim();
    await sleep(200);
    const route = await lookupRoute(callsign);
    const flight = {
      callsign,
      lat: ac.lat,
      lon: ac.lon,
      alt: ac.alt_baro,
      track: ac.track,
      vspeed: ac.baro_rate,
      ...(route || {}),
    };
    const label = mapFlightRouteSubLabel(flight);
    total += 1;
    if (route) withRoute += 1;
    if (label) withLabel += 1;
    const routeStr = route ? `${route.orig_iata || '?'}→${route.dest_iata || '?'}` : 'no-route';
    console.log(
      `${callsign.padEnd(8)} alt=${String(ac.alt_baro).padStart(4)} trk=${String(Math.round(ac.track)).padStart(3)} ${routeStr.padEnd(12)} → ${summarize(label)}`
    );
  }
}

console.log(`\nSummary: ${total} flights, ${withRoute} with route, ${withLabel} with sublabel`);
