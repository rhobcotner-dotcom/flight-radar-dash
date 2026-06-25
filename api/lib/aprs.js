import { distanceMiles } from '../../lib/geo.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 45 * 1000;

let cache = { fetchedAt: 0, data: null };

export async function fetchAprsStations(lat, lon, radiusMiles = 50, options = {}) {
  const apiKey = String(process.env.APRS_FI_API_KEY || '').trim();
  const maxRadiusKm = Number(process.env.APRS_MAX_RADIUS_KM) || 160;
  const radiusKm = Math.min(maxRadiusKm, Math.max(1, Math.round(radiusMiles * 1.609)));
  const maxStations = Number(options.maxStations) || 80;
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusKm}:${maxStations}:${apiKey ? 'on' : 'off'}`;

  if (!apiKey) {
    return {
      enabled: false,
      source: 'api.aprs.fi',
      message: 'Set APRS_FI_API_KEY in .env (free at aprs.fi → account settings) for ham APRS positions.',
      fetchedAt: new Date().toISOString(),
      count: 0,
      radiusMiles,
      stations: [],
    };
  }

  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lon),
    radius: String(radiusKm),
    apikey: apiKey,
    format: 'json',
  });

  const res = await fetch(`https://api.aprs.fi/api/get?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`APRS feed unavailable (${res.status})`);

  const body = await res.json();
  if (body?.result !== 'ok') {
    throw new Error(body?.result || 'APRS feed error');
  }

  const stations = (Array.isArray(body.entries) ? body.entries : [])
    .map((row) => {
      const sLat = Number(row.lat);
      const sLon = Number(row.lng ?? row.lon);
      if (!Number.isFinite(sLat) || !Number.isFinite(sLon)) return null;
      return {
        callsign: row.name,
        lat: sLat,
        lon: sLon,
        comment: row.comment || '',
        course: row.course != null ? Number(row.course) : null,
        speed: row.speed != null ? Number(row.speed) : null,
        observedAt: row.time ? new Date(Number(row.time) * 1000).toISOString() : null,
        distanceMiles:
          Math.round(distanceMiles(lat, lon, sLat, sLon) * 10) / 10,
      };
    })
    .filter(Boolean)
    .filter((row) => row.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, maxStations);

  const payload = {
    enabled: true,
    source: 'api.aprs.fi',
    fetchedAt: new Date().toISOString(),
    count: stations.length,
    radiusMiles,
    stations,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
