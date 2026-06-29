import { fetchNifcWildfires } from './nifcWildfires.js';
import { fetchFemaDisasters } from './femaDisasters.js';
import { fetchNwsEmergencyAlerts } from './nwsEmergencyAlerts.js';
import { fetchIpawsAlerts } from './ipawsAlerts.js';
import { fetchCityEmsIncidents } from './cityEmsFeeds.js';
import { fetchArcgisEmsIncidents } from './arcgisEmsFeeds.js';
import {
  getPulsePointGlobalStats,
  getPulsePointGlobalIncidents,
  kickPulsePointGlobalRefresh,
} from './pulsePointIncidents.js';
import { buildEmergencyRecentLists } from './emergencyRecentEvents.js';
import {
  filterFreshGeoFeatures,
  filterFreshIncidents,
  ipawsAlertObservedMs,
  wildfirePerimeterObservedMs,
} from './emergencyFreshness.js';

const CACHE_MS = 90 * 1000;
const CONUS_BBOX = { west: -130, south: 24, east: -66, north: 50 };

let cache = { fetchedAt: 0, payload: null };

export async function fetchEmergencyTrackingStats() {
  if (cache.payload && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.payload;
  }

  const pulsePointGlobal = getPulsePointGlobalStats();
  if (!pulsePointGlobal || Date.now() - pulsePointGlobal.fetchedAt > 90_000) {
    kickPulsePointGlobalRefresh();
  }

  const [nifcResult, femaResult, nwsResult, ipawsResult, socrataResult, arcgisResult] =
    await Promise.allSettled([
      fetchNifcWildfires(CONUS_BBOX),
      fetchFemaDisasters(CONUS_BBOX),
      fetchNwsEmergencyAlerts(CONUS_BBOX),
      fetchIpawsAlerts(),
      fetchCityEmsIncidents(CONUS_BBOX),
      fetchArcgisEmsIncidents(CONUS_BBOX),
    ]);

  const nifc = nifcResult.status === 'fulfilled' ? nifcResult.value : null;
  const fema = femaResult.status === 'fulfilled' ? femaResult.value : null;
  const nws = nwsResult.status === 'fulfilled' ? nwsResult.value : null;
  const ipaws = ipawsResult.status === 'fulfilled' ? ipawsResult.value : null;
  const socrata = socrataResult.status === 'fulfilled' ? socrataResult.value : null;
  const arcgis = arcgisResult.status === 'fulfilled' ? arcgisResult.value : null;

  const pulsePointGlobalFresh = getPulsePointGlobalStats();
  const freshPulsePoint = filterFreshIncidents(getPulsePointGlobalIncidents());
  const freshSocrata = filterFreshIncidents(socrata?.incidents || []);
  const freshArcgis = filterFreshIncidents(arcgis?.incidents || []);
  const pulsePointLive = freshPulsePoint.length;
  const socrataLive = freshSocrata.length;
  const arcgisLive = freshArcgis.length;
  const liveIncidents = pulsePointLive + socrataLive + arcgisLive;

  const freshNwsCount = filterFreshGeoFeatures(nws?.collection?.features, nwsAlertObservedMs).length;
  const freshWildfirePerimeters = filterFreshGeoFeatures(
    nifc?.perimeterCollection?.features,
    wildfirePerimeterObservedMs
  ).length;
  const freshWildfireIncidents = filterFreshIncidents(nifc?.incidents || []).length;
  const freshIpawsCount = filterFreshGeoFeatures(ipaws?.collection?.features, ipawsAlertObservedMs).length;

  const recent = buildEmergencyRecentLists({
    nifc,
    fema: fema ? await fetchFemaDisasters(null).catch(() => fema) : null,
    nws: nws ? await fetchNwsEmergencyAlerts(null).catch(() => nws) : null,
    ipaws,
    socrata: socrata ? await fetchCityEmsIncidents(null).catch(() => socrata) : null,
    arcgis: arcgis ? await fetchArcgisEmsIncidents(null).catch(() => arcgis) : null,
    pulsePointIncidents: freshPulsePoint,
  });

  const payload = {
    liveIncidents,
    pulsePointLive,
    socrataLive,
    arcgisLive,
    wildfirePerimeters: freshWildfirePerimeters,
    wildfireIncidents: freshWildfireIncidents,
    femaCounties: fema?.countyCount ?? 0,
    nwsAlerts: freshNwsCount,
    ipawsAlerts: freshIpawsCount,
    approximate: !pulsePointGlobalFresh || freshPulsePoint.length === 0,
    recentScope: 'nationwide',
    recent,
    partial: {
      pulsePoint: !pulsePointGlobalFresh,
      nifc: nifcResult.status !== 'fulfilled',
      fema: femaResult.status !== 'fulfilled',
      nws: nwsResult.status !== 'fulfilled',
      ipaws: ipawsResult.status !== 'fulfilled',
      socrata: socrataResult.status !== 'fulfilled',
      arcgis: arcgisResult.status !== 'fulfilled',
    },
  };

  cache = { fetchedAt: Date.now(), payload };
  return payload;
}
