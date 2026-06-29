import { fetchRailNetwork } from './overpassQuery.js';

const REGIONAL_TTL_MS = 6 * 60 * 60 * 1000;
const ON_DEMAND_TTL_MS = 2 * 60 * 60 * 1000;

export const DEFAULT_REGIONS = [
  { name: 'stl', bbox: { south: 38.4, west: -91.0, north: 39.1, east: -90.0 } },
  { name: 'chicago', bbox: { south: 41.5, west: -88.3, north: 42.2, east: -87.3 } },
  { name: 'kansascity', bbox: { south: 38.8, west: -94.8, north: 39.4, east: -94.0 } },
  { name: 'denver', bbox: { south: 39.5, west: -105.2, north: 40.1, east: -104.6 } },
  { name: 'twincities', bbox: { south: 44.7, west: -93.5, north: 45.2, east: -93.0 } },
  { name: 'houston', bbox: { south: 29.5, west: -95.8, north: 30.2, east: -95.0 } },
];

/** @typedef {{ id: string, railwayType: string, operator: string|null, name: string|null, coordinates: number[][] }} RailSegment */

/** @type {Map<string, { fetchedAt: number, bbox: object, segments: RailSegment[] }>} */
const regionalCache = new Map();
/** @type {Map<string, { fetchedAt: number, bbox: object, segments: RailSegment[] }>} */
const onDemandCache = new Map();
/** @type {Map<string, Promise<RailSegment[]>>} */
const inFlightFetches = new Map();

export function bboxesOverlap(a, b) {
  return !(a.west > b.east || a.east < b.west || a.south > b.north || a.north < b.south);
}

function bboxKey(bbox) {
  return `${bbox.south.toFixed(2)},${bbox.west.toFixed(2)},${bbox.north.toFixed(2)},${bbox.east.toFixed(2)}`;
}

function segmentIntersectsBbox(segment, bbox) {
  for (const [lon, lat] of segment.coordinates) {
    if (lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east) {
      return true;
    }
  }
  return false;
}

function filterSegmentsForBbox(segments, bbox) {
  return segments.filter((segment) => segmentIntersectsBbox(segment, bbox));
}

function mergeSegments(existing, incoming) {
  const byId = new Map(existing.map((segment) => [segment.id, segment]));
  for (const segment of incoming) {
    byId.set(segment.id, segment);
  }
  return [...byId.values()];
}

function collectCachedSegments(bbox) {
  let segments = [];
  const now = Date.now();

  for (const entry of regionalCache.values()) {
    if (now - entry.fetchedAt > REGIONAL_TTL_MS) continue;
    if (!bboxesOverlap(entry.bbox, bbox)) continue;
    segments = mergeSegments(segments, filterSegmentsForBbox(entry.segments, bbox));
  }

  for (const entry of onDemandCache.values()) {
    if (now - entry.fetchedAt > ON_DEMAND_TTL_MS) continue;
    if (!bboxesOverlap(entry.bbox, bbox)) continue;
    segments = mergeSegments(segments, filterSegmentsForBbox(entry.segments, bbox));
  }

  return segments;
}

function isCoveredByRegionalCache(bbox) {
  const now = Date.now();
  return DEFAULT_REGIONS.some((region) => {
    const entry = regionalCache.get(region.name);
    return entry && now - entry.fetchedAt <= REGIONAL_TTL_MS && bboxesOverlap(entry.bbox, bbox);
  });
}

function startOnDemandFetch(bbox) {
  const key = bboxKey(bbox);
  if (inFlightFetches.has(key)) return inFlightFetches.get(key);

  const promise = fetchRailNetwork(bbox)
    .then((segments) => {
      onDemandCache.set(key, { fetchedAt: Date.now(), bbox, segments });
      return segments;
    })
    .catch((err) => {
      console.warn(`Rail network on-demand fetch failed (${key}):`, err.message);
      return [];
    })
    .finally(() => {
      inFlightFetches.delete(key);
    });

  inFlightFetches.set(key, promise);
  return promise;
}

async function warmRegion(region) {
  try {
    const segments = await fetchRailNetwork(region.bbox);
    regionalCache.set(region.name, { fetchedAt: Date.now(), bbox: region.bbox, segments });
    console.log(`Rail network warmed: ${region.name} (${segments.length} segments)`);
  } catch (err) {
    console.warn(`Rail network warm failed (${region.name}):`, err.message);
  }
}

