import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { distanceMiles, pointInBoundingBox } from '../../lib/geo.js';

const configPath = join(dirname(fileURLToPath(import.meta.url)), '../../config/rail-cameras.json');
let catalogCache = { mtimeMs: 0, bundled: null };

function loadCatalog() {
  const stat = statSync(configPath);
  if (catalogCache.bundled && catalogCache.mtimeMs === stat.mtimeMs) {
    return catalogCache.bundled;
  }
  catalogCache = {
    mtimeMs: stat.mtimeMs,
    bundled: JSON.parse(readFileSync(configPath, 'utf8')),
  };
  return catalogCache.bundled;
}

function buildYoutubeEmbedUrl(youtubeId) {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
  });
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`;
}

function normalizeRailCamera(row) {
  if (row.disabled || !row.youtubeId) return null;
  const embedUrl = buildYoutubeEmbedUrl(row.youtubeId);
  return {
    id: row.id,
    description: row.name,
    lat: Number(row.lat),
    lon: Number(row.lon),
    streamUrl: embedUrl,
    liveUrl: embedUrl,
    youtubeId: row.youtubeId,
    sourceLiveUrl: `https://www.youtube.com/watch?v=${row.youtubeId}`,
    mediaType: 'youtube',
    camKind: 'rail',
    source: row.source || 'Rail cam',
    state: row.state || null,
    railroad: row.railroad || null,
  };
}

function allCameras() {
  const bundled = loadCatalog();
  return (bundled.cameras || []).map(normalizeRailCamera).filter(Boolean);
}

export function fetchRailCameras({
  west,
  south,
  east,
  north,
  limit = 128,
  centerLat,
  centerLon,
  radiusMiles,
}) {
  const bundled = loadCatalog();
  const defaultRadius = Number(bundled.defaultRadiusMiles) || 125;
  const bbox = { west, south, east, north };
  const hasCenter = Number.isFinite(centerLat) && Number.isFinite(centerLon);
  const radius = Math.max(25, Math.min(Number(radiusMiles) || defaultRadius, 250));

  let cameras = allCameras().filter((cam) => {
    if (pointInBoundingBox(cam.lat, cam.lon, bbox)) return true;
    if (hasCenter && distanceMiles(centerLat, centerLon, cam.lat, cam.lon) <= radius) return true;
    return false;
  });

  if (hasCenter) {
    cameras = cameras
      .map((cam) => ({
        ...cam,
        distanceMiles: Math.round(distanceMiles(centerLat, centerLon, cam.lat, cam.lon) * 10) / 10,
      }))
      .sort((a, b) => a.distanceMiles - b.distanceMiles);
  }

  const capped = cameras.slice(0, Math.min(limit, 256));
  const withinRadius = hasCenter
    ? capped.filter((cam) => cam.distanceMiles <= radius).length
    : capped.length;

  return {
    source: 'curated-rail-cams',
    sources: bundled.sources || ['virtual-railfan', 'live-trains-llc', 'railstream', 'steel-highway'],
    catalogCount: bundled.cameraCount || allCameras().length,
    fetchedAt: new Date().toISOString(),
    count: capped.length,
    limit,
    radiusMiles: radius,
    bbox,
    cameras: capped,
    coverageNote:
      capped.length === 0
        ? `No rail cams within ${radius} mi — try zooming out or panning to a major line.`
        : hasCenter && withinRadius > 0
          ? `${withinRadius} rail cam(s) within ${radius} mi · YouTube live feeds.`
          : 'Rail cams in current map view · YouTube live feeds.',
    nationwide: true,
  };
}
