import { bboxFromPoint, fetchCamerasNearPoint, fetchUsTrafficCameras, primeCameraPoolAtPoint } from '../lib/usTrafficCameras.js';
import { fetchRailCameras } from '../lib/railCameras.js';
import { fetchNwpsRiverForecast } from '../lib/nwpsRiver.js';
import { fetchEbirdRecent } from '../lib/ebird.js';
import { fetchINaturalistObservations } from '../lib/inaturalist.js';
import { fetchUsDrought } from '../lib/usDrought.js';
import { fetchAprsStations } from '../lib/aprs.js';
import { fetchLiveDashboard } from '../lib/liveDashboard.js';
import { fetchMisoGrid } from '../lib/misoGrid.js';
import { fetchSportsSchedule } from '../lib/sportsSchedule.js';
import { fetchFaaNasStatus } from '../lib/faaNasStatus.js';

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

function parseBbox(req) {
  const west = Number(req.query.west);
  const south = Number(req.query.south);
  const east = Number(req.query.east);
  const north = Number(req.query.north);
  if (
    Number.isFinite(west) &&
    Number.isFinite(south) &&
    Number.isFinite(east) &&
    Number.isFinite(north) &&
    west < east &&
    south < north
  ) {
    return { west, south, east, north };
  }
  return null;
}

function parseLimit(req, fallback = 120) {
  const limit = Number(req.query.limit);
  if (!Number.isFinite(limit) || limit <= 0) return fallback;
  return Math.min(360, Math.max(20, Math.round(limit)));
}

function parseStormCameraMode(req) {
  const mode = String(req.query.cameraMode || '').trim().toLowerCase();
  if (mode === 'all' || mode === 'live-and-snapshots' || mode === 'snapshots') {
    return { liveOnly: false };
  }
  return { liveOnly: true };
}

export async function handleCamerasNear(req, res) {
  const point = parseLatLon(req);
  if (!point) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 3));
  const radiusMiles = Math.min(60, Math.max(5, Number(req.query.radiusMiles) || 20));
  const cameras = await fetchCamerasNearPoint(
    point.lat,
    point.lon,
    radiusMiles,
    limit,
    parseStormCameraMode(req)
  );
  primeCameraPoolAtPoint(point.lat, point.lon);
  res.json({ lat: point.lat, lon: point.lon, radiusMiles, limit, count: cameras.length, cameras });
}

export async function handleTrafficCameras(req, res) {
  const point = parseLatLon(req);
  const limit = parseLimit(req, 120);
  const bbox =
    parseBbox(req) ||
    (point ? bboxFromPoint(point.lat, point.lon, parseRadius(req, 50)) : null);

  if (!bbox) {
    return res.status(400).json({ error: 'lat/lon or west/south/east/north query params required' });
  }

  const centerLat = point?.lat ?? (bbox.south + bbox.north) / 2;
  const centerLon = point?.lon ?? (bbox.west + bbox.east) / 2;

  res.json(
    await fetchUsTrafficCameras({
      ...bbox,
      limit,
      centerLat,
      centerLon,
    })
  );
}

export async function handleRailCameras(req, res) {
  const point = parseLatLon(req);
  const limit = parseLimit(req, 128);
  const radiusMiles = Number(req.query.radiusMiles);
  const bbox =
    parseBbox(req) ||
    (point ? bboxFromPoint(point.lat, point.lon, parseRadius(req, 120)) : null);

  if (!bbox) {
    return res.status(400).json({ error: 'lat/lon or west/south/east/north query params required' });
  }

  res.json(
    await fetchRailCameras({
      ...bbox,
      limit,
      centerLat: point?.lat,
      centerLon: point?.lon,
      radiusMiles: Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : 125,
    })
  );
}

export async function handleCameraImage(req, res) {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  if (!url) return res.status(400).json({ error: 'url query param required' });

  const { fetchProxiedCameraImage } = await import('../lib/cameraProxy.js');
  try {
    const image = await fetchProxiedCameraImage(url);
    res.set('Content-Type', image.contentType);
    res.set('Cache-Control', image.cacheControl);
    res.send(image.body);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || 'Camera image unavailable' });
  }
}

export async function handleCameraHls(req, res) {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  if (!url) return res.status(400).json({ error: 'url query param required' });

  const { fetchProxiedHlsManifest } = await import('../lib/cameraStreamProxy.js');
  try {
    const manifest = await fetchProxiedHlsManifest(url);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', manifest.contentType);
    res.set('Cache-Control', manifest.cacheControl);
    res.send(manifest.body);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || 'Camera stream unavailable' });
  }
}

export async function handleCameraHlsSegment(req, res) {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  if (!url) return res.status(400).json({ error: 'url query param required' });

  const { fetchProxiedHlsSegment } = await import('../lib/cameraStreamProxy.js');
  try {
    const segment = await fetchProxiedHlsSegment(url);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Content-Type', segment.contentType);
    res.set('Cache-Control', segment.cacheControl);
    res.send(segment.body);
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message || 'Camera segment unavailable' });
  }
}

export async function handleRiverForecast(req, res) {
  const point = parseLatLon(req);
  if (!point) return res.status(400).json({ error: 'lat and lon query params required' });
  res.json(await fetchNwpsRiverForecast(point.lat, point.lon, parseRadius(req, 85)));
}

export async function handleEbird(req, res) {
  const point = parseLatLon(req);
  if (!point) return res.status(400).json({ error: 'lat and lon query params required' });
  res.json(await fetchEbirdRecent(point.lat, point.lon, parseRadius(req, 25)));
}

export async function handleINaturalist(req, res) {
  const point = parseLatLon(req);
  if (!point) return res.status(400).json({ error: 'lat and lon query params required' });
  res.json(await fetchINaturalistObservations(point.lat, point.lon, parseRadius(req, 25)));
}

export async function handleDrought(req, res) {
  const point = parseLatLon(req);
  if (!point) return res.status(400).json({ error: 'lat and lon query params required' });
  res.json(await fetchUsDrought(point.lat, point.lon, parseRadius(req, 120)));
}

export async function handleAprs(req, res) {
  const point = parseLatLon(req);
  if (!point) return res.status(400).json({ error: 'lat and lon query params required' });
  res.json(await fetchAprsStations(point.lat, point.lon, parseRadius(req, 50)));
}

export async function handleLiveDashboard(req, res) {
  const point = parseLatLon(req);
  if (!point) return res.status(400).json({ error: 'lat and lon query params required' });
  res.json(await fetchLiveDashboard(point.lat, point.lon));
}

export async function handleMisoGrid(_req, res) {
  res.json(await fetchMisoGrid());
}

export async function handleSportsSchedule(_req, res) {
  res.json(await fetchSportsSchedule());
}

export async function handleNasStatus(_req, res) {
  res.json(await fetchFaaNasStatus());
}
