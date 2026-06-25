#!/usr/bin/env node
/**
 * Harvest verified live rail YouTube streams from major networks and rebuild
 * config/rail-cameras.json. Uses oEmbed validation + Nominatim geocoding.
 *
 * Run: node scripts/build-rail-cameras.mjs
 * Optional: node scripts/build-rail-cameras.mjs --no-geocode  (reuse cache only)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'config/rail-cameras.json');
const cachePath = join(root, 'data/rail-cam-geocode-cache.json');
const skipGeocode = process.argv.includes('--no-geocode');

/** @type {[string, string][]} label, YouTube handle */
const CHANNELS = [
  ['Virtual Railfan', 'VirtualRailfan'],
  ['Live Trains LLC', 'OfficialLiveTrains'],
  ['Railstream', 'Railstream'],
  ['Steel Highway Railcams', 'SteelHighwayRailcams'],
  ['Tehachapi Live Train Cams', 'TehachapiLiveTrainCam'],
  ['SouthWest RailCams', 'SouthWestRailCams'],
  ['Northern Transcon Railcams', 'NTR-OTC'],
  ['Railside Live', 'railsidelive'],
  ['RRphotographer', 'RRphotographer661'],
  ['Railfan Depot', 'RailfanDepot'],
  ['PU Tower Railcam', 'putower'],
  ['Train Watching Live', 'TrainWatchingLive'],
  ['Main Street Railfan', 'MainStreetRailfan'],
  ['Rails of the MW', 'RailsoftheMW'],
  ['RailCam Live', 'RailCamLive'],
];

const EXTRA_YOUTUBE_IDS = [
  'iz9IQhp_fu0', 'X-ir2KfXMX0', 'flEBdsoP4o0', 'On1MRt0NqFs', 'XX6EOgOmUX8',
  'L6eG4ahJc_Q', 'DuXSP6y9W7U', 'BDb_sSL-K5k', 'D5kKdEBmrYU', '0u6wBsMlnhg',
  'mexGMd6-8ik', '0nBG_i-PLqw',
];

const SKIP_TITLE =
  /ARCHIV|DVR Replay|Big Boy passed|derail|highlight reel|cab ride|heading west from|Trackside with Tom|Snowstorm Tour|Breakfast & Trains|60-Minute Live|240-Minute Live|Episode \d+|RECORDING:|Riding Bikes|Stallion Springs|Drone Benji|Fund Raiser|Pop-Up LIVE Railcam: West Newton|Pop-Up LIVE Railcam: Durand|Rosenberg, TX LIVE Railcam — Freight|Afternoon Snow Action|passed Rochelle|Watch the DVR|Replay \| RailStream|Scanner Feed|Time Lapse|timelapse|Drone footage|Cab Ride|Onboard|Open House|Fundraiser|Giveaway|Q&A Session|TEAMS RACE|DRAG RACING|FIREBIRD RACEWAY| in Goldsboro |P98 in | catches | rolls through | rolls by |approach to |departure from |review of |unboxing |podcast |interview with |Construction Progress|Live to Stallion|Riding Bikes with|Website Launch|Grand Opening|Camera Install|Linktree|Facebook Live|June \d{1,2}, \d{4} #\d - Huron|Train Compilation at Huron|Compilation at Huron|\d{4} #\d - Huron/i;

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho',
  IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const STATE_ABBR = Object.fromEntries(Object.entries(STATE_NAMES).map(([abbr, name]) => [name, abbr]));

