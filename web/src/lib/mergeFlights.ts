import type { Flight } from '../types';

const LIVE_FIELDS = ['lat', 'lon', 'alt', 'gspeed', 'vspeed', 'track', 'squawk', 'timestamp', 'distanceMiles'] as const;

const ROUTE_FIELDS = [
  'orig_iata',
  'orig_icao',
  'orig_city',
  'orig_country',
  'orig_country_iso',
  'orig_lat',
  'orig_lon',
  'dest_iata',
  'dest_icao',
  'dest_city',
  'dest_country',
  'dest_country_iso',
  'dest_lat',
  'dest_lon',
  'carrierName',
  'operating_as',
  'painted_as',
  'googleFlightsUrl',
] as const;

function flightKey(flight: Flight) {
  return flight.fr24_id || flight.hex || `${flight.lat}-${flight.lon}`;
}

function hasDefinedRouteField(flight: Flight, field: (typeof ROUTE_FIELDS)[number]) {
  const value = flight[field];
  return value !== undefined && value !== null && value !== '';
}

/** Fast position refreshes (enrich=0) omit route fields — only merge when enrich sent them. */
function incomingHasRouteData(flight: Flight) {
  return ROUTE_FIELDS.some((field) => hasDefinedRouteField(flight, field));
}

/** Keep stable object references when only live position fields change. */
export function mergeFlightList(prev: Flight[], incoming: Flight[]): Flight[] {
  if (!incoming.length) return prev;

  const prevMap = new Map(prev.map((flight) => [flightKey(flight), flight]));

  return incoming.map((next) => {
    const key = flightKey(next);
    const previous = prevMap.get(key);
    if (!previous) return next;

    const liveChanged = LIVE_FIELDS.some((field) => previous[field] !== next[field]);
    const routePayload = incomingHasRouteData(next);
    const routeChanged =
      routePayload && ROUTE_FIELDS.some((field) => previous[field] !== next[field]);
    if (!liveChanged && !routeChanged) return previous;

    const merged: Flight = { ...previous };
    if (liveChanged) {
      for (const field of LIVE_FIELDS) {
        merged[field] = next[field];
      }
    }
    if (routeChanged) {
      for (const field of ROUTE_FIELDS) {
        if (hasDefinedRouteField(next, field)) {
          merged[field] = next[field];
        }
      }
    }
    return merged;
  });
}

export function flightListsEqual(a: Flight[], b: Flight[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
