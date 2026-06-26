import bundledFeeds from '../../config/gtfs-rt-rail-feeds.json' with { type: 'json' };
import bundled511 from '../../config/511-rail-agencies.json' with { type: 'json' };
import { filterInSearchRegion } from './viewportQuery.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 25 * 1000;

const feedCache = new Map();
let siri511Cache = { fetchedAt: 0, key: '', vehicles: [] };

function readEnv(name) {
  return String(process.env[name] || '').trim();
}

function parseFeedList() {
  const raw = readEnv('GTFS_RT_RAIL_FEEDS');
  if (!raw) return bundledFeeds.filter((feed) => feed.enabled !== false);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : bundledFeeds;
  } catch {
    return bundledFeeds;
  }
}

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
  if (!Number.isFinite(speed)) return null;
  return Math.round(speed * 2.23694);
}

function normalizeRegionalTrain({
  vehicleId,
  label,
  routeName,
  railroad,
  sourceLabel,
  lat,
  lon,
  bearing,
  speedMph,
  tripId,
}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const id = String(vehicleId || label || `${lat}:${lon}`).trim();
  if (!id) return null;

  return {
    trainNum: String(label || id).slice(0, 12),
    trainId: `${sourceLabel}:${id}`.toLowerCase().replace(/\s+/g, '-'),
    routeName: routeName || railroad || sourceLabel,
    lat,
    lon,
    heading: bearing != null ? Math.round(Number(bearing)) : null,
    velocityMph: speedMph != null ? Math.round(Number(speedMph)) : null,
    timely: tripId || null,
    originCode: routeName || null,
    destCode: null,
    trainState: 'live',
    trainKind: 'passenger',
    railroad: railroad || sourceLabel,
    crossingStatus: null,
    sourceLabel,
  };
}

function parseGtfsJsonFeed(body, feed) {
  const entities = Array.isArray(body?.entity) ? body.entity : [];
  const trains = [];

  for (const entity of entities) {
    const vehicle = entity?.vehicle;
    const position = vehicle?.position;
    const lat = Number(position?.latitude);
    const lon = Number(position?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const vehicleId = vehicle?.vehicle?.id || entity.id;
    const label = vehicle?.vehicle?.label || vehicleId;
    const routeId = vehicle?.trip?.routeId || vehicle?.trip?.route_id;

    trains.push(
      normalizeRegionalTrain({
        vehicleId,
        label,
        routeName: routeId ? `${feed.railroad || feed.name} ${routeId}` : feed.name,
        railroad: feed.railroad || feed.name,
        sourceLabel: feed.name,
        lat,
        lon,
        bearing: vehicle?.position?.bearing ?? vehicle?.bearing,
        speedMph: metersPerSecondToMph(vehicle?.position?.speed ?? vehicle?.speed),
        tripId: vehicle?.trip?.tripId || vehicle?.trip?.trip_id,
      })
    );
  }

  return trains.filter(Boolean);
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
      if (!vehicleId) return null;

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
      });
    })
    .filter(Boolean);
}

function parseMetraJson(body, feed) {
  const entities = Array.isArray(body?.entity)
    ? body.entity
    : Array.isArray(body?.vehicles)
      ? body.vehicles
      : Array.isArray(body?.data)
        ? body.data
        : [];

  if (entities.length && entities[0]?.vehicle?.position) {
    return parseGtfsJsonFeed(body, feed);
  }

  return entities
    .map((row) => {
      const lat = Number(row?.latitude ?? row?.lat ?? row?.position?.latitude);
      const lon = Number(row?.longitude ?? row?.lon ?? row?.position?.longitude);
      const vehicleId = String(row?.vehicleId || row?.vehicle_id || row?.id || '').trim();
      if (!vehicleId) return null;

      return normalizeRegionalTrain({
        vehicleId,
        label: row?.label || row?.vehicleLabel || vehicleId,
        routeName: row?.routeName || row?.routeId || row?.route_id || feed.name,
        railroad: feed.railroad || 'Metra',
        sourceLabel: feed.name,
        lat,
        lon,
        bearing: row?.bearing ?? row?.heading,
        speedMph: row?.speedMph ?? metersPerSecondToMph(row?.speed),
        tripId: row?.tripId || row?.trip_id,
      });
    })
    .filter(Boolean);
}

function flatten511Activities(body) {
  const deliveries = body?.ServiceDelivery?.VehicleMonitoringDelivery;
  if (!Array.isArray(deliveries)) return [];

  const activities = [];
  for (const delivery of deliveries) {
    const rows = delivery?.VehicleActivity;
    if (Array.isArray(rows)) activities.push(...rows);
  }
  return activities;
}

function parse511Activity(activity, agency) {
  const journey = activity?.MonitoredVehicleJourney;
  const location = journey?.VehicleLocation || journey?.vehicleLocation;
  const lat = Number(location?.Latitude ?? location?.latitude);
  const lon = Number(location?.Longitude ?? location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const lineRef = journey?.LineRef || journey?.PublishedLineName?.[0] || agency.name;
  const vehicleRef = journey?.VehicleRef || journey?.FramedVehicleJourneyRef?.DatedVehicleJourneyRef;
  const vehicleId = String(vehicleRef || lineRef || `${lat}:${lon}`).trim();

  return normalizeRegionalTrain({
    vehicleId,
    label: String(journey?.VehicleRef || vehicleId).slice(0, 12),
    routeName: String(lineRef).replace(/^.*:/, ''),
    railroad: agency.railroad,
    sourceLabel: `511 ${agency.name}`,
    lat,
    lon,
    bearing: journey?.Bearing ?? journey?.bearing,
    speedMph: metersPerSecondToMph(journey?.Velocity ?? journey?.velocity),
    tripId: journey?.FramedVehicleJourneyRef?.DatedVehicleJourneyRef,
  });
}

async function fetchGtfsFeed(feed) {
  const authEnv = feed.authEnv ? readEnv(feed.authEnv) : '';
  if (feed.authEnv && !authEnv) {
    return { trains: [], configured: false, skipped: `${feed.authEnv} not set` };
  }

  const cacheKey = `${feed.id}:${authEnv ? 'auth' : 'open'}`;
  const cached = feedCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const headers = {};
  if (feed.authHeader && authEnv) headers[feed.authHeader] = authEnv;

  let url = feed.url;
  if (feed.authQuery && authEnv) {
    const parsed = new URL(url);
    parsed.searchParams.set(feed.authQuery, authEnv);
    url = parsed.toString();
  }

  const res = await fetchWithTimeout(url, { headers });
  if (!res.ok) {
    throw new Error(`${feed.name} unavailable (${res.status})`);
  }

  const body = await res.json();
  let trains = [];
  if (feed.format === 'metrolink-json') trains = parseMetrolinkJson(body, feed);
  else if (feed.format === 'metra-json') trains = parseMetraJson(body, feed);
  else trains = parseGtfsJsonFeed(body, feed);

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
    return { trains: [], configured: false };
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
  const feeds = parseFeedList();
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
  } else if (readEnv('API_511_KEY')) {
    sources.push('511-rail');
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