/** Fallback coords when Nominatim misses small rail towns. */
const SEED_COORDS = {
  'Pacific, MO': [38.482, -90.744],
  'Dubuque, IA': [42.501, -90.664],
  'Flossmoor, IL': [41.543, -87.684],
  'Ottumwa, IA': [41.02, -92.411],
  'Neenah, WI': [44.186, -88.473],
  'Chehalis, WA': [46.662, -122.965],
  'Port Byron, IL': [41.604, -90.335],
  'East Greenwich, RI': [41.661, -71.456],
  'Worcester, MA': [42.262, -71.802],
  'Cozad, NE': [40.86, -99.987],
  'Malakoff, TX': [32.179, -96.012],
  'Marshall, TX': [32.545, -94.367],
  'Las Vegas, NM': [35.594, -105.223],
  'Indio, CA': [33.72, -116.215],
  'Stockton, CA': [37.957, -121.29],
  'Raton, NM': [36.903, -104.439],
  'Yuma, AZ': [32.693, -114.625],
  'Oak Park, IL': [41.888, -87.789],
  'Fort Madison, IA': [40.629, -91.315],
  'Huron, OH': [41.364, -82.552],
  'Dundas, MN': [44.429, -93.204],
  'Burlington, WI': [42.678, -88.276],
  'Adrian, MI': [41.898, -84.037],
  'Belvidere, NE': [40.14, -97.723],
  'Onawa, IA': [42.027, -96.095],
  'Bellevue, IA': [42.258, -90.422],
  'Carroll, IA': [42.067, -94.867],
  'Red Oak, IA': [41.011, -95.225],
  'Creston, IA': [41.059, -94.361],
  'Woodbine, IA': [41.738, -95.703],
  'Grand Mound, IA': [41.824, -90.647],
  'Clarence, IA': [41.889, -90.589],
  'Clinton, IA': [41.844, -90.189],
  'Waupaca, WI': [44.358, -89.086],
  'Wisconsin Dells, WI': [43.628, -89.777],
  'Phillipsburg, NJ': [40.693, -75.19],
};

/** Hard-coded coords when geocoder is ambiguous (multi-cam sites). */
const SITE_COORDS = [
  [/Tehachapi Loop/i, [35.212, -118.542]],
  [/Depot Railroad Museum/i, [35.132, -118.448]],
  [/West Cable/i, [35.128, -118.465]],
  [/Giumarra|Edison CA/i, [35.379, -118.856]],
  [/Mojave CA/i, [35.052, -118.174]],
  [/Tower 26|Sampson Street|Baer Jct/i, [29.776, -95.369]],
  [/Blue Island/i, [41.657, -87.68]],
  [/Des Plaines/i, [42.033, -87.883]],
  [/Phillipsburg,\s*NJ|NS Lehigh Line/i, [40.693, -75.19]],
  [/Lookout/i, [39.729, -92.49]],
];

