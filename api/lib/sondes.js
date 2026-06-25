import { distanceMiles } from '../../lib/geo.js';

const SONDEHUB_URL = 'https://api.v2.sondehub.org/sondes';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 2 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

function normalizeSonde(serial, row) {
  const lat = Number(row?.lat);
  const lon = Number(row?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    serial,
    type: row.type || row.subtype || 'Sonde',
    lat,
    lon,
    altitudeM: row.alt != null ? Math.round(Number(row.alt)) : null,
    frequency: row.frequency ?? null,
    observedAt: row.datetime || row.time_received || null,
    temperatureC: row.temp ?? null,
    humidity: row.humidity ?? null,
    velocityVertical: row.vel_v ?? null,
  };
}

export async function fetchWeatherSondes(lat, lon, radiusMiles = 250) {
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radius: String(Math.max(radiusMiles, 50)),
  });

  const res = await fetch(`${SONDEHUB_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`SondeHub unavailable (${res.status})`);
  }

  const body = await res.json();
  const sondes = Object.entries(body || {})
    .map(([serial, row]) => normalizeSonde(serial, row))
    .filter(Boolean)
    .map((sonde) => ({
      ...sonde,
      distanceMiles: Math.round(distanceMiles(lat, lon, sonde.lat, sonde.lon) * 10) / 10,
    }))
    .filter((sonde) => sonde.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 100);

  const payload = {
    source: 'api.v2.sondehub.org',
    fetchedAt: new Date().toISOString(),
    count: sondes.length,
    radiusMiles,
    sondes,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
