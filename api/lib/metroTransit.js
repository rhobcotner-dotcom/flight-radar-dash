import { distanceMiles } from '../../lib/geo.js';
import { extractVehiclePositions, fetchGtfsRtPayload } from './gtfsRtClient.js';
import { buildTripUpdateIndex, enrichVehicleRow } from './gtfsTransitDetails.js';
import { resolveStopName } from './gtfsStopNames.js';
import { enrichTransitMotion } from './transitMotion.js';
import { enrichTransitVehicleOccupancy } from './occupancyEnrichment.js';

const STL_VEHICLES_URL = 'https://www.metrostlouis.org/RealTimeData/StlRealTimeVehicles.pb';
const STL_TRIPS_URL = 'https://www.metrostlouis.org/RealTimeData/StlRealTimeTrips.pb';
const CACHE_MS = 20 * 1000;

let cache = { fetchedAt: 0, data: null };

function normalizeVehicle(row, details = {}) {
  return {
    vehicleId: row.vehicleId,
    routeId: row.routeId,
    routeName: row.routeId ? `MetroLink ${row.routeId}` : 'MetroLink',
    lat: row.lat,
    lon: row.lon,
    bearing: row.bearing,
    speedMph: row.speedMph,
    tripId: row.tripId,
    label: row.label,
    direction: details.direction || null,
    headsign: details.headsign || null,
    nextStopName: details.nextStop?.name || null,
    occupancyLabel: details.occupancyLabel || null,
    occupancyLevel: details.occupancyLevel ?? null,
    occupancySource: details.occupancySource || null,
  };
}

export async function fetchMetroTransit(area) {
  if (cache.data && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const [vehiclePayload, tripPayload] = await Promise.all([
    fetchGtfsRtPayload(STL_VEHICLES_URL, { headers: { Accept: 'application/x-protobuf' } }),
    fetchGtfsRtPayload(STL_TRIPS_URL, { headers: { Accept: 'application/x-protobuf' } }).catch(() => null),
  ]);

  const tripIndex = tripPayload ? buildTripUpdateIndex(tripPayload.message) : null;
  const stopNameLookup = (stopId) => resolveStopName('metro-stl', stopId);
  const positions = extractVehiclePositions(vehiclePayload.message);

  const radius = Math.max(Number(area.radiusMiles) || 30, 35);
  const vehicles = positions
    .map((row) => {
      const motion = enrichTransitMotion(
        'metro-stl-transit',
        row.vehicleId,
        row.lat,
        row.lon,
        row.bearing,
        row.speedMps
      );
      const details = enrichVehicleRow(row, { tripIndex, stopNameLookup });
      const vehicle = normalizeVehicle(
        {
          vehicleId: row.vehicleId,
          routeId: row.routeId,
          label: row.label,
          lat: row.lat,
          lon: row.lon,
          bearing: motion.heading,
          speedMph: motion.speedMph,
          tripId: row.tripId,
        },
        details
      );
      return enrichTransitVehicleOccupancy(vehicle, details);
    })
    .map((vehicle) => ({
      ...vehicle,
      distanceMiles: distanceMiles(area.lat, area.lon, vehicle.lat, vehicle.lon),
    }))
    .filter((vehicle) => vehicle.distanceMiles <= radius)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  const result = {
    enabled: true,
    source: 'metrostlouis.org',
    fetchedAt: new Date().toISOString(),
    count: vehicles.length,
    radiusMiles: radius,
    vehicles,
  };

  cache = { fetchedAt: Date.now(), data: result };
  return result;
}
