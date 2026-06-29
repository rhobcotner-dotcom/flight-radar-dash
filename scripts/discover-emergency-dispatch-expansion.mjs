#!/usr/bin/env node
/**
 * Multi-angle emergency dispatch discovery for dark states / missed sources.
 * Angles: ArcGIS Hub sweep, county GIS REST, PulsePoint state search,
 * CAD vendor P2C probes, state 511 APIs, Broadcastify/OpenMHz/Waze checks.
 *
 * Run: node scripts/discover-emergency-dispatch-expansion.mjs [--write]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptPulsePointPayload } from '../api/lib/pulsePointCrypto.js';

const USER_AGENT = 'homescope-dispatch-expansion/1.0';
const RECENT_MS = 4 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 3600 * 1000;

const DARK_STATES = [
  'MA', 'RI', 'CT', 'NJ', 'MD', 'TN', 'KY', 'AL', 'LA', 'MI', 'IN', 'KS', 'OK',
  'NM', 'CO', 'UT', 'MT', 'WY', 'ND', 'SD', 'IA',
];

const ARCGIS_QUERIES = [
  'fire incidents live dispatch',
  'EMS incidents active',
  '911 calls for service',
  'CAD incidents public',
  'emergency dispatch active',
  'active calls FeatureServer',
];

const DATE_FIELDS = [
  'Alarm_DateTime', 'ResponseDate', 'dispatched', 'eventdatetime', 'Call_DateandTime',
  'Call_Date_Time', 'datetime', 'DispatchDateTime', 'CallReceived', 'EditDate',
  'created_date', 'Date', 'call_timestamp', 'ReportDate',
];

const P2C_HOSTS = [
  'p2c.nhcgov.com',
  'p2c.montgomerycountymd.gov',
  'p2c.indy.gov',
];

const STATE_511_URLS = [
  { name: 'PA 511', url: 'https://511pa.com/api/events?format=json' },
  { name: 'OH OHGO', url: 'https://ohgo.com/api/events?format=json' },
  { name: 'CO COtrip', url: 'https://www.cotrip.org/api/events?format=json' },
  { name: 'TX DriveTexas', url: 'https://drivetexas.org/api/events?format=json' },
];

function parseArgs() {
  const write = process.argv.includes('--write');
  return { write };
}

async function arcgisSearch(q, num = 20) {
  const url = `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&num=${num}&f=json`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.results || []).filter((r) => r.url && /FeatureServer/i.test(r.url));
}

function normalizeUrl(url) {
  return String(url).replace(/\/+$/, '').replace(/\/\d+$/, '');
}

async function probeFeatureServer(baseUrl, layerId = 0) {
  const queryUrl = `${baseUrl}/${layerId}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=5&f=json`;
  try {
    const res = await fetch(queryUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { status: 'http', code: res.status };
    const data = await res.json();
    if (data.error) return { status: 'error', message: data.error.message };
    const features = data.features || [];
    if (!features.length) return { status: 'empty' };

    let withCoords = 0;
    let withAddress = 0;
    let latestMs = 0;
    let orderField = null;

    for (const f of features) {
      const a = f.attributes || {};
      const x = f.geometry?.x ?? Number(a.Longitude ?? a.longitude ?? a.lon);
      const y = f.geometry?.y ?? Number(a.Latitude ?? a.latitude ?? a.lat);
      if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(y) <= 90 && Math.abs(y) > 0.01) withCoords += 1;
      if (a.Address || a.address || a.Block_Location || a.location || a.incident_address) withAddress += 1;

      for (const field of DATE_FIELDS) {
        if (a[field] == null) continue;
        let ms = Number(a[field]);
        if (!Number.isFinite(ms) || ms < 1e11) ms = Date.parse(String(a[field]));
        if (Number.isFinite(ms) && ms > latestMs) {
          latestMs = ms;
          orderField = field;
        }
      }
    }

    const ageMs = latestMs ? Date.now() - latestMs : null;
    let classification = 'GAP';
    if (withCoords === 0 && withAddress === 0) classification = 'GAP';
    else if (withCoords === 0 && withAddress > 0) classification = ageMs != null && ageMs <= RECENT_MS ? 'GEOCODED' : 'PARTIAL';
    else if (ageMs != null && ageMs <= RECENT_MS) classification = 'LIVE';
    else if (ageMs != null && ageMs <= WEEK_MS) classification = 'PARTIAL';
    else if (ageMs != null) classification = 'STALE';
    else classification = withCoords > 0 ? 'PARTIAL' : 'GEOCODED';

    return {
      status: 'ok',
      withCoords,
      withAddress,
      latestIso: latestMs ? new Date(latestMs).toISOString() : null,
      ageHours: ageMs != null ? Math.round(ageMs / 3600000) : null,
      orderField,
      classification,
      sampleFields: Object.keys(features[0].attributes || {}).slice(0, 12),
    };
  } catch (err) {
    return { status: 'fail', message: err.message };
  }
}

async function pulsePointDarkStateSweep() {
  const API = 'https://api.pulsepoint.org/v1/webapp';
  const results = [];
  const seen = new Set();

  for (const st of DARK_STATES) {
    for (const token of [st, `${st} Fire`, `${st} EMS`]) {
      const url = `${API}?resource=searchagencies&token=${encodeURIComponent(token)}`;
      try {
        const res = await fetch(url, {
          headers: { Referer: 'https://web.pulsepoint.org/', Accept: 'application/json' },
          signal: AbortSignal.timeout(12000),
        });
        const enc = await res.json();
        const hits = decryptPulsePointPayload(enc).searchagencies || [];
        for (const h of hits) {
          const state = String(h.Display1 || '').match(/\[([A-Z]{2})\]/)?.[1];
          if (state !== st) continue;
          const agencyId = h.agencyid || h.id;
          if (seen.has(agencyId)) continue;
          seen.add(agencyId);

          let activeCount = 0;
          try {
            const probeUrl = `${API}?resource=incidents&agencyid=${agencyId}`;
            const probeRes = await fetch(probeUrl, {
              headers: { Referer: 'https://web.pulsepoint.org/' },
              signal: AbortSignal.timeout(12000),
            });
            const probeData = decryptPulsePointPayload(await probeRes.json());
            activeCount = (probeData?.incidents?.active || []).length;
          } catch {
            activeCount = null;
          }

          results.push({
            angle: 'pulsepoint-dark-state',
            state: st,
            agencyId,
            title: h.Display1,
            subtitle: h.Display2,
            activeCount,
            classification: activeCount > 0 ? 'LIVE' : activeCount === 0 ? 'EMPTY' : 'GAP',
            url: `${API}?resource=incidents&agencyid=${agencyId}`,
          });
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch {
        /* skip token */
      }
    }
  }

  return results;
}

