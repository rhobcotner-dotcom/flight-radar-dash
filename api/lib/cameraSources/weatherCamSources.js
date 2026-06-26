import {
  fetchCachedJson,
  normalizeCamera,
  pointInBbox,
  roundCoord,
  thinCameras,
} from './helpers.js';

const ALERTWEST_API = 'https://alertwest.live/api/getCameraDataByLoc';
const ALERTWEST_CACHE_KEY = 'alertwest-cameras';
const ALERTWEST_IMAGE_CDN = 'https://img.cdn.prod.alertwest.com/data/img';

/** Build CDN URL from camera id + rolling snapshot filename (epoch in name). */
export function alertWestImageUrl(cameraId, imgFilename) {
  if (!cameraId || !imgFilename) return null;
  const match = String(imgFilename).match(/_(\d{10})_/);
  const epochSec = match ? Number(match[1]) : Math.floor(Date.now() / 1000);
  const date = new Date(epochSec * 1000);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${ALERTWEST_IMAGE_CDN}/${cameraId}/${yyyy}/${mm}/${dd}/${imgFilename}`;
}

async function fetchWindyWebcams(bbox) {
  const apiKey = process.env.WINDY_WEBCAMS_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({
    countries: 'US',
    limit: '500',
    include: 'images,location',
  });
  const res = await fetch(`https://api.windy.com/webcams/api/v3/webcams?${params}`, {
    headers: { 'x-windy-api-key': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return [];
  const body = await res.json();
  const rows = Array.isArray(body?.result) ? body.result : [];
  return rows
    .map((row) => {
      const lat = row.location?.latitude;
      const lon = row.location?.longitude;
      if (!pointInBbox(lat, lon, bbox)) return null;
      const preview =
        row.images?.current?.preview ||
        row.images?.daylight?.preview ||
        row.images?.current?.icon;
      if (!preview) return null;
      return normalizeCamera({
        id: `windy-${row.webcamId}`,
        description: row.title || row.location?.city || 'Weather cam',
        lat,
        lon,
        streamUrl: preview,
        source: 'Windy',
        state: row.location?.country_code === 'US' ? null : null,
        camKind: 'weather',
      });
    })
    .filter(Boolean);
}

/**
 * ALERTWest / ALERTCalifornia / AlertWildfire public sky-facing fire-weather cameras.
 * ~10k+ pan-tilt zoom cameras with fresh snapshot URLs in one JSON feed.
 */
export async function fetchAlertWestCameras(bbox) {
  const data = await fetchCachedJson(ALERTWEST_API, ALERTWEST_CACHE_KEY, 120_000);
  const locRows = data?.data?.locs?.data;
  const camRows = data?.data?.cams?.data;
  if (!Array.isArray(locRows) || !Array.isArray(camRows)) return [];

  const locById = new Map();
  for (const loc of locRows) {
    if (loc?.lp) continue;
    locById.set(Number(loc.id), loc);
  }

  const out = [];
  for (const cam of camRows) {
    if (cam?.off || cam?.pv) continue;
    const loc = locById.get(Number(cam.lid));
    if (!loc) continue;
    const lat = Number(loc.lat);
    const lon = Number(loc.lon);
    if (!pointInBbox(lat, lon, bbox)) continue;
    const imageUrl = alertWestImageUrl(cam.id, cam.img);
    if (!imageUrl) continue;
    const normalized = normalizeCamera({
      id: `alertwest-${cam.id}`,
      description: cam.cn || cam.co || 'Sky cam',
      lat,
      lon,
      streamUrl: imageUrl,
      source: cam.pr || 'ALERTWest',
      state: cam.st || loc.st || null,
      camKind: 'weather',
    });
    if (normalized) out.push(normalized);
  }

  const centerLat = (bbox.south + bbox.north) / 2;
  const centerLon = (bbox.west + bbox.east) / 2;
  const span = Math.max(bbox.east - bbox.west, bbox.north - bbox.south);
  const cap = span > 25 ? 600 : span > 12 ? 1200 : 4000;
  if (out.length <= cap) return out;
  return thinCameras(out, bbox, cap, centerLat, centerLon);
}

export async function fetchWeatherCameras(bbox) {
  const [alertWest, windy] = await Promise.all([
    fetchAlertWestCameras(bbox).catch(() => []),
    fetchWindyWebcams(bbox).catch(() => []),
  ]);
  const seen = new Set();
  return [...alertWest, ...windy].filter((cam) => {
    const key = `${roundCoord(cam.lat, 2)}:${roundCoord(cam.lon, 2)}:${cam.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
