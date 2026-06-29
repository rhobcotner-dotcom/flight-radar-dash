#!/usr/bin/env node
/**
 * Systematic ArcGIS Online / Hub discovery for live CAD/911 incident FeatureServers.
 * Run: node scripts/discover-arcgis-cad-feeds.mjs [--state FL] [--limit 50] [--write]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USER_AGENT = 'homescope-arcgis-discovery/1.0';
const RECENT_MS = 24 * 60 * 60 * 1000;
const PRIORITY_STATES = [
  'Florida', 'Pennsylvania', 'Texas', 'Virginia', 'North Carolina', 'Colorado',
  'Washington', 'Oregon', 'Arizona', 'Georgia', 'Ohio', 'Michigan', 'Minnesota', 'Wisconsin',
  'California', 'New York', 'Illinois', 'Maryland', 'New Jersey', 'Tennessee', 'Missouri',
  'Indiana', 'Alabama', 'South Carolina', 'Louisiana', 'Kentucky', 'Oklahoma', 'Iowa',
  'Arkansas', 'Mississippi', 'Kansas', 'Utah', 'Nevada', 'New Mexico', 'Connecticut',
  'Massachusetts', 'Maine', 'New Hampshire', 'Vermont', 'Rhode Island', 'Delaware',
  'West Virginia', 'Idaho', 'Montana', 'Wyoming', 'North Dakota', 'South Dakota',
  'Nebraska', 'Alaska', 'Hawaii',
];

const KEYWORDS = [
  '911 Incidents FeatureServer',
  'CAD dispatch incidents',
  'FireMap_Incidents',
  'active fire incidents CAD',
  'emergency incident points dispatch',
  'county 911 incidents',
];

const DATE_FIELD_CANDIDATES = [
  'ResponseDate', 'dispatched', 'DispatchDateTime', 'Call_DateandTime', 'datetime',
  'incident_datetime', 'Alarm_DateTime', 'CallReceived', 'CALL_RECEIVED', 'Start_Date',
  'Last_Updated', 'created_date', 'EditDate', 'incident_date', 'Date',
];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { state: null, limit: 80, write: false };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--state') opts.state = args[++i];
    if (args[i] === '--limit') opts.limit = Number(args[++i]) || 80;
    if (args[i] === '--write') opts.write = true;
  }
  return opts;
}

async function arcgisSearch(q, num = 20) {
  const url = `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&num=${num}&f=json`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.results || []).filter((r) => r.url && /FeatureServer/i.test(r.url));
}

function normalizeFeatureServerUrl(url) {
  return String(url).replace(/\/+$/, '').replace(/\/\d+$/, '');
}

async function probeFeatureServer(baseUrl, layerId = 0) {
  const queryUrl = `${baseUrl}/${layerId}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=5&f=json&orderByFields=OBJECTID%20DESC`;
  const metaUrl = `${baseUrl}/${layerId}?f=json`;
  try {
    const [qRes, mRes] = await Promise.all([
      fetch(queryUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(12000) }),
      fetch(metaUrl, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) }),
    ]);
    if (!qRes.ok) return { status: 'http', code: qRes.status };
    const data = await qRes.json();
    if (data.error) return { status: 'error', message: data.error.message || 'query error' };
    const meta = mRes.ok ? await mRes.json() : {};
    const features = data.features || [];
    if (!features.length) return { status: 'empty', geometryType: meta.geometryType };

    let withCoords = 0;
    let latestMs = 0;
    let sampleAddress = null;
    let sampleType = null;
    const fieldNames = Object.keys(features[0].attributes || {});

    for (const f of features) {
      const a = f.attributes || {};
      const x = f.geometry?.x ?? Number(a.Longitude ?? a.longitude ?? a.lon);
      const y = f.geometry?.y ?? Number(a.Latitude ?? a.latitude ?? a.lat);
      if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(y) <= 90 && Math.abs(x) <= 180) withCoords += 1;

      for (const field of DATE_FIELD_CANDIDATES) {
        if (a[field] == null) continue;
        const raw = a[field];
        let ms = Number(raw);
        if (!Number.isFinite(ms) || ms < 1e11) ms = Date.parse(String(raw));
        if (Number.isFinite(ms) && ms > latestMs) latestMs = ms;
      }

      sampleAddress =
        sampleAddress ||
        a.Address ||
        a.address ||
        a.location ||
        a.FullDisplayAddress ||
        a.Location_Name ||
        null;
      sampleType = sampleType || a.incidenttype || a.ProblemDescription || a.Incident_Type || a.type || null;
    }

    const ageMs = latestMs ? Date.now() - latestMs : null;
    const classification =
      withCoords === 0
        ? 'no-coords'
        : ageMs != null && ageMs <= RECENT_MS
          ? 'LIVE'
          : ageMs != null && ageMs <= 7 * 24 * 3600 * 1000
            ? 'RECENT'
            : ageMs != null
              ? 'STALE'
              : 'UNKNOWN-RECENCY';

    return {
      status: 'ok',
      featureCount: features.length,
      withCoords,
      geometryType: meta.geometryType || (features[0].geometry ? 'point' : 'none'),
      latestMs: latestMs || null,
      latestIso: latestMs ? new Date(latestMs).toISOString() : null,
      ageHours: ageMs != null ? Math.round(ageMs / 3600000) : null,
      classification,
      fieldNames: fieldNames.slice(0, 20),
      sampleAddress,
      sampleType,
      description: meta.description?.slice?.(0, 200) || meta.name || null,
    };
  } catch (err) {
    return { status: 'fail', message: err.message };
  }
}

async function main() {
  const opts = parseArgs();
  const states = opts.state ? [opts.state] : PRIORITY_STATES;
  const seen = new Set();
  const candidates = [];

  for (const state of states) {
    for (const kw of KEYWORDS) {
      const q = `${kw} ${state}`;
      const hits = await arcgisSearch(q, 15);
      for (const hit of hits) {
        const base = normalizeFeatureServerUrl(hit.url);
        if (seen.has(base)) continue;
        seen.add(base);
        candidates.push({ title: hit.title, url: base, state, query: q });
        if (candidates.length >= opts.limit) break;
      }
      if (candidates.length >= opts.limit) break;
    }
    if (candidates.length >= opts.limit) break;
  }

  console.log(`Probing ${candidates.length} unique FeatureServer candidates...\n`);
  const results = [];
  for (const c of candidates) {
    const probe = await probeFeatureServer(c.url, 0);
    const row = { ...c, probe };
    results.push(row);
    if (probe.status === 'ok' && (probe.classification === 'LIVE' || probe.classification === 'RECENT')) {
      console.log(`✓ ${probe.classification} | ${c.title} | ${c.url} | coords ${probe.withCoords}/${probe.featureCount} | age ${probe.ageHours ?? '?'}h`);
    }
  }

  const live = results.filter((r) => r.probe?.classification === 'LIVE');
  const recent = results.filter((r) => r.probe?.classification === 'RECENT');
  const needsWork = results.filter(
    (r) =>
      r.probe?.status === 'ok' &&
      r.probe.withCoords > 0 &&
      !['LIVE', 'RECENT'].includes(r.probe.classification)
  );

  console.log(`\nSummary: ${live.length} LIVE (24h), ${recent.length} RECENT (7d), ${needsWork.length} stale-with-coords, ${results.length} probed`);

  const outDir = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.join(outDir, '../config/emergency-arcgis-discovery.json');
  await fs.writeFile(
    outPath,
    JSON.stringify({ scannedAt: new Date().toISOString(), live, recent, needsWork, all: results }, null, 2)
  );
  console.log(`Wrote ${outPath}`);

  if (opts.write && live.length) {
    console.log('\nUse scripts/merge-arcgis-discovery.mjs to merge LIVE feeds into config.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
