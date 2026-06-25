import { distanceMiles } from '../../lib/geo.js';

const METRO_VEHICLES_URL = 'https://metrolink-gtfsrt.gbsdigital.us/extended/vehicles';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 20 * 1000;

let cache = { fetchedAt: 0, data: null };

function normalizeVehicle(raw) {
  const lat = Number(raw?.latitude ?? raw?.lat);
  const lon = Number(raw?.longitude ?? raw?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const routeId = String(raw?.routeId || raw?.route_id || '').trim();
  const vehicleId = String(raw?.vehicleId || raw?.vehicle_id || raw?.id || '').trim();
  if (!vehicleId) return null;

  return {
    vehicleId,
    routeId: routeId || null,
    routeName: raw?.routeShortName || raw?.route_short_name || routeId || 'Metro',
    lat,
    lon,
    bearing: raw?.bearing != null ? Number(raw.bearing) : null,
    speedMph: raw?.speed != null ? Math.round(Number(raw.speed) * 2.23694) : null,
    tripId: raw?.tripId || raw?.trip_id || null,
    label: raw?.label || vehicleId,
  };
}

export async function fetchMetroTransit(area) {
  const apiKey = String(process.env.METRO_API_KEY || '').trim();
  if (!apiKey) {
    return {
      enabled: false,
      source: 'metrolink-gtfsrt.gbsdigital.us',
      message: 'Set METRO_API_KEY in .env to enable MetroLink / MetroBus live vehicles.',
      count: 0,
      vehicles: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  if (cache.data && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const res = await fetch(METRO_VEHICLES_URL, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'X-Api-Key': apiKey,
    },
  });

  if (!res.ok) {
    throw new Error(`Metro transit unavailable (${res.status})`);
  }

  const body = await res.json();
  const rows = Array.isArray(body?.vehicles)
    ? body.vehicles
    : Array.isArray(body?.entity)
      ? body.entity.map((row) => row?.vehicle || row).filter(Boolean)
      : Array.isArray(body)
        ? body
        : [];

  const radius = Math.max(Number(area.radiusMiles) || 30, 35);
  const vehicles = rows
    .map(normalizeVehicle)
    .filter(Boolean)
    .map((vehicle) => ({
      ...vehicle,
      distanceMiles: distanceMiles(area.lat, area.lon, vehicle.lat, vehicle.lon),
    }))
    .filter((vehicle) => vehicle.distanceMiles <= radius)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  const payload = {
    enabled: true,
    source: 'metrolink-gtfsrt.gbsdigital.us',
    fetchedAt: new Date().toISOString(),
    count: vehicles.length,
    radiusMiles: radius,
    vehicles,
  };

  cache = { fetchedAt: Date.now(), data: payload };
  return payload;
}
