#!/usr/bin/env node
/**
 * Deep St. Louis metro fire/EMS dispatch probe.
 * Run: node scripts/probe-stl-dispatch-coverage.mjs [--write]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decryptPulsePointPayload } from '../api/lib/pulsePointCrypto.js';

const USER_AGENT = 'homescope-stl-probe/1.0';
const RECENT_MS = 4 * 60 * 60 * 1000;
const API = 'https://api.pulsepoint.org/v1/webapp';

const PULSEPOINT_QUERIES = [
  'St Louis', 'Saint Louis', 'STL', 'Affton', 'Mehlville', 'Florissant', 'Kirkwood', 'Clayton',
  'Creve Coeur', 'Maryland Heights', 'Hazelwood', 'Maplewood', 'University City', 'Belleville',
  'Edwardsville', 'O Fallon', 'St Peters', 'Chesterfield', 'Ballwin', 'Fenton', 'Arnold',
  'Jefferson County', 'Pattonville', 'Jennings', 'Ladue', 'Valley Park', 'Black Jack',
  'Spanish Lake', 'Riverview', 'East St Louis', 'Metro East', 'St Clair County', 'Madison County IL',
  'Robertson Fire', 'Monarch Fire', 'West County EMS', 'Rock Community', 'Central County',
];

const FIRE_DISTRICTS = [
  { name: 'Affton', urls: ['https://www.afftonfire.org/', 'https://afftonfire.org/'] },
  { name: 'Mehlville', urls: ['https://www.mehlvillefire.org/', 'https://mehlvillefire.org/'] },
  { name: 'Pattonville', urls: ['https://www.pattonvillefire.org/', 'https://pattonvillefire.org/'] },
  { name: 'Florissant Valley', urls: ['https://www.florissantvalleyfire.org/'] },
  { name: 'Robertson', urls: ['https://www.robertsonfire.org/'] },
  { name: 'Jennings', urls: ['https://www.jenningsfd.org/'] },
  { name: 'University City', urls: ['https://www.ucityfire.org/'] },
  { name: 'Maplewood', urls: ['https://www.maplewoodfire.org/'] },
  { name: 'Clayton', urls: ['https://www.claytonfire.org/'] },
  { name: 'Kirkwood', urls: ['https://www.kirkwoodfire.org/'] },
  { name: 'Ladue', urls: ['https://www.laduefire.org/'] },
  { name: 'Creve Coeur', urls: ['https://www.ccfire.org/', 'https://www.crevecoeurfire.org/'] },
  { name: 'Monarch', urls: ['https://www.monarchfire.org/'] },
  { name: 'Maryland Heights', urls: ['https://www.marylandheights.com/departments/fire-department'] },
  { name: 'Hazelwood', urls: ['https://www.hazelwoodmo.org/fire'] },
  { name: 'Black Jack', urls: ['https://www.blackjackfire.org/'] },
  { name: 'Spanish Lake', urls: ['https://www.spanishlakefire.org/'] },
  { name: 'Riverview', urls: ['https://www.riverviewfire.org/'] },
  { name: 'Valley Park', urls: ['https://www.valleyparkfire.org/'] },
  { name: 'St Louis City FD', urls: ['https://www.stlouis-mo.gov/government/departments/fire/'] },
];

const ARCGIS_SEARCHES = [
  'fire incidents St Louis Missouri FeatureServer',
  'EMS dispatch St Louis FeatureServer',
  '911 calls St Louis County FeatureServer',
  'CAD incidents Missouri FeatureServer',
  'emergency calls St Louis FeatureServer',
  'active incidents St Clair County Illinois FeatureServer',
  '911 Madison County Illinois FeatureServer',
];

const GIS_PORTALS = [
  { label: 'St Louis County GIS', base: 'https://gis.stlouisco.com/arcgis/rest/services' },
  { label: 'St Louis City GIS', base: 'https://stlouis-mo.gov/gis/rest/services' },
  { label: 'St Louis City GIS alt', base: 'https://services2.arcgis.com/8MUN8uU2L0O5p4j0/arcgis/rest/services' },
  { label: 'St Clair County IL', base: 'https://gis.co.st-clair.il.us/arcgis/rest/services' },
  { label: 'Madison County IL', base: 'https://gis.co.madison.il.us/arcgis/rest/services' },
  { label: 'Belleville IL', base: 'https://gis.belleville.net/arcgis/rest/services' },
];

const OPEN_DATA = [
  { name: 'St Louis County open data', url: 'https://data.stlouisco.com/api/views/metadata/v1' },
  { name: 'STL Data', url: 'https://www.stldata.org/api/views' },
  { name: 'Missouri data.mo.gov STL', url: 'https://data.mo.gov/api/views?q=fire' },
  { name: 'St Louis City Socrata', url: 'https://www.stlouis-mo.gov/data.cfm' },
];

const OTHER = [
  { name: 'SEMA Missouri', url: 'https://sema.dps.mo.gov/' },
  { name: 'MSHP crash report', url: 'https://www.mshp.dps.mo.gov/MSHPWeb/PatrolDivision/Traffic/CrashReports' },
  { name: 'MSHP GIS', url: 'https://gis.modot.mo.gov/arcgis/rest/services' },
];

const DATE_FIELDS = [
  'Alarm_DateTime', 'ResponseDate', 'dispatched', 'Call_Date_Time', 'datetime', 'DispatchDateTime',
  'call_timestamp', 'eventdatetime', 'EditDate', 'created_date',
];

function parseArgs() {
  return { write: process.argv.includes('--write') };
}

async function pulsePointSearch(token) {
  const url = `${API}?resource=searchagencies&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    headers: { Referer: 'https://web.pulsepoint.org/', Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  return decryptPulsePointPayload(body).searchagencies || [];
}

async function pulsePointProbe(agencyId) {
  const url = `${API}?resource=incidents&agencyid=${agencyId}`;
  const res = await fetch(url, {
    headers: { Referer: 'https://web.pulsepoint.org/' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = decryptPulsePointPayload(await res.json());
  return data?.incidents?.active || [];
}

function parseState(display1) {
  return String(display1 || '').match(/\[([A-Z]{2})\]\s*$/)?.[1] || null;
}

async function runPulsePointProbe() {
  const seen = new Set();
  const results = [];
  for (const q of PULSEPOINT_QUERIES) {
    let hits = [];
    try {
      hits = await pulsePointSearch(q);
    } catch (err) {
      results.push({ angle: 'pulsepoint', query: q, classification: 'GAP', note: err.message });
      continue;
    }
    for (const h of hits) {
      const agencyId = h.agencyid || h.id;
      if (seen.has(agencyId)) continue;
      seen.add(agencyId);
      const state = parseState(h.Display1);
      if (state !== 'MO' && state !== 'IL') {
        results.push({
          angle: 'pulsepoint',
          query: q,
          agencyId,
          display1: h.Display1,
          display2: h.Display2,
          state,
          classification: 'OUT_OF_SCOPE',
          note: 'Same city name outside MO/IL — ignored for STL wiring',
        });
        continue;
      }
      let active = [];
      let probeErr = null;
      try {
        active = await pulsePointProbe(agencyId);
      } catch (err) {
        probeErr = err.message;
      }
      results.push({
        angle: 'pulsepoint',
        query: q,
        agencyId,
        display1: h.Display1,
        display2: h.Display2,
        lat: h.lat,
        lng: h.lng,
        state,
        activeCount: active.length,
        classification: probeErr ? 'GAP' : active.length > 0 ? 'LIVE' : 'EMPTY',
        note: probeErr || null,
        sample: active[0]
          ? {
              type: active[0].PulsePointIncidentCallType,
              address: active[0].FullDisplayAddress?.slice(0, 80),
            }
          : null,
      });
      await new Promise((r) => setTimeout(r, 220));
    }
  }
  return results;
}

async function arcgisSearch(q) {
  const url = `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&num=15&f=json`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const body = await res.json();
  return (body.results || []).filter((r) => r.url && /FeatureServer|MapServer/i.test(r.url));
}

async function probeFeatureServer(url, layerId = 0) {
  const base = url.replace(/\/+\d+$/, '').replace(/\/+$/, '');
  const q = `${base}/${layerId}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=5&f=json`;
  try {
    const res = await fetch(q, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return { status: 'http', code: res.status };
    const data = await res.json();
    if (data.error) return { status: 'error', message: data.error.message };
    const feats = data.features || [];
    if (!feats.length) return { status: 'empty' };
    let coords = 0;
    let latest = 0;
    for (const f of feats) {
      const a = f.attributes || {};
      const y = f.geometry?.y ?? Number(a.latitude ?? a.Latitude);
      const x = f.geometry?.x ?? Number(a.longitude ?? a.Longitude);
      if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(y) <= 90) coords += 1;
      for (const field of DATE_FIELDS) {
        if (a[field] == null) continue;
        let ms = Number(a[field]);
        if (!Number.isFinite(ms) || ms < 1e11) ms = Date.parse(String(a[field]));
        if (Number.isFinite(ms) && ms > latest) latest = ms;
      }
    }
    const ageH = latest ? Math.round((Date.now() - latest) / 3600000) : null;
    let classification = 'GAP';
    if (coords === 0) classification = 'PARTIAL';
    else if (latest && Date.now() - latest <= RECENT_MS) classification = 'LIVE';
    else if (latest && Date.now() - latest <= 7 * 24 * 3600 * 1000) classification = 'PARTIAL';
    else if (latest) classification = 'STALE';
    else classification = 'PARTIAL';
    return {
      status: 'ok',
      coords,
      ageH,
      latestIso: latest ? new Date(latest).toISOString() : null,
      classification,
      fields: Object.keys(feats[0].attributes || {}).slice(0, 12),
    };
  } catch (err) {
    return { status: 'fail', message: err.message };
  }
}

async function listGisServices(base) {
  try {
    const res = await fetch(`${base}?f=json`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { status: 'http', code: res.status };
    const j = await res.json();
    const matches = [];
    for (const s of j.services || []) {
      if (/911|cad|dispatch|fire|ems|incident|emergency|active.?call|service.?call/i.test(s.name)) {
        matches.push(`${base}/${s.name}/${s.type}`);
      }
    }
    for (const folder of (j.folders || []).slice(0, 12)) {
      if (!/911|cad|dispatch|fire|ems|incident|emergency|public|safety/i.test(folder)) continue;
      try {
        const fr = await fetch(`${base}/${folder}?f=json`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) });
        if (!fr.ok) continue;
        const fj = await fr.json();
        for (const s of fj.services || []) {
          if (/911|cad|dispatch|fire|ems|incident|emergency|active/i.test(s.name)) {
            matches.push(`${base}/${folder}/${s.name}/${s.type}`);
          }
        }
      } catch {
        /* skip folder */
      }
    }
    return { status: 'ok', matches };
  } catch (err) {
    return { status: 'fail', message: err.message };
  }
}

