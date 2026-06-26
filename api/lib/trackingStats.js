import { getFlightsNearPoint, milesToNauticalMiles } from '../adsb-client.js';
import { normalizeAdsbResponse } from './adsbNormalize.js';
import { isOpenSkyAvailable, isOpenSkyConfigured, getStatesInBounds } from './openskyClient.js';
import { normalizeOpenSkyStates } from './openskyNormalize.js';
import { getCameraPoolStatus } from './usTrafficCameras.js';
import { fetchPassengerTrainsRaw } from './trainTracking.js';
import { fetchAllRegionalRailTrains } from './gtfsRtRail.js';
import { countSignificantVesselsInBbox } from './axiomVessels.js';

const CACHE_MS = 60_000;
const CONUS_BBOX = { west: -130, south: 24, east: -66, north: 50 };
const ADSB_GRID = [
  [47, -122],
  [37, -122],
  [40, -105],
  [33, -97],
  [42, -88],
  [34, -84],
  [41, -74],
];

let cache = { fetchedAt: 0, payload: null };

async function fetchConusFlightCount() {
  if (isOpenSkyConfigured() && isOpenSkyAvailable()) {
    try {
      const payload = await getStatesInBounds(CONUS_BBOX);
      const flights = normalizeOpenSkyStates(payload.states, CONUS_BBOX);
      return { count: flights.length, source: 'opensky-network.org' };
    } catch {
      // fall through to ADSB grid
    }
  }

  const seen = new Set();
  for (const [lat, lon] of ADSB_GRID) {
    try {
      const body = await getFlightsNearPoint(lat, lon, 250);
      const flights = normalizeAdsbResponse(body, milesToNauticalMiles(250));
      for (const flight of flights) {
        const key = String(flight.hex || flight.fr24_id || `${flight.lat}:${flight.lon}`).toLowerCase();
        seen.add(key);
      }
    } catch {
      // keep partial grid count
    }
  }

  return { count: seen.size, source: 'adsb.lol' };
}

async function fetchNationwideTrainCount() {
  const [passengerResult, regionalResult] = await Promise.allSettled([
    fetchPassengerTrainsRaw(),
    fetchAllRegionalRailTrains(),
  ]);

  const passenger = passengerResult.status === 'fulfilled' ? passengerResult.value.length : 0;
  const regional = regionalResult.status === 'fulfilled' ? regionalResult.value.count : 0;

  return {
    count: passenger + regional,
    passenger,
    regional,
  };
}

export async function fetchTrackingStats() {
  if (cache.payload && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.payload;
  }

  const cameraStatus = getCameraPoolStatus();
  const cameras = cameraStatus.verifiedCount || cameraStatus.poolCount || 0;

  const [flightResult, boatResult, trainResult] = await Promise.allSettled([
    fetchConusFlightCount(),
    countSignificantVesselsInBbox(CONUS_BBOX),
    fetchNationwideTrainCount(),
  ]);

  const flights =
    flightResult.status === 'fulfilled'
      ? flightResult.value
      : { count: 0, source: 'adsb.lol' };
  const boats =
    boatResult.status === 'fulfilled'
      ? boatResult.value
      : { count: 0, source: 'axiomoverwatch.io' };
  const trains =
    trainResult.status === 'fulfilled'
      ? trainResult.value
      : { count: 0, passenger: 0, regional: 0 };

  const payload = {
    fetchedAt: new Date().toISOString(),
    flights: flights.count,
    cameras,
    boats: boats.count,
    trains: trains.count,
    sources: {
      flights: flights.source,
      cameras: 'traffic-camera-pool',
      boats: boats.source,
      trains: 'amtrak + gtfs-rt',
    },
    partial: {
      cameras: Boolean(cameraStatus.partial || cameraStatus.warming),
      flights: flightResult.status !== 'fulfilled',
      boats: boatResult.status !== 'fulfilled',
      trains: trainResult.status !== 'fulfilled',
    },
  };

  cache = { fetchedAt: Date.now(), payload };
  return payload;
}
