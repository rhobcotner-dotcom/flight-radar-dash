import { distanceMiles } from '../../lib/geo.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 10 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

export async function fetchEbirdRecent(lat, lon, radiusMiles = 25) {
  const apiKey = String(process.env.EBIRD_API_KEY || '').trim();
  const distKm = Math.min(50, Math.max(1, Math.round(radiusMiles * 1.609)));
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${distKm}:${apiKey ? 'on' : 'off'}`;

  if (!apiKey) {
    return {
      enabled: false,
      source: 'api.ebird.org',
      message: 'Set EBIRD_API_KEY in .env (free at ebird.org/api/keygen) for recent bird observations.',
      fetchedAt: new Date().toISOString(),
      count: 0,
      radiusMiles,
      observations: [],
    };
  }

  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lon),
    dist: String(distKm),
    back: '7',
    maxResults: '50',
  });

  const res = await fetch(`https://api.ebird.org/v2/data/obs/geo/recent?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'X-eBirdApiToken': apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`eBird unavailable (${res.status})`);
  }

  const rows = await res.json();
  const observations = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const oLat = Number(row.lat);
      const oLon = Number(row.lng);
      if (!Number.isFinite(oLat) || !Number.isFinite(oLon)) return null;
      return {
        speciesCode: row.speciesCode,
        commonName: row.comName,
        scientificName: row.sciName,
        locationName: row.locName,
        observedAt: row.obsDt,
        count: row.howMany ?? null,
        lat: oLat,
        lon: oLon,
        distanceMiles:
          Math.round(distanceMiles(lat, lon, oLat, oLon) * 10) / 10,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime());

  const payload = {
    enabled: true,
    source: 'api.ebird.org',
    fetchedAt: new Date().toISOString(),
    count: observations.length,
    radiusMiles,
    observations,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
