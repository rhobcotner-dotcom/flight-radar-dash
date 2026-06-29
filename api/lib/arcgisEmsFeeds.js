import arcgisFeeds from '../../config/emergency-arcgis-feeds.json' with { type: 'json' };
import { queryArcGisGeoJson } from './arcgisQuery.js';
import { enrichEmsIncident } from './emergencyEnrichment.js';
import { distanceMiles } from '../../lib/geo.js';
import { recordFeedFetch, classifyFeedStatus } from './feedTelemetry.js';

const CACHE_MS = 60 * 1000;
let cache = new Map();

function pickField(props, fields) {
  if (!Array.isArray(fields)) return null;
  for (const field of fields) {
    const value = props?.[field];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function parseObservedMs(value, type) {
  if (value == null) return null;
  if (type === 'epochMs') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'montgomeryDispatch') {
    const match = String(value).match(/(\d{4}-\d{2}-\d{2})\s*@\s*(\d{2}:\d{2}:\d{2})/);
    if (!match) return Date.parse(String(value)) || null;
    return Date.parse(`${match[1]}T${match[2]}`);
  }
  if (type === 'incidentIdYear') {
    const year = Number(String(value).match(/^(\d{4})/)?.[1]);
    if (!Number.isFinite(year)) return null;
    return Date.parse(`${year}-01-01T00:00:00Z`);
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function coordsFromFeature(feature, feed) {
  const props = feature?.properties || {};
  if (feed.useGeometry !== false) {
    if (feature?.geometry?.type === 'Point') {
      const [lon, lat] = feature.geometry.coordinates;
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
    const lat = Number(props[feed.latField]);
    const lon = Number(props[feed.lonField]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

function normalizeArcgisFeature(feature, feed) {
  const props = feature?.properties || {};
  const coords = coordsFromFeature(feature, feed);
  if (!coords) return null;

  const title =
    pickField(props, feed.titleFields) ||
    pickField(props, feed.typeFields) ||
    'Fire/EMS dispatch';
  const address = pickField(props, feed.addressFields);
  const observedAt = props[feed.orderField] ?? null;
  const observedMs = parseObservedMs(observedAt, feed.orderFieldType);

  return enrichEmsIncident({
    id: `${feed.id}:${props.OBJECTID || props.objectid || props.MasterIncidentNumber || props.incident || `${coords.lat}:${coords.lon}`}`,
    lat: coords.lat,
    lon: coords.lon,
    city: feed.city,
    agency: feed.agency,
    source: feed.id,
    sourceType: feed.sourceType || 'arcgis-featureserver',
    timingClass: feed.timingClass,
    title,
    type: pickField(props, feed.typeFields) || title,
    address,
    status: pickField(props, feed.statusFields) || 'Active',
    observedAt: observedMs ? new Date(observedMs).toISOString() : observedAt,
    entityKind: 'ems-incident',
  });
}

function isRecentFeature(feature, feed) {
  const props = feature?.properties || {};
  const observedMs = parseObservedMs(props[feed.orderField], feed.orderFieldType);
  if (!Number.isFinite(observedMs)) return true;
  const cutoff = Date.now() - (feed.hoursBack || 4) * 60 * 60 * 1000;
  return observedMs >= cutoff;
}

async function fetchArcgisFeed(feed, bbox) {
  if (feed.enabled === false) {
    return { feed: feed.id, enabled: false, gap: feed.gapNote || 'Disabled', incidents: [], city: feed.city };
  }

  const cacheKey = `${feed.id}:${bbox ? `${bbox.west},${bbox.south},${bbox.east},${bbox.north}` : 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached.payload;
  }

  try {
    const geometry = bbox ? `${bbox.west},${bbox.south},${bbox.east},${bbox.north}` : null;
    const rows = await queryArcGisGeoJson(feed.baseUrl, feed.layerId ?? 0, {
      where: feed.where || '1=1',
      outFields: feed.outFields || '*',
      limit: feed.limit || 200,
      geometry,
      orderByFields: feed.orderField ? `${feed.orderField} DESC` : undefined,
      outSR: feed.geometryOutSr || (feed.useGeometry ? 4326 : undefined),
    });

    const incidents = rows
      .filter((row) => isRecentFeature(row, feed))
      .map((row) => normalizeArcgisFeature(row, feed))
      .filter(Boolean);

    const payload = {
      feed: feed.id,
      city: feed.city,
      agency: feed.agency,
      enabled: true,
      sourceType: feed.sourceType,
      timingClass: feed.timingClass,
      timingNote: feed.timingNote,
      count: incidents.length,
      incidents,
    };

    const latestObserved = incidents.reduce((max, row) => {
      const ms = Date.parse(String(row.observedAt || ''));
      return Number.isFinite(ms) && ms > max ? ms : max;
    }, 0);

    recordFeedFetch(feed.id, {
      group: 'emergency',
      status: classifyFeedStatus({
        entityCount: incidents.length,
        dataAgeMs: latestObserved ? Date.now() - latestObserved : null,
        staleAfterMs: (feed.hoursBack || 4) * 60 * 60 * 1000,
      }),
      entityCount: incidents.length,
      dataAgeMs: latestObserved ? Date.now() - latestObserved : null,
      latestObservedAt: latestObserved ? new Date(latestObserved).toISOString() : null,
      endpoint: feed.baseUrl,
      warning: incidents.length === 0 ? 'Zero ArcGIS incidents in viewport after filters' : null,
    });

    cache.set(cacheKey, { fetchedAt: Date.now(), payload });
    return payload;
  } catch (err) {
    const payload = {
      feed: feed.id,
      city: feed.city,
      enabled: false,
      gap: err.message,
      incidents: [],
    };
    recordFeedFetch(feed.id, {
      group: 'emergency',
      status: 'OFFLINE',
      error: err.message,
      endpoint: feed.baseUrl,
    });
    return payload;
  }
}

export function configuredArcgisFeeds() {
  return arcgisFeeds;
}

export async function fetchArcgisEmsIncidents(bbox) {
  const feeds = arcgisFeeds.filter((feed) => feed.enabled === true);
  const results = await Promise.all(feeds.map((feed) => fetchArcgisFeed(feed, bbox)));

  const incidents = results
    .flatMap((result) => result.incidents || [])
    .map((incident) => ({
      ...incident,
      distanceMiles: bbox
        ? Math.round(
            distanceMiles((bbox.north + bbox.south) / 2, (bbox.west + bbox.east) / 2, incident.lat, incident.lon) * 10
          ) / 10
        : null,
    }));

  return {
    source: 'ArcGIS FeatureServer (CAD/911)',
    timingClass: 'mixed',
    feeds: results,
    count: incidents.length,
    incidents,
  };
}
