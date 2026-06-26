import { LOCAL_AIRPORTS } from './localAirports.js';

const LANDING_RADIUS_MILES = 50;
const DEPARTURE_RADIUS_MILES = 30;
const LOW_ALTITUDE_FT = 2500;
const TRACK_ALIGNMENT_DEG = 50;
const CLIMB_VSPEED_FPM = 80;
const DESCENT_VSPEED_FPM = -80;

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

function endpointPatch(airport, role) {
  if (role === 'orig') {
    return {
      orig_icao: airport.icao,
      orig_iata: airport.iata,
      orig_city: airport.city,
      orig_country: 'United States',
      orig_country_iso: 'US',
      orig_lat: airport.lat,
      orig_lon: airport.lon,
    };
  }

  return {
    dest_icao: airport.icao,
    dest_iata: airport.iata,
    dest_city: airport.city,
    dest_country: 'United States',
    dest_country_iso: 'US',
    dest_lat: airport.lat,
    dest_lon: airport.lon,
  };
}

/**
 * When adsbdb has no route, infer the nearest aligned metro airport as origin/departure
 * or destination/approach for low-altitude traffic.
 */
export function inferLocalAirportEndpoints(flight, airports = LOCAL_AIRPORTS) {
  const lat = Number(flight.lat);
  const lon = Number(flight.lon);
  const alt = Number(flight.alt);
  const track = Number(flight.track);
  const vspeed = Number(flight.vspeed);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return {};
  if (!Number.isFinite(alt) || alt >= LOW_ALTITUDE_FT) return {};
  if (!Number.isFinite(track)) return {};

  const descending = Number.isFinite(vspeed) && vspeed < DESCENT_VSPEED_FPM;
  const climbing = Number.isFinite(vspeed) && vspeed > CLIMB_VSPEED_FPM;

  let bestApproach = null;
  let bestApproachDist = Infinity;
  let bestDeparture = null;
  let bestDepartureDist = Infinity;

  for (const airport of airports) {
    const dist = distanceMiles(lat, lon, airport.lat, airport.lon);
    const inbound = bearingDegrees(lat, lon, airport.lat, airport.lon);
    const outbound = bearingDegrees(airport.lat, airport.lon, lat, lon);

    if (
      descending &&
      dist <= LANDING_RADIUS_MILES &&
      trackAlignsWithBearing(track, inbound) &&
      dist < bestApproachDist
    ) {
      bestApproach = airport;
      bestApproachDist = dist;
    }

    if (
      climbing &&
      dist <= DEPARTURE_RADIUS_MILES &&
      trackAlignsWithBearing(track, outbound) &&
      dist < bestDepartureDist
    ) {
      bestDeparture = airport;
      bestDepartureDist = dist;
    }
  }

  const patch = {};
  if (bestApproach && !hasEndpoint(flight, 'dest')) {
    Object.assign(patch, endpointPatch(bestApproach, 'dest'));
  }
  if (bestDeparture && !hasEndpoint(flight, 'orig')) {
    Object.assign(patch, endpointPatch(bestDeparture, 'orig'));
  }

  return patch;
}

export function withLocalAirportInference(flight, airports = LOCAL_AIRPORTS) {
  const patch = inferLocalAirportEndpoints(flight, airports);
  if (!patch.dest_lat && !patch.orig_lat) return flight;
  return { ...flight, ...patch };
}
