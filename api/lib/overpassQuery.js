import { distanceMiles } from '../../lib/geo.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard; rail-network)';
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const FETCH_TIMEOUT_MS = 25_000;
const SIMPLIFY_TOLERANCE_METERS = 50;
const RAW_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** @type {Map<string, { fetchedAt: number, segments: import('./railNetwork.js').RailSegment[] }>} */
const rawResponseCache = new Map();

function bboxCacheKey(bbox) {
  return `${bbox.south.toFixed(3)},${bbox.west.toFixed(3)},${bbox.north.toFixed(3)},${bbox.east.toFixed(3)}`;
}

function perpendicularDistanceMeters(point, start, end) {
  const latScale = 111_320;
  const lonScale = latScale * Math.cos((point.lat * Math.PI) / 180);
  const px = point.lon * lonScale;
  const py = point.lat * latScale;
  const ax = start.lon * lonScale;
  const ay = start.lat * latScale;
  const bx = end.lon * lonScale;
  const by = end.lat * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/** Douglas-Peucker simplification; tolerance in meters. */
export function simplifyLineCoordinates(coordinates, toleranceMeters = SIMPLIFY_TOLERANCE_METERS) {
  if (coordinates.length <= 2) return coordinates;

  const points = coordinates.map(([lon, lat]) => ({ lon, lat }));
  const keep = new Set([0, points.length - 1]);
  const stack = [[0, points.length - 1]];

  while (stack.length) {
    const [startIdx, endIdx] = stack.pop();
    let maxDist = 0;
    let maxIdx = startIdx;
    const start = points[startIdx];
    const end = points[endIdx];
    for (let i = startIdx + 1; i < endIdx; i += 1) {
      const dist = perpendicularDistanceMeters(points[i], start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }
    if (maxDist > toleranceMeters) {
      keep.add(maxIdx);
      stack.push([startIdx, maxIdx], [maxIdx, endIdx]);
    }
  }

  return [...keep]
    .sort((a, b) => a - b)
    .map((idx) => [points[idx].lon, points[idx].lat]);
}

function parseOverpassElements(elements) {
  const segments = [];
  for (const element of elements || []) {
    if (element.type !== 'way' || !Array.isArray(element.geometry) || element.geometry.length < 2) continue;
    const tags = element.tags || {};
    const railwayType = tags.railway || 'rail';
    const coordinates = element.geometry.map((pt) => [Number(pt.lon), Number(pt.lat)]);
    segments.push({
      id: String(element.id),
      railwayType,
      operator: tags.operator || tags['operator:short'] || tags.name || null,
      name: tags.name || null,
      coordinates: simplifyLineCoordinates(coordinates),
    });
  }
  return segments;
}

async function postOverpass(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const body = new URLSearchParams({ data: query });
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: body.toString(),
      signal: controller.signal,
    });

    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 2000));
      const retry = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: body.toString(),
        signal: controller.signal,
      });
      if (!retry.ok) throw new Error(`Overpass unavailable (${retry.status})`);
      return retry.json();
    }

    if (!res.ok) throw new Error(`Overpass unavailable (${res.status})`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Query Overpass for rail track ways within bbox.
 * @param {{ south: number, west: number, north: number, east: number }} bbox
 * @param {{ skipCache?: boolean }} [options]
 * @returns {Promise<Array<{ id: string, railwayType: string, operator: string|null, name: string|null, coordinates: number[][] }>>}
 */
export async function fetchRailNetwork(bbox, options = {}) {
  const key = bboxCacheKey(bbox);
  if (!options.skipCache) {
    const cached = rawResponseCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < RAW_CACHE_TTL_MS) {
      return cached.segments;
    }
  }

  const query = `[out:json][timeout:25];
(
  way["railway"~"^(rail|subway|light_rail|tram|monorail)$"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out geom;`;

  const payload = await postOverpass(query);
  const segments = parseOverpassElements(payload.elements);
  rawResponseCache.set(key, { fetchedAt: Date.now(), segments });
  return segments;
}

/** Nearest point on a polyline; coordinates are [lon, lat]. */
export function nearestPointOnPolyline(lat, lon, coordinates) {
  let best = null;
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];
    const latScale = 111_320;
    const lonScale = latScale * Math.cos((lat * Math.PI) / 180);
    const px = lon * lonScale;
    const py = lat * latScale;
    const ax = lon1 * lonScale;
    const ay = lat1 * latScale;
    const bx = lon2 * lonScale;
    const by = lat2 * latScale;
    const dx = bx - ax;
    const dy = by - ay;
    let t = 0;
    if (dx !== 0 || dy !== 0) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    }
    const snapLon = (ax + t * dx) / lonScale;
    const snapLat = (ay + t * dy) / latScale;
    const miles = distanceMiles(lat, lon, snapLat, snapLon);
    if (!best || miles < best.distanceMiles) {
      best = { lat: snapLat, lon: snapLon, distanceMiles: miles, segmentIndex: i };
    }
  }
  return best;
}

export function clearOverpassCacheForTests() {
  rawResponseCache.clear();
}
