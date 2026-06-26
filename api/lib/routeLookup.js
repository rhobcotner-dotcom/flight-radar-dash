import { fetchWithTimeout, mapWithConcurrency } from './fetchWithTimeout.js';

const ROUTE_API = process.env.ROUTE_API_BASE || 'https://api.adsbdb.com/v0';
const ROUTE_CACHE_TTL_MS = Number(process.env.ROUTE_CACHE_TTL_MS || 60 * 60 * 1000);
const ROUTE_LOOKUP_LIMIT = Number(process.env.ROUTE_LOOKUP_LIMIT || 120);
const ROUTE_LOOKUP_CONCURRENCY = Number(process.env.ROUTE_LOOKUP_CONCURRENCY || 12);
const ROUTE_FETCH_TIMEOUT_MS = Number(process.env.ROUTE_FETCH_TIMEOUT_MS || 8_000);

const cache = new Map();

function normalizeCallsign(value) {
  return String(value || '').trim().toUpperCase();
}

export function googleFlightsUrl(flight) {
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

async function lookupRouteByCallsign(callsign) {
  const key = normalizeCallsign(callsign);
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < ROUTE_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetchWithTimeout(
    `${ROUTE_API}/callsign/${encodeURIComponent(key)}`,
    { headers: { Accept: 'application/json' } },
    ROUTE_FETCH_TIMEOUT_MS
  );

  if (!res.ok) {
    cache.set(key, { ts: Date.now(), data: null });
    return null;
  }

  const body = await res.json();
  const route = body?.response?.flightroute;
  if (!route?.origin || !route?.destination) {
    cache.set(key, { ts: Date.now(), data: null });
    return null;
  }

  const data = {
    orig_iata: route.origin.iata_code || undefined,
    orig_icao: route.origin.icao_code || undefined,
    orig_city: route.origin.municipality || route.origin.name || undefined,
    orig_country: route.origin.country_name || undefined,
    orig_country_iso: route.origin.country_iso_name || undefined,
    orig_lat: route.origin.latitude ?? undefined,
    orig_lon: route.origin.longitude ?? undefined,
    dest_iata: route.destination.iata_code || undefined,
    dest_icao: route.destination.icao_code || undefined,
    dest_city: route.destination.municipality || route.destination.name || undefined,
    dest_country: route.destination.country_name || undefined,
    dest_country_iso: route.destination.country_iso_name || undefined,
    dest_lat: route.destination.latitude ?? undefined,
    dest_lon: route.destination.longitude ?? undefined,
    operating_as: route.airline?.icao || undefined,
    painted_as: route.airline?.icao || undefined,
    carrierName: route.airline?.name || undefined,
    googleFlightsUrl: googleFlightsUrl({
      orig_iata: route.origin.iata_code,
      orig_icao: route.origin.icao_code,
      dest_iata: route.destination.iata_code,
      dest_icao: route.destination.icao_code,
    }),
  };

  cache.set(key, { ts: Date.now(), data });
  return data;
}

export async function enrichFlightsWithRoutes(flights, { homeRadiusMiles = null } = {}) {
  const allCallsigns = [
    ...new Set(flights.map((f) => normalizeCallsign(f.callsign || f.flight)).filter(Boolean)),
  ];

  const homeCallsigns = new Set();
  if (homeRadiusMiles != null) {
    for (const flight of flights) {
      if ((flight.distanceMiles ?? Infinity) <= homeRadiusMiles) {
        const key = normalizeCallsign(flight.callsign || flight.flight);
        if (key) homeCallsigns.add(key);
      }
    }
  }

  const callsigns = [
    ...allCallsigns.filter((callsign) => homeCallsigns.has(callsign)),
    ...allCallsigns.filter((callsign) => !homeCallsigns.has(callsign)),
  ].slice(0, ROUTE_LOOKUP_LIMIT);

  const routeByCallsign = new Map();
  const results = await mapWithConcurrency(
    callsigns,
    ROUTE_LOOKUP_CONCURRENCY,
    (callsign) => lookupRouteByCallsign(callsign)
  );
  callsigns.forEach((callsign, index) => {
    routeByCallsign.set(callsign, results[index]);
  });

  return flights.map((flight) => {
    const key = normalizeCallsign(flight.callsign || flight.flight);
    const route = key ? routeByCallsign.get(key) : null;
    if (!route) {
      return {
        ...flight,
        googleFlightsUrl: googleFlightsUrl(flight),
      };
    }

    return {
      ...flight,
      orig_iata: route.orig_iata ?? flight.orig_iata,
      orig_icao: route.orig_icao ?? flight.orig_icao,
      orig_city: route.orig_city ?? flight.orig_city,
      orig_country: route.orig_country ?? flight.orig_country,
      orig_country_iso: route.orig_country_iso ?? flight.orig_country_iso,
      orig_lat: route.orig_lat ?? flight.orig_lat,
      orig_lon: route.orig_lon ?? flight.orig_lon,
      dest_iata: route.dest_iata ?? flight.dest_iata,
      dest_icao: route.dest_icao ?? flight.dest_icao,
      dest_city: route.dest_city ?? flight.dest_city,
      dest_country: route.dest_country ?? flight.dest_country,
      dest_country_iso: route.dest_country_iso ?? flight.dest_country_iso,
      dest_lat: route.dest_lat ?? flight.dest_lat,
      dest_lon: route.dest_lon ?? flight.dest_lon,
      operating_as: route.operating_as ?? flight.operating_as,
      painted_as: route.painted_as ?? flight.painted_as,
      carrierName: route.carrierName ?? flight.carrierName,
      googleFlightsUrl: route.googleFlightsUrl || googleFlightsUrl({ ...flight, ...route }),
    };
  });
}
