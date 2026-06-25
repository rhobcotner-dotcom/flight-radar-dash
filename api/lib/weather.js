import {
  enrichWeatherConditions,
  fahrenheitFromCelsius,
} from '../../lib/weatherCodes.js';
import { fetchNwsObservation } from './nwsObservation.js';

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const cache = new Map();
const CACHE_TTL_MS = 90 * 1000;
const CACHE_VERSION = 5;

function cacheKey(lat, lon) {
  return `v${CACHE_VERSION}:${lat.toFixed(2)}:${lon.toFixed(2)}`;
}

function mphFromKmh(kmh) {
  return Math.round(kmh * 0.621371 * 10) / 10;
}

function detectSurfaceInversion(current, hourly) {
  const surfaceTemp = Number(current?.temperature_2m);
  const surfaceHumidity = Number(current?.relative_humidity_2m);
  if (!Number.isFinite(surfaceTemp)) return false;

  const temps = hourly?.temperature_2m;
  if (Array.isArray(temps) && temps.length > 2) {
    const aloft = Number(temps[2]);
    if (Number.isFinite(aloft) && aloft - surfaceTemp >= 2) return true;
  }

  return surfaceHumidity > 90 && surfaceTemp < 8;
}

async function fetchOpenMeteoConditions(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure,weather_code,precipitation,cloud_cover',
    hourly: 'temperature_2m',
    forecast_hours: '3',
    timezone: 'auto',
  });

  const res = await fetch(`${OPEN_METEO}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Weather lookup failed (${res.status})`);
  }

  const body = await res.json();
  const current = body.current || {};
  const temperatureC = current.temperature_2m ?? null;
  const temperatureF = fahrenheitFromCelsius(temperatureC);

  return enrichWeatherConditions({
    source: 'open-meteo.com',
    fetchedAt: new Date().toISOString(),
    observedAt: current.time ?? null,
    temperatureC,
    temperatureF,
    relativeHumidityPct: current.relative_humidity_2m ?? null,
    windSpeedMph: current.wind_speed_10m != null ? mphFromKmh(current.wind_speed_10m) : null,
    windDirectionDeg: current.wind_direction_10m ?? null,
    surfacePressureHpa: current.surface_pressure ?? null,
    surfaceInversion: detectSurfaceInversion(current, body.hourly),
    weatherCode: current.weather_code ?? null,
    precipitationMm: current.precipitation ?? null,
    cloudCoverPct: current.cloud_cover ?? null,
  });
}

export { weatherCodeLabel } from '../../lib/weatherCodes.js';
export { WEATHER_CODE_LABELS } from '../../lib/weatherCodes.js';

export async function fetchWeatherConditions(lat, lon) {
  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.data;
  }

  let data = null;

  try {
    data = await fetchNwsObservation(lat, lon);
  } catch {
    data = null;
  }

  if (!data) {
    data = await fetchOpenMeteoConditions(lat, lon);
  }

  cache.set(key, { fetchedAt: Date.now(), data });
  return data;
}
