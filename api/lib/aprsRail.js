import { distanceMiles, pointInBoundingBox } from '../../lib/geo.js';
import { fetchAprsStations } from './aprs.js';
import { fetchAprsFiMapStations } from './aprsFiMap.js';
import { fetchAprsIsStations, getAprsIsStatus } from './aprsIs.js';
import { parseTrainSymbol } from './freightSymbolParser.js';
import { nearestPointOnPolyline } from './overpassQuery.js';
import { getRailNetworkForBbox, normalizeRailOperator } from './railNetwork.js';
import { searchCenter } from './viewportQuery.js';

const RAIL_KEYWORDS =
  /\b(loco|locomotive|freight|manifest|train|railroad|rail yard|yard job|bnsf|csx|ns\b|kcs|up\b|cn\b|cp\b|norfolk|union pacific|metra\b|amtrak\b|intermodal|hopper|unit train|stack train|coal train|grain|ethanol|autorack|doublestack|mixed freight|local freight|road freight|dpu\b|sd70|es44|ac44|dash-?9|gevo|tank train|baretable|mty|mt\b|loads|empties|tow|tonnage|rr\b)\b/i;

const RAILROAD_IN_COMMENT = /\b(BNSF|CSX|NS|UP|KCS|CN|CP|CPKC|UPRR|NSRR|METRA|AMTK)\b/i;
const RAIL_FAN_TAGS = /\b(RR|RAIL|TRN|LOCO|RAILFAN)\b/i;

const NON_RAIL_COMMENT =
  /\b(xastir|uiview|javaprssrv|openaprs|aprsfi|winlink|igate|rptr|repeater|dmr|d-star|mmdvm|echolink|balloon|beacon|wx|weather|monitoring|a=\d{3,}|d=\d{3,})\b|>/i;
const NON_RAIL_PI = /\bpi\s*\d+[a-z0-9]*\b/i;

const RAIL_SYMBOL = /^[A-Z]{1,4}[0-9]{2,5}$/i;

/** Known railroad-related APRS callsign prefixes (Class I + major regionals). */
export const RAIL_CALLSIGN_PATTERNS = [
  /^BNSF/i,
  /^BN[0-9]{1,4}[A-Z0-9-]*$/i,
  /^CSX/i,
  /^NS[0-9]{1,4}[A-Z0-9-]*$/i,
  /^UP[0-9]{1,4}[A-Z0-9-]*$/i,
  /^UPRR/i,
  /^KCS/i,
  /^CPKC/i,
  /^CN[0-9]{1,4}[A-Z0-9-]*$/i,
  /^CP[0-9]{1,4}[A-Z0-9-]*$/i,
  /^AMTK/i,
  /^METRA/i,
  /^METX/i,
  /^NJT/i,
  /^MARC/i,
  /^VIA/i,
];

export function matchesRailCallsign(callsign) {
  const call = String(callsign || '').trim();
  if (!call) return false;
  return RAIL_CALLSIGN_PATTERNS.some((pattern) => pattern.test(call));
}

function hasRailEvidence(callsign, comment) {
  const haystack = `${callsign} ${comment}`.trim();
  if (!haystack) return false;
  if (NON_RAIL_COMMENT.test(comment) && !RAIL_KEYWORDS.test(haystack) && !RAILROAD_IN_COMMENT.test(haystack)) {
    return false;
  }
  if (NON_RAIL_PI.test(comment) && !RAIL_KEYWORDS.test(haystack) && !RAILROAD_IN_COMMENT.test(haystack)) {
    return false;
  }
  if (RAIL_KEYWORDS.test(haystack)) return true;
  if (RAILROAD_IN_COMMENT.test(haystack)) return true;
  if (parseTrainSymbol(haystack)) return true;
  if (RAIL_SYMBOL.test(callsign) && RAIL_FAN_TAGS.test(haystack)) return true;
  if (/^(W?[A-Z0-9]{1,2}[0-9][A-Z0-9]{1,3}|[A-Z]{2,4}[0-9]{2,4})$/i.test(callsign) && RAIL_FAN_TAGS.test(haystack)) {
    return true;
  }
  return false;
}