async function probeP2cHosts() {
  const results = [];
  for (const host of P2C_HOSTS) {
    const url = `https://${host}/p2c/cad/currentcalls.aspx`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      const text = await res.text();
      const hasTable = /incident|dispatch|call.?type|address|unit/i.test(text);
      results.push({
        angle: 'cad-p2c-tyler',
        host,
        url,
        httpStatus: res.status,
        classification: res.ok && hasTable ? 'PARTIAL' : 'GAP',
        note: res.ok && hasTable
          ? 'HTML table present; no stable JSON API — needs per-host scraper'
          : 'Unreachable or no CAD table',
      });
    } catch (err) {
      results.push({
        angle: 'cad-p2c-tyler',
        host,
        url,
        classification: 'GAP',
        note: err.message,
      });
    }
  }
  return results;
}

async function probeState511() {
  const results = [];
  for (const entry of STATE_511_URLS) {
    try {
      const res = await fetch(entry.url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const ct = res.headers.get('content-type') || '';
      const text = await res.text();
      const isJson = text.startsWith('{') || text.startsWith('[');
      let fireEms = false;
      if (isJson) {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : parsed.events || parsed.data || [];
        if (Array.isArray(arr)) {
          fireEms = arr.some((row) =>
            /fire|ems|medical|rescue|hazmat|mutual/i.test(
              JSON.stringify(row.type || row.eventType || row.category || row.description || '')
            )
          );
        }
      }
      results.push({
        angle: 'state-police-511',
        name: entry.name,
        url: entry.url,
        httpStatus: res.status,
        contentType: ct,
        classification: isJson && fireEms ? 'PARTIAL' : 'GAP',
        note: isJson
          ? fireEms
            ? 'JSON events may include fire/EMS categories but mostly traffic'
            : 'JSON without fire/EMS incident types'
          : 'Not JSON — SPA or blocked',
      });
    } catch (err) {
      results.push({
        angle: 'state-police-511',
        name: entry.name,
        url: entry.url,
        classification: 'GAP',
        note: err.message,
      });
    }
  }
  return results;
}

async function probeScannerMetadata() {
  const checks = [
    { name: 'Broadcastify calls API', url: 'https://api.broadcastify.com/calls/' },
    { name: 'OpenMHz all calls', url: 'https://api.openmhz.com/s/all/calls' },
    { name: 'Waze partner hub', url: 'https://www.waze.com/row-partnerhub-api/partners' },
  ];
  const results = [];
  for (const c of checks) {
    try {
      const res = await fetch(c.url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();
      const isJson = text.startsWith('{') || text.startsWith('[');
      results.push({
        angle: c.name.includes('Broadcastify')
          ? 'broadcastify-metadata'
          : c.name.includes('OpenMHz')
            ? 'openmhz-metadata'
            : 'waze-ccp',
        name: c.name,
        url: c.url,
        httpStatus: res.status,
        classification: isJson ? 'PARTIAL' : 'GAP',
        note: isJson ? 'Unexpected JSON — manual review needed' : 'No public structured incident API',
      });
    } catch (err) {
      results.push({
        angle: 'scanner-metadata',
        name: c.name,
        url: c.url,
        classification: 'GAP',
        note: err.message,
      });
    }
  }
  return results;
}

async function arcgisHubSweep() {
  const seen = new Set();
  const candidates = [];

  for (const q of ARCGIS_QUERIES) {
    const hits = await arcgisSearch(q, 25);
    for (const hit of hits) {
      const base = normalizeUrl(hit.url);
      if (seen.has(base)) continue;
      seen.add(base);
      candidates.push({ title: hit.title, url: base, query: q });
    }
  }

  const results = [];
  for (const c of candidates.slice(0, 60)) {
    const probe = await probeFeatureServer(c.url, 0);
    if (probe.status !== 'ok') continue;
    if (probe.classification === 'GAP') continue;
    results.push({
      angle: 'arcgis-hub-sweep',
      title: c.title,
      url: c.url,
      query: c.query,
      ...probe,
    });
  }
  return results;
}

function summarize(findings) {
  const byClass = {};
  for (const row of findings) {
    const cls = row.classification || 'UNKNOWN';
    byClass[cls] = (byClass[cls] || 0) + 1;
  }
  return byClass;
}

async function main() {
  const { write } = parseArgs();
  console.log('Running multi-angle emergency dispatch expansion discovery…\n');

  const [arcgis, pulsepoint, p2c, state511, scanner] = await Promise.all([
    arcgisHubSweep(),
    pulsePointDarkStateSweep(),
    probeP2cHosts(),
    probeState511(),
    probeScannerMetadata(),
  ]);

  const findings = [...arcgis, ...pulsepoint, ...p2c, ...state511, ...scanner];
  const liveArcgis = arcgis.filter((r) => r.classification === 'LIVE');
  const livePulse = pulsepoint.filter((r) => r.classification === 'LIVE');
  const wiredPulse = livePulse.filter((r) =>
    ['ND', 'SD', 'IA', 'IN', 'KS', 'OK', 'CO', 'UT', 'MT', 'WY', 'MD', 'NJ', 'TN', 'KY', 'AL', 'LA'].includes(r.state)
  );

  console.log(`ArcGIS candidates: ${arcgis.length} (${liveArcgis.length} LIVE)`);
  console.log(`PulsePoint dark-state agencies: ${pulsepoint.length} (${livePulse.length} LIVE)`);
  console.log(`P2C hosts probed: ${p2c.length}`);
  console.log(`State 511 endpoints: ${state511.length}`);
  console.log(`Scanner/Waze checks: ${scanner.length}`);
  console.log('Classification totals:', summarize(findings));

  const outDir = path.dirname(fileURLToPath(import.meta.url));
  const jsonPath = path.join(outDir, '../config/emergency-dispatch-expansion-discovery.json');
  const payload = {
    scannedAt: new Date().toISOString(),
    summary: {
      findings: findings.length,
      liveArcgis: liveArcgis.length,
      livePulsePointDarkState: livePulse.length,
      wiredPulsePointDarkState: wiredPulse.length,
      classifications: summarize(findings),
    },
    liveArcgis,
    livePulsePoint: livePulse,
    findings,
  };

  if (write) {
    await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2));
    console.log(`\nWrote ${jsonPath}`);
  } else {
    console.log(`\nDry run — pass --write to save ${jsonPath}`);
  }

  if (liveArcgis.length) {
    console.log('\nLIVE ArcGIS layers:');
    liveArcgis.slice(0, 10).forEach((r) => console.log(`  ${r.title} | ${r.url}`));
  }
  if (wiredPulse.length) {
    console.log('\nLIVE PulsePoint (dark states, sample):');
    wiredPulse.slice(0, 12).forEach((r) =>
      console.log(`  ${r.state} ${r.agencyId} active=${r.activeCount} | ${r.title}`)
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
