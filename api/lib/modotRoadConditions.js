import { distanceMiles } from '../../lib/geo.js';
import { queryArcGisGeoJson } from './arcgisQuery.js';

const MODOT_BASE =
  'https://mapping.modot.org/arcgis/rest/services/TravelerInformation/TravelerInformationMod/MapServer';
const CACHE_MS = 3 * 60 * 1000;

const LAYERS = [
  { id: 1, kind: 'flood-closed', label: 'Flood closed' },
  { id: 2, kind: 'workzone-closed', label: 'Work zone closed' },
  { id: 3, kind: 'planned-closed', label: 'Planned closure' },
  { id: 4, kind: 'winter-closed', label: 'Winter weather closed' },
  { id: 5, kind: 'traffic-delay', label: 'Traffic delay' },
  { id: 6, kind: 'flood-delay', label: 'Flood delay' },
  { id: 7, kind: 'workzone-delay', label: 'Work zone delay' },
  { id: 10, kind: 'workzone-possible', label: 'Possible work zone delay' },
  { id: 26, kind: 'winter-condition', label: 'Winter road condition' },
];

let cache = { fetchedAt: 0, data: null };

function featureCoords(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;

  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    return { lat, lon };
  }

  if (geometry.type === 'LineString' && geometry.coordinates?.length) {
    const mid = geometry.coordinates[Math.floor(geometry.coordinates.length / 2)];
    return { lat: mid[1], lon: mid[0] };
  }

  if (geometry.type === 'MultiLineString' && geometry.coordinates?.[0]?.length) {
    const line = geometry.coordinates[0];
    const mid = line[Math.floor(line.length / 2)];
    return { lat: mid[1], lon: mid[0] };
  }

  return null;
}

function normalizeFeature(feature, layer) {
  const props = feature?.properties || {};
  const coords = featureCoords(feature);
  if (!coords) return null;

  const status = String(props.STATUS || props.status || '').toUpperCase();
  if (status && status !== 'ACTIVE') return null;

  const title = [
    props.TRAVELWAY_NAME,
    props.DIRECTION,
    props.LEVEL_OF_IMPACT || layer.label,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    type: 'Feature',
    id: `${layer.kind}-${props.OBJECTID || props.ESRI_OID || props.TI_WZ_ID || Math.random()}`,
    geometry: feature.geometry,
    properties: {
      id: String(props.OBJECTID || props.ESRI_OID || props.TI_WZ_ID || ''),
      kind: layer.kind,
      label: layer.label,
      title: title || layer.label,
      county: props.COUNTY_NAME || '',
      impact: props.LEVEL_OF_IMPACT || '',
      workType: props.WORK_TYPE || '',
      comment: String(props.EXTERNAL_COMMENT || '').trim(),
      startDate: props.START_DATE || null,
      endDate: props.END_DATE || null,
      lat: coords.lat,
      lon: coords.lon,
    },
  };
}

export async function fetchModotRoadConditions(lat, lon, radiusMiles = 85) {
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const rows = await Promise.all(
    LAYERS.map(async (layer) => {
      try {
        const features = await queryArcGisGeoJson(MODOT_BASE, layer.id, {
          outFields:
            'OBJECTID,ESRI_OID,TI_WZ_ID,LEVEL_OF_IMPACT,WORK_TYPE,TRAVELWAY_NAME,DIRECTION,STATUS,COUNTY_NAME,EXTERNAL_COMMENT,START_DATE,END_DATE',
        });
        return features.map((feature) => normalizeFeature(feature, layer)).filter(Boolean);
      } catch {
        return [];
      }
    })
  );

  const features = rows
    .flat()
    .map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        distanceMiles:
          Math.round(distanceMiles(lat, lon, feature.properties.lat, feature.properties.lon) * 10) / 10,
      },
    }))
    .filter((feature) => feature.properties.distanceMiles <= radiusMiles)
    .sort((a, b) => a.properties.distanceMiles - b.properties.distanceMiles)
    .slice(0, 120);

  const counts = features.reduce((acc, feature) => {
    const kind = feature.properties.kind;
    acc[kind] = (acc[kind] || 0) + 1;
    return acc;
  }, {});

  const payload = {
    type: 'FeatureCollection',
    source: 'mapping.modot.org',
    fetchedAt: new Date().toISOString(),
    count: features.length,
    radiusMiles,
    counts,
    features,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
