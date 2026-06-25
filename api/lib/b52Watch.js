import { isB52 } from '../../lib/military.js';
import { normalizeAdsbAircraft } from './adsbNormalize.js';

const ADSB_BASE = process.env.ADSB_API_BASE || 'https://api.adsb.lol';
const CACHE_MS = Number(process.env.B52_WATCH_CACHE_MS || 15000);

let cache = {
  ts: 0,
  flights: [],
};

function flightMergeKey(flight) {
  return String(flight.hex || flight.fr24_id || `${flight.lat}-${flight.lon}`).toLowerCase();
}

export function mergeB52Flights(...groups) {
  const map = new Map();

  for (const group of groups) {
    for (const flight of group || []) {
      if (!isB52(flight)) continue;
      const key = flightMergeKey(flight);
      map.set(key, { ...map.get(key), ...flight });
    }
  }

  return [...map.values()];
}

export async function fetchGlobalB52Flights() {
  const now = Date.now();
  if (now - cache.ts < CACHE_MS) {
    return cache.flights;
  }

  try {
    const res = await fetch(`${ADSB_BASE}/v2/mil`, {
      headers: { Accept: 'application/json' },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.message || body?.detail || `ADSB.lol mil feed failed (${res.status})`);
    }

    const flights = (Array.isArray(body?.ac) ? body.ac : [])
      .map(normalizeAdsbAircraft)
      .filter(Boolean)
      .filter(isB52);

    cache = { ts: now, flights };
    return flights;
  } catch {
    return cache.flights;
  }
}

export async function resolveB52Flights(localFlights = []) {
  const globalFlights = await fetchGlobalB52Flights();
  return mergeB52Flights(localFlights, globalFlights);
}