/** Non-blocking preload of default metro regions. */
export function warmRegionalRailNetworkCache() {
  for (const region of DEFAULT_REGIONS) {
    warmRegion(region);
  }
}

/**
 * Return cached track segments overlapping bbox; trigger background fetch when uncovered.
 * @param {{ south: number, west: number, north: number, east: number }} bbox
 */
export function getRailNetworkForBbox(bbox) {
  const segments = collectCachedSegments(bbox);
  const key = bboxKey(bbox);
  const cachedOnDemand = onDemandCache.get(key);
  const onDemandFresh =
    cachedOnDemand && Date.now() - cachedOnDemand.fetchedAt <= ON_DEMAND_TTL_MS;

  let warming = false;
  if (!isCoveredByRegionalCache(bbox) && !onDemandFresh && !inFlightFetches.has(key)) {
    startOnDemandFetch(bbox);
    warming = true;
  } else if (inFlightFetches.has(key)) {
    warming = true;
  }

  return { segments, warming };
}

/** Map inconsistent OSM operator strings to standard railroad codes. */
export function normalizeRailOperator(osmOperator) {
  const raw = String(osmOperator || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  if (/\bamtrak\b/.test(lower)) return 'AMTK';
  if (/\bbnsf\b|burlington northern santa fe/.test(lower)) return 'BNSF';
  if (/\bunion pacific\b|\buprr\b|\bup\b/.test(lower) && !/group|pacific rim/.test(lower)) return 'UP';
  if (/\bcsx\b/.test(lower)) return 'CSX';
  if (/\bnorfolk southern\b|\bns\b/.test(lower)) return 'NS';
  if (/\bcpkc\b|canadian pacific|\bcp rail\b/.test(lower)) return 'CPKC';
  if (/\bcanadian national\b|\bcn railway\b|\bcn\b/.test(lower)) return 'CN';
  if (/\bkansas city southern\b|\bkcs\b/.test(lower)) return 'KCS';

  if (/\bmetra\b/.test(lower)) return 'METRA';
  if (/\bmetrolink\b/.test(lower)) return 'MetroLink';
  if (/\bwmata\b|washington metropolitan/.test(lower)) return 'WMATA';
  if (/\bcta\b|chicago transit/.test(lower)) return 'CTA';
  if (/\bmbta\b/.test(lower)) return 'MBTA';
  if (/\bsepta\b/.test(lower)) return 'SEPTA';
  if (/\brt[d]?\b|regional transportation district/.test(lower) && /denver|colorado/.test(lower)) return 'RTD';
  if (/\bmetro transit\b/.test(lower)) return 'Metro Transit';
  if (/\bbart\b|bay area rapid transit/.test(lower)) return 'BART';

  if (/\bterminal railroad association\b|\btrra\b/.test(lower)) return 'TRRA';
  if (/\bmissouri eastern\b/.test(lower)) return 'Missouri Eastern';

  if (raw.includes(';')) {
    const parts = raw.split(';').map((part) => part.trim()).filter(Boolean);
    for (const part of parts) {
      const normalized = normalizeRailOperator(part);
      if (normalized && normalized.length <= 6 && /^[A-Z0-9]+$/.test(normalized)) return normalized;
    }
    return parts[0].slice(0, 40);
  }

  return raw.slice(0, 40);
}

export function segmentsToGeoJson(segments) {
  return {
    type: 'FeatureCollection',
    features: segments.map((segment) => ({
      type: 'Feature',
      id: segment.id,
      properties: {
        id: segment.id,
        railwayType: segment.railwayType,
        operator: segment.operator,
        railroad: normalizeRailOperator(segment.operator),
        name: segment.name,
      },
      geometry: {
        type: 'LineString',
        coordinates: segment.coordinates,
      },
    })),
  };
}

export function clearRailNetworkCacheForTests() {
  regionalCache.clear();
  onDemandCache.clear();
  inFlightFetches.clear();
}

export async function primeRailNetworkRegion(name) {
  const region = DEFAULT_REGIONS.find((entry) => entry.name === name);
  if (!region) throw new Error(`Unknown rail region: ${name}`);
  await warmRegion(region);
  return regionalCache.get(name)?.segments || [];
}
