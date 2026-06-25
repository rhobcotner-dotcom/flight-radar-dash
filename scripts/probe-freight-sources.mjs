#!/usr/bin/env node
/**
 * Documents every U.S. freight live-data source probed for the dashboard.
 * Run: node scripts/probe-freight-sources.mjs
 */
const SOURCES = [
  {
    id: 'houston-train-watch',
    kind: 'crossing',
    live: true,
    key: false,
    url: 'https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services/Train_CrossingStatus_Public_Current/FeatureServer/0/query',
    notes: 'Only public live crossing-status ArcGIS feed found (Houston metro). Wired in config/freight-crossing-feeds.json.',
  },
  {
    id: 'aprs-fi',
    kind: 'freight-gps',
    live: true,
    key: 'free at aprs.fi',
    url: 'https://api.aprs.fi/api/get',
    notes: 'Ham railfans on BNSF/UP/CSX lines. Best open option near STL when APRS_FI_API_KEY is set.',
  },
  {
    id: 'aprs-is',
    kind: 'freight-gps',
    live: true,
    key: 'ham callsign',
    url: 'noam.aprs2.net:14580',
    notes: 'N0CALL anonymous login blocked. Set APRS_CALLSIGN in .env.',
  },
  {
    id: 'highball',
    kind: 'passenger-today',
    live: true,
    key: 'auto data/highball.key',
    url: 'https://api.highballplatform.com/v1/trains',
    notes: 'Free key auto-provisioned. Passenger only today (is_freight false).',
  },
  {
    id: 'railstate',
    kind: 'freight-sensor',
    live: true,
    key: 'paid',
    url: 'https://api.railstate.com',
    notes: 'Trackside acoustic sensors. Commercial token required.',
  },
  {
    id: 'blockedtrax',
    kind: 'crossing',
    live: true,
    key: 'commercial',
    url: 'https://blockedtrax.com',
    notes: 'No public API. Mobile app / agency portal only.',
  },
  {
    id: 'trainfo',
    kind: 'crossing',
    live: true,
    key: 'commercial',
    url: 'https://trainfo.ca',
    notes: 'Municipal sensor network. API by contract.',
  },
  {
    id: 'oculus-rail',
    kind: 'crossing',
    live: true,
    key: 'commercial',
    url: 'https://oculusrail.com',
    notes: 'Crossing blockage sensors. Subscription/API by contract.',
  },
  {
    id: 'rail-watch',
    kind: 'atcs',
    live: 'sparse',
    key: false,
    url: 'https://rail.watch',
    notes: 'ATCS radio decode maps. Railroad radio migration reduced coverage; no JSON API.',
  },
  {
    id: 'bnsf-csx-up-apis',
    kind: 'freight-shipper',
    live: true,
    key: 'shipper account',
    url: 'https://www.bnsf.com/ship-with-bnsf/support-services/customer-api/',
    notes: 'Class-I tracing APIs require shipper registration. Not map-wide GPS.',
  },
  {
    id: 'fra-blocked-crossings',
    kind: 'incidents',
    live: false,
    key: false,
    url: 'https://services1.arcgis.com/4yjifSiIG17X0gW4/arcgis/rest/services/FRA_Blocked_Crossings_Incidents/FeatureServer',
    notes: 'Historical incident reports, not live blockages.',
  },
  {
    id: 'fra-ntad-crossings',
    kind: 'inventory',
    live: false,
    key: false,
    url: 'https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/NTAD_Railroad_Grade_Crossings/FeatureServer',
    notes: 'Static crossing inventory only.',
  },
];

async function probeLive() {
  const houstonUrl =
    'https://services.arcgis.com/NummVBqZSIJKUeVR/arcgis/rest/services/Train_CrossingStatus_Public_Current/FeatureServer/0/query?where=crossingStatus%3D%27blocked%27&returnCountOnly=true&f=json';
  const res = await fetch(houstonUrl, { headers: { 'User-Agent': 'flight-radar-dash-probe' } });
  const body = await res.json();
  return body.count ?? '?';
}

const blocked = await probeLive();
console.log(`Freight source audit (${SOURCES.length} entries)`);
console.log(`Houston blocked crossings right now: ${blocked}\n`);
for (const source of SOURCES) {
  console.log(`[${source.live === true ? 'LIVE' : source.live === false ? 'STATIC' : source.live}] ${source.id}`);
  console.log(`  kind: ${source.kind} | key: ${source.key}`);
  console.log(`  ${source.url}`);
  console.log(`  ${source.notes}\n`);
}
