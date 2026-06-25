import { distanceMiles } from '../../lib/geo.js';

const FAA_WFS =
  'https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=TFR:V_TFR_LOC&outputFormat=application/json';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 5 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

function polygonCentroid(coordinates) {
  const ring = coordinates?.[0];
  if (!Array.isArray(ring) || !ring.length) return null;

  let latSum = 0;
  let lonSum = 0;
  for (const [lon, lat] of ring) {
    latSum += lat;
    lonSum += lon;
  }

  return { lat: latSum / ring.length, lon: lonSum / ring.length };
}

function geometryDistanceMiles(geometry, lat, lon) {
  if (geometry?.type === 'Polygon') {
    const center = polygonCentroid(geometry.coordinates);
    return center ? distanceMiles(lat, lon, center.lat, center.lon) : Infinity;
  }

  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((best, polygon) => {
      const center = polygonCentroid(polygon);
      if (!center) return best;
      return Math.min(best, distanceMiles(lat, lon, center.lat, center.lon));
    }, Infinity);
  }

  return Infinity;
}

function normalizeTfrFeature(feature) {
  const props = feature?.properties || {};
  if (!feature?.geometry) return null;

  const title = props.TITLE || props.title || 'Temporary Flight Restriction';
  const legal = props.LEGAL || props.legal || 'TFR';

  return {
    type: 'Feature',
    id: props.NOTAM_KEY || props.GID || feature.id,
    geometry: feature.geometry,
    properties: {
      id: String(props.NOTAM_KEY || props.GID || feature.id),
      title,
      legal,
      state: props.STATE || '',
      notamKey: props.NOTAM_KEY || '',
      modifiedAt: props.LAST_MODIFICATION_DATETIME || null,
    },
  };
}

export async function fetchAreaTfrs(lat, lon, radiusMiles = 120) {
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const res = await fetch(`${FAA_WFS}&maxFeatures=500`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`FAA TFR feed unavailable (${res.status})`);
  }

  const body = await res.json();
  const features = (Array.isArray(body?.features) ? body.features : [])
    .map(normalizeTfrFeature)
    .filter(Boolean)
    .map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        distanceMiles: Math.round(geometryDistanceMiles(feature.geometry, lat, lon) * 10) / 10,
      },
    }))
    .filter((feature) => feature.properties.distanceMiles <= radiusMiles)
    .sort((a, b) => a.properties.distanceMiles - b.properties.distanceMiles);

  const payload = {
    type: 'FeatureCollection',
    source: 'tfr.faa.gov',
    fetchedAt: new Date().toISOString(),
    count: features.length,
    radiusMiles,
    features,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
