import { inferenceAirportsNear } from './inferenceAirports.js';
import { LOW_ALTITUDE_LABEL_FT } from './flightLabelThresholds.js';

const LANDING_RADIUS_MILES = 50;
const DEPARTURE_RADIUS_MILES = 30;
const INFERENCE_SEARCH_RADIUS_MILES = Math.max(LANDING_RADIUS_MILES, DEPARTURE_RADIUS_MILES);
/** Route destination must be at least this many miles farther than the aligned local airport. */
const ROUTE_ENDPOINT_MISMATCH_MILES = 15;
const TRACK_ALIGNMENT_DEG = 50;

function distanceMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(fromLat, fromLon, toLat, toLon) {
  const deg = Math.PI / 180;
  const lat1 = fromLat * deg;
  const lat2 = toLat * deg;
  const dLon = (toLon - fromLon) * deg;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) / deg) + 360) % 360;
}

function trackAlignsWithBearing(track, bearing, toleranceDeg = TRACK_ALIGNMENT_DEG) {
  if (!Number.isFinite(track) || !Number.isFinite(bearing)) return false;
  const delta = Math.abs(((track - bearing + 540) % 360) - 180);
  return delta <= toleranceDeg;
}

function hasEndpoint(flight, role) {
  if (role === 'orig') {
    return Number.isFinite(Number(flight.orig_lat)) && Number.isFinite(Number(flight.orig_lon));
  }
  return Number.isFinite(Number(flight.dest_lat)) && Number.isFinite(Number(flight.dest_lon));
}

function routeOriginNear(flight) {
  const origLat = Number(flight.orig_lat);
  const origLon = Number(flight.orig_lon);
  if (!Number.isFinite(origLat) || !Number.isFinite(origLon)) return false;
  if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return false;
  return distanceMiles(flight.lat, flight.lon, origLat, origLon) <= DEPARTURE_RADIUS_MILES;
}

function isDepartingRoute(flight) {
  const origLat = Number(flight.orig_lat);
  const origLon = Number(flight.orig_lon);
  const track = Number(flight.track);
  if (!Number.isFinite(origLat) || !Number.isFinite(origLon) || !Number.isFinite(track)) return false;
  if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return false;
  const outbound = bearingDegrees(origLat, origLon, flight.lat, flight.lon);
  return trackAlignsWithBearing(track, outbound);
}

/** Climbing out near filed origin with track toward filed destination (not a local final). */
function isClosingOnRouteDestination(flight) {
  const destLat = Number(flight.dest_lat);
  const destLon = Number(flight.dest_lon);
  const track = Number(flight.track);
  if (!Number.isFinite(destLat) || !Number.isFinite(destLon) || !Number.isFinite(track)) return false;
  if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return false;
  const inbound = bearingDegrees(flight.lat, flight.lon, destLat, destLon);
  return trackAlignsWithBearing(track, inbound);
}

function endpointPatch(airport, role) {
  if (role === 'orig') {
    return {
      orig_icao: airport.icao,
      orig_iata: airport.iata,
      orig_lat: airport.lat,
      orig_lon: airport.lon,
      orig_inferred: true,
    };
  }

  return {
    dest_icao: airport.icao,
    dest_iata: airport.iata,
    dest_lat: airport.lat,
    dest_lon: airport.lon,
    dest_inferred: true,
  };
}

function clearRouteEndpointFields(role) {
  if (role === 'orig') {
    return {
      orig_city: undefined,
      orig_iata: undefined,
      orig_icao: undefined,
    };
  }
  return {
    dest_city: undefined,
    dest_iata: undefined,
    dest_icao: undefined,
  };
}

function routeEndpointMismatch(flight, airport, role) {
  const lat = Number(flight.lat);
  const lon = Number(flight.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

  const endpointLat = Number(role === 'orig' ? flight.orig_lat : flight.dest_lat);
  const endpointLon = Number(role === 'orig' ? flight.orig_lon : flight.dest_lon);
  if (!Number.isFinite(endpointLat) || !Number.isFinite(endpointLon)) return false;

  const routeDist = distanceMiles(lat, lon, endpointLat, endpointLon);
  const localDist = distanceMiles(lat, lon, airport.lat, airport.lon);
  return localDist + ROUTE_ENDPOINT_MISMATCH_MILES < routeDist;
}

function shouldInferEndpoint(flight, airport, role) {
  if (!hasEndpoint(flight, role)) return true;
  return routeEndpointMismatch(flight, airport, role);
}

/**
 * Infer aligned commercial airports for low-altitude traffic.
 * Overrides stale adsbdb route endpoints when the aircraft is clearly
 * departing from or approaching a nearer local airport instead.
 */
export function inferLocalAirportEndpoints(flight, airports = null) {
  const lat = Number(flight.lat);
  const lon = Number(flight.lon);
  const alt = Number(flight.alt);
  const track = Number(flight.track);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return {};
  if (!Number.isFinite(alt) || alt >= LOW_ALTITUDE_LABEL_FT) return {};
  if (!Number.isFinite(track)) return {};

  const candidates = airports ?? inferenceAirportsNear(lat, lon, INFERENCE_SEARCH_RADIUS_MILES);

  let bestApproach = null;
  let bestApproachDist = Infinity;
  let bestDeparture = null;
  let bestDepartureDist = Infinity;

  for (const airport of candidates) {
    const dist = distanceMiles(lat, lon, airport.lat, airport.lon);
    const inbound = bearingDegrees(lat, lon, airport.lat, airport.lon);
    const outbound = bearingDegrees(airport.lat, airport.lon, lat, lon);

    if (
      dist <= LANDING_RADIUS_MILES &&
      trackAlignsWithBearing(track, inbound) &&
      dist < bestApproachDist
    ) {
      bestApproach = airport;
      bestApproachDist = dist;
    }

    if (
      dist <= DEPARTURE_RADIUS_MILES &&
      trackAlignsWithBearing(track, outbound) &&
      dist < bestDepartureDist
    ) {
      bestDeparture = airport;
      bestDepartureDist = dist;
    }
  }

  const patch = {};
  if (bestApproach && shouldInferEndpoint(flight, bestApproach, 'dest')) {
    const outbound = bearingDegrees(bestApproach.lat, bestApproach.lon, lat, lon);
    const departingLocal = trackAlignsWithBearing(track, outbound);
    const departingRoute = routeOriginNear(flight) && isDepartingRoute(flight);
    const climbingOutOnRoute =
      routeOriginNear(flight) && flight.dest_city && isClosingOnRouteDestination(flight);
    if (!departingLocal && !departingRoute && !climbingOutOnRoute) {
      Object.assign(patch, endpointPatch(bestApproach, 'dest'));
      if (hasEndpoint(flight, 'dest')) {
        Object.assign(patch, clearRouteEndpointFields('dest'));
      }
    }
  }
  if (bestDeparture && shouldInferEndpoint(flight, bestDeparture, 'orig') && !flight.orig_city) {
    const inbound = bearingDegrees(lat, lon, bestDeparture.lat, bestDeparture.lon);
    const approachingLocal = trackAlignsWithBearing(track, inbound);
    if (!approachingLocal) {
      Object.assign(patch, endpointPatch(bestDeparture, 'orig'));
      if (hasEndpoint(flight, 'orig')) {
        Object.assign(patch, clearRouteEndpointFields('orig'));
      }
    }
  }

  return patch;
}

export function withLocalAirportInference(flight, airports = null) {
  const patch = inferLocalAirportEndpoints(flight, airports);
  if (!patch.dest_lat && !patch.orig_lat) return flight;
  return { ...flight, ...patch };
}
