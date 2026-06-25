const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 12000;
const POINTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_STATIONS = 4;

const pointsCache = new Map();

function pointsCacheKey(lat, lon) {
  return `${lat.toFixed(2)}:${lon.toFixed(2)}`;
}

function isUsLocation(lat, lon) {
  return lat >= 15 && lat <= 72 && lon >= -170 && lon <= -60;
}

async function fetchWithTimeout(url, accept = 'application/geo+json') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: accept,
        'User-Agent': USER_AGENT,
      },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`NWS request failed (${res.status})`);
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function quantityValue(field) {
  const value = field?.value;
  return value == null || !Number.isFinite(Number(value)) ? null : Number(value);
}

function mphFromKmh(kmh) {
  return Math.round(kmh * 0.621371 * 10) / 10;
}

function hpaFromPa(pa) {
  return Math.round((pa / 100) * 10) / 10;
}

function normalizeStationId(stationRef) {
  const value = String(stationRef || '');
  const match = value.match(/stations\/([A-Z0-9]+)/i);
  if (match) return match[1].toUpperCase();
  return value.split('/').pop()?.toUpperCase() || null;
}

export function nwsTextToCondition(textDescription, iconUrl = '') {
  const text = String(textDescription || '').trim().toLowerCase();
  if (text) {
    const cleaned = text.replace(/\s+/g, ' ');
    if (cleaned.includes('thunder')) {
      if (cleaned.includes('vicinity') || cleaned.includes('nearby')) return 'nearby thunderstorm';
      return 'active thunderstorm';
    }
    if (cleaned.includes('light rain') || cleaned.startsWith('light rain')) return 'light rain';
    if (cleaned.includes('heavy rain')) return 'heavy rain';
    if (cleaned.includes('rain')) return 'light rain';
    if (cleaned.includes('fog')) return 'hazy fog';
    if (cleaned.includes('haze')) return 'hazy skies';
    if (cleaned.includes('overcast')) return 'overcast cloudy';
    if (cleaned.includes('partly cloudy')) return 'partly cloudy';
    if (cleaned.includes('mostly clear')) return 'mostly clear';
    if (cleaned.includes('cloud')) return 'partly cloudy';
    if (cleaned.includes('clear')) return 'mostly clear';
    if (cleaned.includes('snow')) return 'light snow';

    const parts = cleaned.split(' ').filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
    return `${parts[0] || 'mixed'} conditions`;
  }

  const icon = String(iconUrl || '').toLowerCase();
  if (icon.includes('tsra') || icon.includes('tstm')) return 'active thunderstorm';
  if (icon.includes('rain') || icon.includes('shra')) return 'light rain';
  if (icon.includes('snow')) return 'light snow';
  if (icon.includes('fog')) return 'hazy fog';
  if (icon.includes('ovc') || icon.includes('cloud')) return 'overcast cloudy';
  if (icon.includes('sct') || icon.includes('bkn')) return 'partly cloudy';
  if (icon.includes('few') || icon.includes('skc')) return 'mostly clear';
  return 'mixed conditions';
}

async function resolveObservationStations(lat, lon) {
  const key = pointsCacheKey(lat, lon);
  const cached = pointsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < POINTS_CACHE_TTL_MS) {
    return cached.stations;
  }

  const points = await fetchWithTimeout(`https://api.weather.gov/points/${lat},${lon}`);
  const stationsUrl = points?.properties?.observationStations;
  if (!stationsUrl) return [];

  const stationsBody = await fetchWithTimeout(stationsUrl);
  const stations = Array.isArray(stationsBody?.observationStations)
    ? stationsBody.observationStations.slice(0, MAX_STATIONS)
    : [];

  pointsCache.set(key, { fetchedAt: Date.now(), stations });
  return stations;
}

async function fetchLatestObservation(stationUrl) {
  const body = await fetchWithTimeout(`${stationUrl}/observations/latest`);
  const props = body?.properties;
  if (!props) return null;

  const temperatureC = quantityValue(props.temperature);
  if (temperatureC == null) return null;

  const windKmh = quantityValue(props.windSpeed);
  const precipMm = quantityValue(props.precipitationLastHour);

  return {
    source: 'weather.gov',
    fetchedAt: new Date().toISOString(),
    observedAt: props.timestamp || null,
    stationId: normalizeStationId(props.station || stationUrl),
    stationName: props.name || null,
    temperatureC,
    temperatureF: Math.round((temperatureC * 9) / 5 + 32),
    relativeHumidityPct: quantityValue(props.relativeHumidity),
    windSpeedMph: windKmh != null ? mphFromKmh(windKmh) : null,
    windDirectionDeg: quantityValue(props.windDirection),
    surfacePressureHpa: quantityValue(props.barometricPressure) != null
      ? hpaFromPa(quantityValue(props.barometricPressure))
      : null,
    surfaceInversion: false,
    weatherCode: null,
    precipitationMm: precipMm,
    cloudCoverPct: null,
    conditionLabel: nwsTextToCondition(props.textDescription, props.icon),
  };
}

export async function fetchNwsObservation(lat, lon) {
  if (!isUsLocation(lat, lon)) return null;

  const stations = await resolveObservationStations(lat, lon);
  if (!stations.length) return null;

  const observations = await Promise.all(stations.map((stationUrl) => fetchLatestObservation(stationUrl)));
  const valid = observations.filter(Boolean);
  if (!valid.length) return null;

  const withWind = valid.filter((obs) => obs.windSpeedMph != null);
  const pool = withWind.length ? withWind : valid;
  pool.sort((a, b) => Date.parse(b.observedAt || 0) - Date.parse(a.observedAt || 0));

  return pool[0];
}
