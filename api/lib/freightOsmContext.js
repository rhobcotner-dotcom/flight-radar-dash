import { distanceMiles } from '../../lib/geo.js';

const USER_AGENT = 'flight-radar-dash/1.0 (freight osm context)';
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

const TAG_RULES = [
  { pattern: /grain|silo|elevator|feed|agri/i, cargo: 'Grain', detail: 'Corn, soybeans, or wheat', weight: 0.72 },
  { pattern: /oil|petro|crude|refin/i, cargo: 'Crude oil', detail: 'Tank train', weight: 0.74 },
  { pattern: /lpg|lng|propane|gas|fuel tank/i, cargo: 'Natural gas & LPG', detail: 'Pressurized tank cars', weight: 0.74 },
  { pattern: /chem|acid|caustic|ethanol/i, cargo: 'Chemicals', detail: 'Industrial tank loads', weight: 0.72 },
  { pattern: /auto|vehicle|car plant/i, cargo: 'Automobiles', detail: 'Autorack train', weight: 0.72 },
  { pattern: /steel|metal|mill|foundry|coil/i, cargo: 'Steel & metal', detail: 'Coil, pipe, or scrap', weight: 0.68 },
  { pattern: /cement|aggregate|quarry|lime|concrete/i, cargo: 'Cement & aggregates', detail: 'Bulk construction materials', weight: 0.68 },
  { pattern: /lumber|paper|pulp|wood/i, cargo: 'Lumber & paper', detail: 'Forest products', weight: 0.65 },
];

function cacheKey(lat, lon) {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}`;
}

function tagHaystack(tags = {}) {
  return Object.entries(tags)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

function inferFromTags(tags, lat, lon, trainLat, trainLon) {
  const haystack = tagHaystack(tags);
  for (const rule of TAG_RULES) {
    if (!rule.pattern.test(haystack)) continue;
    const dist = distanceMiles(trainLat, trainLon, lat, lon);
    return {
      cargo: rule.cargo,
      detail: rule.detail,
      weight: Math.max(0.45, rule.weight - dist * 0.02),
      reason: `Near ${tags.name || tags.industrial || tags.landuse || 'industry'} (${dist.toFixed(1)} mi)`,
      source: 'osm-industry',
    };
  }
  return null;
}

export async function fetchNearbyFreightContext(lat, lon, radiusM = 4000) {
  const key = cacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const query = `
    [out:json][timeout:12];
    (
      node(around:${radiusM},${lat},${lon})["railway"~"^(depot|turntable)$"];
      way(around:${radiusM},${lat},${lon})["landuse"="industrial"];
      way(around:${radiusM},${lat},${lon})["industrial"];
      node(around:${radiusM},${lat},${lon})["man_made"~"^(silo|storage_tank)$"];
      node(around:${radiusM},${lat},${lon})["railway"="terminal"];
    );
    out center tags 20;
  `;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const body = await res.json();
    const hits = [];

    for (const element of body.elements || []) {
      const eLat = element.lat ?? element.center?.lat;
      const eLon = element.lon ?? element.center?.lon;
      if (!Number.isFinite(eLat) || !Number.isFinite(eLon)) continue;
      const inferred = inferFromTags(element.tags || {}, eLat, eLon, lat, lon);
      if (inferred) hits.push(inferred);
    }

    hits.sort((a, b) => b.weight - a.weight);
    const value = hits[0] || null;
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    cache.set(key, { at: Date.now(), value: null });
    return null;
  }
}
