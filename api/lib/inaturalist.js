import { distanceMiles } from '../../lib/geo.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 5 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

export async function fetchINaturalistObservations(lat, lon, radiusMiles = 25) {
  const radiusKm = Math.min(50, Math.max(1, Math.round(radiusMiles * 1.609)));
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusKm}`;

  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lon),
    radius: String(radiusKm),
    per_page: '40',
    order: 'desc',
    order_by: 'observed_at',
    geo: 'true',
    photos: 'true',
  });

  const res = await fetch(`https://api.inaturalist.org/v1/observations?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!res.ok) throw new Error(`iNaturalist unavailable (${res.status})`);

  const body = await res.json();
  const observations = (Array.isArray(body?.results) ? body.results : [])
    .map((row) => {
      const coords = row.geojson?.coordinates;
      const oLat = coords ? Number(coords[1]) : Number(row.location?.[0]);
      const oLon = coords ? Number(coords[0]) : Number(row.location?.[1]);
      if (!Number.isFinite(oLat) || !Number.isFinite(oLon)) return null;
      return {
        id: row.id,
        commonName:
          row.taxon?.preferred_common_name ||
          row.taxon?.name ||
          row.species_guess ||
          'Unknown species',
        scientificName: row.taxon?.name || null,
        observedOn: row.observed_on || row.time_observed_at,
        photoUrl: row.photos?.[0]?.url?.replace('square', 'medium') || null,
        lat: oLat,
        lon: oLon,
        distanceMiles:
          Math.round(distanceMiles(lat, lon, oLat, oLon) * 10) / 10,
      };
    })
    .filter(Boolean)
    .filter((row) => row.distanceMiles <= radiusMiles)
    .slice(0, 35);

  const payload = {
    source: 'api.inaturalist.org',
    fetchedAt: new Date().toISOString(),
    count: observations.length,
    radiusMiles,
    totalResults: body?.total_results ?? observations.length,
    observations,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
