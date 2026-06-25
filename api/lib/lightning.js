import { boundingBox, distanceMiles } from '../../lib/geo.js';

const BLITZORTUNG_URL = 'https://map.blitzortung.org/GEOjson/getjson.php?f=s&n=00';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 30 * 1000;

let cache = { fetchedAt: 0, data: null };

function normalizeStrike(row, lat, lon, radiusMiles) {
  if (!Array.isArray(row) || row.length < 3) return null;

  const strikeLon = Number(row[0]);
  const strikeLat = Number(row[1]);
  if (!Number.isFinite(strikeLat) || !Number.isFinite(strikeLon)) return null;

  const distance = distanceMiles(lat, lon, strikeLat, strikeLon);
  if (distance > radiusMiles) return null;

  const observedAt = String(row[2] || '').replace(' UTC', 'Z');
  const parsed = Date.parse(observedAt.includes('T') ? observedAt : observedAt.replace(' ', 'T') + 'Z');
  const ageMinutes = Number.isFinite(parsed)
    ? Math.max(0, Math.round((Date.now() - parsed) / 60000))
    : null;

  return {
    lat: strikeLat,
    lon: strikeLon,
    observedAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
    ageMinutes,
    distanceMiles: Math.round(distance * 10) / 10,
    intensity: Number(row[5]) || null,
  };
}

export async function fetchLightningStrikes(lat, lon, radiusMiles = 85) {
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const res = await fetch(BLITZORTUNG_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Referer: 'https://map.blitzortung.org/',
    },
  });

  if (!res.ok) {
    throw new Error(`Lightning feed unavailable (${res.status})`);
  }

  const body = await res.json();
  const rows = Array.isArray(body) ? body : [];
  const strikes = rows
    .map((row) => normalizeStrike(row, lat, lon, radiusMiles))
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = a.observedAt ? Date.parse(a.observedAt) : 0;
      const bTime = b.observedAt ? Date.parse(b.observedAt) : 0;
      return bTime - aTime;
    })
    .slice(0, 500);

  const payload = {
    source: 'blitzortung.org',
    fetchedAt: new Date().toISOString(),
    count: strikes.length,
    radiusMiles,
    bbox: boundingBox(lat, lon, radiusMiles),
    strikes,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
