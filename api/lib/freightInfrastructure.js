import { distanceMiles, pointInBoundingBox } from '../../lib/geo.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const RAIL_YARDS_URL =
  'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Rail_Yards/FeatureServer/0/query';
const FREIGHT_VOLUME_URL =
  'https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/freight_trains_per_day_gdb/FeatureServer/0/query';

let cache = { fetchedAt: 0, key: '', yards: [], corridors: [] };

function geometryCentroid(geometry) {
  if (!geometry) return null;
  if (Number.isFinite(geometry.y) && Number.isFinite(geometry.x)) {
    return { lat: geometry.y, lon: geometry.x };
  }

  const ring = geometry.paths?.[0] || geometry.rings?.[0];
  if (!Array.isArray(ring) || ring.length === 0) return null;

  let sumLat = 0;
  let sumLon = 0;
  for (const point of ring) {
    sumLon += Number(point[0]);
    sumLat += Number(point[1]);
  }

  return { lat: sumLat / ring.length, lon: sumLon / ring.length };
}

async function fetchArcgisFeatures(url, bbox, extraParams = {}) {
  const params = new URLSearchParams({
    where: extraParams.where || '1=1',
    outFields: extraParams.outFields || '*',
    outSR: '4326',
    f: 'json',
    returnGeometry: 'true',
    resultRecordCount: String(extraParams.limit || 2000),
    geometry: JSON.stringify({
      xmin: bbox.west,
      ymin: bbox.south,
      xmax: bbox.east,
      ymax: bbox.north,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });
    if (!res.ok) throw new Error(`ArcGIS query failed (${res.status})`);
    const body = await res.json();
    if (body.error) throw new Error(body.error.message || 'ArcGIS query failed');
    return body.features || [];
  } finally {
    clearTimeout(timer);
  }
}

function normalizeYardFeature(feature) {
  const attrs = feature?.attributes || {};
  const point = geometryCentroid(feature?.geometry);
  if (!point) return null;

  const name = String(attrs.YARDNAME || attrs.yardname || 'Rail yard').trim();
  const owner = String(attrs.RROWNER1 || attrs.rrowner1 || '').trim();
  const trainId = `yard:${owner}:${name}`.slice(0, 80);

  return {
    trainNum: owner || name.slice(0, 8),
    trainId,
    routeName: name,
    lat: point.lat,
    lon: point.lon,
    heading: null,
    velocityMph: null,
    timely: owner || null,
    originCode: owner || null,
    destCode: null,
    trainState: 'yard',
    trainKind: 'yard',
    railroad: owner || null,
    crossingStatus: null,
    sourceLabel: 'FRA rail yard',
  };
}

function normalizeCorridorFeature(feature) {
  const attrs = feature?.attributes || {};
  const point = geometryCentroid(feature?.geometry);
  if (!point) return null;

  const trainsPerDay = Number(attrs.MedianFrghtTrainsPerDay ?? attrs.medianfrghttrainsperday);
  if (!Number.isFinite(trainsPerDay) || trainsPerDay < 8) return null;

  const owner = String(attrs.RROWNER1 || attrs.rrowner1 || 'Freight').trim();
  const subdivision = String(attrs.SUBDIV || attrs.subdiv || '').trim();
  const trainId = `corridor:${owner}:${subdivision}:${Math.round(point.lat * 100)}:${Math.round(point.lon * 100)}`;

  return {
    trainNum: owner,
    trainId,
    routeName: subdivision ? `${owner} ${subdivision}` : `${owner} main`,
    lat: point.lat,
    lon: point.lon,
    heading: null,
    velocityMph: null,
    timely: `~${Math.round(trainsPerDay)} frt/day`,
    originCode: owner,
    destCode: subdivision || null,
    trainState: 'corridor',
    trainKind: 'corridor',
    railroad: owner,
    crossingStatus: null,
    sourceLabel: 'FRA freight volume',
  };
}

export async function fetchFreightInfrastructure(area, bbox, radiusMiles) {
  const cacheKey = `${bbox.west}:${bbox.south}:${bbox.east}:${bbox.north}`;
  if (cache.key === cacheKey && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { yards: cache.yards, corridors: cache.corridors };
  }

  const [yardResult, corridorResult] = await Promise.allSettled([
    fetchArcgisFeatures(RAIL_YARDS_URL, bbox, {
      outFields: 'YARDNAME,RROWNER1',
      limit: 500,
    }),
    fetchArcgisFeatures(FREIGHT_VOLUME_URL, bbox, {
      outFields: 'RROWNER1,SUBDIV,MedianFrghtTrainsPerDay',
      limit: 1500,
    }),
  ]);

  const yards = [];
  const corridors = [];
  const seenYards = new Set();
  const seenCorridors = new Set();

  if (yardResult.status === 'fulfilled') {
    for (const feature of yardResult.value) {
      const train = normalizeYardFeature(feature);
      if (!train || !pointInBoundingBox(train.lat, train.lon, bbox)) continue;
      if (distanceMiles(area.lat, area.lon, train.lat, train.lon) > radiusMiles) continue;
      if (seenYards.has(train.trainId)) continue;
      seenYards.add(train.trainId);
      yards.push(train);
    }
  }

  if (corridorResult.status === 'fulfilled') {
    for (const feature of corridorResult.value) {
      const train = normalizeCorridorFeature(feature);
      if (!train || !pointInBoundingBox(train.lat, train.lon, bbox)) continue;
      if (distanceMiles(area.lat, area.lon, train.lat, train.lon) > radiusMiles) continue;
      if (seenCorridors.has(train.trainId)) continue;
      seenCorridors.add(train.trainId);
      corridors.push(train);
    }
  }

  cache = {
    fetchedAt: Date.now(),
    key: cacheKey,
    yards: yards.slice(0, 40),
    corridors: corridors.slice(0, 60),
  };

  return cache;
}