export function isAprsRailEntry(station) {
  if (!station) return false;
  const callsign = String(station.callsign || '').trim();
  const comment = String(station.comment || '').trim();
  return hasRailEvidence(callsign, comment);
}

export function hasFreightCargoClue(stationOrTrain) {
  const comment = String(stationOrTrain?.comment || stationOrTrain?.routeName || '').trim();
  const callsign = String(stationOrTrain?.callsign || stationOrTrain?.trainNum || stationOrTrain?.originCode || '').trim();
  const haystack = `${callsign} ${comment}`.trim();
  if (!haystack) return false;
  if (parseTrainSymbol(haystack, stationOrTrain?.railroad)) return true;
  return RAIL_KEYWORDS.test(haystack);
}

const SNAP_THRESHOLD_MILES = 0.5;

/**
 * Snap a position to the nearest cached track segment within threshold.
 * @param {number} lat
 * @param {number} lon
 * @param {import('./railNetwork.js').RailSegment[]} railNetwork
 */
export function snapToNearestTrack(lat, lon, railNetwork) {
  if (!Array.isArray(railNetwork) || railNetwork.length === 0) {
    return { lat, lon, snappedLat: null, snappedLon: null, inferredRailroad: null };
  }

  let best = null;
  let bestSegment = null;
  for (const segment of railNetwork) {
    const hit = nearestPointOnPolyline(lat, lon, segment.coordinates);
    if (!hit || hit.distanceMiles > SNAP_THRESHOLD_MILES) continue;
    if (!best || hit.distanceMiles < best.distanceMiles) {
      best = hit;
      bestSegment = segment;
    }
  }

  if (!best || !bestSegment) {
    return { lat, lon, snappedLat: null, snappedLon: null, inferredRailroad: null };
  }

  return {
    lat,
    lon,
    snappedLat: best.lat,
    snappedLon: best.lon,
    inferredRailroad: normalizeRailOperator(bestSegment.operator) || null,
  };
}

function resolveSearchBbox(area, radiusMiles) {
  if (area.viewport) return area.viewport;
  const center = searchCenter(area);
  const latDelta = radiusMiles / 69;
  const lonDelta = radiusMiles / (69 * Math.cos((center.lat * Math.PI) / 180));
  return {
    south: center.lat - latDelta,
    north: center.lat + latDelta,
    west: center.lon - lonDelta,
    east: center.lon + lonDelta,
  };
}

function applyTrackSnap(train, railNetwork) {
  const snap = snapToNearestTrack(train.lat, train.lon, railNetwork);
  if (snap.snappedLat == null || snap.snappedLon == null) return train;
  return {
    ...train,
    snappedLat: snap.snappedLat,
    snappedLon: snap.snappedLon,
    inferredRailroad: snap.inferredRailroad || train.railroad,
    railroad: train.railroad || snap.inferredRailroad || null,
  };
}

export function normalizeAprsRailTrain(station) {
  if (!station || !isAprsRailEntry(station)) return null;

  const callsign = String(station.callsign || 'APRS').trim();
  const comment = String(station.comment || '').trim();
  const speedKph = Number(station.speed);
  let speedMph = Number.isFinite(speedKph) ? Math.round(speedKph * 0.621371) : null;
  if (Number.isFinite(speedMph) && (speedMph > 70 || speedMph < 1)) speedMph = null;

  const railroad = comment.match(RAILROAD_IN_COMMENT)?.[1]?.toUpperCase().replace('CPKC', 'KCS') || null;
  const knownRailCallsign = matchesRailCallsign(callsign);
  const cargoClue = knownRailCallsign || hasFreightCargoClue({ ...station, callsign, comment, railroad });

  return {
    trainNum: callsign.slice(0, 12),
    trainId: `aprs:${callsign.toLowerCase()}`,
    routeName: comment.slice(0, 80) || callsign,
    lat: station.lat,
    lon: station.lon,
    heading: station.course != null && Number(station.course) >= 0 ? Math.round(Number(station.course)) : null,
    velocityMph: Number.isFinite(speedMph) ? speedMph : null,
    timely: station.observedAt || null,
    originCode: callsign,
    destCode: null,
    trainState: cargoClue ? 'confirmed' : 'beacon',
    trainKind: 'freight',
    railroad,
    crossingStatus: null,
    sourceLabel: station.sourceLabel || 'APRS rail',
    cargoClue,
  };
}

