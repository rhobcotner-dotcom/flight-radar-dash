import { boundingBox, distanceMiles } from '../../lib/geo.js';
import { enrichNwsEmergencyAlert } from './emergencyEnrichment.js';
import { recordFeedFetch, classifyFeedStatus } from './feedTelemetry.js';

const NWS_ALERTS = 'https://api.weather.gov/alerts/active';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 60 * 1000;

let cache = { fetchedAt: 0, payload: null };

function classifyNwsAlert(event, props) {
  const label = String(event || '').toLowerCase();
  if (label.includes('amber') || label.includes('child abduction')) return 'nws-amber';
  if (label.includes('911') && label.includes('outage')) return 'nws-outage';
  if (label.includes('civil emergency') || label.includes('civil danger')) return 'nws-civil';
  if (label.includes('law enforcement')) return 'nws-law-enforcement';
  if (label.includes('emergency')) return 'nws-emergency';
  if (label.includes('warning')) return 'nws-warning';
  if (label.includes('watch')) return 'nws-watch';
  if (label.includes('statement')) return 'nws-statement';
  if (label.includes('advisory')) return 'nws-advisory';
  const msgType = String(props.messageType || '').toLowerCase();
  if (msgType.includes('alert')) return 'nws-warning';
  return 'nws-other';
}

function geometryIntersectsBbox(geometry, bbox) {
  if (!geometry?.coordinates || !bbox) return true;
  const visit = (lon, lat) =>
    lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east;

  if (geometry.type === 'Polygon') {
    return geometry.coordinates.some((ring) => ring.some(([lon, lat]) => visit(lon, lat)));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => poly.some((ring) => ring.some(([lon, lat]) => visit(lon, lat))));
  }
  return false;
}

function normalizeFeature(feature) {
  const props = feature?.properties || {};
  if (!feature?.geometry) return null;
  if (!['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) return null;

  const event = props.event || 'Weather alert';
  const alertClass = classifyNwsAlert(event, props);
  const normalized = {
    type: 'Feature',
    id: props.id || feature.id,
    geometry: feature.geometry,
    properties: {
      id: props.id || feature.id,
      alertClass,
      kind: alertClass,
      event,
      headline: props.headline || event,
      areaDesc: props.areaDesc || '',
      effective: props.effective || props.onset || null,
      expires: props.expires || props.ends || null,
      senderName: props.senderName || 'National Weather Service',
      severity: props.severity || '',
      urgency: props.urgency || '',
      certainty: props.certainty || '',
      messageType: props.messageType || '',
      entityKind: alertClass,
    },
  };

  enrichNwsEmergencyAlert(normalized.properties);

  return normalized;
}

export async function fetchNwsEmergencyAlerts(bbox) {
  if (cache.payload && Date.now() - cache.fetchedAt < CACHE_MS) {
    return filterPayload(cache.payload, bbox);
  }

  const res = await fetch(`${NWS_ALERTS}?status=actual`, {
    headers: { Accept: 'application/geo+json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`NWS alerts unavailable (${res.status})`);

  const body = await res.json();
  const features = (Array.isArray(body?.features) ? body.features : [])
    .map(normalizeFeature)
    .filter(Boolean);

  const counts = features.reduce((acc, feature) => {
    const key = feature.properties.alertClass;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const payload = {
    source: 'weather.gov',
    timingClass: 'real-time',
    timingNote: 'CAP alerts via api.weather.gov — typically under 2 min lag',
    count: features.length,
    counts,
    collection: { type: 'FeatureCollection', features },
  };

  cache = { fetchedAt: Date.now(), payload };
  recordFeedFetch('nws-cap-emergency', {
    group: 'emergency',
    status: classifyFeedStatus({ entityCount: features.length }),
    entityCount: features.length,
    endpoint: `${NWS_ALERTS}?status=actual`,
  });
  return filterPayload(payload, bbox);
}

function filterPayload(payload, bbox) {
  if (!bbox) return payload;
  const features = payload.collection.features.filter((feature) =>
    geometryIntersectsBbox(feature.geometry, bbox)
  );
  const counts = features.reduce((acc, feature) => {
    const key = feature.properties.alertClass;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    ...payload,
    count: features.length,
    counts,
    collection: { type: 'FeatureCollection', features },
  };
}

export function nwsAlertsNearPoint(lat, lon, radiusMiles, payload) {
  const features = payload.collection.features.filter((feature) => {
    if (!feature.geometry) return false;
    const ring = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0]?.[0];
    if (!Array.isArray(ring)) return false;
    return ring.some(([lng, lt]) => distanceMiles(lat, lon, lt, lng) <= radiusMiles);
  });
  return { ...payload, count: features.length, collection: { type: 'FeatureCollection', features } };
}

export function defaultSearchBbox(lat, lon, radiusMiles) {
  return boundingBox(lat, lon, radiusMiles);
}
