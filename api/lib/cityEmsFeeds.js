import cityFeeds from '../../config/emergency-city-feeds.json' with { type: 'json' };
import { enrichEmsIncident } from './emergencyEnrichment.js';
import { distanceMiles } from '../../lib/geo.js';
import { recordFeedFetch, classifyFeedStatus } from './feedTelemetry.js';
import { geocodeCensusBatch } from './censusGeocoder.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 60 * 1000;

const NYC_BOROUGH_CENTROIDS = {
  MANHATTAN: { lat: 40.7831, lon: -73.9712 },
  BRONX: { lat: 40.8448, lon: -73.8648 },
  BROOKLYN: { lat: 40.6782, lon: -73.9442 },
  QUEENS: { lat: 40.7282, lon: -73.7949 },
  'STATEN ISLAND': { lat: 40.5795, lon: -74.1502 },
};

let cache = new Map();

function parseNycIncident(row, feed) {
  const borough = String(row.incident_borough || row.alarm_box_borough || '').trim().toUpperCase();
  const centroid = NYC_BOROUGH_CENTROIDS[borough];
  if (!centroid) return null;

  const title = String(row.incident_classification || row.incident_classification_group || 'FDNY dispatch').trim();
  const address = String(row.alarm_box_location || row.incident_location || '').trim();
  const alarmLevel = String(row.highest_alarm_level || row.alarm_level_index_description || '').trim();

  return enrichEmsIncident({
    id: `${feed.id}:${row.starfire_incident_id || row.incident_datetime}`,
    lat: centroid.lat,
    lon: centroid.lon,
    city: feed.city,
    agency: feed.agency,
    source: feed.id,
    sourceType: 'socrata-open-data',
    timingClass: feed.timingClass,
    title,
    type: title,
    address,
    alarmLevel,
    status: row.incident_close_datetime ? 'Closed' : 'Active',
    observedAt: row.incident_datetime || null,
    closedAt: row.incident_close_datetime || null,
    incidentNumber: row.starfire_incident_id ? String(row.starfire_incident_id) : null,
    entityKind: 'ems-incident',
    geocodeNote: borough ? `Borough centroid · ${borough}` : null,
  });
}

function normalizeCensusAddress(raw, feed) {
  const text = String(raw || '').trim();
  if (!text) return null;
  if (text.includes('/')) {
    return text.replace(/\s*\/\s*/g, ' & ');
  }
  return text;
}

function parseCensusGeocodedIncident(row, feed, geo) {
  if (!geo) return null;
  const addressField = feed.addressField || 'location';
  const rawAddress = String(row[addressField] || row.location || row.address || '').trim();
  const title = String(row.nature_of_call || row.type || row.incident_type || row.description || 'Fire/EMS').trim();

  return enrichEmsIncident({
    id: `${feed.id}:${row.incident_number || row.id || `${geo.lat}:${geo.lon}:${row[feed.orderField]}`}`,
    lat: geo.lat,
    lon: geo.lon,
    city: feed.city,
    agency: feed.agency,
    source: feed.id,
    sourceType: 'socrata-open-data',
    timingClass: feed.timingClass,
    title,
    type: title,
    address: rawAddress,
    status: 'Dispatched',
    observedAt: row[feed.orderField] || row.datetime || row.date || null,
    incidentNumber: row.incident_number ? String(row.incident_number) : row.id ? String(row.id) : null,
    entityKind: 'ems-incident',
    geocodeNote: feed.geocodeNote || 'Census Bureau geocoded (not GPS dispatch coordinates)',
  });
}

