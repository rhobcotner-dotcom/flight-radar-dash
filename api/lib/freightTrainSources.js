import { boundingBox, distanceMiles, pointInBoundingBox } from '../../lib/geo.js';
import { fetchAprsRailTrains } from './aprsRail.js';
import { getAprsIsStatus } from './aprsIs.js';
import { fetchHighballTrains } from './highballTrains.js';
import { filterInSearchRegion, searchBbox, searchCenter } from './viewportQuery.js';
import bundledCrossingFeeds from '../../config/freight-crossing-feeds.json' with { type: 'json' };

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 30 * 1000;

const DEFAULT_CROSSING_FEEDS = bundledCrossingFeeds;

let crossingCache = { fetchedAt: 0, key: '', trains: [] };
let railStateCache = { fetchedAt: 0, key: '', trains: [] };
let railStateSyncFrom = null;

function trainRadiusMiles(area) {
  return Math.max(Number(area.radiusMiles) || 30, 120);
}

function freightRadiusMiles(area) {
  return Math.max(Number(area.radiusMiles) || 30, 160);
}

function areaBbox(area, radiusMiles) {
  return searchBbox(area, radiusMiles);
}

function freightSearchRadius(area) {
  if (area.viewport) return area.queryRadiusMiles;
  return freightRadiusMiles(area);
}

function bboxKey(bbox) {
  return [bbox.west, bbox.south, bbox.east, bbox.north].map((v) => v.toFixed(2)).join(':');
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseCrossingFeeds() {
  const raw = String(process.env.FREIGHT_CROSSING_FEEDS || '').trim();
  if (!raw) return DEFAULT_CROSSING_FEEDS;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_CROSSING_FEEDS;
  } catch {
    return DEFAULT_CROSSING_FEEDS;
  }
}

function isActiveCrossingStatus(status, feed) {
  const value = String(status || '').trim().toLowerCase();
  if (!value) return false;
  const active = (feed.activeValues || ['blocked']).map((item) => String(item).toLowerCase());
  if (active.includes(value)) return true;
  return value !== 'clear' && value !== 'open';
}

