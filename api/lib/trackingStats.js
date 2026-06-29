import { getFlightsNearPoint, milesToNauticalMiles } from '../adsb-client.js';
import { normalizeAdsbResponse } from './adsbNormalize.js';
import { isOpenSkyAvailable, isOpenSkyConfigured, getStatesInBounds } from './openskyClient.js';
import { normalizeOpenSkyStates } from './openskyNormalize.js';
import { getCameraPoolStatus, warmNationwideCameraPool } from './usTrafficCameras.js';
import { fetchPassengerTrainsRaw } from './trainTracking.js';
import { fetchAllRegionalRailTrains } from './gtfsRtRail.js';
import { countSignificantVesselsInBbox } from './axiomVessels.js';
import { fetchEmergencyTrackingStats } from './emergencyTrackingStats.js';

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

  const cameraStatusBefore = getCameraPoolStatus();
  const catalogReady = cameraStatusBefore.catalogCount > 0;
  const cameraPoolPromise = catalogReady
    ? Promise.resolve()
    : warmNationwideCameraPool();
  if (catalogReady) void warmNationwideCameraPool();

  const [cameraPoolResult, flightResult, boatResult, trainResult, emergencyResult] = await Promise.allSettled([
    cameraPoolPromise,
    fetchConusFlightCount(),
    countSignificantVesselsInBbox(CONUS_BBOX),
    fetchNationwideTrainCount(),
    fetchEmergencyTrackingStats(),
  ]);

  const cameraStatus = getCameraPoolStatus();
  const cameras = cameraStatus.catalogCount;

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
  const emergency =
    emergencyResult.status === 'fulfilled'
      ? emergencyResult.value
      : {
          liveIncidents: 0,
          pulsePointLive: 0,
          socrataLive: 0,
          arcgisLive: 0,
          wildfirePerimeters: 0,
          wildfireIncidents: 0,
          femaCounties: 0,
          nwsAlerts: 0,
          ipawsAlerts: 0,
          approximate: true,
          recentScope: 'nationwide',
          recent: {
            ems: [],
            wildfirePerimeters: [],
            nwsAlerts: [],
            femaZones: [],
            ipawsAlerts: [],
          },
          partial: {
            pulsePoint: true,
            nifc: true,
            fema: true,
            nws: true,
            ipaws: true,
            socrata: true,
            arcgis: true,
          },
        };

  const payload = {
    fetchedAt: new Date().toISOString(),
    flights: flights.count,
    cameras,
    boats: boats.count,
    trains: trains.count,
    emergency,
    sources: {
      flights: flights.source,
      cameras: 'traffic-camera-pool',
      boats: boats.source,
      trains: 'amtrak + gtfs-rt',
      emergency: 'pulsepoint + nws + nifc + fema + city CAD',
    },
    partial: {
      cameras: false,
      flights: flightResult.status !== 'fulfilled',
      boats: boatResult.status !== 'fulfilled',
      trains: trainResult.status !== 'fulfilled',
      emergency: emergencyResult.status !== 'fulfilled',
    },
  };

  cache = { fetchedAt: Date.now(), payload };
  return payload;
}
