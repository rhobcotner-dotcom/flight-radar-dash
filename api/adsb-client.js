import { fetchWithTimeout } from './lib/fetchWithTimeout.js';

const ADSB_BASE = process.env.ADSB_API_BASE || 'https://api.adsb.lol';
const STALE_MAX_MS = Number(process.env.ADSB_STALE_MAX_MS || 5 * 60_000);
const ADSB_COOLDOWN_MS = Number(process.env.ADSB_COOLDOWN_MS || 90_000);
const ADSB_MIN_INTERVAL_MS = Number(process.env.ADSB_MIN_INTERVAL_MS || 8_000);
const ADSB_FETCH_TIMEOUT_MS = Number(process.env.ADSB_FETCH_TIMEOUT_MS || 12_000);

const cache = new Map();
let lastNetworkAt = 0;
let cooldownUntil = 0;

function getCacheTtl() {
  const raw = process.env.ADSB_CACHE_TTL_MS;
  if (raw === '0') return 0;
  return Number(raw || 10_000);
}

export function milesToNauticalMiles(miles) {
  return miles / 1.15078;
}

function pointCacheKey(lat, lon, radiusNm) {
  const roundedLat = Math.round(Number(lat) * 10) / 10;
  const roundedLon = Math.round(Number(lon) * 10) / 10;
  return `/v2/point/${roundedLat}/${roundedLon}/${radiusNm}`;
}

function newestStaleEntry(maxAgeMs = STALE_MAX_MS) {
  const now = Date.now();
  let best = null;
  for (const entry of cache.values()) {
    if (now - entry.ts <= maxAgeMs && (!best || entry.ts > best.ts)) {
      best = entry;
    }
  }
  return best?.data ?? null;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, options = {}, attempts = 3) {
  const { timeoutMs, ...fetchOptions } = options;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, fetchOptions, timeoutMs);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  const message =
    lastError instanceof Error && lastError.message === 'fetch failed'
      ? 'ADSB flight feed unreachable'
      : lastError instanceof Error
        ? lastError.message
        : 'ADSB flight feed unreachable';
  const err = new Error(message);
  err.cause = lastError;
  throw err;
}

export async function getFlightsNearPoint(lat, lon, radiusMiles) {
  const radiusNm = Math.min(250, Math.max(1, Math.ceil(milesToNauticalMiles(radiusMiles))));
  const key = pointCacheKey(lat, lon, radiusNm);
  const ttl = getCacheTtl();
  const cached = cache.get(key);

  if (ttl > 0 && cached && Date.now() - cached.ts < ttl) {
    return cached.data;
  }

  if (Date.now() < cooldownUntil) {
    if (cached && Date.now() - cached.ts < STALE_MAX_MS) {
      return cached.data;
    }
    const fallback = newestStaleEntry();
    if (fallback) return fallback;
  }

  const waitMs = Math.max(0, ADSB_MIN_INTERVAL_MS - (Date.now() - lastNetworkAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  try {
    lastNetworkAt = Date.now();
    const res = await fetchJsonWithRetry(
      `${ADSB_BASE}${key}`,
      {
        headers: { Accept: 'application/json' },
        timeoutMs: ADSB_FETCH_TIMEOUT_MS,
      }
    );

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 429 || res.status === 503 || res.status === 420) {
        cooldownUntil = Date.now() + ADSB_COOLDOWN_MS;
      }
      if (cached && Date.now() - cached.ts < STALE_MAX_MS) {
        return cached.data;
      }
      const fallback = newestStaleEntry();
      if (fallback) return fallback;

      const err = new Error(body?.message || body?.detail || `ADSB.lol request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    cache.set(key, { ts: Date.now(), data: body });

    return body;
  } catch (err) {
    if (cached && Date.now() - cached.ts < STALE_MAX_MS) {
      return cached.data;
    }
    const fallback = newestStaleEntry();
    if (fallback) return fallback;
    throw err;
  }
}
