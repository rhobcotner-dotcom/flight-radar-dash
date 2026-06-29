#!/usr/bin/env node
/**
 * Emergency incident coverage probe — ArcGIS, Socrata, PulsePoint, state portals.
 * Run: node scripts/probe-emergency-coverage.mjs
 */
import arcgisFeeds from '../config/emergency-arcgis-feeds.json' with { type: 'json' };
import cityFeeds from '../config/emergency-city-feeds.json' with { type: 'json' };
import pulsePointAgencies from '../config/emergency-pulsepoint-agencies.json' with { type: 'json' };
import { fetchArcgisEmsIncidents } from '../api/lib/arcgisEmsFeeds.js';
import { fetchCityEmsIncidents } from '../api/lib/cityEmsFeeds.js';
import { fetchPulsePointIncidents } from '../api/lib/pulsePointIncidents.js';

const ARCGIS_SEARCH_QUERIES = [
  'Montgomery County 911 Incidents',
  'FireMap_Incidents',
  'Emergency Incident Points',
  '911 Incidents FeatureServer',
];

async function arcgisOnlineSearch(q) {
  const url = `https://www.arcgis.com/sharing/rest/search?q=${encodeURIComponent(q)}&num=10&f=json`;
  const res = await fetch(url);
  const body = await res.json();
  return (body.results || []).filter((r) => r.url && /FeatureServer/.test(r.url));
}

console.log('=== Wired ArcGIS feeds ===');
for (const feed of arcgisFeeds.filter((f) => f.enabled)) {
  const bbox =
    feed.city === 'San Diego'
      ? { west: -117.5, south: 32.5, east: -116.9, north: 33.2 }
      : feed.region === 'PA'
        ? { west: -75.7, south: 40.0, east: -75.2, north: 40.4 }
        : { west: -81.5, south: 29.0, east: -81.0, north: 29.5 };
  const r = await fetchArcgisEmsIncidents(bbox);
  const sub = r.feeds?.find((f) => f.feed === feed.id);
  console.log(`${feed.id}: ${sub?.count ?? 0} incidents (${feed.city})`);
}

console.log('\n=== Wired Socrata feeds ===');
for (const feed of cityFeeds.filter((f) => f.enabled)) {
  const bbox =
    feed.id === 'seattle-fire-911'
      ? { west: -122.5, south: 47.5, east: -122.2, north: 47.7 }
      : feed.id === 'dallas-fire-dispatch'
        ? { west: -97.0, south: 32.6, east: -96.6, north: 33.0 }
        : { west: -75, south: 40, east: -73, north: 41 };
  const r = await fetchCityEmsIncidents(bbox);
  const sub = r.feeds?.find((f) => f.feed === feed.id);
  console.log(`${feed.id}: ${sub?.count ?? 0} incidents`);
}

console.log('\n=== PulsePoint agencies ===');
const ppBbox = { west: -125, south: 24, east: -66, north: 50 };
const pp = await fetchPulsePointIncidents(ppBbox);
const enabled = pulsePointAgencies.agencies.filter((a) => a.enabled);
console.log(`Configured: ${enabled.length} agencies`);
console.log(`Fetched in US bbox: ${pp.count ?? 0} incidents (${pp.agencyCount ?? pp.feeds?.length ?? 0} agencies polled)`);
for (const agency of enabled.slice(0, 10)) {
  const sub = pp.feeds?.find((f) => f.feed === agency.id);
  console.log(`  ${agency.city} ${agency.agencyId}: ${sub?.count ?? 0}`);
}
if (enabled.length > 10) console.log(`  … ${enabled.length - 10} more agencies`);

console.log('\n=== ArcGIS Online discovery (sample) ===');
for (const q of ARCGIS_SEARCH_QUERIES) {
  const hits = await arcgisOnlineSearch(q);
  console.log(`\n${q}:`);
  hits.slice(0, 5).forEach((h) => console.log(`  ${h.title} | ${h.url}`));
}

console.log('\n=== PulsePoint ===');
console.log('api.pulsepoint.org/v1/webapp?resource=incidents&agencyid=… → AES JSON (wired when agencies enabled)');
console.log('Legacy giba.php → SPA HTML (deprecated server-side path)');

console.log('\n=== NFIRS / NERIS ===');
console.log('NERIS api.neris.fsri.org — OAuth department credentials; no public national incident map API');

console.log('\nDone. See docs/EMERGENCY_CITY_COVERAGE.md for full audit.');
