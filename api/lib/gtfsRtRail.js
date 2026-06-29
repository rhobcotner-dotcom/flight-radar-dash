import bundled511 from '../../config/511-rail-agencies.json' with { type: 'json' };
import ctaRailRoutes from '../../config/cta-rail-routes.json' with { type: 'json' };
import {
  extractVehiclePositions,
  fetchGtfsRtPayload,
  flatten511Activities,
  parse511VehicleActivity,
} from './gtfsRtClient.js';
import {
  buildTripUpdateIndex,
  buildRouteAlertIndex,
  enrichVehicleRow,
  formatDirectionLabel,
} from './gtfsTransitDetails.js';
import { resolveStopName } from './gtfsStopNames.js';
import {
  feedUrlWithAuth,
  parseTransitFeedList,
  readEnv,
  resolveTrainKind,
} from './transitAgencies.js';
import { occupancyLevelFromLabel } from './occupancyEnrichment.js';
import { enrichTransitMotion } from './transitMotion.js';
import { filterInSearchRegion } from './viewportQuery.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 25 * 1000;

const feedCache = new Map();
let siri511Cache = { fetchedAt: 0, key: '', vehicles: [] };

const CTA_RAIL_ROUTE_IDS = new Set(ctaRailRoutes.routeIds || []);

