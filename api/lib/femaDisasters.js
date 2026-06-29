import { queryArcGisGeoJson } from './arcgisQuery.js';
import { enrichFemaDisaster } from './emergencyEnrichment.js';
import { pointInBoundingBox } from '../../lib/geo.js';
import { recordFeedFetch, classifyFeedStatus } from './feedTelemetry.js';

const OPENFEMA =
  'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries';
const TIGER_COUNTIES =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 30 * 60 * 1000;

let cache = { fetchedAt: 0, payload: null };

function geoidFromFips(stateCode, countyCode) {
  const state = String(stateCode || '').padStart(2, '0');
  const county = String(countyCode || '').padStart(3, '0');
  if (!/^\d{2}$/.test(state) || !/^\d{3}$/.test(county)) return null;
  return `${state}${county}`;
}

async function fetchActiveDeclarations() {
  const params = new URLSearchParams({
    $filter: 'incidentEndDate eq null',
    $orderby: 'declarationDate desc',
    $top: '500',
  });
  const res = await fetch(`${OPENFEMA}?${params.toString()}`, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`FEMA OpenFEMA unavailable (${res.status})`);
  const body = await res.json();
  return Array.isArray(body?.DisasterDeclarationsSummaries) ? body.DisasterDeclarationsSummaries : [];
}

async function fetchCountyPolygon(geoid) {
  const features = await queryArcGisGeoJson(TIGER_COUNTIES, 1, {
    where: `GEOID='${geoid}'`,
    outFields: 'GEOID,NAME,BASENAME,STATE,COUNTY',
    limit: 1,
  });
  return features[0] || null;
}

function featureIntersectsBbox(feature, bbox) {
  if (!bbox || !feature?.geometry) return true;
  const coords = feature.geometry.coordinates;
  const visit = (lon, lat) => pointInBoundingBox(lat, lon, bbox);

  if (feature.geometry.type === 'Polygon') {
    return coords.some((ring) => ring.some(([lon, lat]) => visit(lon, lat)));
  }
  if (feature.geometry.type === 'MultiPolygon') {
    return coords.some((poly) => poly.some((ring) => ring.some(([lon, lat]) => visit(lon, lat))));
  }
  return true;
}

export async function fetchFemaDisasters(bbox) {
  if (cache.payload && Date.now() - cache.fetchedAt < CACHE_MS) {
    return filterFemaPayload(cache.payload, bbox);
  }

  const declarations = await fetchActiveDeclarations();
  const geoidMap = new Map();
  for (const row of declarations) {
    const geoid = geoidFromFips(row.fipsStateCode, row.fipsCountyCode);
    if (!geoid) continue;
    if (!geoidMap.has(geoid)) geoidMap.set(geoid, []);
    geoidMap.get(geoid).push(row);
  }

  const geoids = [...geoidMap.keys()].slice(0, 80);
  const polygonResults = await Promise.all(
    geoids.map(async (geoid) => {
      try {
        const feature = await fetchCountyPolygon(geoid);
        return { geoid, feature };
      } catch {
        return { geoid, feature: null };
      }
    })
  );

  const features = [];
  for (const { geoid, feature } of polygonResults) {
    const rows = geoidMap.get(geoid) || [];
    for (const row of rows) {
      const enriched = enrichFemaDisaster(row);
      if (feature?.geometry) {
        features.push({
          type: 'Feature',
          id: `fema:${row.id || row.femaDeclarationString}`,
          geometry: feature.geometry,
          properties: {
            ...row,
            ...enriched,
            entityKind: 'fema-disaster',
            geoid,
            countyName: feature.properties?.NAME || row.designatedArea,
          },
        });
      } else {
        features.push({
          type: 'Feature',
          id: `fema:${row.id || row.femaDeclarationString}`,
          geometry: null,
          properties: {
            ...row,
            ...enriched,
            entityKind: 'fema-disaster',
            geoid,
            countyName: row.designatedArea,
            geometryGap: 'County boundary unavailable',
          },
        });
      }
    }
  }

  const payload = {
    source: 'FEMA OpenFEMA',
    timingClass: 'static',
    timingNote: 'Declaration records update on administrative cadence, not minute-by-minute',
    declarationCount: declarations.length,
    countyCount: features.filter((f) => f.geometry).length,
    collection: { type: 'FeatureCollection', features },
  };

  cache = { fetchedAt: Date.now(), payload };
  recordFeedFetch('fema-open', {
    group: 'emergency',
    status: classifyFeedStatus({ entityCount: payload.countyCount }),
    entityCount: payload.countyCount,
    endpoint: OPENFEMA,
    warning: payload.countyCount === 0 ? 'No county polygons resolved for open declarations' : null,
  });
  return filterFemaPayload(payload, bbox);
}

function filterFemaPayload(payload, bbox) {
  if (!bbox) return payload;
  const features = payload.collection.features.filter((feature) => featureIntersectsBbox(feature, bbox));
  return {
    ...payload,
    collection: { type: 'FeatureCollection', features },
    countyCount: features.filter((f) => f.geometry).length,
  };
}
