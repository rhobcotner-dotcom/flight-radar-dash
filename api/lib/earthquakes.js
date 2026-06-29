import { distanceMiles } from '../../lib/geo.js';
import { enrichEarthquakeOccupancy } from './occupancyEnrichment.js';

const USGS_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 5 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

export async function fetchEarthquakes(lat, lon, radiusMiles = 500) {
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const res = await fetch(USGS_FEED, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`USGS earthquake feed unavailable (${res.status})`);
  }

  const body = await res.json();
  const events = (Array.isArray(body?.features) ? body.features : [])
    .map((feature) => {
      const coords = feature?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      const [eventLon, eventLat, depthKm] = coords;
      const props = feature?.properties || {};
      return enrichEarthquakeOccupancy({
        id: feature.id || props.code,
        lat: eventLat,
        lon: eventLon,
        magnitude: props.mag ?? null,
        place: props.place || 'Unknown location',
        time: props.time ? new Date(props.time).toISOString() : null,
        depthKm: depthKm ?? null,
        url: props.url || null,
        distanceMiles: Math.round(distanceMiles(lat, lon, eventLat, eventLon) * 10) / 10,
      });
    })
    .filter(Boolean)
    .filter((event) => event.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  const payload = {
    source: 'earthquake.usgs.gov',
    fetchedAt: new Date().toISOString(),
    count: events.length,
    radiusMiles,
    events,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
