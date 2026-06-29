import {
  filterFreshGeoFeatures,
  filterFreshIncidents,
  ipawsAlertObservedMs,
  nwsAlertObservedMs,
  wildfirePerimeterObservedMs,
} from './emergencyFreshness.js';

/** Build top-N newest lists from nationwide feed snapshots (not map viewport). */
const RECENT_LIMIT = 10;

function parseObservedMs(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

function visitGeometryCoords(geometry, visitor) {
  if (!geometry?.coordinates) return;
  if (geometry.type === 'Point') {
    visitor(geometry.coordinates[0], geometry.coordinates[1]);
    return;
  }
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      for (const [lon, lat] of ring) visitor(lon, lat);
    }
    return;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) {
        for (const [lon, lat] of ring) visitor(lon, lat);
      }
    }
  }
}

function geometryBounds(geometry) {
  if (!geometry) return null;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  visitGeometryCoords(geometry, (lon, lat) => {
    if (lon < west) west = lon;
    if (lon > east) east = lon;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  });
  if (!Number.isFinite(west)) return null;
  return { west, south, east, north };
}

function boundsCenter(bounds) {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lon: (bounds.west + bounds.east) / 2,
  };
}

function pickPopupProps(source) {
  return {
    emergencyLabel: source.emergencyLabel ?? null,
    emergencyName: source.emergencyName ?? null,
    emergencyStatus: source.emergencyStatus ?? null,
    emergencySeverity: source.emergencySeverity ?? null,
    emergencySource: source.emergencySource ?? null,
    emergencyKind: source.emergencyKind ?? null,
    emergencyTimingClass: source.emergencyTimingClass ?? null,
    containmentPct: source.containmentPct ?? null,
    acres: source.acres ?? null,
    cause: source.cause ?? null,
    countyName: source.countyName ?? null,
    geocodeNote: source.geocodeNote ?? null,
    title: source.title ?? null,
    address: source.address ?? null,
    agency: source.agency ?? source.agencyName ?? null,
    observedAt: source.observedAt ?? null,
    areaDesc: source.areaDesc ?? null,
    headline: source.headline ?? null,
    event: source.event ?? null,
  };
}

function topRecent(items, limit = RECENT_LIMIT) {
  return [...items]
    .sort((a, b) => parseObservedMs(b.observedAt) - parseObservedMs(a.observedAt))
    .slice(0, limit);
}

function emsToRecent(incident) {
  return {
    id: incident.id,
    category: 'ems',
    title: incident.emergencyName || incident.title || 'EMS call',
    subtitle: incident.agency || incident.city || incident.emergencyLabel || null,
    lat: incident.lat,
    lon: incident.lon,
    observedAt: incident.observedAt || null,
    geometryType: 'point',
    properties: pickPopupProps(incident),
  };
}

function featureToRecent(feature, category, observedAt) {
  const props = feature.properties || {};
  const bounds = feature.geometry ? geometryBounds(feature.geometry) : null;
  const center = bounds ? boundsCenter(bounds) : null;
  if (!center && category !== 'fema') return null;

  return {
    id: String(feature.id || props.id),
    category,
    title: props.emergencyName || props.headline || props.poly_IncidentName || props.declarationTitle || 'Emergency',
    subtitle: props.emergencyLabel || props.areaDesc || props.countyName || props.designatedArea || null,
    lat: center?.lat ?? null,
    lon: center?.lon ?? null,
    observedAt: observedAt || null,
    geometryType: feature.geometry ? 'polygon' : 'point',
    bounds,
    geometry: feature.geometry || null,
    properties: pickPopupProps({ ...props, observedAt }),
  };
}

function perimeterObservedAt(props) {
  const current = Number(props?.poly_DateCurrent ?? props?.attr_ModifiedOnDateTime_dt);
  return Number.isFinite(current) ? new Date(current).toISOString() : null;
}

function incidentObservedAt(incident) {
  const discovered = Number(incident.FireDiscoveryDateTime ?? incident.observedAt);
  if (Number.isFinite(discovered)) {
    return new Date(discovered < 1e12 ? discovered * 1000 : discovered).toISOString();
  }
  return incident.observedAt || null;
}

export function buildEmergencyRecentLists({
  nifc,
  fema,
  nws,
  ipaws,
  socrata,
  arcgis,
  pulsePointIncidents = [],
}) {
  const emsIncidents = filterFreshIncidents([
    ...pulsePointIncidents,
    ...(socrata?.incidents || []),
    ...(arcgis?.incidents || []),
  ]).map(emsToRecent);

  const wildfirePerimeters = filterFreshGeoFeatures(
    nifc?.perimeterCollection?.features,
    wildfirePerimeterObservedMs
  )
    .map((feature) =>
      featureToRecent(feature, 'wildfire-perimeter', perimeterObservedAt(feature.properties))
    )
    .filter(Boolean);

  const nwsAlerts = filterFreshGeoFeatures(nws?.collection?.features, nwsAlertObservedMs)
    .map((feature) =>
      featureToRecent(
        feature,
        'nws',
        feature.properties?.effective || feature.properties?.onset || null
      )
    )
    .filter(Boolean);

  const femaZones = (fema?.collection?.features || [])
    .map((feature) =>
      featureToRecent(feature, 'fema', feature.properties?.declarationDate || null)
    )
    .filter((item) => item && (item.lat != null || item.bounds));

  const ipawsAlerts = filterFreshGeoFeatures(ipaws?.collection?.features, ipawsAlertObservedMs)
    .map((feature) => featureToRecent(feature, 'ipaws', feature.properties?.sent || null))
    .filter(Boolean);

  return {
    ems: topRecent(emsIncidents),
    wildfirePerimeters: topRecent(wildfirePerimeters),
    nwsAlerts: topRecent(nwsAlerts),
    femaZones: topRecent(femaZones),
    ipawsAlerts: topRecent(ipawsAlerts),
  };
}
