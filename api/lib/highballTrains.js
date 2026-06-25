import { distanceMiles } from '../../lib/geo.js';
import { resolveHighballApiKey } from './highballKey.js';

const BASE_URL = 'https://api.highballplatform.com/v1';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 15000;
const CACHE_MS = 25 * 1000;

let cache = { key: '', fetchedAt: 0, trains: [] };

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

function normalizeHighballTrain(row) {
  const lat = Number(row?.latitude);
  const lon = Number(row?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const isFreight = Boolean(row?.is_freight);
  const agency = row?.agency_name || row?.agency_id || 'Rail';
  const trainNum = String(row?.train_number || row?.vehicle_id || row?.id || '').trim();
  if (!trainNum) return null;

  const speedKmh = Number(row?.speed_kmh);
  const speedMph = Number.isFinite(speedKmh) ? Math.round(speedKmh * 0.621371) : null;

  return {
    trainNum: trainNum.slice(0, 12),
    trainId: `highball:${row?.id || trainNum}`.toLowerCase(),
    routeName: row?.route_name || agency,
    lat,
    lon,
    heading: row?.bearing != null ? Math.round(Number(row.bearing)) : null,
    velocityMph: speedMph,
    timely: row?.updated_at || row?.status || null,
    originCode: row?.agency_id || null,
    destCode: row?.next_stop || null,
    trainState: row?.status || 'live',
    trainKind: isFreight ? 'freight' : 'passenger',
    railroad: agency,
    crossingStatus: null,
    sourceLabel: isFreight ? 'Highball freight' : 'Highball',
  };
}

export async function fetchHighballTrains(area, radiusMiles) {
  const apiKey = await resolveHighballApiKey();
  if (!apiKey) {
    return { trains: [], configured: false };
  }

  const cacheKey = `${area.lat.toFixed(2)}:${area.lon.toFixed(2)}:${radiusMiles}`;
  if (cache.trains.length && cache.key === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return { trains: cache.trains, configured: true };
  }

  const params = new URLSearchParams({
    lat: String(area.lat),
    lon: String(area.lon),
    radius_km: String(Math.max(25, Math.round(radiusMiles * 1.609))),
  });

  const res = await fetchWithTimeout(`${BASE_URL}/trains?${params.toString()}`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) {
    throw new Error(`Highball unavailable (${res.status})`);
  }

  const body = await res.json();
  const trains = (body?.trains || [])
    .map(normalizeHighballTrain)
    .filter(Boolean)
    .map((train) => ({
      ...train,
      distanceMiles: distanceMiles(area.lat, area.lon, train.lat, train.lon),
    }))
    .filter((train) => train.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  cache = { key: cacheKey, fetchedAt: Date.now(), trains };
  return {
    trains,
    configured: true,
    freightCount: trains.filter((train) => train.trainKind === 'freight').length,
    passengerCount: trains.filter((train) => train.trainKind === 'passenger').length,
  };
}
