import { fetchNifcWildfires } from './nifcWildfires.js';
import { fetchFemaDisasters } from './femaDisasters.js';
import { fetchNwsEmergencyAlerts } from './nwsEmergencyAlerts.js';
import { fetchIpawsAlerts } from './ipawsAlerts.js';
import { fetchEmsIncidents, allConfiguredEmsFeeds } from './emsIncidentFeeds.js';
import { attachViewportToArea, emsFetchBbox, searchBbox } from './viewportQuery.js';
import { resolveArea } from './area.js';
import { stableViewportCacheKey } from '../../lib/viewportCacheKey.js';
import { applyEmergencyMapFreshness } from './emergencyFreshness.js';

const RESPONSE_CACHE_MS = 45 * 1000;
/** @type {Map<string, { fetchedAt: number, payload: unknown }>} */
const responseCache = new Map();

/**
 * Aggregate emergency services data for map overlay.
 * @param {Record<string, unknown>} query
 */
export async function fetchEmergencyServices(query = {}) {
  const area = attachViewportToArea(resolveArea(query), query);
  const bbox = searchBbox(area, area.queryRadiusMiles || area.radiusMiles || 500);
  const emsBbox = emsFetchBbox(area);
  const zoom = Number(query.zoom);
  const cacheKey = stableViewportCacheKey({
    west: bbox.west,
    south: bbox.south,
    east: bbox.east,
    north: bbox.north,
    zoom: Number.isFinite(zoom) ? zoom : 10,
  });
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < RESPONSE_CACHE_MS) {
    return cached.payload;
  }

  const sourceCounts = {};
  const gaps = [];

  const [nifc, fema, nws, ipaws, cityEms] = await Promise.all([
    fetchNifcWildfires(bbox).catch((err) => ({ error: err.message })),
    fetchFemaDisasters(bbox).catch((err) => ({ error: err.message })),
    fetchNwsEmergencyAlerts(bbox).catch((err) => ({ error: err.message })),
    fetchIpawsAlerts().catch((err) => ({ error: err.message })),
    fetchEmsIncidents(emsBbox).catch((err) => ({ error: err.message })),
  ]);

  if (nifc.error) gaps.push({ source: 'nifc-wfigs', error: nifc.error });
  else sourceCounts.nifcPerimeters = nifc.perimeterCount || 0;
  if (fema.error) gaps.push({ source: 'fema-open', error: fema.error });
  else sourceCounts.femaCounties = fema.countyCount || 0;
  if (nws.error) gaps.push({ source: 'nws-cap', error: nws.error });
  else sourceCounts.nwsAlerts = nws.count || 0;
  if (ipaws.error) gaps.push({ source: 'ipaws-cap', error: ipaws.error });
  else sourceCounts.ipawsAlerts = ipaws.count || 0;
  if (cityEms.error) gaps.push({ source: 'city-ems', error: cityEms.error });
  else sourceCounts.cityEms = cityEms.count || 0;

  for (const feed of allConfiguredEmsFeeds()) {
    if (feed.enabled === false && feed.gapNote) {
      gaps.push({ source: feed.id, gap: feed.gapNote, city: feed.city });
    }
  }

  if (Array.isArray(cityEms.feeds)) {
    for (const feed of cityEms.feeds) {
      if (feed.gap) gaps.push({ source: feed.feed, gap: feed.gap, city: feed.city });
    }
  }

  const ipawsInView =
    ipaws.collection?.features?.filter((feature) => {
      if (!feature.geometry || !bbox) return true;
      const ring = feature.geometry.coordinates?.[0];
      if (!Array.isArray(ring)) return false;
      return ring.some(([lon, lat]) => lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east);
    }) || [];

  const payload = applyEmergencyMapFreshness({
    fetchedAt: new Date().toISOString(),
    bbox,
    sourceCounts,
    gaps,
    nifc: nifc.error ? null : nifc,
    fema: fema.error ? null : fema,
    nws: nws.error ? null : nws,
    ipaws: ipaws.error
      ? null
      : {
          ...ipaws,
          inViewCollection: { type: 'FeatureCollection', features: ipawsInView },
          inViewCount: ipawsInView.length,
        },
    cityEms: cityEms.error ? null : cityEms,
    summary: {
      wildfirePerimeters: nifc.perimeterCount || 0,
      wildfireIncidents: nifc.incidentCount || 0,
      femaCounties: fema.countyCount || 0,
      nwsAlerts: nws.count || 0,
      ipawsAlerts: ipawsInView.length,
      cityEms: cityEms.count || 0,
    },
  });

  responseCache.set(cacheKey, { fetchedAt: Date.now(), payload });
  return payload;
}
