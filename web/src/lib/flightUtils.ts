import type { Flight } from '../types';
import { inferAirlineIcaoFromCallsign } from './airlineNames';
import icaoToIata from '../../../config/airlines-icao-iata.json';
import airlineLiveryPhotos from '../../../config/airline-livery-photos.json';
import militaryAircraftPhotos from '../../../config/military-aircraft-photos.json';
import { isLikelyMilGov, resolveMilPhotoType } from './military';
import typeNames from '../../../config/aircraft-type-names.json';
import typicalSeats from '../../../config/aircraft-typical-seats.json';
import { mapFlightRouteSubLabel as mapFlightRouteSubLabelCore, flightDepartureLabel as routeDepartureLabel, flightDestinationLabel as routeDestinationLabel } from '../../../lib/flightRouteLabels.js';
import { withLocalAirportInference } from '../../../lib/localAirportInference.js';

export function flightKey(flight: Flight) {
  return flight.fr24_id || flight.hex || `${flight.lat}-${flight.lon}`;
}

export function flightLabel(flight: Flight) {
  return flight.callsign || flight.flight || flight.reg || 'Unknown';
}

const KNOTS_TO_MPH = 1.15078;

export function knotsToMph(knots?: number | null) {
  if (knots == null || !Number.isFinite(Number(knots))) return null;
  return Math.round(Number(knots) * KNOTS_TO_MPH);
}

export function formatSpeedMph(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return `${Math.round(Number(value))} mph`;
}

export function formatFlightSpeedMph(gspeed?: number | null) {
  return formatSpeedMph(knotsToMph(gspeed));
}

export function isSquawk7700(flight: Pick<Flight, 'squawk'>) {
  return Number(flight.squawk) === 7700;
}

const COUNTRY_LABELS: Record<string, string> = {
  US: 'USA',
  GB: 'UK',
  AE: 'UAE',
};