function parse511Agencies() {
  const raw = readEnv('API_511_RAIL_AGENCIES');
  if (!raw) return bundled511;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : bundled511;
  } catch {
    return bundled511;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function metersPerSecondToMph(value) {
  const speed = Number(value);
  if (!Number.isFinite(speed) || speed <= 0.5) return null;
  return Math.round(speed * 2.23694);
}

function normalizeRegionalTrain({
  vehicleId,
  label,
  routeName,
  routeId,
  railroad,
  sourceLabel,
  lat,
  lon,
  bearing,
  speedMph,
  tripId,
  trainKind = 'passenger',
  observedAt = null,
  direction = null,
  headsign = null,
  lineCode = null,
  routeLabel = null,
  vehicleStatus = null,
  tripStartTime = null,
  delayMinutes = null,
  originStop = null,
  destStop = null,
  previousStop = null,
  nextStop = null,
  stopsRemaining = null,
  activeAlerts = null,
  lineName = null,
  occupancyLabel = null,
  occupancySource = null,
  originName = null,
  destName = null,
  originCode = null,
  destCode = null,
}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const id = String(vehicleId || label || `${lat}:${lon}`).trim();
  if (!id) return null;

  const heading =
    bearing != null && Number.isFinite(Number(bearing)) && Number(bearing) !== 0
      ? Math.round(Number(bearing))
      : null;

  return {
    trainNum: String(routeLabel || label || id).slice(0, 40),
    trainId: `${sourceLabel}:${id}`.toLowerCase().replace(/\s+/g, '-'),
    routeName: routeName || railroad || sourceLabel,
    routeId: routeId || null,
    lat,
    lon,
    heading,
    velocityMph: speedMph != null ? Math.round(Number(speedMph)) : null,
    timely: observedAt || null,
    observedAt,
    direction,
    headsign,
    lineCode,
    lineName,
    tripStartTime,
    delayMinutes,
    originCode: originCode || null,
    destCode: destCode || null,
    originName: originName || originStop?.name || null,
    destName: destName || destStop?.name || headsign || null,
    trainState: vehicleStatus || 'live',
    trainKind,
    railroad: railroad || sourceLabel,
    crossingStatus: null,
    sourceLabel,
    nextStop,
    previousStop,
    originStop,
    destStop,
    stopsRemaining,
    activeAlerts: activeAlerts?.length ? activeAlerts : null,
    occupancyLabel,
    occupancyLevel: occupancyLevelFromLabel(occupancyLabel),
    occupancySource: occupancyLabel ? occupancySource || 'gtfs-rt' : null,
    vehicleId: vehicleId || null,
    tripId: tripId || null,
  };
}

function isCtaRailRoute(routeId) {
  if (!routeId) return false;
  const id = String(routeId).trim();
  if (CTA_RAIL_ROUTE_IDS.has(id)) return true;
  return !/^\d+$/.test(id);
}

function resolveCtaTrainKind(routeId) {
  const id = String(routeId || '').trim();
  if (/^(Brn|G|Grn|Y|Pink)$/i.test(id)) return 'light_rail';
  return 'subway';
}

function filterPositionsForFeed(positions, feed) {
  if (feed.railRouteFilter !== 'cta-rail') return positions;
  return positions.filter((row) => isCtaRailRoute(row.routeId));
}

function positionsToTrains(positions, feed, tripIndex = null) {
  const defaultKind = resolveTrainKind(feed);
  const stopNameLookup = (stopId) => resolveStopName(feed.id, stopId);

  return positions
    .map((row) => {
      const trainKind =
        feed.railRouteFilter === 'cta-rail' ? resolveCtaTrainKind(row.routeId) : defaultKind;
      const motion = enrichTransitMotion(
        feed.id,
        row.vehicleId,
        row.lat,
        row.lon,
        row.bearing,
        row.speedMps
      );
      const details = enrichVehicleRow(row, { tripIndex, stopNameLookup, routeAlerts: feed.routeAlerts });
      const direction =
        details.direction ||
        (row.directionId != null
          ? formatDirectionLabel(row.directionId === 0 || row.directionId === '0' ? 'Inbound' : 'Outbound')
          : null);

      return normalizeRegionalTrain({
        vehicleId: row.vehicleId,
        label: row.label,
        routeLabel: details.routeLabel,
        routeName: row.routeId ? `${feed.railroad || feed.name} ${row.routeId}` : feed.name,
        routeId: row.routeId,
        railroad: feed.railroad || feed.name,
        sourceLabel: feed.name,
        lat: row.lat,
        lon: row.lon,
        bearing: motion.heading,
        speedMph: motion.speedMph,
        tripId: row.tripId,
        trainKind,
        observedAt: details.observedAt,
        direction,
        headsign: details.headsign,
        lineCode: details.lineCode,
        vehicleStatus: details.vehicleStatus,
        tripStartTime: details.tripStartTime,
        delayMinutes: details.delayMinutes,
        originStop: details.originStop,
        destStop: details.destStop,
        previousStop: details.previousStop,
        nextStop: details.nextStop,
        stopsRemaining: details.stopsRemaining,
        activeAlerts: details.activeAlerts,
        lineName: details.lineName,
        occupancyLabel: details.occupancyLabel,
        occupancySource: details.occupancySource,
        vehicleId: row.vehicleId,
        originName: details.originName,
        destName: details.destName,
        originCode: details.originCode,
        destCode: details.destCode,
      });
    })
    .filter(Boolean);
}

function parseGtfsJsonFeed(body, feed, tripIndex = null) {
  return positionsToTrains(filterPositionsForFeed(extractVehiclePositions(body), feed), feed, tripIndex);
}

function parseMetrolinkJson(body, feed) {
  const rows = Array.isArray(body?.vehicles)
    ? body.vehicles
    : Array.isArray(body?.entity)
      ? body.entity.map((row) => row?.vehicle || row).filter(Boolean)
      : Array.isArray(body)
        ? body
        : [];

  return rows
    .map((row) => {
      const lat = Number(row?.latitude ?? row?.lat);
      const lon = Number(row?.longitude ?? row?.lon);
      const vehicleId = String(row?.vehicleId || row?.vehicle_id || row?.id || '').trim();
      if (!vehicleId || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      return normalizeRegionalTrain({
        vehicleId,
        label: row?.label || vehicleId,
        routeName: row?.routeShortName || row?.route_short_name || row?.routeId || row?.route_id || feed.name,
        railroad: feed.railroad || 'MetroLink',
        sourceLabel: feed.name,
        lat,
        lon,
        bearing: row?.bearing,
        speedMph: row?.speed != null ? Math.round(Number(row.speed) * 2.23694) : null,
        tripId: row?.tripId || row?.trip_id,
        trainKind: resolveTrainKind(feed),
      });
    })
    .filter(Boolean);
}

function parse511Activity(activity, agency) {
  const row = parse511VehicleActivity(activity);
  if (!row) return null;

  return normalizeRegionalTrain({
    vehicleId: row.vehicleId,
    label: row.label,
    routeName: row.routeName || agency.name,
    railroad: agency.railroad,
    sourceLabel: `511 ${agency.name}`,
    lat: row.lat,
    lon: row.lon,
    bearing: row.bearing,
    speedMph: metersPerSecondToMph(row.speedMps),
    tripId: row.tripId,
    trainKind: agency.trainKind || 'passenger',
  });
}

async function fetchGtfsFeed(feed) {
  const auth = feedUrlWithAuth(feed);
  if (auth.skipped) {
    return { trains: [], configured: false, skipped: auth.skipped };
  }

  const cacheKey = `${feed.id}:${auth.configured ? 'auth' : 'open'}`;
  const cached = feedCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  let trains = [];

  if (feed.format === 'metrolink-json') {
    const res = await fetchWithTimeout(auth.url, { headers: auth.headers });
    if (!res.ok) throw new Error(`${feed.name} unavailable (${res.status})`);
    const body = await res.json();
    trains = parseMetrolinkJson(body, feed);
  } else if (feed.format === 'gtfs-json') {
    const res = await fetchWithTimeout(auth.url, { headers: auth.headers });
    if (!res.ok) throw new Error(`${feed.name} unavailable (${res.status})`);
    const body = await res.json();
    trains = parseGtfsJsonFeed(body, feed);
  } else {
    const tripUpdatesUrl = feed.tripUpdatesUrl || null;
    const alertsUrl = feed.alertsUrl || null;
    const [vehiclePayload, tripPayload, alertsPayload] = await Promise.all([
      fetchGtfsRtPayload(auth.url, { headers: auth.headers }),
      tripUpdatesUrl
        ? fetchGtfsRtPayload(tripUpdatesUrl, { headers: auth.headers }).catch(() => null)
        : Promise.resolve(null),
      alertsUrl
        ? fetchGtfsRtPayload(alertsUrl, { headers: auth.headers }).catch(() => null)
        : Promise.resolve(null),
    ]);
    const tripIndex = tripPayload ? buildTripUpdateIndex(tripPayload.message) : null;
    feed.routeAlerts = alertsPayload ? buildRouteAlertIndex(alertsPayload.message) : null;
    const positions = filterPositionsForFeed(extractVehiclePositions(vehiclePayload.message), feed);
    trains = positionsToTrains(positions, feed, tripIndex);
    delete feed.routeAlerts;
  }

  const result = { trains, configured: true, count: trains.length };
  feedCache.set(cacheKey, { fetchedAt: Date.now(), result });
  return result;
}

async function fetch511Agency(agency, apiKey) {
  const params = new URLSearchParams({
    api_key: apiKey,
    agency: agency.code,
    format: 'json',
  });

  const res = await fetchWithTimeout(`https://api.511.org/transit/VehicleMonitoring?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`511 ${agency.code} unavailable (${res.status})`);
  }

  const body = await res.json();
  return flatten511Activities(body)
    .map((activity) => parse511Activity(activity, agency))
    .filter(Boolean);
}

async function fetch511RailTrains() {
  const apiKey = readEnv('API_511_KEY');
  if (!apiKey) {
    return { trains: [], configured: false, skipped: 'API_511_KEY not set' };
  }

  const agencies = parse511Agencies();
  const cacheKey = agencies.map((row) => row.code).join(',');
  if (
    siri511Cache.vehicles.length &&
    siri511Cache.key === cacheKey &&
    Date.now() - siri511Cache.fetchedAt < CACHE_TTL_MS
  ) {
    return { trains: siri511Cache.vehicles, configured: true };
  }

  const results = await Promise.allSettled(agencies.map((agency) => fetch511Agency(agency, apiKey)));
  const trains = [];
  const sourceCounts = {};

  results.forEach((result, index) => {
    const agency = agencies[index];
    if (result.status === 'fulfilled') {
      sourceCounts[agency.code] = result.value.length;
      trains.push(...result.value);
    } else {
      sourceCounts[agency.code] = { error: result.reason?.message || 'failed' };
    }
  });

  siri511Cache = { fetchedAt: Date.now(), key: cacheKey, vehicles: trains };
  return { trains, configured: true, sourceCounts };
}

export async function fetchRegionalRailTrains(area, radiusMiles) {
  const feeds = parseTransitFeedList();
  const feedResults = await Promise.allSettled(feeds.map((feed) => fetchGtfsFeed(feed)));
  const siri511Result = await fetch511RailTrains();

  const trains = [];
  const sourceCounts = {};
  const sources = [];

  feedResults.forEach((result, index) => {
    const feed = feeds[index];
    if (result.status !== 'fulfilled') {
      sourceCounts[feed.id] = { error: result.reason?.message || 'failed' };
      return;
    }

    if (result.value.skipped) {
      sourceCounts[feed.id] = result.value.skipped;
      return;
    }

    if (result.value.configured) {
      sources.push(feed.id);
      sourceCounts[feed.id] = result.value.count;
      trains.push(...result.value.trains);
    }
  });

  if (siri511Result.configured) {
    sources.push('511-rail');
    Object.assign(sourceCounts, siri511Result.sourceCounts || {});
    sourceCounts['511_total'] = siri511Result.trains.length;
    trains.push(...siri511Result.trains);
  } else if (siri511Result.skipped) {
    sourceCounts['511-rail'] = siri511Result.skipped;
  }

  const nearby = filterInSearchRegion(trains, area, radiusMiles);

  const nearbyCounts = {};
  for (const train of nearby) {
    const key = train.sourceLabel || 'regional';
    nearbyCounts[key] = (nearbyCounts[key] || 0) + 1;
  }

  return {
    trains: nearby,
    configured: sources.length > 0,
    sources,
    sourceCounts: { ...sourceCounts, nearby: nearbyCounts },
  };
}

/** All live regional rail positions (not filtered to a map viewport). */
export async function fetchAllRegionalRailTrains() {
  const feeds = parseTransitFeedList();
  const feedResults = await Promise.allSettled(feeds.map((feed) => fetchGtfsFeed(feed)));
  const siri511Result = await fetch511RailTrains();

  const trains = [];
  const sourceCounts = {};

  feedResults.forEach((result, index) => {
    const feed = feeds[index];
    if (result.status !== 'fulfilled') {
      sourceCounts[feed.id] = { error: result.reason?.message || 'failed' };
      return;
    }

    if (result.value.skipped) {
      sourceCounts[feed.id] = result.value.skipped;
      return;
    }

    if (result.value.configured) {
      sourceCounts[feed.id] = result.value.count;
      trains.push(...result.value.trains);
    }
  });

  if (siri511Result.configured) {
    Object.assign(sourceCounts, siri511Result.sourceCounts || {});
    sourceCounts['511_total'] = siri511Result.trains.length;
    trains.push(...siri511Result.trains);
  } else if (siri511Result.skipped) {
    sourceCounts['511-rail'] = siri511Result.skipped;
  }

  const byId = new Map();
  for (const train of trains) {
    byId.set(`${train.trainKind}:${train.trainId}`, train);
  }

  return {
    count: byId.size,
    sourceCounts,
  };
}
