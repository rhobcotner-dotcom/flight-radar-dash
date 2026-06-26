const ADSB_BASE = process.env.ADSB_API_BASE || 'https://api.adsb.lol';
const STALE_MAX_MS = Number(process.env.ADSB_STALE_MAX_MS || 90_000);

const cache = new Map();

function getCacheTtl() {
  const raw = process.env.ADSB_CACHE_TTL_MS;
  if (raw === '0') return 0;
  return Number(raw || 10_000);
}

export function milesToNauticalMiles(miles) {
  return miles / 1.15078;
}

async function fetchJsonWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch(url, options);
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
  const path = `/v2/point/${lat}/${lon}/${radiusNm}`;
  const key = path;
  const ttl = getCacheTtl();
  const cached = cache.get(key);

  if (ttl > 0 && cached && Date.now() - cached.ts < ttl) {
    return cached.data;
  }

  try {
    const res = await fetchJsonWithRetry(`${ADSB_BASE}${path}`, {
      headers: { Accept: 'application/json' },
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.message || body?.detail || `ADSB.lol request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    if (ttl > 0) {
      cache.set(key, { ts: Date.now(), data: body });
    }

    return body;
  } catch (err) {
    if (cached && Date.now() - cached.ts < STALE_MAX_MS) {
      return cached.data;
    }
    throw err;
  }
}
