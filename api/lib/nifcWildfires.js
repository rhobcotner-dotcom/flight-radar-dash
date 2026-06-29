import { queryArcGisGeoJson } from './arcgisQuery.js';
import { enrichWildfireIncident, enrichWildfirePerimeter } from './emergencyEnrichment.js';
import { pointInBoundingBox } from '../../lib/geo.js';
import { recordFeedFetch, classifyFeedStatus } from './feedTelemetry.js';

const WFIGS_PERIMETERS =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters/FeatureServer';
const WFIGS_INCIDENTS =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations/FeatureServer';

const PERIMETER_WHERE =
  "poly_IsVisible='Yes' AND poly_FeatureStatus='Approved' AND (attr_PercentContained IS NULL OR attr_PercentContained < 100)";
const INCIDENT_WHERE = 'PercentContained IS NULL OR PercentContained < 100';
const RECENT_MS = 21 * 24 * 60 * 60 * 1000;

function envelopeFromBbox(bbox) {
  if (!bbox) return null;
  return `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
}

function isRecentPerimeter(props) {
  const current = Number(props?.poly_DateCurrent ?? props?.attr_ModifiedOnDateTime_dt);
  if (!Number.isFinite(current)) return true;
  return Date.now() - current <= RECENT_MS;
}

function normalizePerimeterFeature(feature) {
  if (!feature?.geometry) return null;
  if (!isRecentPerimeter(feature.properties)) return null;
  enrichWildfirePerimeter(feature);
  const props = feature.properties || {};
  return {
    type: 'Feature',
    id: `nifc-perimeter:${props.poly_IRWINID || props.OBJECTID || props.poly_IncidentName}`,
    geometry: feature.geometry,
    properties: {
      ...props,
      entityKind: 'wildfire-perimeter',
      containmentPct: props.attr_PercentContained,
      acres: props.poly_GISAcres ?? props.poly_Acres_AutoCalc,
      cause: props.attr_FireCause,
    },
  };
}

function normalizeIncidentFeature(feature) {
  const props = feature?.properties || {};
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const discovered = Number(props.FireDiscoveryDateTime);
  if (Number.isFinite(discovered) && Date.now() - discovered > RECENT_MS) return null;

  const incident = enrichWildfireIncident({
    id: `nifc-incident:${props.IncidentName || props.OBJECTID}`,
    lat,
    lon,
    name: props.IncidentName,
    containmentPct: props.PercentContained,
    acres: props.DiscoveryAcres ?? props.IncidentSize,
    cause: props.FireCause,
    status: props.PercentContained != null ? `${props.PercentContained}% contained` : 'Active',
  });

  return {
    ...incident,
    entityKind: 'wildfire-incident',
    containmentPct: props.PercentContained,
    acres: props.DiscoveryAcres ?? props.IncidentSize,
    cause: props.FireCause,
  };
}

export async function fetchNifcWildfires(bbox, { limit = 500 } = {}) {
  const geometry = envelopeFromBbox(bbox);
  const queryOpts = {
    where: PERIMETER_WHERE,
    outFields:
      'poly_IncidentName,attr_PercentContained,poly_GISAcres,poly_Acres_AutoCalc,attr_FireCause,poly_DateCurrent,poly_IRWINID,OBJECTID',
    limit,
    geometry,
    orderByFields: 'poly_DateCurrent DESC',
  };

  const [perimeterRows, incidentRows] = await Promise.all([
    queryArcGisGeoJson(WFIGS_PERIMETERS, 0, queryOpts),
    queryArcGisGeoJson(WFIGS_INCIDENTS, 0, {
      where: INCIDENT_WHERE,
      outFields: 'IncidentName,PercentContained,DiscoveryAcres,IncidentSize,FireCause,FireDiscoveryDateTime,OBJECTID',
      limit: Math.min(limit, 300),
      geometry,
      orderByFields: 'FireDiscoveryDateTime DESC',
    }),
  ]);

  let perimeterFeatures = perimeterRows.map(normalizePerimeterFeature).filter(Boolean);
  if (bbox) {
    perimeterFeatures = perimeterFeatures.filter((feature) => {
      if (feature.geometry.type === 'Polygon') {
        return feature.geometry.coordinates.some((ring) =>
          ring.some(([lon, lat]) => pointInBoundingBox(lat, lon, bbox))
        );
      }
      if (feature.geometry.type === 'MultiPolygon') {
        return feature.geometry.coordinates.some((poly) =>
          poly.some((ring) => ring.some(([lon, lat]) => pointInBoundingBox(lat, lon, bbox)))
        );
      }
      return true;
    });
  }

  const incidents = incidentRows.map(normalizeIncidentFeature).filter(Boolean);

  recordFeedFetch('nifc-wfigs', {
    group: 'emergency',
    status: classifyFeedStatus({
      entityCount: perimeterFeatures.length + incidents.length,
      degraded: perimeterFeatures.length === 0 && incidents.length > 0,
    }),
    entityCount: perimeterFeatures.length + incidents.length,
    endpoint: WFIGS_PERIMETERS,
    warning:
      perimeterFeatures.length === 0 && incidents.length > 0
        ? 'Incident points returned but no perimeter polygons in viewport'
        : perimeterFeatures.length + incidents.length === 0
          ? 'Zero wildfire features in viewport after filters'
          : null,
  });

  return {
    source: 'NIFC WFIGS',
    timingClass: 'real-time',
    cacheNote: 'ArcGIS cacheMaxAge ~300s',
    perimeterCollection: {
      type: 'FeatureCollection',
      features: perimeterFeatures,
    },
    incidents,
    perimeterCount: perimeterFeatures.length,
    incidentCount: incidents.length,
  };
}
