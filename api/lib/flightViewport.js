import { pointInBoundingBox } from '../../lib/geo.js';
import { getFlightsNearPoint, milesToNauticalMiles } from '../adsb-client.js';
import { normalizeAdsbResponse } from './adsbNormalize.js';
import { getStatesInBounds, isOpenSkyAvailable, isOpenSkyConfigured } from './openskyClient.js';
import { normalizeOpenSkyStates } from './openskyNormalize.js';
import { enrichAndSortFlights } from './distance.js';
import { enrichFlightsCarriers } from './airlineNames.js';
import { enrichFlightsWithRoutes } from './routeLookup.js';
import { enrichFlightsWithRegistry } from './aircraftRegistry.js';

const MAX_ADSB_RADIUS_NM = 250;
const MAX_ADSB_RADIUS_MILES = MAX_ADSB_RADIUS_NM * 1.15078;

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveFlightViewport(query = {}, area = {}) {
  const west = parseNumber(query.west);
  const south = parseNumber(query.south);
  const east = parseNumber(query.east);
  const north = parseNumber(query.north);
  const zoom = parseNumber(query.zoom);

  if (west != null && south != null && east != null && north != null) {
    return {
      west,
      south,
      east,
      north,
      zoom: zoom ?? 10,
    };
  }

  if (area?.box) {
    return {
      west: area.box.west,
      south: area.box.south,
      east: area.box.east,
      north: area.box.north,
      zoom: zoom ?? 12,
    };
  }

  return {
    west: -180,
    south: -60,
    east: 180,
    north: 80,
    zoom: zoom ?? 4,
  };
}

function viewportCenter(viewport) {
  return {
    lat: (viewport.south + viewport.north) / 2,
    lon: (viewport.west + viewport.east) / 2,
  };
}

function viewportCornerDistanceMiles(viewport) {
  const center = viewportCenter(viewport);
  const corners = [
    [viewport.south, viewport.west],
    [viewport.south, viewport.east],
    [viewport.north, viewport.west],
    [viewport.north, viewport.east],
  ];
  return Math.max(
    ...corners.map(([lat, lon]) =>
      Math.hypot((lat - center.lat) * 69, (lon - center.lon) * 69 * Math.cos((center.lat * Math.PI) / 180))
    )
  );
}

function flightLimitForZoom(zoom) {
  if (zoom <= 4) return 900;
  if (zoom <= 6) return 2200;
  if (zoom <= 8) return 4500;
  return 12000;
}

function thinFlights(flights, viewport, limit) {
  if (flights.length <= limit) return flights;

  const lonSpan = Math.max(viewport.east - viewport.west, 0.001);
  const latSpan = Math.max(viewport.north - viewport.south, 0.001);
  const cols = Math.max(8, Math.min(24, Math.round(Math.sqrt(limit))));
  const rows = Math.max(8, Math.min(24, Math.ceil(limit / cols)));
  const lonStep = lonSpan / cols;
  const latStep = latSpan / rows;
  const buckets = new Map();

  for (const flight of flights) {
    const col = Math.min(cols - 1, Math.max(0, Math.floor((flight.lon - viewport.west) / lonStep)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((flight.lat - viewport.south) / latStep)));
    const key = `${row}:${col}`;
    const altScore = flight.alt ?? 0;
    const current = buckets.get(key);
    if (!current || altScore > (current.alt ?? 0)) {
      buckets.set(key, flight);
    }
  }

  return [...buckets.values()].slice(0, limit);
}

function dedupeFlights(flights) {
  const byHex = new Map();
  for (const flight of flights) {
    const key = String(flight.hex || flight.fr24_id || `${flight.lat}:${flight.lon}`).toLowerCase();
    byHex.set(key, flight);
  }
  return [...byHex.values()];
}

async function fetchAdsbViewportFlights(viewport) {
  const center = viewportCenter(viewport);
  const radiusMiles = Math.min(
    MAX_ADSB_RADIUS_MILES,
    Math.max(25, Math.ceil(viewportCornerDistanceMiles(viewport) * 1.1))
  );
  const body = await getFlightsNearPoint(center.lat, center.lon, radiusMiles);
  const maxDistanceNm = milesToNauticalMiles(radiusMiles);
  return normalizeAdsbResponse(body, maxDistanceNm).filter((flight) =>
    pointInBoundingBox(flight.lat, flight.lon, viewport)
  );
}

async function fetchOpenSkyViewportFlights(viewport) {
  const payload = await getStatesInBounds(viewport);
  return normalizeOpenSkyStates(payload.states, viewport);
}

export async function fetchViewportFlights(viewport, home, { enrich = true } = {}) {
  const homeLat = Number(home.lat);
  const homeLon = Number(home.lon);
  const homeRadius = Number(home.radiusMiles) || 85;

  let flights = [];
  let dataSource = 'adsb.lol';
  let dataWarning = null;
  let openSkyError = null;

  if (isOpenSkyConfigured() && isOpenSkyAvailable()) {
    try {
      flights = await fetchOpenSkyViewportFlights(viewport);
      dataSource = 'opensky-network.org';
    } catch (err) {
      openSkyError = err;
      if (err?.status === 429) {
        dataWarning = 'OpenSky rate limited — using ADSB.lol backup feed.';
      }
    }
  }

  if (!flights.length) {
    try {
      flights = await fetchAdsbViewportFlights(viewport);
      dataSource = 'adsb.lol';
    } catch (adsbError) {
      throw openSkyError || adsbError;
    }
  }

  flights = dedupeFlights(flights);
  const limit = flightLimitForZoom(viewport.zoom ?? 10);
  flights = thinFlights(flights, viewport, limit);
  flights = enrichAndSortFlights(flights, homeLat, homeLon);

  if (enrich) {
    const registryTask = enrichFlightsWithRegistry(flights);
    const routesTask = enrichFlightsWithRoutes(flights, { homeRadiusMiles: homeRadius });
    const [, routeFlights] = await Promise.all([registryTask, routesTask]);
    flights = routeFlights.map((flight, index) => ({
      ...flight,
      reg: flights[index].reg ?? flight.reg,
      type: flights[index].type ?? flight.type,
      carrierName: flight.carrierName ?? flights[index].carrierName,
      operating_as: flight.operating_as ?? flights[index].operating_as,
      painted_as: flight.painted_as ?? flights[index].painted_as,
    }));
  }
  flights = enrichFlightsCarriers(flights);

  const homeFlights = flights.filter((flight) => (flight.distanceMiles ?? Infinity) <= homeRadius);

  return {
    flights,
    homeFlights,
    viewport,
    dataSource,
    dataWarning,
    inViewCount: flights.length,
    homeCount: homeFlights.length,
    thinned: flights.length >= limit,
  };
}
