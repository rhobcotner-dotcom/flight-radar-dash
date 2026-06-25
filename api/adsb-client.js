const ADSB_BASE = process.env.ADSB_API_BASE || 'https://api.adsb.lol';

const cache = new Map();

function getCacheTtl() {
  const raw = process.env.ADSB_CACHE_TTL_MS;
  if (raw === '0') return 0;
  return Number(raw || 10_000);
}

export function milesToNauticalMiles(miles) {
  return miles / 1.15078;
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

  const res = await fetch(`${ADSB_BASE}${path}`, {
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
}
