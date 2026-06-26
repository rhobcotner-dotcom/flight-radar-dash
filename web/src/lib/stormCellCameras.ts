import { distanceMiles } from './flightUtils';
import { isModotTrafficCamera } from './cameraSnapshot';
import type { TrafficCamera, TrafficCameraPayload } from './mapLayers';

export interface StormCamera {
  id: string;
  description: string;
  lat: number;
  lon: number;
  liveUrl: string;
  sourceLiveUrl?: string;
  mediaType: 'hls' | 'snapshot' | 'youtube';
  camKind?: 'road' | 'rail' | 'weather';
  source?: string;
  distanceMiles?: number;
}

export interface StormAnalysis {
  hasStorm: boolean;
  lat: number;
  lon: number;
  /** Exact map click — camera distance/sorting uses this, not storm centroid. */
  clickLat?: number;
  clickLon?: number;
  summary?: string;
  brief?: string;
  hazardLine?: string;
  disclaimer?: string;
  cellRadiusMiles?: number;
  cameras?: StormCamera[];
  /** Nearby candidates — storm grid rotates through these when a feed fails. */
  cameraPool?: StormCamera[];
  loading?: boolean;
  camerasLoading?: boolean;
  radar?: {
    clickDbz: number;
    peakDbz: number;
    approxDiameterMiles: number;
    intensityLabel: string;
    cloudType: string;
  };
  motion?: {
    directionLabel: string | null;
    speedMph: number | null;
  };
  hazards?: {
    lightningCount: number;
    alerts: Array<{ event: string; headline: string; severity: string }>;
  };
}

export const STORM_CAM_LIMIT = 3;
export const STORM_CAMERA_POOL_LIMIT = 24;
/** Search pool for storm cams — selection is always by distance to the click. */
export const STORM_CAMERA_RADIUS_MILES = 15;

function toStormCamera(cam: TrafficCamera, centerLat: number, centerLon: number): StormCamera {
  return {
    id: cam.id,
    description: cam.description,
    lat: cam.lat,
    lon: cam.lon,
    liveUrl: cam.liveUrl,
    sourceLiveUrl: cam.sourceLiveUrl,
    mediaType: cam.mediaType,
    camKind: cam.camKind,
    source: cam.source,
    distanceMiles: Math.round(distanceMiles(centerLat, centerLon, cam.lat, cam.lon) * 10) / 10,
  };
}

function normalizeStormCamera(cam: StormCamera, centerLat: number, centerLon: number): StormCamera | null {
  if (!cam?.id || !cam.liveUrl) return null;
  if (isModotTrafficCamera(cam)) return null;
  return {
    ...cam,
    distanceMiles: Math.round(distanceMiles(centerLat, centerLon, cam.lat, cam.lon) * 10) / 10,
  };
}

/** Prefer exact click pin over snapped/analysis coordinates for camera picks. */
export function stormClickAnchor(analysis: Pick<StormAnalysis, 'clickLat' | 'clickLon' | 'lat' | 'lon'>) {
  return {
    lat: analysis.clickLat ?? analysis.lat,
    lon: analysis.clickLon ?? analysis.lon,
  };
}

/** Prefer HLS / YouTube feeds for storm briefing tiles. */
export function isLiveStormCamera(cam: Pick<StormCamera, 'mediaType'>) {
  return cam.mediaType === 'hls' || cam.mediaType === 'youtube';
}

export function isStormSnapshotCamera(cam: Pick<StormCamera, 'mediaType'>) {
  return cam.mediaType === 'snapshot';
}

export function stormPoolHasCameras(pool: StormCamera[] | undefined) {
  return (pool ?? []).some((cam) => Boolean(cam?.liveUrl));
}

function stormReliabilityScore(cam: StormCamera) {
  let score = 0;
  if (cam.mediaType === 'snapshot') score -= 100;
  if (cam.camKind === 'weather') score -= 1;
  else if (cam.mediaType === 'hls') score += 10;
  else if (cam.mediaType === 'youtube') score += 8;
  return score;
}

function compareStormCameras(a: StormCamera, b: StormCamera) {
  const distA = a.distanceMiles ?? 999;
  const distB = b.distanceMiles ?? 999;
  if (Math.abs(distA - distB) > 0.2) return distA - distB;
  const scoreA = stormReliabilityScore(a);
  const scoreB = stormReliabilityScore(b);
  if (Math.abs(scoreA - scoreB) > 0.05) return scoreA - scoreB;
  return (a.id || '').localeCompare(b.id || '');
}

function sortStormCameras(cameras: StormCamera[]) {
  const live = cameras.filter(isLiveStormCamera).sort(compareStormCameras);
  const snapshots = cameras.filter(isStormSnapshotCamera).sort(compareStormCameras);
  return [...live, ...snapshots];
}

export function pickStormCameraPool(
  centerLat: number,
  centerLon: number,
  sources: StormCamera[],
  limit = STORM_CAMERA_POOL_LIMIT
): StormCamera[] {
  const byId = new Map<string, StormCamera>();
  for (const raw of sources) {
    const cam = normalizeStormCamera(raw, centerLat, centerLon);
    if (!cam) continue;
    const existing = byId.get(cam.id);
    if (!existing || (cam.distanceMiles ?? 999) < (existing.distanceMiles ?? 999)) {
      byId.set(cam.id, cam);
    }
  }
  return sortStormCameras([...byId.values()]).slice(0, limit);
}

