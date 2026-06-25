import type { Flight } from '../types';
import { flightKey } from './flightUtils';

const LIVE_FIELDS = ['lat', 'lon', 'alt', 'gspeed', 'vspeed', 'track', 'squawk', 'timestamp', 'distanceMiles'] as const;

/** Keep stable object references when only live position fields change. */
export function mergeFlightList(prev: Flight[], incoming: Flight[]): Flight[] {
  const prevMap = new Map(prev.map((flight) => [flightKey(flight), flight]));

  return incoming.map((next) => {
    const key = flightKey(next);
    const previous = prevMap.get(key);
    if (!previous) return next;

    const liveChanged = LIVE_FIELDS.some((field) => previous[field] !== next[field]);
    if (!liveChanged) return previous;

    return {
      ...previous,
      lat: next.lat,
      lon: next.lon,
      alt: next.alt,
      gspeed: next.gspeed,
      vspeed: next.vspeed,
      track: next.track,
      squawk: next.squawk,
      timestamp: next.timestamp,
      distanceMiles: next.distanceMiles,
    };
  });
}

export function flightListsEqual(a: Flight[], b: Flight[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
