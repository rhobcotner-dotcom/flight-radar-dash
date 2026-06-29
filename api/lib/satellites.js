import {
  degreesLat,
  degreesLong,
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  eciToGeodetic,
  gstime,
  propagate,
  twoline2satrec,
} from 'satellite.js';
import { enrichSatelliteOccupancy } from './occupancyEnrichment.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 15000;
const TLE_CACHE_TTL_MS = 60 * 60 * 1000;
const OVERHEAD_CACHE_TTL_MS = 20 * 1000;

const TLE_GROUPS = [
  'stations',
  'weather',
  'noaa',
  'goes',
  'science',
  'resource',
  'gps-ops',
  'galileo',
  'gnss',
  'geo',
];

let tleCache = { fetchedAt: 0, catalog: null };
const overheadCache = new Map();

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/plain,*/*',
        'User-Agent': USER_AGENT,
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseTleCatalog(text, group) {
  const lines = text.trim().split(/\r?\n/);
  const entries = [];

  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i]?.trim();
    const line1 = lines[i + 1]?.trim();
    const line2 = lines[i + 2]?.trim();
    if (!name || !line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue;

    const noradId = line1.slice(2, 7).trim();
    let satrec;
    try {
      satrec = twoline2satrec(line1, line2);
    } catch {
      continue;
    }

    entries.push({
      noradId,
      name,
      group,
      satrec,
    });
  }

  return entries;
}

async function fetchGroupCatalog(group) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;
  const res = await fetchWithTimeout(url);
  const text = await res.text();
  if (!res.ok || text.includes('GP data has not updated since')) {
    throw new Error(`CelesTrak TLE unavailable for ${group}`);
  }
  return parseTleCatalog(text, group);
}

async function loadTleCatalog() {
  const now = Date.now();
  if (tleCache.catalog && now - tleCache.fetchedAt < TLE_CACHE_TTL_MS) {
    return tleCache.catalog;
  }

  const merged = new Map();
  const errors = [];

  for (const group of TLE_GROUPS) {
    try {
      const entries = await fetchGroupCatalog(group);
      for (const entry of entries) {
        if (!merged.has(entry.noradId)) merged.set(entry.noradId, entry);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!merged.size) {
    const err = new Error('Satellite catalog unavailable');
    err.status = 503;
    err.details = errors;
    throw err;
  }

  const catalog = [...merged.values()];
  tleCache = { fetchedAt: now, catalog };
  return catalog;
}

function velocityKmh(velocityEci) {
  if (!velocityEci) return null;
  const speed = Math.sqrt(
    velocityEci.x ** 2 + velocityEci.y ** 2 + velocityEci.z ** 2
  );
  return Math.round(speed * 3.6);
}

function overheadCacheKey(lat, lon, minElevation) {
  return `${lat.toFixed(3)}:${lon.toFixed(3)}:${minElevation}`;
}

export async function fetchOverheadSatellites(area, options = {}) {
  const minElevation = Math.max(0, Math.min(90, Number(options.minElevation) || 5));
  const maxResults = Math.max(1, Math.min(200, Number(options.maxResults) || 100));
  const cacheKey = overheadCacheKey(area.lat, area.lon, minElevation);
  const cached = overheadCache.get(cacheKey);
  const nowMs = Date.now();

  if (cached && nowMs - cached.fetchedAt < OVERHEAD_CACHE_TTL_MS) {
    return cached.payload;
  }

  const catalog = await loadTleCatalog();
  const observerGd = {
    latitude: degreesToRadians(area.lat),
    longitude: degreesToRadians(area.lon),
    height: 0.2,
  };
  const now = new Date();
  const gmst = gstime(now);
  const satellites = [];

  for (const entry of catalog) {
    const propagated = propagate(entry.satrec, now);
    if (!propagated?.position) continue;

    const positionEcf = eciToEcf(propagated.position, gmst);
    const lookAngles = ecfToLookAngles(observerGd, positionEcf);
    const elevationDeg = (lookAngles.elevation * 180) / Math.PI;
    if (elevationDeg < minElevation) continue;

    const geodetic = eciToGeodetic(propagated.position, gmst);
    satellites.push({
      noradId: entry.noradId,
      name: entry.name,
      group: entry.group,
      lat: degreesLat(geodetic.latitude),
      lon: degreesLong(geodetic.longitude),
      altitudeKm: Math.round(geodetic.height),
      elevationDeg: Math.round(elevationDeg * 10) / 10,
      azimuthDeg: Math.round(((lookAngles.azimuth * 180) / Math.PI + 360) % 360),
      rangeKm: Math.round(lookAngles.rangeSat),
      velocityKmh: velocityKmh(propagated.velocity),
    });
  }

  satellites.sort((a, b) => b.elevationDeg - a.elevationDeg);
  const trimmed = satellites.slice(0, maxResults);

  const payload = {
    area: {
      lat: area.lat,
      lon: area.lon,
      name: area.name,
    },
    fetchedAt: now.toISOString(),
    minElevationDeg: minElevation,
    catalogSize: catalog.length,
    count: trimmed.length,
    groups: TLE_GROUPS,
    source: 'celestrak-tle + satellite.js (SGP4)',
    satellites: trimmed.map((satellite) => enrichSatelliteOccupancy(satellite)),
  };

  overheadCache.set(cacheKey, { fetchedAt: nowMs, payload });
  return payload;
}
