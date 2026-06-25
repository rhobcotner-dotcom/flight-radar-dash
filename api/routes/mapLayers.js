import { fetchWeatherAlertPolygons } from '../lib/nwsAlertPolygons.js';
import { fetchLightningStrikes } from '../lib/lightning.js';
import { fetchMetarStations } from '../lib/metar.js';
import { fetchAreaTfrs } from '../lib/faaTfrs.js';
import { fetchRiverGauges } from '../lib/riverGauges.js';
import { fetchMetroTransit } from '../lib/metroTransit.js';
import { fetchModotRoadConditions } from '../lib/modotRoadConditions.js';
import { fetchAirQuality } from '../lib/airQuality.js';
import { fetchAisVessels } from '../lib/aisVessels.js';
import { fetchAreaNotams } from '../lib/notams.js';
import { fetchEarthquakes } from '../lib/earthquakes.js';
import { fetchWeatherSondes } from '../lib/sondes.js';
import { fetchWildfireHotspots } from '../lib/wildfires.js';

function parseLatLon(req) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

function parseRadius(req, fallback = 85) {
  const radiusMiles = Number(req.query.radiusMiles);
  return Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : fallback;
}

export async function handleWeatherAlertPolygons(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchWeatherAlertPolygons(point.lat, point.lon, parseRadius(req, 120));
  res.json(payload);
}

export async function handleLightning(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchLightningStrikes(point.lat, point.lon, parseRadius(req, 85));
  res.json(payload);
}

export async function handleMetar(req, res) {
  const ids = String(req.query.ids || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const payload = await fetchMetarStations(ids.length ? ids : undefined);
  res.json(payload);
}

export async function handleTfrs(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchAreaTfrs(point.lat, point.lon, parseRadius(req, 120));
  res.json(payload);
}

export async function handleRiverGauges(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchRiverGauges(point.lat, point.lon, parseRadius(req, 85));
  res.json(payload);
}

export async function handleTransit(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchMetroTransit({
    lat: point.lat,
    lon: point.lon,
    radiusMiles: parseRadius(req, 35),
  });
  res.json(payload);
}

export async function handleRoadConditions(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchModotRoadConditions(point.lat, point.lon, parseRadius(req, 85));
  res.json(payload);
}

export async function handleAirQuality(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchAirQuality(point.lat, point.lon);
  res.json(payload);
}

export async function handleAisVessels(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchAisVessels(point.lat, point.lon, parseRadius(req, 85));
  res.json(payload);
}

export async function handleNotams(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchAreaNotams(point.lat, point.lon, parseRadius(req, 120));
  res.json(payload);
}

export async function handleEarthquakes(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchEarthquakes(point.lat, point.lon, parseRadius(req, 500));
  res.json(payload);
}

export async function handleSondes(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchWeatherSondes(point.lat, point.lon, parseRadius(req, 250));
  res.json(payload);
}

export async function handleWildfires(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const payload = await fetchWildfireHotspots(point.lat, point.lon, parseRadius(req, 200));
  res.json(payload);
}