function normalizeCrossingFeature(feature, feed) {
  const attrs = feature?.attributes || feature?.properties || {};
  const geom = feature?.geometry || {};
  const lat = Number(geom.y ?? geom.latitude ?? attrs.latitude);
  const lon = Number(geom.x ?? geom.longitude ?? attrs.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const status = attrs[feed.statusField] ?? attrs.crossingStatus ?? attrs.status;
  if (!isActiveCrossingStatus(status, feed)) return null;

  const street = attrs[feed.streetField] || attrs.street || 'Rail crossing';
  const code = String(attrs[feed.codeField] || attrs.code || attrs.OBJECTID || '').trim();
  const movement = attrs[feed.movementField] || attrs.trainMovement || null;
  const direction = attrs[feed.directionField] || attrs.direction || null;

  return {
    trainNum: code || `${lat.toFixed(3)},${lon.toFixed(3)}`,
    trainId: `${feed.id}:${code || `${lat.toFixed(4)}:${lon.toFixed(4)}`}`,
    routeName: street,
    lat,
    lon,
    heading: direction,
    velocityMph: null,
    timely: String(status),
    originCode: feed.name,
    destCode: movement,
    trainState: String(status),
    trainKind: 'crossing',
    railroad: null,
    crossingStatus: String(status),
    sourceLabel: feed.name,
  };
}

async function fetchArcgisCrossingFeed(feed, bbox, area, radiusMiles) {
  const params = new URLSearchParams({
    where: feed.where || '1=1',
    outFields: '*',
    outSR: '4326',
    f: 'json',
    returnGeometry: 'true',
    resultRecordCount: '2000',
  });

  if (feed.fetchGlobal !== false) {
    // City crossing feeds are small — pull the whole feed and distance-filter locally.
  } else {
    params.set(
      'geometry',
      JSON.stringify({
        xmin: bbox.west,
        ymin: bbox.south,
        xmax: bbox.east,
        ymax: bbox.north,
        spatialReference: { wkid: 4326 },
      })
    );
    params.set('geometryType', 'esriGeometryEnvelope');
    params.set('spatialRel', 'esriSpatialRelIntersects');
    params.set('inSR', '4326');
  }

  const res = await fetchWithTimeout(`${feed.url}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`${feed.name} unavailable (${res.status})`);
  }

  const body = await res.json();
  if (body.error) {
    throw new Error(body.error.message || `${feed.name} query failed`);
  }

  return (body.features || [])
    .map((feature) => normalizeCrossingFeature(feature, feed))
    .filter(Boolean)
    .filter((train) => {
      if (area.viewport) {
        return pointInBoundingBox(train.lat, train.lon, area.viewport);
      }
      if (feed.fetchGlobal !== false) {
        return distanceMiles(area.lat, area.lon, train.lat, train.lon) <= radiusMiles;
      }
      return distanceMiles(area.lat, area.lon, train.lat, train.lon) <= radiusMiles;
    });
}

async function fetchCrossingSensorTrains(area, bbox, radiusMiles) {
  const cacheKey = `${bboxKey(bbox)}:${radiusMiles}`;
  if (crossingCache.trains.length && crossingCache.key === cacheKey && Date.now() - crossingCache.fetchedAt < CACHE_TTL_MS) {
    return crossingCache.trains;
  }

  const feeds = parseCrossingFeeds();
  const results = await Promise.allSettled(
    feeds.map((feed) => fetchArcgisCrossingFeed(feed, bbox, area, radiusMiles))
  );
  const trains = [];
  const sourceCounts = {};

  results.forEach((result, index) => {
    const feed = feeds[index];
    if (result.status !== 'fulfilled') {
      sourceCounts[feed.id] = { error: result.reason?.message || 'failed' };
      return;
    }
    sourceCounts[feed.id] = result.value.length;
    trains.push(...result.value);
  });

  crossingCache = { fetchedAt: Date.now(), key: cacheKey, trains, sourceCounts };
  return trains;
}

function pickField(row, names) {
  for (const name of names) {
    if (row?.[name] != null && row[name] !== '') return row[name];
  }
  return null;
}

function normalizeRailStateSighting(row) {
  const lat = Number(
    pickField(row, ['sensor_latitude', 'sensorLatitude', 'SensorLatitude', 'latitude', 'lat'])
  );
  const lon = Number(
    pickField(row, ['sensor_longitude', 'sensorLongitude', 'SensorLongitude', 'longitude', 'lon'])
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const sightingId = String(
    pickField(row, ['sighting_id', 'sightingId', 'SightingId', 'id']) || `${lat}:${lon}`
  );
  const tripId = String(
    pickField(row, ['train_trip_id', 'trainTripId', 'TrainTripId', 'train_set_id', 'trainSetId']) ||
      sightingId
  );
  const trainType = pickField(row, ['train_type', 'trainType', 'TrainType']) || 'Freight';
  const operator = pickField(row, ['train_operator', 'trainOperator', 'TrainOperator']);
  const speed = Number(pickField(row, ['speed', 'instantaneous_speed', 'instantaneousSpeed', 'Speed']));
  const direction = pickField(row, ['direction', 'Direction']);
  const sensorName = pickField(row, ['sensor_name', 'sensorName', 'SensorName', 'site']);

  return {
    trainNum: tripId.slice(0, 12),
    trainId: `railstate:${sightingId}`,
    routeName: trainType,
    lat,
    lon,
    heading: direction,
    velocityMph: Number.isFinite(speed) ? Math.round(speed) : null,
    timely: sensorName,
    originCode: operator,
    destCode: null,
    trainState: pickField(row, ['loaded', 'Loaded']),
    trainKind: 'freight',
    railroad: operator,
    crossingStatus: null,
    sourceLabel: 'RailState',
  };
}

function flattenRailStatePayload(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.sightings)) return body.sightings;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.results)) return body.results;
  return [];
}

async function fetchRailStateSightings(area, bbox) {
  const token = String(process.env.RAILSTATE_API_TOKEN || process.env.RAILSTATE_API_KEY || '').trim();
  const base = String(process.env.RAILSTATE_API_BASE || '').trim().replace(/\/$/, '');
  if (!token || !base) {
    return { trains: [], configured: false };
  }

  const cacheKey = `${bboxKey(bbox)}:${railStateSyncFrom || 'cold'}`;
  if (
    railStateCache.trains.length &&
    railStateCache.key === cacheKey &&
    Date.now() - railStateCache.fetchedAt < CACHE_TTL_MS
  ) {
    return { trains: railStateCache.trains, configured: true };
  }

  if (!railStateSyncFrom) {
    railStateSyncFrom = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  }

  const params = new URLSearchParams({
    last_modification_time_from: railStateSyncFrom,
  });
  const authHeader =
    String(process.env.RAILSTATE_AUTH_HEADER || 'Authorization').trim() || 'Authorization';
  const authPrefix = String(process.env.RAILSTATE_AUTH_PREFIX || 'Bearer').trim();

  const paths = [
    process.env.RAILSTATE_SIGHTINGS_PATH || '/export/full_sightings',
    '/api/export/full_sightings',
    '/full_sightings',
  ].filter(Boolean);

  let lastError = null;
  for (const path of [...new Set(paths)]) {
    try {
      const url = `${base}${path.startsWith('/') ? path : `/${path}`}?${params.toString()}`;
      const res = await fetchWithTimeout(url, {
        headers: {
          [authHeader]: `${authPrefix} ${token}`.trim(),
        },
      });
      if (!res.ok) {
        lastError = new Error(`RailState unavailable (${res.status})`);
        continue;
      }

      const body = await res.json();
      const rows = flattenRailStatePayload(body);
      const trains = rows
        .map(normalizeRailStateSighting)
        .filter((train) => train && pointInBoundingBox(train.lat, train.lon, bbox));

      if (body.nextRequestLink) {
        railStateSyncFrom = new Date().toISOString();
      } else if (rows.length) {
        railStateSyncFrom = new Date().toISOString();
      }

      railStateCache = { fetchedAt: Date.now(), key: cacheKey, trains };
      return { trains, configured: true };
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) throw lastError;
  return { trains: [], configured: true };
}

export async function fetchFreightTrains(area) {
  const radius = freightSearchRadius(area);
  const bbox = areaBbox(area, radius);
  const center = searchCenter(area);
  const queryArea = area.viewport ? { ...area, lat: center.lat, lon: center.lon } : area;
  const sourceCounts = {};
  const sources = [];
  let trains = [];

  const [crossingResult, railStateResult, aprsResult, highballResult] = await Promise.allSettled([
    fetchCrossingSensorTrains(queryArea, bbox, radius),
    fetchRailStateSightings(queryArea, bbox),
    fetchAprsRailTrains(queryArea, radius),
    fetchHighballTrains(queryArea, radius),
  ]);

  if (crossingResult.status === 'fulfilled') {
    trains.push(...crossingResult.value);
    sources.push('crossing-sensors');
    Object.assign(sourceCounts, crossingCache.sourceCounts || {});
    sourceCounts.crossing_sensors = crossingResult.value.length;
  } else {
    sourceCounts.crossing_sensors_error = crossingResult.reason?.message;
  }

  if (railStateResult.status === 'fulfilled') {
    if (railStateResult.value.configured) {
      sources.push('railstate');
      sourceCounts.railstate = railStateResult.value.trains.length;
      trains.push(...railStateResult.value.trains);
    }
  } else if (String(process.env.RAILSTATE_API_TOKEN || process.env.RAILSTATE_API_KEY || '').trim()) {
    sourceCounts.railstate_error = railStateResult.reason?.message;
    sources.push('railstate');
  }

  if (aprsResult.status === 'fulfilled') {
    sources.push('aprs-rail');
    sourceCounts.aprs_rail = aprsResult.value.count;
    if (aprsResult.value.message) sourceCounts.aprs_fi = aprsResult.value.message;
    trains.push(...aprsResult.value.trains);
  } else {
    sourceCounts.aprs_rail_error = aprsResult.reason?.message;
  }

  if (highballResult.status === 'fulfilled') {
    if (highballResult.value.configured) {
      sources.push('highball');
      sourceCounts.highball_freight = highballResult.value.freightCount ?? 0;
      sourceCounts.highball_passenger = highballResult.value.passengerCount ?? 0;
      trains.push(...highballResult.value.trains.filter((train) => train.trainKind === 'freight'));
    }
  } else if (String(process.env.HIGHBALL_API_KEY || '').trim()) {
    sourceCounts.highball_error = highballResult.reason?.message;
    sources.push('highball');
  }

  const nearby = filterInSearchRegion(trains, area, radius);

  return {
    trains: nearby,
    radiusMiles: radius,
    viewport: area.viewport || null,
    sourceCounts,
    sources,
    coverage:
      sources.length > 0
        ? 'Freight via crossing sensors, optional APRS.fi/RailState/Highball, and ham APRS-IS'
        : 'No freight feeds configured',
    freightHints: buildFreightHints(sourceCounts, nearby),
  };
}

function buildFreightHints(sourceCounts, trains) {
  const freightCount = trains.filter((train) => train.trainKind === 'freight').length;
  const crossingCount = trains.filter((train) => train.trainKind === 'crossing').length;
  if (freightCount > 0) return undefined;

  const aprsIs = getAprsIsStatus();
  const active = [];
  if (crossingCount > 0) active.push('Crossing sensors (live blocked-grade crossings)');
  if (sourceCounts.highball_freight > 0) active.push('Highball freight positions');
  if (sourceCounts.aprs_rail > 0) active.push('APRS rail positions');
  if (!active.length) {
    active.push('Houston Train Watch crossing sensors (nationwide feed; only near Houston)');
  }

  return {
    summary:
      crossingCount > 0
        ? 'Crossing sensors show live blockages (freight passing), not locomotive GPS.'
        : 'No live freight GPS near you. U.S. freight has no free nationwide feed like ADS-B.',
    active,
    optional: [
      'APRS_FI_API_KEY — free at aprs.fi → account settings (best STL freight chance via ham railfans)',
      'APRS_CALLSIGN — your ham callsign in .env for direct APRS-IS (passcode auto-computed)',
      'RAILSTATE_API_TOKEN — paid trackside sensor sightings (railstate.com)',
    ],
    local:
      'St Louis: BNSF/UP/NS lines are active but only show up via APRS railfans or RailState. Houston crossing sensors work when you pan to Texas.',
    aprsIs: aprsIs.configured ? null : aprsIs.message,
  };
}

export { trainRadiusMiles, freightRadiusMiles };
