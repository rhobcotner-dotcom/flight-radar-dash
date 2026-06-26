import { withLocalAirportInference } from './localAirportInference.js';

const COUNTRY_LABELS = {
  US: 'USA',
  GB: 'UK',
  AE: 'UAE',
};

const DEPARTURE_RADIUS_MILES = 30;
const LANDING_RADIUS_MILES = 50;
const LOW_ALTITUDE_SUBLABEL_FT = 2500;
const TRACK_ALIGNMENT_DEG = 50;
const CLIMB_VSPEED_FPM = 80;
const DESCENT_VSPEED_FPM = -80;

function endpointLabel(flight, role) {
  const city = role === 'orig' ? flight.orig_city : flight.dest_city;
  const countryIso = role === 'orig' ? flight.orig_country_iso : flight.dest_country_iso;
  const country = role === 'orig' ? flight.orig_country : flight.dest_country;
  const iata = role === 'orig' ? flight.orig_iata : flight.dest_iata;
  const icao = role === 'orig' ? flight.orig_icao : flight.dest_icao;

  if (city) {
    const iso = String(countryIso || '').toUpperCase();
    if (iso && iso !== 'US') {
      return `${city}, ${COUNTRY_LABELS[iso] || iso}`;
    }
    if (country && country !== 'United States') {
      return `${city}, ${country}`;
    }
    return city;
  }

  return iata || icao || '?';
}

export function flightDepartureLabel(flight) {
  const location = endpointLabel(flight, 'orig');
  return location !== '?' ? location : null;
}

export function flightDestinationLabel(flight) {
  const location = endpointLabel(flight, 'dest');
  return location !== '?' ? location : null;
}

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

function isNearDeparture(flight, radiusMiles = DEPARTURE_RADIUS_MILES) {
  const origLat = Number(flight.orig_lat);
  const origLon = Number(flight.orig_lon);
  if (!Number.isFinite(origLat) || !Number.isFinite(origLon)) return false;
  if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return false;
  return distanceMiles(flight.lat, flight.lon, origLat, origLon) <= radiusMiles;
}

function isNearLanding(flight, radiusMiles = LANDING_RADIUS_MILES) {
  const destLat = Number(flight.dest_lat);
  const destLon = Number(flight.dest_lon);
  if (!Number.isFinite(destLat) || !Number.isFinite(destLon)) return false;
  if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return false;
  return distanceMiles(flight.lat, flight.lon, destLat, destLon) <= radiusMiles;
}

function isLowAltitude(flight) {
  const alt = Number(flight.alt);
  return Number.isFinite(alt) && alt < LOW_ALTITUDE_SUBLABEL_FT;
}

function isClimbing(flight, altitudeTrend) {
  const vspeed = Number(flight.vspeed);
  if (Number.isFinite(vspeed) && vspeed > CLIMB_VSPEED_FPM) return true;
  return altitudeTrend === 'up';
}

function isDescending(flight, altitudeTrend) {
  const vspeed = Number(flight.vspeed);
  if (Number.isFinite(vspeed) && vspeed < DESCENT_VSPEED_FPM) return true;
  return altitudeTrend === 'down';
}

function isHeadingAwayFromOrigin(flight) {
  const origLat = Number(flight.orig_lat);
  const origLon = Number(flight.orig_lon);
  const track = Number(flight.track);
  if (!Number.isFinite(origLat) || !Number.isFinite(origLon) || !Number.isFinite(track)) return false;
  if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return false;
  const outbound = bearingDegrees(origLat, origLon, flight.lat, flight.lon);
  return trackAlignsWithBearing(track, outbound);
}

function isClosingOnDestination(flight) {
  const destLat = Number(flight.dest_lat);
  const destLon = Number(flight.dest_lon);
  const track = Number(flight.track);
  if (!Number.isFinite(destLat) || !Number.isFinite(destLon) || !Number.isFinite(track)) return false;
  if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return false;
  const inbound = bearingDegrees(flight.lat, flight.lon, destLat, destLon);
  return trackAlignsWithBearing(track, inbound);
}

/** Below 2,500 ft: infer to/from from vertical trend + heading vs route endpoints. */
function lowAltitudeRouteSubLabel(flight, altitudeTrend) {
  if (!isLowAltitude(flight)) return null;

  const departure = flightDepartureLabel(flight);
  const destination = flightDestinationLabel(flight);

  if (isDescending(flight, altitudeTrend) && isClosingOnDestination(flight) && departure) {
    return { text: `from ${departure}`, tone: 'from' };
  }

  if (
    isDescending(flight, altitudeTrend) &&
    isClosingOnDestination(flight) &&
    destination &&
    !departure
  ) {
    return { text: `to ${destination}`, tone: 'to' };
  }

  if (isClimbing(flight, altitudeTrend) && isHeadingAwayFromOrigin(flight) && destination) {
    return { text: `to ${destination}`, tone: 'to' };
  }

  if (isClimbing(flight, altitudeTrend) && isHeadingAwayFromOrigin(flight) && departure && !destination) {
    return { text: `from ${departure}`, tone: 'from' };
  }

  return null;
}

/**
 * Map route sublabel under carrier.
 * Proximity rules first; below 2,500 ft uses heading + climb/descent inference (stateless).
 */
export function mapFlightRouteSubLabel(flight, { altitudeTrend = null } = {}) {
  return mapFlightRouteSubLabelForFlight(withLocalAirportInference(flight), { altitudeTrend });
}

function mapFlightRouteSubLabelForFlight(flight, { altitudeTrend = null } = {}) {
  const departure = flightDepartureLabel(flight);
  const destination = flightDestinationLabel(flight);

  if (isNearLanding(flight) && departure) {
    return { text: `from ${departure}`, tone: 'from' };
  }

  if (
    isNearLanding(flight) &&
    destination &&
    isDescending(flight, altitudeTrend) &&
    !departure
  ) {
    return { text: `to ${destination}`, tone: 'to' };
  }

  if (isNearDeparture(flight) && destination) {
    return { text: `to ${destination}`, tone: 'to' };
  }

  if (
    isNearDeparture(flight) &&
    departure &&
    isClimbing(flight, altitudeTrend) &&
    !destination
  ) {
    return { text: `from ${departure}`, tone: 'from' };
  }

  return lowAltitudeRouteSubLabel(flight, altitudeTrend);
}
