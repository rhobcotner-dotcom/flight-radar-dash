import { distanceMiles } from '../../lib/geo.js';
import {
  filterInSearchRegion,
  searchCenter,
} from './viewportQuery.js';
import { fetchFreightTrains, trainRadiusMiles as passengerRadiusMiles } from './freightTrainSources.js';
import { fetchRegionalRailTrains } from './gtfsRtRail.js';

const MARCMAP_URL = 'https://amtrak-api.marcmap.app/get-trains';
const AMTRAKER_URL = 'https://api.amtraker.com/v3/trains';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 45 * 1000;

let passengerCache = { fetchedAt: 0, trains: null };

function trainRadiusMiles(area) {
  return passengerRadiusMiles(area);
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

function normalizePassengerTrain(raw) {
  const lat = Number(raw?.lat);
  const lon = Number(raw?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const trainNum = String(raw.trainNum || raw.trainID || '').trim();
  if (!trainNum) return null;

  const stations = Array.isArray(raw.stations) ? raw.stations : [];
  const nextStop = stations.find((station) => station?.status && station.status !== 'Departed') || null;

  return {
    trainNum,
    trainId: String(raw.trainID || trainNum),
    routeName: raw.routeName || 'Amtrak',
    lat,
    lon,
    heading: raw.heading || null,
    velocityMph: raw.velocity != null ? Math.round(Number(raw.velocity)) : null,
    timely: raw.trainTimely || null,
    originCode: raw.origCode || null,
    destCode: raw.destCode || null,
    trainState: raw.trainState || null,
    trainKind: 'passenger',
    railroad: 'Amtrak',
    crossingStatus: null,
    sourceLabel: 'Amtrak',
    nextStop: nextStop
      ? {
          name: nextStop.name || nextStop.code,
          code: nextStop.code,
          status: nextStop.status,
          scheduledArrival: nextStop.schArr || null,
          scheduledDeparture: nextStop.schDep || null,
        }
      : null,
  };
}

function flattenTrainPayload(body) {
  if (Array.isArray(body?.data)) {
    return body.data;
  }

  if (body && typeof body === 'object' && !Array.isArray(body)) {
    const values = Object.values(body);
    if (values.every((item) => Array.isArray(item))) {
      return values.flat();
    }
  }

  return [];
}

async function fetchPassengerTrainsRaw() {
  if (passengerCache.trains && Date.now() - passengerCache.fetchedAt < CACHE_TTL_MS) {
    return passengerCache.trains;
  }

  let lastError = null;

  for (const url of [MARCMAP_URL, AMTRAKER_URL]) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        lastError = new Error(`Passenger train feed unavailable (${res.status})`);
        continue;
      }

      const body = await res.json();
      const rows = flattenTrainPayload(body);
      const trains = rows.map(normalizePassengerTrain).filter(Boolean);
      if (trains.length === 0) {
        lastError = new Error('No active passenger train positions returned');
        continue;
      }

      passengerCache = { fetchedAt: Date.now(), trains };
      return trains;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Passenger train feed unavailable');
}

function dedupeTrains(trains) {
  const byId = new Map();
  for (const train of trains) {
    byId.set(`${train.trainKind}:${train.trainId}`, train);
  }
  return [...byId.values()];
}

export async function fetchAreaTrains(area) {
  const radius = area.viewport ? area.queryRadiusMiles : trainRadiusMiles(area);
  const [passengerResult, freightResult, regionalResult] = await Promise.allSettled([
    fetchPassengerTrainsRaw(),
    fetchFreightTrains(area),
    fetchRegionalRailTrains(area, radius),
  ]);

  let passengerTrains = [];
  let passengerError = null;
  if (passengerResult.status === 'fulfilled') {
    passengerTrains = filterInSearchRegion(passengerResult.value, area, radius);
  } else {
    passengerError = passengerResult.reason?.message;
  }

  const freightTrains = freightResult.status === 'fulfilled' ? freightResult.value.trains : [];
  const freightMeta = freightResult.status === 'fulfilled' ? freightResult.value : null;
  const freightError = freightResult.status === 'rejected' ? freightResult.reason?.message : null;

  let regionalTrains = [];
  let regionalMeta = null;
  if (regionalResult.status === 'fulfilled') {
    regionalMeta = regionalResult.value;
    regionalTrains = regionalResult.value.trains;
  }

  const trains = dedupeTrains([...passengerTrains, ...regionalTrains, ...freightTrains]).sort(
    (a, b) => a.distanceMiles - b.distanceMiles
  );

  const passengerCount = trains.filter((train) => train.trainKind === 'passenger').length;
  const freightCount = trains.filter((train) => train.trainKind === 'freight').length;
  const crossingCount = trains.filter((train) => train.trainKind === 'crossing').length;

  const sources = ['amtrak-community'];
  if (regionalMeta?.sources?.length) {
    sources.push(...regionalMeta.sources);
  }
  if (freightMeta?.sources?.length) sources.push(...freightMeta.sources);

  const sourceCounts = {
    amtrak: passengerTrains.length,
    ...(regionalMeta?.sourceCounts || {}),
    ...(freightMeta?.sourceCounts || {}),
  };

  let coverage = 'Amtrak nationwide + regional GTFS-RT rail (MBTA, MetroLink, Metra, 511)';
  if (area.viewport) {
    coverage = `${coverage}; filtered to current map viewport`;
  }
  if (freightCount || crossingCount) {
    coverage = `${coverage}; freight via crossing sensors, APRS rail, and RailState`;
  } else if (freightMeta?.coverage) {
    coverage = `${coverage}; ${freightMeta.coverage}`;
  }

  const errors = [passengerError, freightError].filter(Boolean);

  return {
    trains,
    radiusMiles: Math.max(radius, freightMeta?.radiusMiles || radius),
    viewport: area.viewport || null,
    searchCenter: searchCenter(area),
    source: sources.join(' + '),
    sources,
    sourceCounts,
    coverage,
    counts: {
      total: trains.length,
      passenger: passengerCount,
      freight: freightCount,
      crossing: crossingCount,
      yard: 0,
      corridor: 0,
    },
    errors: errors.length ? errors : undefined,
    freightHints: freightMeta?.freightHints,
  };
}