function endpointLabel(flight: Flight, role: 'orig' | 'dest') {
  const city = role === 'orig' ? flight.orig_city : flight.dest_city;
  const countryIso = role === 'orig' ? flight.orig_country_iso : flight.dest_country_iso;
  const country = role === 'orig' ? flight.orig_country : flight.dest_country;
  const iata = role === 'orig' ? flight.orig_iata : flight.dest_iata;
  const icao = role === 'orig' ? flight.orig_icao : flight.dest_icao;

  if (city) {
    const iso = (countryIso || '').toUpperCase();
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

export function flightDepartureLabel(flight: Flight) {
  const location = endpointLabel(flight, 'orig');
  return location !== '?' ? location : null;
}

export function flightDestinationLabel(flight: Flight) {
  const location = endpointLabel(flight, 'dest');
  return location !== '?' ? location : null;
}

const NEAR_AIRPORT_RADIUS_MILES = 30;

export function isNearTakeoffLocation(flight: Flight, radiusMiles = NEAR_AIRPORT_RADIUS_MILES) {
  const origLat = Number(flight.orig_lat);
  const origLon = Number(flight.orig_lon);
  if (!Number.isFinite(origLat) || !Number.isFinite(origLon)) return false;
  if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return false;
  return distanceMiles(flight.lat, flight.lon, origLat, origLon) <= radiusMiles;
}

export function isNearLandingLocation(flight: Flight, radiusMiles = NEAR_AIRPORT_RADIUS_MILES) {
  const destLat = Number(flight.dest_lat);
  const destLon = Number(flight.dest_lon);
  if (!Number.isFinite(destLat) || !Number.isFinite(destLon)) return false;
  if (!Number.isFinite(flight.lat) || !Number.isFinite(flight.lon)) return false;
  return distanceMiles(flight.lat, flight.lon, destLat, destLon) <= radiusMiles;
}

export type FlightRouteSubLabel = {
  text: string;
  tone: 'from' | 'to';
};

export function mapFlightRouteSubLabel(
  flight: Flight,
  options: { altitudeTrend?: 'up' | 'down' | null } = {}
): FlightRouteSubLabel | null {
  return mapFlightRouteSubLabelCore(flight, options);
}

export function routeLabel(flight: Flight) {
  const enriched = withLocalAirportInference(flight) as Flight;
  const from = routeDepartureLabel(enriched) ?? '?';
  const to = routeDestinationLabel(enriched) ?? '?';
  if (from !== '?' || to !== '?') return `${from} → ${to}`;

  const codes = routeCodesLabel(flight);
  if (codes) return codes;

  if (flight.track != null && Number.isFinite(flight.track)) {
    return `Heading ${Math.round(flight.track)}° · local traffic`;
  }

  if (flight.type) {
    return `Local · ${aircraftTypeLabel(flight.type) || flight.type}`;
  }

  return 'Local traffic';
}

export function routeCodesLabel(flight: Flight) {
  const from =
    (flight as Flight & { orig_inferred?: boolean }).orig_inferred
      ? null
      : flight.orig_iata || flight.orig_icao;
  const to =
    (flight as Flight & { dest_inferred?: boolean }).dest_inferred
      ? null
      : flight.dest_iata || flight.dest_icao;
  if (!from && !to) return null;
  return `${from || '?'} → ${to || '?'}`;
}

export function typicalSeatsLabel(flight: Flight) {
  const code = (flight.type || '').trim().toUpperCase();
  if (!code) return null;
  const seats = (typicalSeats as Record<string, number>)[code];
  if (!seats) return null;
  return `~${seats} seats typical for ${code}`;
}

export function googleFlightsUrl(flight: Flight) {
  if (flight.googleFlightsUrl) return flight.googleFlightsUrl;
  const from = flight.orig_iata || flight.orig_icao;
  const to = flight.dest_iata || flight.dest_icao;
  if (from && to) {
    return `https://www.google.com/travel/flights?q=Flights%20from%20${encodeURIComponent(from)}%20to%20${encodeURIComponent(to)}`;
  }
  const label = flight.callsign || flight.flight;
  if (label) {
    return `https://www.google.com/search?q=${encodeURIComponent(`${label} flight route`)}`;
  }
  return null;
}

export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sortFlightsByDistance(flights: Flight[], centerLat: number, centerLon: number) {
  return [...flights]
    .map((flight) => ({
      ...flight,
      distanceMiles:
        flight.distanceMiles ?? distanceMiles(centerLat, centerLon, flight.lat, flight.lon),
    }))
    .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
}

export function airlineIataFromFlight(flight: Flight) {
  const icao = (flight.operating_as || flight.painted_as || '').trim().toUpperCase();
  if (!icao) return null;
  return (icaoToIata as Record<string, string>)[icao] || null;
}

export function airlineLogoUrls(flight: Flight) {
  const iata = airlineIataFromFlight(flight);
  if (!iata) return [];
  return [
    `https://images.kiwi.com/airlines/128/${iata}.png`,
    `https://content.r9cdn.net/rimg/provider-logos/airlines/v/${iata}.png`,
    `https://www.gstatic.com/flights/airline_logos/70px/${iata}.png`,
  ];
}

export function aircraftPhotoProxyUrl(flight: Flight) {
  const reg = (flight.reg || '').trim();
  const hex = (flight.hex || '').trim();
  const type = (flight.type || '').trim();
  if (!reg && !hex) return null;
  const params = new URLSearchParams();
  if (reg) params.set('reg', reg);
  if (hex) params.set('hex', hex);
  if (type) params.set('type', type);
  return `/api/images/aircraft?${params.toString()}`;
}

export function resolvedAirlineIcao(flight: Flight) {
  return (
    flight.painted_as ||
    flight.operating_as ||
    inferAirlineIcaoFromCallsign(flight.callsign || flight.flight) ||
    ''
  )
    .trim()
    .toUpperCase();
}

export function curatedLiveryPhotoUrl(flight: Flight) {
  const icao = resolvedAirlineIcao(flight);
  if (!icao) return null;
  return (airlineLiveryPhotos as Record<string, string>)[icao] || null;
}

export function curatedMilitaryPhotoUrl(flight: Flight) {
  const photoType = resolveMilPhotoType(flight.type);
  if (!photoType) return null;
  return (militaryAircraftPhotos as Record<string, string>)[photoType] || null;
}

export function aircraftLiveryPhotoProxyUrl(flight: Flight) {
  const airline = resolvedAirlineIcao(flight);
  if (!airline) return null;
  if ((airlineLiveryPhotos as Record<string, string>)[airline]) return null;

  const params = new URLSearchParams({ airline });
  const type = (flight.type || '').trim();
  if (type) params.set('type', type);
  return `/api/images/aircraft-livery?${params.toString()}`;
}

/** @deprecated FR24 image CDN blocks hotlinking; kept for direct links if needed */
export function airlineLogoUrl(flight: Flight) {
  const urls = airlineLogoUrls(flight);
  return urls[0] || null;
}

/** @deprecated FR24 image CDN blocks hotlinking */
export function aircraftPhotoUrl(flight: Flight) {
  return aircraftPhotoProxyUrl(flight);
}

export function aircraftTypePhotoProxyUrl(type?: string) {
  const code = (type || '').trim();
  if (!code) return null;
  return `/api/images/aircraft-type?type=${encodeURIComponent(code)}`;
}

export function aircraftTypeLabel(type?: string) {
  const code = (type || '').trim().toUpperCase();
  if (!code) return null;
  const raw = (typeNames as Record<string, string | { name?: string; wiki?: string }>)[code];
  if (!raw) return code;
  if (typeof raw === 'string') return raw;
  return raw.name || raw.wiki || code;
}

export type AircraftVisualCandidate =
  | { kind: 'photo' | 'livery-photo' | 'logo' | 'type-photo'; url: string; label: string }
  | { kind: 'type-sprite'; type: string; label: string };

export function aircraftImageCandidates(flight: Flight): AircraftVisualCandidate[] {
  const candidates: AircraftVisualCandidate[] = [];
  const airline = resolvedAirlineIcao(flight);
  const milPhoto = curatedMilitaryPhotoUrl(flight);

  if (milPhoto) {
    candidates.push({
      url: milPhoto,
      kind: 'type-photo',
      label: aircraftTypeLabel(flight.type) || flight.type || 'Military aircraft',
    });
  }

  const curated = isLikelyMilGov(flight) ? null : curatedLiveryPhotoUrl(flight);
  if (curated) {
    candidates.push({
      url: curated,
      kind: 'livery-photo',
      label: `${airline} ${aircraftTypeLabel(flight.type) || flight.type || 'aircraft'}`,
    });
  }

  const photo = aircraftPhotoProxyUrl(flight);
  if (photo) {
    candidates.push({
      url: photo,
      kind: 'photo',
      label: flight.reg || flightLabel(flight),
    });
  }

  const liveryPhoto = aircraftLiveryPhotoProxyUrl(flight);
  if (liveryPhoto) {
    candidates.push({
      url: liveryPhoto,
      kind: 'livery-photo',
      label: `${airline || 'Airline'} ${aircraftTypeLabel(flight.type) || flight.type || 'aircraft'}`,
    });
  }

  const typePhoto = aircraftTypePhotoProxyUrl(flight.type);
  if (typePhoto) {
    candidates.push({
      url: typePhoto,
      kind: 'type-photo',
      label: aircraftTypeLabel(flight.type) || flight.type || 'Aircraft',
    });
  }

  if (flight.type) {
    candidates.push({
      kind: 'type-sprite',
      type: flight.type,
      label: aircraftTypeLabel(flight.type) || flight.type,
    });
  }

  return candidates;
}

export function formatEta(flight: Flight) {
  if (!flight.eta) return null;
  const eta = new Date(flight.eta);
  if (Number.isNaN(eta.getTime())) return null;
  return eta.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function arrivalStatus(flight: Flight) {
  if (!flight.eta) return 'En route · ETA unavailable';
  const eta = new Date(flight.eta);
  if (Number.isNaN(eta.getTime())) return 'En route';

  const minutes = Math.round((eta.getTime() - Date.now()) / 60000);
  if (minutes <= 0) return 'Arriving / on approach';
  if (minutes < 60) return `En route · ETA in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `En route · ETA in ${hours}h ${rem}m`;
}

export function verticalTrend(vspeed?: number) {
  if (vspeed === undefined || vspeed === null) return 'Level';
  if (vspeed > 300) return 'Climbing fast';
  if (vspeed > 80) return 'Climbing';
  if (vspeed < -300) return 'Descending fast';
  if (vspeed < -80) return 'Descending';
  return 'Level';
}