function loadCache() {
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

async function scrapeIds(handle) {
  const ids = new Set();
  for (const path of ['/streams', '/videos']) {
    try {
      const res = await fetch(`https://www.youtube.com/@${handle}${path}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; flight-radar-dash/1.0)' },
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      for (const m of html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)) ids.add(m[1]);
    } catch {
      /* channel unavailable */
    }
  }
  return ids;
}

async function fetchOembed(id) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
      { signal: AbortSignal.timeout(12000) }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function acceptStream(title, author) {
  if (SKIP_TITLE.test(title)) return false;
  if (/Track Side Live/i.test(author)) return false;
  if (/Camden Mason/i.test(author) && !/live railcam|LIVE NOW|🔴|Live Railcam/i.test(title)) return false;

  const blob = `${title} ${author}`;
  const trusted =
    /Virtual Railfan|LIVE Trains|Live Trains|Railstream|Steel Highway|Tehachapi Live Train Cams|SouthWest RailCams|Otter Tail|Rails Of The Midwest|Main Street Railfan|PU Tower|RRphotographer|Railside Live|Railfan Depot|RailCam Live|TrainWatchingLive|Northern Transcon|NTR/i.test(
      blob
    );

  const liveish =
    /LIVE NOW|LIVE Railcam|Live Railcam|live railcam|🔴|LIVE Train Camera|LIVE PTZ Railcam|LIVE Trains Railcam|LIVE Trains AD Free|Tehachapi Live Train Cams at|SouthWest RailCams|Steel Highway|Virtual Railfan|RailStream|Live Trains|PTZ Cam LIVE|railcam\.| railcam |Rail Cam|Train Camera \(PTZ|Tower 26|Tehachapi Loop|West Cable|Depot Railroad Museum|Giumarra|Main Street Railfan|Rails Of The Midwest|Oak park IL railcam|Live Trains Ad Free|Lehigh Line|Phillipsburg|Norfolk Southern|24\/7|24 7 trains|Fixed View|Fixed Cam|LIVE RAILCAM|Live Trains LLC/i.test(
      title
    );

  if (/🔴/.test(title) && liveish) return true;
  if (/LIVE NOW/i.test(title) && /railcam|train cam|PTZ Cam|BNSF|CSX|NS |UP /i.test(title)) return true;
  return trusted && liveish;
}

function stateAbbr(name) {
  const trimmed = name.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_ABBR[trimmed] || trimmed.slice(0, 2).toUpperCase();
}

function parseLocation(title) {
  const swLead = title.match(/^([^,|]+),\s*([A-Z]{2})\s*\|/);
  if (swLead && STATE_NAMES[swLead[2]]) return `${swLead[1].trim()}, ${swLead[2]}`;

  const rd = title.match(/^([A-Za-z ]+),\s*([^,-]+)\s-/);
  if (rd) return `${rd[2].trim()}, ${stateAbbr(rd[1].trim())}`;

  const inCity = title.match(/\bin\s+([^,]+),\s*([A-Za-z ]+),\s*USA/i);
  if (inCity) return `${inCity[1].trim()}, ${stateAbbr(inCity[2].trim())}`;

  const railcam = title.match(/LIVE RAILCAM:\s*([^,]+),\s*([A-Za-z ]+),\s*USA/i);
  if (railcam) return `${railcam[1].trim()}, ${stateAbbr(railcam[2].trim())}`;

  if (/Oak Park IL/i.test(title)) return 'Oak Park, IL';
  if (/Fort Madison/i.test(title)) return 'Fort Madison, IA';
  if (/Pacific Partnership| -\s*Pacific, MO/i.test(title)) return 'Pacific, MO';
  if (/Dubuque/i.test(title)) return 'Dubuque, IA';
  if (/Flossmoor/i.test(title)) return 'Flossmoor, IL';
  if (/Ottumwa/i.test(title)) return 'Ottumwa, IA';
  if (/Neenah/i.test(title)) return 'Neenah, WI';
  if (/Chehalis/i.test(title)) return 'Chehalis, WA';
  if (/Port Byron/i.test(title)) return 'Port Byron, IL';
  if (/East Greenwich/i.test(title)) return 'East Greenwich, RI';
  if (/Worcester, MA/i.test(title)) return 'Worcester, MA';
  if (/Cozad/i.test(title)) return 'Cozad, NE';
  if (/Yuma Sub|UPRR Yuma/i.test(title)) return 'Yuma, AZ';
  if (/Stockton Diamond/i.test(title)) return 'Stockton, CA';
  if (/Raton Sub/i.test(title)) return 'Las Vegas, NM';
  if (/Reisor|Little Rock \(66|Marshall, TX/i.test(title)) return 'Marshall, TX';

  const ntr = title.match(/^([^,|]+),\s*([A-Z]{2})\b/);
  if (
    ntr &&
    STATE_NAMES[ntr[2]] &&
    !/railcam|train cam|live railcam|ptz cam|subs|mp \d|\|/i.test(ntr[1])
  ) {
    return `${ntr[1].trim()}, ${ntr[2]}`;
  }

  const hashCity = title.match(/([^,-]+),\s*([A-Za-z ]+)\s*#/i);
  if (hashCity) return `${hashCity[1].trim()}, ${stateAbbr(hashCity[2].trim())}`;

  const dash = title.match(/-\s*([^,#]+),\s*([A-Z]{2})\b/i);
  if (dash) return `${dash[1].trim()}, ${dash[2]}`;

  const lt = title.match(/\|\s*([^,(|]+),\s*([A-Za-z ]+?)(?:\s*\(|$|\s*PTZ)/i);
  if (lt) return `${lt[1].trim()}, ${stateAbbr(lt[2].trim())}`;

  const vrf = title.match(/^([^|]+),\s*([A-Za-z ]+),\s*USA/i);
  if (vrf && !/^LIVE RAILCAM:/i.test(vrf[1])) return `${vrf[1].trim()}, ${stateAbbr(vrf[2].trim())}`;

  const mw = title.match(/([A-Za-z ]+) IL railcam/i);
  if (mw) return `${mw[1].trim()}, IL`;

  const iaEnd = title.match(/-\s*([^,-]+),\s*IA\b/i);
  if (iaEnd) return `${iaEnd[1].trim()}, IA`;

  if (/Houston, Texas|Tower 26|Sampson|Baer Jct/i.test(title)) return 'Houston, TX';
  if (/St Louis|St\. Louis/i.test(title)) return 'St Louis, MO';
  if (/Essex, Montana/i.test(title)) return 'Essex, MT';
  if (/Caliente, Nevada/i.test(title)) return 'Caliente, NV';
  if (/Phillipsburg,\s*NJ|NS Lehigh Line/i.test(title)) return 'Phillipsburg, NJ';
  if (/Atlanta, Georgia|Howell Wye|BI Tower/i.test(title)) return 'Atlanta, GA';
  if (/Fostoria, Ohio/i.test(title)) return 'Fostoria, OH';
  if (/Tehachapi/i.test(title)) return 'Tehachapi, CA';
  if (/Truckee/i.test(title)) return 'Truckee, CA';
  if (/Cajon Pass|Hesperia/i.test(title)) return 'Hesperia, CA';
  if (/Barstow/i.test(title)) return 'Barstow, CA';
  if (/Fullerton/i.test(title)) return 'Fullerton, CA';
  if (/Colfax/i.test(title)) return 'Colfax, CA';
  if (/Verdi/i.test(title)) return 'Verdi, NV';
  if (/Wellington, KS/i.test(title)) return 'Wellington, KS';
  if (/Alliance, NE/i.test(title)) return 'Alliance, NE';
  if (/Glendale, AZ/i.test(title)) return 'Glendale, AZ';
  if (/Fort Madison/i.test(title)) return 'Fort Madison, IA';
  const liveCity = title.match(/^LIVE\s+([^,]+),\s*([A-Z]{2})\b/i);
  if (liveCity) return `${liveCity[1].trim()}, ${liveCity[2]}`;

  if (/Oak Park IL/i.test(title)) return 'Oak Park, IL';
  if (/Yuma/i.test(title)) return 'Yuma, AZ';
  if (/Stockton Diamond/i.test(title)) return 'Stockton, CA';
  if (/Raton Sub/i.test(title)) return 'Las Vegas, NM';
  if (/Reisor|Little Rock Sub/i.test(title)) return 'Malakoff, TX';
  if (/East Greenwich/i.test(title)) return 'East Greenwich, RI';
  if (/Worcester, MA/i.test(title)) return 'Worcester, MA';
  if (/Cozad/i.test(title)) return 'Cozad, NE';
  if (/Ottumwa/i.test(title)) return 'Ottumwa, IA';
  if (/Neenah/i.test(title)) return 'Neenah, WI';
  if (/Chehalis/i.test(title)) return 'Chehalis, WA';
  if (/Port Byron/i.test(title)) return 'Port Byron, IL';
  if (/Little Falls/i.test(title)) return 'Little Falls, MN';
  if (/Wadena/i.test(title)) return 'Wadena, MN';
  if (/Staples/i.test(title)) return 'Staples, MN';
  if (/Glendale, AZ/i.test(title)) return 'Glendale, AZ';

  return null;
}

function siteCoords(title, indexAtSite) {
  for (const [re, coords] of SITE_COORDS) {
    if (re.test(title)) return offsetCoords(coords, indexAtSite);
  }
  return null;
}

function offsetCoords([lat, lon], n) {
  const d = n * 0.0035;
  return [round3(lat + d * 0.65), round3(lon + d)];
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

async function geocode(cityKey, cache) {
  if (cache[cityKey]) return cache[cityKey];
  if (skipGeocode) return null;

  const [city, st] = cityKey.split(', ');
  const stateName = STATE_NAMES[st] || st;
  const query = `${city}, ${stateName}, USA`;

  await new Promise((r) => setTimeout(r, 1100));
  try {
    const params = new URLSearchParams({ format: 'json', limit: '1', q: query, countrycodes: 'us' });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'flight-radar-dash/1.0 (rail-cam-build; personal dashboard)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const hits = await res.json();
    const hit = hits?.[0];
    if (!hit) return null;
    const coords = [round3(Number(hit.lat)), round3(Number(hit.lon))];
    cache[cityKey] = coords;
    saveCache(cache);
    return coords;
  } catch {
    return null;
  }
}

function inferRailroad(title) {
  if (/TRRA|Terminal Railroad/i.test(title)) return 'TRRA';
  if (/BNSF/i.test(title)) return 'BNSF';
  if (/CSX\/NS|CSX.*NS|NS.*CSX/i.test(title)) return 'CSX/NS';
  if (/Norfolk Southern|\bNS\b/i.test(title)) return 'NS';
  if (/CSX/i.test(title)) return 'CSX';
  if (/Union Pacific|\bUP\b/i.test(title)) return 'UP';
  if (/Amtrak/i.test(title)) return 'Amtrak';
  if (/CPKC|CN|KCS/i.test(title)) return 'Class I';
  return null;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function cleanTitle(title) {
  return title
    .replace(/^🔴\s*/g, '')
    .replace(/\s*\|\s*Virtual Railfan.*$/i, '')
    .replace(/\s*\|\s*RailStream.*$/i, '')
    .replace(/\s*#\S+.*$/g, '')
    .trim();
}

async function main() {
  const cache = { ...loadCache(), ...SEED_COORDS };
  const byId = new Map();

  for (const [source, handle] of CHANNELS) {
    const ids = await scrapeIds(handle);
    console.error(`${source}: ${ids.size} raw IDs`);
    for (const id of ids) {
      if (byId.has(id)) continue;
      const meta = await fetchOembed(id);
      if (!meta) continue;
      if (/Minnesota Live Railcam, DU|MI Live Railcam, AD/i.test(meta.title)) continue;
      if (!acceptStream(meta.title, meta.author_name)) continue;
      if (/Minnesota Live Railcam, DU|MI Live Railcam, AD/i.test(meta.title)) continue;
      byId.set(id, { id, title: meta.title, author: meta.author_name, source });
      await new Promise((r) => setTimeout(r, 35));
    }
  }

  for (const id of EXTRA_YOUTUBE_IDS) {
    if (byId.has(id)) continue;
    const meta = await fetchOembed(id);
    if (!meta || !acceptStream(meta.title, meta.author_name)) continue;
    byId.set(id, {
      id,
      title: meta.title,
      author: meta.author_name,
      source: meta.author_name.includes('Virtual') ? 'Virtual Railfan' : meta.author_name,
    });
  }

  console.error(`Verified live streams: ${byId.size}`);

  const siteCounts = new Map();
  const cityCounts = new Map();
  const cameras = [];
  const geocodeQueue = new Map();

  for (const row of byId.values()) {
    const cityKey = parseLocation(row.title);
    if (!cityKey) {
      console.error('no location', row.id, row.title.slice(0, 70));
      continue;
    }
    geocodeQueue.set(cityKey, true);
  }

  if (!skipGeocode) {
    console.error(`Geocoding ${geocodeQueue.size} unique locations…`);
    for (const cityKey of geocodeQueue.keys()) {
      if (!cache[cityKey]) await geocode(cityKey, cache);
    }
  }

  for (const row of byId.values()) {
    const cityKey = parseLocation(row.title);
    if (!cityKey) continue;

    const siteIdx = siteCounts.get(row.title.slice(0, 40)) || 0;
    siteCounts.set(row.title.slice(0, 40), siteIdx + 1);
    const site = siteCoords(row.title, siteIdx);
    if (site) {
      pushCamera(row, cityKey, site, cameras);
      continue;
    }

    const cityIdx = cityCounts.get(cityKey) || 0;
    cityCounts.set(cityKey, cityIdx + 1);
    const base = cache[cityKey];
    if (!base) {
      console.error('no geocode', cityKey, row.id);
      continue;
    }
    pushCamera(row, cityKey, offsetCoords(base, cityIdx), cameras);
  }

  cameras.sort((a, b) => (a.state || '').localeCompare(b.state || '') || a.name.localeCompare(b.name));

  const payload = {
    defaultRadiusMiles: 125,
    generatedAt: new Date().toISOString(),
    cameraCount: cameras.length,
    sources: CHANNELS.map(([label]) => label),
    cameras,
  };

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.error(`Wrote ${cameras.length} cameras → ${outPath}`);
}

function pushCamera(row, cityKey, coords, cameras) {
  const state = cityKey.split(', ').pop();
  cameras.push({
    id: `${slug(row.source)}-${slug(cleanTitle(row.title))}-${row.id}`.slice(0, 80),
    name: cleanTitle(row.title),
    lat: coords[0],
    lon: coords[1],
    youtubeId: row.id,
    railroad: inferRailroad(row.title),
    state,
    source: row.source,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