/** Fill slots with live first; DOT snapshots only when no live remains in pool. */
export function initialStormCameraSlots(
  pool: StormCamera[],
  count = STORM_CAM_LIMIT
): (StormCamera | null)[] {
  const picked: StormCamera[] = [];
  const seen = new Set<string>();

  for (const cam of pool) {
    if (!isLiveStormCamera(cam)) continue;
    if (seen.has(cam.id)) continue;
    seen.add(cam.id);
    picked.push(cam);
    if (picked.length >= count) break;
  }

  if (picked.length < count) {
    for (const cam of pool) {
      if (!isStormSnapshotCamera(cam)) continue;
      if (seen.has(cam.id)) continue;
      seen.add(cam.id);
      picked.push(cam);
      if (picked.length >= count) break;
    }
  }

  return Array.from({ length: count }, (_, index) => picked[index] ?? null);
}

/** Next camera when a live feed fails — prefer live, then DOT snapshots. */
export function nextStormCameraReplacement(
  pool: StormCamera[],
  failedIds: Set<string>,
  usedIds: Set<string>
): StormCamera | null {
  for (const preferLive of [true, false]) {
    for (const cam of pool) {
      if (preferLive ? !isLiveStormCamera(cam) : !isStormSnapshotCamera(cam)) continue;
      if (failedIds.has(cam.id) || usedIds.has(cam.id)) continue;
      return cam;
    }
  }
  return null;
}

/** Closest cameras already on the map — shown immediately on storm click. */
export function nearestStormCamerasFromViewport(
  centerLat: number,
  centerLon: number,
  viewportCameras: TrafficCameraPayload | null,
  radiusMiles = STORM_CAMERA_RADIUS_MILES,
  limit = STORM_CAM_LIMIT
): StormCamera[] {
  const inRange = (viewportCameras?.cameras ?? [])
    .filter((cam) => cam.liveUrl && !isModotTrafficCamera(cam))
    .map((cam) => toStormCamera(cam, centerLat, centerLon))
    .filter((cam) => (cam.distanceMiles ?? 999) <= radiusMiles);

  return sortStormCameras(inRange).slice(0, limit);
}

export function pickClosestStormCameras(
  centerLat: number,
  centerLon: number,
  sources: StormCamera[],
  limit = STORM_CAM_LIMIT
): StormCamera[] {
  const byId = new Map<string, StormCamera>();
  for (const raw of sources) {
    const cam = normalizeStormCamera(raw, centerLat, centerLon);
    if (!cam) continue;
    const existing = byId.get(cam.id);
    if (!existing || (cam.distanceMiles ?? 999) < (existing.distanceMiles ?? 999)) {
      byId.set(cam.id, cam);
    }
  }
  return sortStormCameras([...byId.values()]).slice(0, limit);
}

export function mergeStormCellCameras(
  analysis: StormAnalysis,
  viewportCameras: TrafficCameraPayload | null,
  previousCameras: StormCamera[] = []
): StormCamera[] {
  const { lat: centerLat, lon: centerLon } = stormClickAnchor(analysis);

  const fromAnalysis = (analysis.cameras ?? [])
    .map((cam) => normalizeStormCamera(cam, centerLat, centerLon))
    .filter(Boolean) as StormCamera[];

  const fromPool = (analysis.cameraPool ?? [])
    .map((cam) => normalizeStormCamera(cam, centerLat, centerLon))
    .filter(Boolean) as StormCamera[];

  const fromViewport = (viewportCameras?.cameras ?? [])
    .filter((cam) => cam.liveUrl && !isModotTrafficCamera(cam))
    .filter((cam) => distanceMiles(centerLat, centerLon, cam.lat, cam.lon) <= STORM_CAMERA_RADIUS_MILES)
    .map((cam) => toStormCamera(cam, centerLat, centerLon));

  return pickClosestStormCameras(centerLat, centerLon, [
    ...previousCameras,
    ...fromAnalysis,
    ...fromPool,
    ...fromViewport,
  ]);
}

export function mergeStormCameraPool(
  analysis: StormAnalysis,
  viewportCameras: TrafficCameraPayload | null,
  previousPool: StormCamera[] = []
): StormCamera[] {
  const { lat: centerLat, lon: centerLon } = stormClickAnchor(analysis);

  const fromAnalysis = (analysis.cameras ?? [])
    .map((cam) => normalizeStormCamera(cam, centerLat, centerLon))
    .filter(Boolean) as StormCamera[];

  const fromPool = (analysis.cameraPool ?? [])
    .map((cam) => normalizeStormCamera(cam, centerLat, centerLon))
    .filter(Boolean) as StormCamera[];

  const fromViewport = (viewportCameras?.cameras ?? [])
    .filter((cam) => cam.liveUrl && !isModotTrafficCamera(cam))
    .filter((cam) => distanceMiles(centerLat, centerLon, cam.lat, cam.lon) <= STORM_CAMERA_RADIUS_MILES)
    .map((cam) => toStormCamera(cam, centerLat, centerLon));

  return pickStormCameraPool(centerLat, centerLon, [
    ...previousPool,
    ...fromAnalysis,
    ...fromPool,
    ...fromViewport,
  ]);
}

export function stormCameraIds(cameras: StormCamera[] | undefined) {
  return (cameras ?? []).map((cam) => cam.id).join('|');
}

export function stormCameraPoolIds(pool: StormCamera[] | undefined) {
  return stormCameraIds(pool);
}

export function stormPoolHasLiveCameras(pool: StormCamera[] | undefined) {
  return (pool ?? []).some(isLiveStormCamera);
}
