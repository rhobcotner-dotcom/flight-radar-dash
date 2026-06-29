import { fetchCityEmsIncidents, configuredCityFeeds } from './cityEmsFeeds.js';
import { fetchArcgisEmsIncidents, configuredArcgisFeeds } from './arcgisEmsFeeds.js';
import { fetchPulsePointIncidents, configuredPulsePointFeeds } from './pulsePointIncidents.js';

/**
 * Aggregate EMS/fire incidents from all wired source types (Socrata, ArcGIS, PulsePoint).
 * @param {{ west?: number, south?: number, east?: number, north?: number } | null} bbox
 */
export async function fetchEmsIncidents(bbox) {
  const [socrata, arcgis, pulsePoint] = await Promise.all([
    fetchCityEmsIncidents(bbox).catch((err) => ({ error: err.message, incidents: [], feeds: [] })),
    fetchArcgisEmsIncidents(bbox).catch((err) => ({ error: err.message, incidents: [], feeds: [] })),
    fetchPulsePointIncidents(bbox).catch((err) => ({ error: err.message, incidents: [], feeds: [] })),
  ]);

  const gaps = [];
  if (socrata.error) gaps.push({ source: 'socrata-ems', error: socrata.error });
  if (arcgis.error) gaps.push({ source: 'arcgis-ems', error: arcgis.error });
  if (pulsePoint.error) gaps.push({ source: 'pulsepoint', error: pulsePoint.error });

  const incidents = [...(socrata.incidents || []), ...(arcgis.incidents || []), ...(pulsePoint.incidents || [])];
  const feeds = [...(socrata.feeds || []), ...(arcgis.feeds || []), ...(pulsePoint.feeds || [])];

  return {
    source: 'Multi-source EMS/Fire incidents',
    timingClass: 'mixed',
    sources: {
      socrata: socrata.error ? { error: socrata.error } : { count: socrata.count, feedCount: socrata.feeds?.length },
      arcgis: arcgis.error ? { error: arcgis.error } : { count: arcgis.count, feedCount: arcgis.feeds?.length },
      pulsePoint: pulsePoint.error ? { error: pulsePoint.error } : { count: pulsePoint.count, feedCount: pulsePoint.feeds?.length },
    },
    gaps,
    feeds,
    count: incidents.length,
    incidents,
  };
}

export function allConfiguredEmsFeeds() {
  return [...configuredCityFeeds(), ...configuredArcgisFeeds(), ...configuredPulsePointFeeds()];
}

/** @deprecated use fetchEmsIncidents */
export const fetchCityEmsIncidentsAggregated = fetchEmsIncidents;
