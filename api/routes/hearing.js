import { fetchWeatherConditions } from '../lib/weather.js';
import { fetchNwsAlerts } from '../lib/nwsAlerts.js';
import { fetchTornadoWarningPolygons } from '../lib/nwsTornadoPolygons.js';
import { getNoiseCategories, getNoiseModel, getNoiseProfiles } from '../lib/hearingPredictor.js';

export async function handleWeather(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const weather = await fetchWeatherConditions(lat, lon);
  res.json({ weather });
}

export async function handleWeatherAlerts(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchNwsAlerts(lat, lon);
  res.json(payload);
}

export async function handleTornadoPolygons(_req, res) {
  const payload = await fetchTornadoWarningPolygons();
  res.json(payload);
}

export function handleHearingConfig(_req, res) {
  res.json({
    model: getNoiseModel(),
    categories: getNoiseCategories(),
    profiles: {
      meta: getNoiseProfiles()._meta,
      defaultCategory: getNoiseProfiles().defaultCategory,
      typeCount: Object.keys(getNoiseProfiles().types || {}).length,
      prefixRuleCount: (getNoiseProfiles().prefixRules || []).length,
    },
  });
}