async function runArcgisProbe() {
  const results = [];
  const seen = new Set();
  for (const q of ARCGIS_SEARCHES) {
    const hits = await arcgisSearch(q);
    for (const h of hits) {
      const base = h.url.replace(/\/+\d+$/, '').replace(/\/+$/, '');
      if (seen.has(base)) continue;
      seen.add(base);
      const probe = await probeFeatureServer(base, 0);
      results.push({
        angle: 'arcgis-search',
        query: q,
        title: h.title,
        url: base,
        ...probe,
      });
    }
  }
  for (const portal of GIS_PORTALS) {
    const listed = await listGisServices(portal.base);
    results.push({
      angle: 'arcgis-portal',
      label: portal.label,
      url: portal.base,
      ...listed,
    });
    if (listed.status === 'ok') {
      for (const svc of listed.matches || []) {
        const probe = await probeFeatureServer(svc.replace(/\/MapServer$|\/FeatureServer$/, '').replace(/\/(MapServer|FeatureServer)\/\d+$/, (m) => m), 0);
        // normalize service url for query
        const fsUrl = svc.replace(/\/MapServer\/\d+$/, '/MapServer/0').replace(/\/FeatureServer\/\d+$/, '/FeatureServer/0');
        const base = fsUrl.replace(/\/\d+$/, '');
        if (seen.has(base)) continue;
        seen.add(base);
        const p = await probeFeatureServer(base.includes('FeatureServer') || base.includes('MapServer') ? base.replace(/\/MapServer$/, '/FeatureServer') : base, 0);
        results.push({
          angle: 'arcgis-portal-service',
          portal: portal.label,
          url: svc,
          ...p,
        });
      }
    }
  }
  return results;
}