function parseGenericIncident(row, feed) {
  const lat = Number(row[feed.latField] ?? row.latitude ?? row.lat);
  const lon = Number(row[feed.lonField] ?? row.longitude ?? row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const title = String(row.type || row.incident_type || row.description || row.emergency_dispatch_code || 'Fire/EMS').trim();
  const address = String(row.address || row.location || row.alarm_box_location || '').trim();
  const priority = String(row.priority || row.emergency_priority || '').trim() || null;
  const alarmLevel = String(row.alarm_level || row.highest_alarm_level || '').trim() || null;

  return enrichEmsIncident({
    id: `${feed.id}:${row.incident_number || row.id || `${lat}:${lon}:${row[feed.orderField]}`}`,
    lat,
    lon,
    city: feed.city,
    agency: feed.agency,
    source: feed.id,
    sourceType: 'socrata-open-data',
    timingClass: feed.timingClass,
    title,
    type: title,
    address,
    priority,
    alarmLevel,
    status: row.status || row.incident_status || 'Dispatched',
    observedAt: row[feed.orderField] || row.datetime || null,
    closedAt: row.closed_at || row.incident_close_datetime || null,
    incidentNumber: row.incident_number ? String(row.incident_number) : row.id ? String(row.id) : null,
    entityKind: 'ems-incident',
  });
}

function parseObservedAt(row, field) {
  const raw = row[field];
  if (!raw) return null;
  const ms = Date.parse(String(raw));
  return Number.isFinite(ms) ? ms : null;
}

function isRecentRow(row, feed) {
  const observed = parseObservedAt(row, feed.orderField);
  if (!Number.isFinite(observed)) return true;
  const hoursBack = feed.hoursBack || 4;
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  return observed >= cutoff;
}

function rowsForFeed(rows, feed) {
  const recent = rows.filter((row) => isRecentRow(row, feed));
  if (recent.length > 0 || !feed.staleFallbackHours) return recent;

  const staleCutoff = Date.now() - feed.staleFallbackHours * 60 * 60 * 1000;
  return rows.filter((row) => {
    const observed = parseObservedAt(row, feed.orderField);
    return Number.isFinite(observed) && observed >= staleCutoff;
  });
}

async function fetchCityFeed(feed) {
  if (!feed.enabled) {
    return { feed: feed.id, enabled: false, gap: feed.gapNote || 'Disabled in config', incidents: [] };
  }

  const cacheKey = `${feed.id}:${feed.hoursBack || 4}:${feed.staleFallbackHours || 0}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached.payload;
  }

  const params = new URLSearchParams({
    $limit: '150',
    $order: `${feed.orderField} DESC`,
  });

  const res = await fetch(`${feed.url}?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });

  if (!res.ok) {
    return {
      feed: feed.id,
      enabled: false,
      gap: `HTTP ${res.status}`,
      incidents: [],
      city: feed.city,
    };
  }

  const rows = await res.json();
  if (!Array.isArray(rows)) {
    return { feed: feed.id, enabled: false, gap: 'Invalid JSON', incidents: [], city: feed.city };
  }

  const filteredRows = rowsForFeed(rows, feed);
  let censusGeoMap = null;
  if (feed.geocode === 'census') {
    const addressField = feed.addressField || 'location';
    const uniqueAddresses = [
      ...new Set(
        filteredRows
          .map((row) => normalizeCensusAddress(row[addressField], feed))
          .filter(Boolean)
      ),
    ];
    censusGeoMap = await geocodeCensusBatch(uniqueAddresses, {
      city: feed.geocodeCity || feed.city,
      state: feed.geocodeState,
      concurrency: 2,
    });
  }

  const incidents = filteredRows
    .map((row) => {
      let incident = null;
      if (feed.geocode === 'census') {
        const addressField = feed.addressField || 'location';
        const normalized = normalizeCensusAddress(row[addressField], feed);
        incident = parseCensusGeocodedIncident(row, feed, normalized ? censusGeoMap?.get(normalized) : null);
      } else if (feed.geocode === true) {
        incident = parseNycIncident(row, feed);
      } else {
        incident = parseGenericIncident(row, feed);
      }
      if (!incident) return null;
      const observed = parseObservedAt(row, feed.orderField);
      const hoursBack = feed.hoursBack || 4;
      const isStale =
        Number.isFinite(observed) && observed < Date.now() - hoursBack * 60 * 60 * 1000;
      if (isStale) {
        incident.status = 'Dataset lag — latest available row';
        incident.timingClass = 'static';
        incident.geocodeNote = incident.geocodeNote
          ? `${incident.geocodeNote} · portal data stale`
          : 'Portal data stale vs real-time dispatch';
      }
      return incident;
    })
    .filter(Boolean);

  const payload = {
    feed: feed.id,
    city: feed.city,
    agency: feed.agency,
    enabled: true,
    timingClass: feed.timingClass,
    timingNote: feed.timingNote,
    count: incidents.length,
    incidents,
  };

  cache.set(cacheKey, { fetchedAt: Date.now(), payload });
  const latestObserved = incidents.reduce((max, row) => {
    const ms = Date.parse(String(row.observedAt || ''));
    return Number.isFinite(ms) && ms > max ? ms : max;
  }, 0);
  const dataAgeMs = latestObserved ? Date.now() - latestObserved : null;
  const status = classifyFeedStatus({
    disabled: !feed.enabled,
    error: payload.gap && !payload.enabled ? payload.gap : null,
    entityCount: incidents.length,
    dataAgeMs,
    staleAfterMs: (feed.hoursBack || 4) * 60 * 60 * 1000,
  });
  recordFeedFetch(feed.id, {
    group: 'emergency',
    status,
    entityCount: incidents.length,
    dataAgeMs,
    latestObservedAt: latestObserved ? new Date(latestObserved).toISOString() : null,
    endpoint: feed.url,
    warning:
      status === 'STALE'
        ? `Latest row older than ${feed.hoursBack}h window`
        : incidents.length === 0 && feed.enabled
          ? 'Zero incidents after time filter'
          : null,
  });
  return payload;
}

export async function fetchCityEmsIncidents(bbox) {
  const feeds = cityFeeds.filter((feed) => feed.enabled === true);
  const results = await Promise.all(feeds.map((feed) => fetchCityFeed(feed)));

  const incidents = results
    .flatMap((result) => result.incidents || [])
    .filter((incident) => {
      if (!bbox) return true;
      return (
        incident.lat >= bbox.south &&
        incident.lat <= bbox.north &&
        incident.lon >= bbox.west &&
        incident.lon <= bbox.east
      );
    })
    .map((incident) => ({
      ...incident,
      distanceMiles: bbox
        ? Math.round(
            distanceMiles((bbox.north + bbox.south) / 2, (bbox.west + bbox.east) / 2, incident.lat, incident.lon) * 10
          ) / 10
        : null,
    }));

  return {
    source: 'City open data (Socrata)',
    timingClass: 'mixed',
    feeds: results,
    count: incidents.length,
    incidents,
  };
}

export function configuredCityFeeds() {
  return cityFeeds;
}