function dedupeStations(stations) {
  const byCall = new Map();
  for (const station of stations) {
    const key = String(station.callsign || '').toLowerCase();
    if (!key) continue;
    byCall.set(key, station);
  }
  return [...byCall.values()];
}

async function fetchAprsFiStations(area, radiusMiles) {
  const apiKey = String(process.env.APRS_FI_API_KEY || '').trim();
  const payload = apiKey
    ? await fetchAprsStations(area.lat, area.lon, radiusMiles, { maxStations: 120 })
    : await fetchAprsFiMapStations(area.lat, area.lon, radiusMiles, { maxStations: 120 });

  if (!payload.enabled) {
    return { stations: [], configured: false, message: payload.message };
  }
  return {
    stations: payload.stations.map((station) => ({
      ...station,
      distanceMiles:
        station.distanceMiles ??
        Math.round(distanceMiles(area.lat, area.lon, station.lat, station.lon) * 10) / 10,
      sourceLabel: payload.source?.includes('xml2') ? 'APRS map' : 'APRS rail',
    })),
    configured: true,
  };
}

async function fetchAprsIsRailStations(area, radiusMiles) {
  const status = getAprsIsStatus();
  if (!status.configured) {
    return { stations: [], configured: false, message: status.message };
  }

  const stations = await fetchAprsIsStations();
  return {
    stations: stations.map((station) => ({
      ...station,
      distanceMiles: Math.round(distanceMiles(area.lat, area.lon, station.lat, station.lon) * 10) / 10,
      sourceLabel: 'APRS-IS rail',
    })),
    configured: true,
  };
}

export async function fetchAprsRailTrains(area, radiusMiles) {
  const center = searchCenter(area);
  const queryArea = { ...area, lat: center.lat, lon: center.lon };
  const [fiResult, isResult] = await Promise.allSettled([
    fetchAprsFiStations(queryArea, radiusMiles),
    fetchAprsIsRailStations(queryArea, radiusMiles),
  ]);

  const merged = [];
  let configured = false;
  let message = null;

  if (fiResult.status === 'fulfilled' && fiResult.value.configured) {
    configured = true;
    merged.push(...fiResult.value.stations);
  } else if (fiResult.status === 'fulfilled' && fiResult.value.message) {
    message = fiResult.value.message;
  }

  if (isResult.status === 'fulfilled') {
    if (isResult.value.configured) {
      configured = true;
      merged.push(...isResult.value.stations);
    } else if (isResult.value.message) {
      message = isResult.value.message;
    }
  }

  const stations = dedupeStations(merged).filter((station) => {
    if (area.viewport) {
      return pointInBoundingBox(station.lat, station.lon, area.viewport);
    }
    return station.distanceMiles == null || station.distanceMiles <= radiusMiles;
  });

  const { segments: railNetwork } = getRailNetworkForBbox(resolveSearchBbox(area, radiusMiles));

  const trains = stations
    .map(normalizeAprsRailTrain)
    .filter(Boolean)
    .map((train) => ({
      ...train,
      distanceMiles:
        train.distanceMiles ??
        Math.round(distanceMiles(center.lat, center.lon, train.lat, train.lon) * 10) / 10,
    }))
    .filter((train) =>
      area.viewport
        ? pointInBoundingBox(train.lat, train.lon, area.viewport)
        : train.distanceMiles <= radiusMiles
    )
    .map((train) => applyTrackSnap(train, railNetwork))
    .sort((a, b) => {
      if (Boolean(a.cargoClue) !== Boolean(b.cargoClue)) return a.cargoClue ? -1 : 1;
      return a.distanceMiles - b.distanceMiles;
    })
    .slice(0, 150);

  return {
    trains,
    configured,
    count: trains.length,
    message: configured ? null : message,
  };
}