async function probeWebsite(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow',
    });
    const text = await res.text();
    const lower = text.toLowerCase();
    const hasCad =
      /currentcalls|cad\/public|p2c|active.?calls|live.?calls|dispatch.?log|incident.?map|current.?incidents/i.test(text) ||
      (lower.includes('dispatch') && lower.includes('address'));
    const hasIframe = /<iframe[^>]+(cad|dispatch|incident|pulsepoint|active911)/i.test(text);
    return {
      url,
      httpStatus: res.status,
      finalUrl: res.url,
      classification: res.ok && (hasCad || hasIframe) ? 'PARTIAL' : res.ok ? 'GAP' : 'GAP',
      note: res.ok
        ? hasCad || hasIframe
          ? 'Possible CAD embed keywords in HTML'
          : 'No public CAD/incident page detected'
        : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { url, classification: 'GAP', note: err.message };
  }
}

async function runCadEmbedProbe() {
  const results = [];
  for (const district of FIRE_DISTRICTS) {
    for (const url of district.urls) {
      const row = await probeWebsite(url);
      results.push({ angle: 'cad-embed', district: district.name, ...row });
    }
    // common CAD path guesses
    for (const guess of ['/current-calls', '/active-calls', '/dispatch', '/cad/currentcalls.aspx', '/p2c/cad/currentcalls.aspx']) {
      const base = district.urls[0]?.replace(/\/$/, '');
      if (!base) continue;
      try {
        const host = new URL(base).origin;
        const row = await probeWebsite(`${host}${guess}`);
        if (row.classification === 'PARTIAL') {
          results.push({ angle: 'cad-embed-guess', district: district.name, ...row });
        }
      } catch {
        /* skip invalid url */
      }
    }
  }
  return results;
}

