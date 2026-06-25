import { boundingBox, distanceMiles } from '../../lib/geo.js';

const NWS_ALERTS = 'https://api.weather.gov/alerts/active';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 60 * 1000;
const REGION_STATES = ['MO', 'IL', 'IA', 'AR', 'KS'];

let cache = { fetchedAt: 0, data: null };

function isPdsTornadoWarning(props) {
  const chunks = [
    props.headline,
    props.description,
    ...(Array.isArray(props.parameters?.NWSheadline) ? props.parameters.NWSheadline : []),
  ];
  const text = chunks.filter(Boolean).join(' ').toUpperCase();
  return (
    text.includes('PARTICULARLY DANGEROUS SITUATION') ||
    text.includes('PDS TORNADO') ||
    text.includes(' EXTREMELY DANGEROUS TORNADO')
  );
}

function classifyAlertKind(event, props) {
  const label = String(event || '').toLowerCase();
  if (label.includes('tornado warning')) {
    return isPdsTornadoWarning(props) ? 'tornado-pds' : 'tornado';
  }
  if (label.includes('severe thunderstorm warning')) return 'severe';
  if (label.includes('flash flood warning')) return 'flash-flood';
  if (label.includes('flood warning') || label.includes('flood advisory')) return 'flood';
  if (label.includes('winter storm') || label.includes('blizzard') || label.includes('ice storm')) {
    return 'winter';
  }
  if (label.includes('heat advisory') || label.includes('excessive heat')) return 'heat';
  if (label.includes('special marine warning')) return 'marine';
  return 'other';
}

function geometryNearPoint(geometry, lat, lon, radiusMiles) {
  if (!geometry?.coordinates) return false;

  const checkRing = (ring) =>
    ring.some(([ringLon, ringLat]) => distanceMiles(lat, lon, ringLat, ringLon) <= radiusMiles);

  if (geometry.type === 'Polygon') {
    return geometry.coordinates.some(checkRing);
  }

  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => polygon.some(checkRing));
  }

  return false;
}

function normalizePolygonFeature(feature) {
  const props = feature?.properties || {};
  if (!feature?.geometry) return null;
  if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return null;

  const event = props.event || 'Weather alert';

  return {
    type: 'Feature',
    id: props.id || feature.id,
    geometry: feature.geometry,
    properties: {
      id: props.id || feature.id,
      kind: classifyAlertKind(event, props),
      event,
      headline: props.headline || event,
      areaDesc: props.areaDesc || '',
      effective: props.effective || props.onset || null,
      expires: props.expires || props.ends || null,
      senderName: props.senderName || 'National Weather Service',
      severity: props.severity || '',
    },
  };
}

async function fetchStateAlerts(state) {
  const url = `${NWS_ALERTS}?area=${encodeURIComponent(state)}&status=actual`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/geo+json',
    },
  });

  if (!res.ok) {
    throw new Error(`NWS alerts unavailable for ${state} (${res.status})`);
  }

  const body = await res.json();
  return Array.isArray(body?.features) ? body.features : [];
}

export async function fetchWeatherAlertPolygons(lat, lon, radiusMiles = 120) {
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const featureMap = new Map();
  for (const state of REGION_STATES) {
    const rows = await fetchStateAlerts(state);
    for (const row of rows) {
      const normalized = normalizePolygonFeature(row);
      if (!normalized) continue;
      if (!geometryNearPoint(normalized.geometry, lat, lon, radiusMiles)) continue;
      featureMap.set(normalized.properties.id, normalized);
    }
  }

  const features = [...featureMap.values()];
  const counts = features.reduce((acc, feature) => {
    const kind = feature.properties.kind;
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});

  const payload = {
    type: 'FeatureCollection',
    source: 'weather.gov',
    fetchedAt: new Date().toISOString(),
    count: features.length,
    pdsCount: counts['tornado-pds'] || 0,
    tornadoCount: (counts.tornado || 0) + (counts['tornado-pds'] || 0),
    counts,
    bbox: boundingBox(lat, lon, radiusMiles),
    features,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}

/** Backward-compatible tornado-only export. */
export async function fetchTornadoWarningPolygons() {
  const all = await fetchWeatherAlertPolygons(38.7851, -90.5831, 200);
  const features = all.features.filter((feature) =>
    ['tornado', 'tornado-pds'].includes(feature.properties.kind)
  );

  return {
    ...all,
    features,
    count: features.length,
    pdsCount: features.filter((feature) => feature.properties.kind === 'tornado-pds').length,
  };
}
