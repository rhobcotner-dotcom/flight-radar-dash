import { distanceMiles } from '../../lib/geo.js';

const USDM_URL = 'https://mesonet.agron.iastate.edu/geojson/usdm.py';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 6 * 60 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lon, lat, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    return pointInRing(lon, lat, geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => pointInRing(lon, lat, poly[0]));
  }
  return false;
}

function droughtLabel(level) {
  const labels = ['None', 'D0 Abnormally dry', 'D1 Moderate drought', 'D2 Severe', 'D3 Extreme', 'D4 Exceptional'];
  return labels[Number(level)] || `D${level}`;
}

export async function fetchUsDrought(lat, lon, radiusMiles = 120) {
  const cacheKey = `${lat.toFixed(1)}:${lon.toFixed(1)}:${radiusMiles}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const res = await fetch(USDM_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`US Drought Monitor unavailable (${res.status})`);

  const body = await res.json();
  const homeLevel = (() => {
    for (const feature of body?.features || []) {
      if (pointInGeometry(lon, lat, feature.geometry)) {
        return Number(feature.properties?.dm ?? feature.properties?.DM ?? 0);
      }
    }
    return null;
  })();

  const features = (body?.features || [])
    .map((feature) => {
      const level = Number(feature.properties?.dm ?? feature.properties?.DM ?? 0);
      if (level <= 0) return null;
      const coords = feature.geometry?.coordinates?.[0]?.[0];
      if (!Array.isArray(coords) || !coords.length) return null;
      const mid = coords[Math.floor(coords.length / 2)];
      const fLat = mid[1];
      const fLon = mid[0];
      return {
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          level,
          label: droughtLabel(level),
          date: feature.properties?.date || body?.date || null,
          distanceMiles:
            Math.round(distanceMiles(lat, lon, fLat, fLon) * 10) / 10,
        },
      };
    })
    .filter(Boolean)
    .filter((feature) => feature.properties.distanceMiles <= radiusMiles)
    .slice(0, 40);

  const payload = {
    type: 'FeatureCollection',
    source: 'mesonet.agron.iastate.edu/usdm',
    fetchedAt: new Date().toISOString(),
    count: features.length,
    radiusMiles,
    homeLevel,
    homeLabel: homeLevel == null ? 'Unknown' : droughtLabel(homeLevel),
    features,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
