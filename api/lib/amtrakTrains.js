import { distanceMiles } from '../../lib/geo.js';

const MARCMAP_URL = 'https://amtrak-api.marcmap.app/get-trains';
const AMTRAKER_URL = 'https://api.amtraker.com/v3/trains';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 45 * 1000;

let cache = { fetchedAt: 0, trains: null };

function trainRadiusMiles(area) {
  return Math.max(Number(area.radiusMiles) || 30, 50);
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

function normalizeTrain(raw) {
  const lat = Number(raw?.lat);
  const lon = Number(raw?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const trainNum = String(raw.trainNum || raw.trainID || '').trim();
  if (!trainNum) return null;

  const stations = Array.isArray(raw.stations) ? raw.stations : [];
  const nextStop = stations.find((station) => station?.status && station.status !== 'Departed') || null;

  return {
    trainNum,
    trainId: String(raw.trainID || trainNum),
    routeName: raw.routeName || 'Amtrak',
    lat,
    lon,
    heading: raw.heading || null,
    velocityMph: raw.velocity != null ? Math.round(Number(raw.velocity)) : null,
    timely: raw.trainTimely || null,
    originCode: raw.origCode || null,
    destCode: raw.destCode || null,
    trainState: raw.trainState || null,
    nextStop: nextStop
      ? {
          name: nextStop.name || nextStop.code,
          code: nextStop.code,
          status: nextStop.status,
          scheduledArrival: nextStop.schArr || null,
          scheduledDeparture: nextStop.schDep || null,
        }
      : null,
  };
}

function flattenTrainPayload(body) {
  if (Array.isArray(body?.data)) {
    return body.data;
  }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const values = Object.values(body);
    if (values.every((item) => Array.isArray(item))) {
      return values.flat();
    }
  }

  return [];
}

async function fetchAllTrainsRaw() {
  if (cache.trains && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.trains;
  }

  let lastError = null;

  for (const url of [MARCMAP_URL, AMTRAKER_URL]) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        lastError = new Error(`Train feed unavailable (${res.status})`);
        continue;
      }

      const body = await res.json();
      const rows = flattenTrainPayload(body);
      const trains = rows.map(normalizeTrain).filter(Boolean);
      if (trains.length === 0) {
        lastError = new Error('No active train positions returned');
        continue;
      }

      cache = { fetchedAt: Date.now(), trains };
      return trains;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Train feed unavailable');
}

export async function fetchAreaTrains(area) {
  const radius = trainRadiusMiles(area);
  const all = await fetchAllTrainsRaw();

  const nearby = all
    .map((train) => ({
      ...train,
      distanceMiles: distanceMiles(area.lat, area.lon, train.lat, train.lon),
    }))
    .filter((train) => train.distanceMiles <= radius)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  return {
    trains: nearby,
    radiusMiles: radius,
    source: 'amtrak-community',
    coverage: 'Amtrak passenger trains only',
  };
}