async function runOpenDataProbe() {
  const results = [];
  for (const entry of OPEN_DATA) {
    try {
      const res = await fetch(entry.url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
      const text = await res.text();
      const dispatchHit = /dispatch|911|incident|fire.?call|ems|cad|emergency.?call/i.test(text);
      results.push({
        angle: 'open-data',
        name: entry.name,
        url: entry.url,
        httpStatus: res.status,
        classification: res.ok && dispatchHit ? 'PARTIAL' : 'GAP',
        note: res.ok
          ? dispatchHit
            ? 'Portal mentions dispatch/incident datasets — manual catalog review needed'
            : 'No dispatch dataset keywords in response'
          : `HTTP ${res.status}`,
        sample: text.slice(0, 200).replace(/\s+/g, ' '),
      });
    } catch (err) {
      results.push({ angle: 'open-data', name: entry.name, url: entry.url, classification: 'GAP', note: err.message });
    }
  }
  return results;
}

async function runOtherProbe() {
  const results = [];
  for (const entry of OTHER) {
    if (entry.url.includes('arcgis')) {
      const listed = await listGisServices(entry.url);
      results.push({ angle: 'other-gis', name: entry.name, url: entry.url, ...listed });
      continue;
    }
    const row = await probeWebsite(entry.url);
    results.push({ angle: 'other', name: entry.name, ...row, url: entry.url });
  }
  return results;
}

function summarize(findings) {
  const byAngle = {};
  const byClass = {};
  for (const f of findings) {
    byAngle[f.angle] = (byAngle[f.angle] || 0) + 1;
    const cls = f.classification || f.status || 'UNKNOWN';
    byClass[cls] = (byClass[cls] || 0) + 1;
  }
  return { byAngle, byClass };
}

async function main() {
  const { write } = parseArgs();
  console.log('STL dispatch deep probe starting…\n');

  const pulsepoint = await runPulsePointProbe();
  console.log(`PulsePoint: ${pulsepoint.length} results`);
  const arcgis = await runArcgisProbe();
  console.log(`ArcGIS: ${arcgis.length} results`);
  const cad = await runCadEmbedProbe();
  console.log(`CAD embeds: ${cad.length} results`);
  const openData = await runOpenDataProbe();
  console.log(`Open data: ${openData.length} results`);
  const other = await runOtherProbe();
  console.log(`Other: ${other.length} results`);

  const findings = [...pulsepoint, ...arcgis, ...cad, ...openData, ...other];
  const summary = summarize(findings);
  const livePulse = pulsepoint.filter((r) => r.classification === 'LIVE');
  const emptyPulse = pulsepoint.filter((r) => r.classification === 'EMPTY' && r.state === 'MO' || r.state === 'IL');
  const liveArcgis = arcgis.filter((r) => r.classification === 'LIVE');

  console.log('\nSummary:', summary);
  console.log(`LIVE PulsePoint (STL metro): ${livePulse.length}`);
  console.log(`EMPTY PulsePoint (MO/IL): ${emptyPulse.filter(r => r.classification === 'EMPTY').length}`);
  console.log(`LIVE ArcGIS: ${liveArcgis.length}`);

  const payload = {
    scannedAt: new Date().toISOString(),
    summary: {
      ...summary,
      livePulsePoint: livePulse.length,
      emptyPulsePointMoIl: pulsepoint.filter((r) => r.classification === 'EMPTY' && (r.state === 'MO' || r.state === 'IL')).length,
      liveArcgis: liveArcgis.length,
    },
    livePulsePoint: livePulse,
    emptyPulsePoint: pulsepoint.filter((r) => r.classification === 'EMPTY' && (r.state === 'MO' || r.state === 'IL')),
    liveArcgis,
    findings,
  };

  const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../config/stl-dispatch-probe.json');
  if (write) {
    await fs.writeFile(outPath, JSON.stringify(payload, null, 2));
    console.log(`\nWrote ${outPath}`);
  }

  if (livePulse.length) {
    console.log('\nLIVE PulsePoint agencies:');
    livePulse.forEach((r) => console.log(`  ${r.agencyId} (${r.activeCount}) ${r.display1}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
