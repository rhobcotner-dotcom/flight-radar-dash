#!/usr/bin/env node
/**
 * Discover PulsePoint agency IDs for major US metros via searchagencies + probe.
 * Run: node scripts/discover-pulsepoint-agencies.mjs [--write-config] [--probe-only]
 *
 * API: GET https://api.pulsepoint.org/v1/webapp?resource=searchagencies&token={query}
 * Response (decrypted): { searchagencies: [{ Type, Display1, Display2, id, lat, lng, agencyid }] }
 */
import { writeFileSync } from 'node:fs';
import { decryptPulsePointPayload } from '../api/lib/pulsePointCrypto.js';

const API_BASE = 'https://api.pulsepoint.org/v1/webapp';
const SEARCH_DELAY_MS = 220;
const PROBE_DELAY_MS = 280;

/** @type {Array<{ region: string, city: string, state: string, queries: string[] }>} */
const TARGET_METROS = [
  { region: 'Northeast', city: 'Boston', state: 'MA', queries: ['Boston', 'Boston Fire', 'Suffolk County'] },
  { region: 'Northeast', city: 'Providence', state: 'RI', queries: ['Providence', 'Providence Fire'] },
  { region: 'Northeast', city: 'Hartford', state: 'CT', queries: ['Hartford', 'Hartford Fire'] },
  { region: 'Northeast', city: 'New Haven', state: 'CT', queries: ['New Haven', 'New Haven Fire'] },
  { region: 'Northeast', city: 'Albany', state: 'NY', queries: ['Albany', 'Albany Fire'] },
  { region: 'Northeast', city: 'Buffalo', state: 'NY', queries: ['Buffalo', 'Buffalo Fire', 'Erie County'] },
  { region: 'Northeast', city: 'Pittsburgh', state: 'PA', queries: ['Pittsburgh', 'Pittsburgh Fire', 'Allegheny'] },
  { region: 'Northeast', city: 'Philadelphia', state: 'PA', queries: ['Philadelphia', 'Philadelphia Fire', 'Philly'] },
  { region: 'Northeast', city: 'Baltimore', state: 'MD', queries: ['Baltimore', 'Baltimore City', 'Baltimore County'] },
  { region: 'Northeast', city: 'Washington', state: 'DC', queries: ['Washington DC', 'DC Fire', 'Arlington'] },
  { region: 'Northeast', city: 'Richmond', state: 'VA', queries: ['Richmond', 'Richmond Fire'] },
  { region: 'Northeast', city: 'Norfolk', state: 'VA', queries: ['Norfolk', 'Virginia Beach', 'Hampton Roads'] },
  { region: 'Southeast', city: 'Atlanta', state: 'GA', queries: ['Atlanta', 'Atlanta Fire', 'Fulton County'] },
  { region: 'Southeast', city: 'Charlotte', state: 'NC', queries: ['Charlotte', 'Charlotte Fire', 'Mecklenburg'] },
  { region: 'Southeast', city: 'Raleigh', state: 'NC', queries: ['Raleigh', 'Raleigh Fire', 'Wake County'] },
  { region: 'Southeast', city: 'Durham', state: 'NC', queries: ['Durham', 'Durham Fire'] },
  { region: 'Southeast', city: 'Jacksonville', state: 'FL', queries: ['Jacksonville', 'JFRD', 'Duval County'] },
  { region: 'Southeast', city: 'Orlando', state: 'FL', queries: ['Orlando', 'Orange County FL'] },
  { region: 'Southeast', city: 'Tampa', state: 'FL', queries: ['Tampa', 'Hillsborough', 'Tampa Fire'] },
  { region: 'Southeast', city: 'Miami', state: 'FL', queries: ['Miami', 'Miami-Dade', 'Miami Fire'] },
  { region: 'Southeast', city: 'Fort Lauderdale', state: 'FL', queries: ['Fort Lauderdale', 'Broward'] },
  { region: 'Southeast', city: 'Nashville', state: 'TN', queries: ['Nashville', 'Nashville Fire', 'Davidson County'] },
  { region: 'Southeast', city: 'Memphis', state: 'TN', queries: ['Memphis', 'Memphis Fire', 'Shelby County'] },
  { region: 'Southeast', city: 'Louisville', state: 'KY', queries: ['Louisville', 'Louisville Fire', 'Jefferson County KY'] },
  { region: 'Southeast', city: 'Birmingham', state: 'AL', queries: ['Birmingham', 'Birmingham Fire'] },
  { region: 'Southeast', city: 'New Orleans', state: 'LA', queries: ['New Orleans', 'NOFD', 'Orleans Parish'] },
  { region: 'Midwest', city: 'Chicago', state: 'IL', queries: ['Chicago', 'Chicago Fire', 'CFD'] },
  { region: 'Midwest', city: 'Detroit', state: 'MI', queries: ['Detroit', 'Detroit Fire'] },
  { region: 'Midwest', city: 'Cleveland', state: 'OH', queries: ['Cleveland', 'Cleveland Fire', 'Cuyahoga'] },
  { region: 'Midwest', city: 'Columbus', state: 'OH', queries: ['Columbus', 'Columbus Fire', 'Franklin County OH'] },
  { region: 'Midwest', city: 'Cincinnati', state: 'OH', queries: ['Cincinnati', 'Cincinnati Fire', 'Hamilton County OH'] },
  { region: 'Midwest', city: 'Indianapolis', state: 'IN', queries: ['Indianapolis', 'Indianapolis Fire', 'Marion County IN'] },
  { region: 'Midwest', city: 'Milwaukee', state: 'WI', queries: ['Milwaukee', 'Milwaukee Fire'] },
  { region: 'Midwest', city: 'Minneapolis', state: 'MN', queries: ['Minneapolis', 'Minneapolis Fire', 'Hennepin'] },
  { region: 'Midwest', city: 'St Paul', state: 'MN', queries: ['St Paul', 'Saint Paul Fire', 'Ramsey County'] },
  { region: 'Midwest', city: 'Kansas City', state: 'MO', queries: ['Kansas City', 'KCFD', 'Jackson County MO'] },
  { region: 'Midwest', city: 'St Louis', state: 'MO', queries: ['St Louis', 'Saint Louis Fire'] },
  { region: 'Midwest', city: 'Omaha', state: 'NE', queries: ['Omaha', 'Omaha Fire', 'Douglas County NE'] },
  { region: 'Midwest', city: 'Des Moines', state: 'IA', queries: ['Des Moines', 'Des Moines Fire'] },
  { region: 'Southwest', city: 'Dallas', state: 'TX', queries: ['Dallas', 'Dallas Fire', 'DFR'] },
  { region: 'Southwest', city: 'Fort Worth', state: 'TX', queries: ['Fort Worth', 'Fort Worth Fire', 'Tarrant County'] },
  { region: 'Southwest', city: 'Houston', state: 'TX', queries: ['Houston', 'Houston Fire', 'HFD'] },
  { region: 'Southwest', city: 'San Antonio', state: 'TX', queries: ['San Antonio', 'SAFD', 'Bexar County'] },
  { region: 'Southwest', city: 'Austin', state: 'TX', queries: ['Austin', 'Austin Fire', 'AFD'] },
  { region: 'Southwest', city: 'El Paso', state: 'TX', queries: ['El Paso', 'El Paso Fire'] },
  { region: 'Southwest', city: 'Phoenix', state: 'AZ', queries: ['Phoenix', 'Phoenix Fire', 'Maricopa'] },
  { region: 'Southwest', city: 'Tucson', state: 'AZ', queries: ['Tucson', 'Tucson Fire', 'Pima County'] },
  { region: 'Southwest', city: 'Albuquerque', state: 'NM', queries: ['Albuquerque', 'Albuquerque Fire', 'Bernalillo'] },
  { region: 'Southwest', city: 'Las Vegas', state: 'NV', queries: ['Las Vegas', 'Clark County', 'Las Vegas Fire'] },
  { region: 'Southwest', city: 'Denver', state: 'CO', queries: ['Denver', 'Denver Fire', 'Aurora CO'] },
  { region: 'Southwest', city: 'Colorado Springs', state: 'CO', queries: ['Colorado Springs', 'El Paso County CO'] },
  { region: 'West', city: 'Los Angeles', state: 'CA', queries: ['Los Angeles', 'LAFD', 'LA County Fire'] },
  { region: 'West', city: 'San Francisco', state: 'CA', queries: ['San Francisco', 'SFFD', 'San Francisco Fire'] },
  { region: 'West', city: 'San Jose', state: 'CA', queries: ['San Jose', 'San Jose Fire', 'Santa Clara'] },
  { region: 'West', city: 'Sacramento', state: 'CA', queries: ['Sacramento', 'Sacramento Fire', 'Sac Metro Fire'] },
  { region: 'West', city: 'San Diego', state: 'CA', queries: ['San Diego', 'San Diego Fire', 'SDFD'] },
  { region: 'West', city: 'Portland', state: 'OR', queries: ['Portland', 'Portland Fire', 'Multnomah'] },
  { region: 'West', city: 'Seattle', state: 'WA', queries: ['Seattle', 'Seattle Fire', 'King County'] },
  { region: 'West', city: 'Spokane', state: 'WA', queries: ['Spokane', 'Spokane Fire'] },
  { region: 'West', city: 'Salt Lake City', state: 'UT', queries: ['Salt Lake', 'Salt Lake City Fire', 'SLC Fire'] },
  { region: 'West', city: 'Boise', state: 'ID', queries: ['Boise', 'Boise Fire', 'Ada County'] },
  { region: 'West', city: 'Anchorage', state: 'AK', queries: ['Anchorage', 'Anchorage Fire'] },
  { region: 'West', city: 'Honolulu', state: 'HI', queries: ['Honolulu', 'Honolulu Fire', 'HFD Hawaii'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchEncrypted(params) {
  const url = `${API_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', Referer: 'https://web.pulsepoint.org/' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.ct) throw new Error('Missing encrypted payload');
  return decryptPulsePointPayload(body);
}

function parseStateFromDisplay1(display1) {
  const match = String(display1 || '').match(/\[([A-Z]{2})\]\s*$/);
  return match?.[1] || null;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function matchesMetro(agency, metro) {
  const state = parseStateFromDisplay1(agency.Display1);
  if (state && state !== metro.state) return false;
  const d1 = String(agency.Display1 || '').toLowerCase();
  const d2 = String(agency.Display2 || '').toLowerCase();
  const city = metro.city.toLowerCase();
  if (d2.includes(city) || d1.includes(city)) return true;
  if (metro.state === 'DC' && (d1.includes('dc') || d2.includes('washington'))) return true;
  const lat = Number(agency.lat);
  const lng = Number(agency.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 18 || lat > 72 || lng > -60 || lng < -180) return false;
  return state === metro.state;
}

function countIncidents(bundle) {
  const active = bundle?.active || [];
  const recent = bundle?.recent || [];
  const rows = [...active, ...recent];
  let withCoords = 0;
  for (const row of rows) {
    const lat = Number(row.Latitude);
    const lon = Number(row.Longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) withCoords++;
  }
  return { total: rows.length, withCoords, active: active.length, recent: recent.length };
}

async function searchAgencies(token) {
  if (String(token).length < 2) return [];
  const params = new URLSearchParams({ resource: 'searchagencies', token: String(token) });
  const body = await fetchEncrypted(params);
  return body.searchagencies || [];
}

async function probeAgency(agencyId) {
  try {
    const params = new URLSearchParams({ resource: 'incidents', agencyid: String(agencyId) });
    const body = await fetchEncrypted(params);
    if (body.StatusCode && body.StatusCode !== '200') {
      return { status: 'DEAD', error: body.StatusMessage || body.StatusCode, counts: { total: 0, withCoords: 0 } };
    }
    const bundle = body.incidents || body;
    const counts = countIncidents(bundle);
    if (counts.total === 0) return { status: 'EMPTY', counts };
    return { status: 'LIVE', counts };
  } catch (err) {
    return { status: 'DEAD', error: err.message, counts: { total: 0, withCoords: 0 } };
  }
}

async function discover() {
  /** @type {Map<string, object>} */
  const byAgencyId = new Map();
  const searchLog = [];

  console.log(`Searching ${TARGET_METROS.length} metros…`);
  for (const metro of TARGET_METROS) {
    for (const query of metro.queries) {
      try {
        const hits = await searchAgencies(query);
        searchLog.push({ metro: metro.city, state: metro.state, query, hitCount: hits.length });
        for (const hit of hits) {
          if (!hit.agencyid) continue;
          if (!matchesMetro(hit, metro)) continue;
          const key = hit.agencyid;
          if (!byAgencyId.has(key)) {
            byAgencyId.set(key, {
              agencyId: key,
              agencyName: hit.Display1,
              display2: hit.Display2,
              state: parseStateFromDisplay1(hit.Display1) || metro.state,
              city: metro.city,
              region: metro.region,
              lat: hit.lat,
              lng: hit.lng,
              matchedQueries: [query],
              metros: [metro.city],
            });
          } else {
            const existing = byAgencyId.get(key);
            if (!existing.metros.includes(metro.city)) existing.metros.push(metro.city);
            if (!existing.matchedQueries.includes(query)) existing.matchedQueries.push(query);
          }
        }
      } catch (err) {
        searchLog.push({ metro: metro.city, query, error: err.message });
      }
      await sleep(SEARCH_DELAY_MS);
    }
  }

  console.log(`\nUnique agencies matched: ${byAgencyId.size}. Probing…`);
  const probed = [];
  let i = 0;
  for (const agency of byAgencyId.values()) {
    i++;
    process.stdout.write(`\rProbe ${i}/${byAgencyId.size} ${agency.agencyId}…`);
    const probe = await probeAgency(agency.agencyId);
    probed.push({ ...agency, ...probe, probedAt: new Date().toISOString() });
    await sleep(PROBE_DELAY_MS);
  }
  process.stdout.write('\n');

  const summary = {
    metros: TARGET_METROS.length,
    searchQueries: searchLog.length,
    uniqueAgencies: probed.length,
    LIVE: probed.filter((a) => a.status === 'LIVE').length,
    EMPTY: probed.filter((a) => a.status === 'EMPTY').length,
    DEAD: probed.filter((a) => a.status === 'DEAD').length,
    probedAt: new Date().toISOString(),
  };

  const discovery = {
    api: {
      search: `${API_BASE}?resource=searchagencies&token={query}`,
      incidents: `${API_BASE}?resource=incidents&agencyid={id}`,
      responseShape: {
        searchagencies: [
          { Type: 'Agency', Display1: 'Seattle FD [WA]', Display2: 'Seattle', id: '974', lat: 47.6, lng: -122.3, agencyid: '17M15' },
        ],
        incidents: { incidents: { active: [], recent: [], alerts: [] } },
      },
    },
    communitySources: [
      'https://github.com/Podskio/pulsepoint — getIncidents(agencyIds), network tab giba.php',
      'https://www.pulsepoint.org/respond-embed-example — iframe agencies=07035,07090',
      'https://github.com/adamcarrier/pulsepoint_scrape — Hampton Roads agency list in script',
      'https://github.com/TrevorBagels/PulsepointScraperV2 — scans all agencies on schedule',
    ],
    summary,
    searchLog,
    agencies: probed.sort((a, b) => a.city.localeCompare(b.city) || a.agencyName.localeCompare(b.agencyName)),
  };

  writeFileSync('config/emergency-pulsepoint-discovery.json', `${JSON.stringify(discovery, null, 2)}\n`);

  const viable = probed.filter((a) => a.status === 'LIVE' || a.status === 'EMPTY');
  console.log('\n=== Summary ===');
  console.log(summary);
  console.log(`\nViable (LIVE+EMPTY): ${viable.length}`);
  console.log('LIVE agencies:', viable.filter((a) => a.status === 'LIVE').slice(0, 15).map((a) => `${a.city} ${a.agencyId} (${a.counts?.total})`).join(', '), viable.length > 15 ? '…' : '');

  if (process.argv.includes('--write-config')) {
    const configAgencies = viable.map((a) => ({
      id: `pulsepoint-${slugify(a.city)}-${slugify(a.agencyId)}`,
      agencyId: a.agencyId,
      city: a.city,
      state: a.state,
      agencyName: a.agencyName,
      status: a.status,
      lastProbeCount: a.counts?.total ?? 0,
      enabled: true,
      region: a.region,
    }));
    const config = {
      gapNote:
        'Unofficial integration via api.pulsepoint.org/v1/webapp (AES-encrypted JSON). Set PULSEPOINT_ENABLED=false to disable. PULSEPOINT_MAX_AGENCIES caps concurrent poll batch.',
      registrationUrl: 'https://github.com/pulsepointinc/pulsepoint_api',
      apiEndpoint: `${API_BASE}?resource=incidents&agencyid={agencyId}`,
      searchEndpoint: `${API_BASE}?resource=searchagencies&token={query}`,
      discoveredAt: summary.probedAt,
      agencies: configAgencies,
    };
    writeFileSync('config/emergency-pulsepoint-agencies.json', `${JSON.stringify(config, null, 2)}\n`);
    console.log(`\nWrote config/emergency-pulsepoint-agencies.json (${configAgencies.length} agencies)`);
  }

  return discovery;
}

discover().catch((err) => {
  console.error(err);
  process.exit(1);
});
