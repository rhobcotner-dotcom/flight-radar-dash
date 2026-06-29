import { enrichAirQualityOccupancy } from './occupancyEnrichment.js';

const OPEN_METEO = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const AIRNOW_URL = 'https://www.airnowapi.org/aq/observation/latLong/current/';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';

let cache = { fetchedAt: 0, data: null };

function aqiCategory(usAqi) {
  const value = Number(usAqi);
  if (!Number.isFinite(value)) return 'Unknown';
  if (value <= 50) return 'Good';
  if (value <= 100) return 'Moderate';
  if (value <= 150) return 'Unhealthy for sensitive groups';
  if (value <= 200) return 'Unhealthy';
  if (value <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

function aqiClass(usAqi) {
  const value = Number(usAqi);
  if (!Number.isFinite(value)) return 'aqi-unknown';
  if (value <= 50) return 'aqi-good';
  if (value <= 100) return 'aqi-moderate';
  if (value <= 150) return 'aqi-sensitive';
  if (value <= 200) return 'aqi-unhealthy';
  return 'aqi-hazardous';
}

async function fetchOpenMeteo(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'us_aqi,pm2_5,pm10',
    timezone: 'America/Chicago',
  });

  const res = await fetch(`${OPEN_METEO}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Air quality unavailable (${res.status})`);
  }

  const body = await res.json();
  const current = body?.current || {};

  return {
    usAqi: current.us_aqi ?? null,
    pm25: current.pm2_5 ?? null,
    pm10: current.pm10 ?? null,
    observedAt: current.time || null,
    source: 'open-meteo.com',
  };
}

async function fetchAirNow(lat, lon) {
  const apiKey = String(process.env.AIRNOW_API_KEY || '').trim();
  if (!apiKey) return null;

  const params = new URLSearchParams({
    format: 'application/json',
    latitude: String(lat),
    longitude: String(lon),
    distance: '50',
    API_KEY: apiKey,
  });

  const res = await fetch(`${AIRNOW_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!res.ok) return null;

  const body = await res.json();
  const row = Array.isArray(body) ? body[0] : null;
  if (!row) return null;

  return {
    usAqi: row.AQI ?? null,
    pm25: row.Parameter === 'PM2.5' ? row.Value : null,
    pm10: row.Parameter === 'PM10' ? row.Value : null,
    observedAt: row.DateObserved ? `${row.DateObserved}T${row.HourObserved || '00'}:00:00` : null,
    source: 'airnow.gov',
    reportingArea: row.ReportingArea || null,
    state: row.StateCode || null,
  };
}

export async function fetchAirQuality(lat, lon) {
  const cacheKey = `${lat.toFixed(3)}:${lon.toFixed(3)}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const [openMeteo, airNow] = await Promise.all([
    fetchOpenMeteo(lat, lon),
    fetchAirNow(lat, lon),
  ]);

  const primary = airNow || openMeteo;
  const payload = {
    lat,
    lon,
    fetchedAt: new Date().toISOString(),
    usAqi: primary.usAqi,
    pm25: primary.pm25 ?? openMeteo.pm25,
    pm10: primary.pm10 ?? openMeteo.pm10,
    category: aqiCategory(primary.usAqi),
    aqiClass: aqiClass(primary.usAqi),
    observedAt: primary.observedAt,
    source: primary.source,
    reportingArea: airNow?.reportingArea || null,
    state: airNow?.state || null,
    supplementalSource: airNow ? openMeteo.source : null,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload: enrichAirQualityOccupancy(payload) } };
  return enrichAirQualityOccupancy(payload);
}
