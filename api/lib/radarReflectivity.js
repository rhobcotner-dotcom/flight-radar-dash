import { samplePngPixel } from './pngSample.js';
import { buildIemRadarPayload, getRadarSource } from './radarSources.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const RAINVIEWER_API_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const TILE_SIZE = 256;
const SAMPLE_ZOOM = 8;
const STORM_MIN_DBZ = 20;

const NEXRAD_COLOR_STOPS = [
  { rgb: [4, 233, 231], dbz: 5 },
  { rgb: [1, 159, 244], dbz: 10 },
  { rgb: [0, 0, 246], dbz: 15 },
  { rgb: [0, 255, 0], dbz: 20 },
  { rgb: [0, 200, 0], dbz: 25 },
  { rgb: [0, 144, 0], dbz: 30 },
  { rgb: [255, 255, 0], dbz: 35 },
  { rgb: [231, 192, 0], dbz: 40 },
  { rgb: [255, 144, 0], dbz: 45 },
  { rgb: [255, 0, 0], dbz: 50 },
  { rgb: [214, 0, 0], dbz: 55 },
  { rgb: [192, 0, 0], dbz: 60 },
  { rgb: [255, 0, 255], dbz: 65 },
  { rgb: [153, 85, 201], dbz: 70 },
];

let rainviewerCache = { fetchedAt: 0, host: null, path: null };

function latLonToTileFloat(lat, lon, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y, zoom };
}

function offsetLatLon(lat, lon, deltaLat, deltaLon) {
  return { lat: lat + deltaLat, lon: lon + deltaLon };
}

export function rgbToDbz(r, g, b, a = 255) {
  if (a < 16) return null;
  if (r < 8 && g < 8 && b < 8) return null;

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const stop of NEXRAD_COLOR_STOPS) {
    const dr = r - stop.rgb[0];
    const dg = g - stop.rgb[1];
    const db = b - stop.rgb[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = stop.dbz;
    }
  }

  return bestDistance > 12000 ? null : best;
}

async function fetchRainviewerPath() {
  if (rainviewerCache.path && Date.now() - rainviewerCache.fetchedAt < 60_000) {
    return rainviewerCache;
  }

  const res = await fetch(RAINVIEWER_API_URL, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`RainViewer unavailable (${res.status})`);
  const body = await res.json();
  const frames = Array.isArray(body?.radar?.past) ? body.radar.past : [];
  const latest = frames[frames.length - 1];
  if (!latest?.path) throw new Error('RainViewer has no radar frames');

  rainviewerCache = {
    fetchedAt: Date.now(),
    host: body.host || 'https://tilecache.rainviewer.com',
    path: latest.path,
  };
  return rainviewerCache;
}

function buildTileUrl(source, tileX, tileY, zoom, rainviewer) {
  if (source === 'rainviewer') {
    return `${rainviewer.host}${rainviewer.path}/${TILE_SIZE}/${zoom}/${tileX}/${tileY}/1/1_0.png`;
  }
  const payload = buildIemRadarPayload();
  return payload.tileUrl
    .replace('{z}', String(zoom))
    .replace('{x}', String(tileX))
    .replace('{y}', String(tileY));
}

async function fetchTilePixel(lat, lon, zoom = SAMPLE_ZOOM) {
  const source = getRadarSource();
  const rainviewer = source === 'rainviewer' ? await fetchRainviewerPath() : null;
  const { x, y } = latLonToTileFloat(lat, lon, zoom);
  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  const pixelX = (x - tileX) * TILE_SIZE;
  const pixelY = (y - tileY) * TILE_SIZE;
  const url = buildTileUrl(source, tileX, tileY, zoom, rainviewer);

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/png' },
  });
  if (!res.ok) throw new Error(`Radar tile unavailable (${res.status})`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const pixel = samplePngPixel(buffer, pixelX, pixelY);
  const dbz = rgbToDbz(pixel.r, pixel.g, pixel.b, pixel.a);
  return { dbz, rgb: [pixel.r, pixel.g, pixel.b], alpha: pixel.a, source, zoom };
}

export async function sampleRadarField(lat, lon, radiusMiles = 16) {
  const latStep = radiusMiles / 69 / 2;
  const lonStep = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180) || 1) / 2;
  const clickSample = await fetchTilePixel(lat, lon);

  const neighborJobs = [];
  for (let row = -2; row <= 2; row += 1) {
    for (let col = -2; col <= 2; col += 1) {
      if (row === 0 && col === 0) continue;
      const point = offsetLatLon(lat, lon, row * latStep, col * lonStep);
      neighborJobs.push(
        fetchTilePixel(point.lat, point.lon)
          .then((sample) =>
            sample.dbz != null ? { lat: point.lat, lon: point.lon, dbz: sample.dbz, center: false } : null
          )
          .catch(() => null)
      );
    }
  }

  const neighbors = (await Promise.all(neighborJobs)).filter(Boolean);
  const samples = [
    ...(clickSample.dbz != null ? [{ lat, lon, dbz: clickSample.dbz, center: true }] : []),
    ...neighbors,
  ];

  const clickDbz = clickSample.dbz;
  const peakDbz = samples.reduce((max, sample) => Math.max(max, sample.dbz), clickDbz ?? 0);
  const coreSamples = samples.filter((sample) => sample.dbz >= Math.max(STORM_MIN_DBZ, peakDbz - 10));
  const approxDiameterMiles =
    coreSamples.length <= 1
      ? 3
      : Math.min(40, Math.max(3, Math.round(Math.sqrt(coreSamples.length) * (radiusMiles / 2))));

  const hasAdjacentStorm = neighbors.some((sample) => sample.dbz >= STORM_MIN_DBZ);

  return {
    clickDbz,
    peakDbz,
    sampleCount: samples.length,
    coreSampleCount: coreSamples.length,
    approxDiameterMiles,
    hasStorm:
      peakDbz >= STORM_MIN_DBZ &&
      (clickDbz != null || hasAdjacentStorm),
    source: clickSample.source,
  };
}

export { STORM_MIN_DBZ };
