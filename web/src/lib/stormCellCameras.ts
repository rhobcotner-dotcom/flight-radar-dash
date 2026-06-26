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

/** Live HLS/YouTube only, or live first with DOT snapshot fallbacks. */
export type StormCameraMode = 'live-only' | 'live-and-snapshots';

export const STORM_CAMERA_MODE_KEY = 'flight-radar-dash-storm-camera-mode';

export const STORM_CAM_LIMIT = 3;
export const STORM_CAMERA_POOL_LIMIT = 24;
/** Search pool for storm cams — by distance to the click. */
export const STORM_CAMERA_RADIUS_MILES = 22;

/** DOT feeds where public HLS is auth-gated — snapshot previews when snapshots are allowed. */
const SNAPSHOT_PRIMARY_SOURCES = /^(FL511|511GA|511IN|511NE|511WI|511PA|New England 511|AZ511|UDOT 511|Idaho 511|NMRoads|WSDOT|511 Alaska|SC DOT|SD DOT|VDOT|HDOT|KY\/IN DOT)$/i;

export function readStormCameraMode(): StormCameraMode {
  try {
    const raw = localStorage.getItem(STORM_CAMERA_MODE_KEY);
    if (raw === 'live-and-snapshots') return 'live-and-snapshots';
    if (raw === 'live-only') return 'live-only';
  } catch {
    /* ignore */
  }
  return 'live-only';
}

export function writeStormCameraMode(mode: StormCameraMode) {
  try {
    localStorage.setItem(STORM_CAMERA_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function stormCameraModeParam(mode: StormCameraMode) {
  return mode === 'live-only' ? 'live-only' : 'all';
}

export function isStormLiveOnlyMode(mode: StormCameraMode) {
  return mode === 'live-only';
}

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

export function stormCameraAllowed(
  cam: Pick<StormCamera, 'mediaType' | 'id' | 'source' | 'liveUrl' | 'sourceLiveUrl' | 'lon'>,
  mode: StormCameraMode = 'live-only'
) {
  if (isModotTrafficCamera(cam)) return false;
  if (isLiveStormCamera(cam)) return true;
  return mode === 'live-and-snapshots' && isStormSnapshotCamera(cam);
}

function normalizeStormCamera(
  cam: StormCamera,
  centerLat: number,
  centerLon: number,
  mode: StormCameraMode = 'live-only'
): StormCamera | null {
  if (!cam?.id || !cam.liveUrl) return null;
  if (!stormCameraAllowed(cam, mode)) return null;
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

function isSnapshotPrimaryStormSource(cam: Pick<StormCamera, 'source'>) {
  return SNAPSHOT_PRIMARY_SOURCES.test(String(cam.source || '').trim());
}

export function stormPoolHasLiveCameras(pool: StormCamera[] | undefined) {
  return (pool ?? []).some(isLiveStormCamera);
}

export function stormPoolHasCameras(
  pool: StormCamera[] | undefined,
  mode: StormCameraMode = 'live-only'
) {
  return (pool ?? []).some((cam) => stormCameraAllowed(cam, mode));
}

function stormReliabilityScore(cam: StormCamera) {
  let score = 0;
  if (cam.mediaType === 'snapshot') score -= 500;
  if (cam.camKind === 'weather') score -= 1;
  else if (cam.mediaType === 'hls') score += 100;
  else if (cam.mediaType === 'youtube') score += 80;
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

function sortStormCameras(cameras: StormCamera[], mode: StormCameraMode = 'live-only') {
  if (mode === 'live-only') {
    return cameras.filter(isLiveStormCamera).sort(compareStormCameras);
  }
  const live = cameras.filter(isLiveStormCamera).sort(compareStormCameras);
  const snapshots = cameras.filter(isStormSnapshotCamera).sort(compareStormCameras);
  return [...live, ...snapshots];
}

export function pickStormCameraPool(
  centerLat: number,
  centerLon: number,
  sources: StormCamera[],
  limit = STORM_CAMERA_POOL_LIMIT,
  mode: StormCameraMode = 'live-only'
): StormCamera[] {
  const byId = new Map<string, StormCamera>();
  for (const raw of sources) {
    const cam = normalizeStormCamera(raw, centerLat, centerLon, mode);
    if (!cam) continue;
    const existing = byId.get(cam.id);
    if (!existing || (cam.distanceMiles ?? 999) < (existing.distanceMiles ?? 999)) {
      byId.set(cam.id, cam);
    }
  }
  return sortStormCameras([...byId.values()], mode).slice(0, limit);
}

function fillStormSlots(
  pool: StormCamera[],
  count: number,
  pick: (cam: StormCamera) => boolean
): StormCamera[] {
  const picked: StormCamera[] = [];
  const seen = new Set<string>();
  for (const cam of pool) {
    if (!pick(cam)) continue;
    if (seen.has(cam.id)) continue;
    seen.add(cam.id);
    picked.push(cam);
    if (picked.length >= count) break;
  }
  return picked;
}

/** Fill storm grid slots — live only, or live first with snapshot fallbacks. */
export function initialStormCameraSlots(
  pool: StormCamera[],
  count = STORM_CAM_LIMIT,
  mode: StormCameraMode = 'live-only'
): (StormCamera | null)[] {
  if (mode === 'live-only') {
    const picked = fillStormSlots(pool, count, isLiveStormCamera);
    return Array.from({ length: count }, (_, index) => picked[index] ?? null);
  }

  const preferSnapshots = pool.some(isSnapshotPrimaryStormSource);
  const picked = preferSnapshots
    ? [
        ...fillStormSlots(pool, count, isStormSnapshotCamera),
        ...fillStormSlots(pool, count, isLiveStormCamera),
      ]
    : [
        ...fillStormSlots(pool, count, isLiveStormCamera),
        ...fillStormSlots(pool, count, isStormSnapshotCamera),
      ];

  const seen = new Set<string>();
  const unique: StormCamera[] = [];
  for (const cam of picked) {
    if (seen.has(cam.id)) continue;
    seen.add(cam.id);
    unique.push(cam);
    if (unique.length >= count) break;
  }

  return Array.from({ length: count }, (_, index) => unique[index] ?? null);
}

/** Next camera when a feed fails. */
export function nextStormCameraReplacement(
  pool: StormCamera[],
  failedIds: Set<string>,
  usedIds: Set<string>,
  mode: StormCameraMode = 'live-only'
): StormCamera | null {
  if (mode === 'live-only') {
    for (const cam of pool) {
      if (!isLiveStormCamera(cam)) continue;
      if (failedIds.has(cam.id) || usedIds.has(cam.id)) continue;
      return cam;
    }
    return null;
  }

  const preferSnapshots = pool.some(isSnapshotPrimaryStormSource);
  const passes = preferSnapshots ? [false, true] : [true, false];

  for (const preferLive of passes) {
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
  limit = STORM_CAM_LIMIT,
  mode: StormCameraMode = 'live-only'
): StormCamera[] {
  const inRange = (viewportCameras?.cameras ?? [])
    .filter((cam) => cam.liveUrl && stormCameraAllowed(cam, mode))
    .map((cam) => toStormCamera(cam, centerLat, centerLon))
    .filter((cam) => (cam.distanceMiles ?? 999) <= radiusMiles);

  return sortStormCameras(inRange, mode).slice(0, limit);
}

export function pickClosestStormCameras(
  centerLat: number,
  centerLon: number,
  sources: StormCamera[],
  limit = STORM_CAM_LIMIT,
  mode: StormCameraMode = 'live-only'
): StormCamera[] {
  const byId = new Map<string, StormCamera>();
  for (const raw of sources) {
    const cam = normalizeStormCamera(raw, centerLat, centerLon, mode);
    if (!cam) continue;
    const existing = byId.get(cam.id);
    if (!existing || (cam.distanceMiles ?? 999) < (existing.distanceMiles ?? 999)) {
      byId.set(cam.id, cam);
    }
  }
  return sortStormCameras([...byId.values()], mode).slice(0, limit);
}

export function mergeStormCellCameras(
  analysis: StormAnalysis,
  viewportCameras: TrafficCameraPayload | null,
  previousCameras: StormCamera[] = [],
  mode: StormCameraMode = 'live-only'
): StormCamera[] {
  const { lat: centerLat, lon: centerLon } = stormClickAnchor(analysis);

  const fromAnalysis = (analysis.cameras ?? [])
    .map((cam) => normalizeStormCamera(cam, centerLat, centerLon, mode))
    .filter(Boolean) as StormCamera[];

  const fromPool = (analysis.cameraPool ?? [])
    .map((cam) => normalizeStormCamera(cam, centerLat, centerLon, mode))
    .filter(Boolean) as StormCamera[];

  const fromViewport = (viewportCameras?.cameras ?? [])
    .filter((cam) => cam.liveUrl && stormCameraAllowed(cam, mode))
    .filter((cam) => distanceMiles(centerLat, centerLon, cam.lat, cam.lon) <= STORM_CAMERA_RADIUS_MILES)
    .map((cam) => toStormCamera(cam, centerLat, centerLon));

  return pickClosestStormCameras(centerLat, centerLon, [
    ...previousCameras,
    ...fromAnalysis,
    ...fromPool,
    ...fromViewport,
  ], STORM_CAM_LIMIT, mode);
}

export function mergeStormCameraPool(
  analysis: StormAnalysis,
  viewportCameras: TrafficCameraPayload | null,
  previousPool: StormCamera[] = [],
  mode: StormCameraMode = 'live-only'
): StormCamera[] {
  const { lat: centerLat, lon: centerLon } = stormClickAnchor(analysis);

  const fromAnalysis = (analysis.cameras ?? [])
    .map((cam) => normalizeStormCamera(cam, centerLat, centerLon, mode))
    .filter(Boolean) as StormCamera[];

  const fromPool = (analysis.cameraPool ?? [])
    .map((cam) => normalizeStormCamera(cam, centerLat, centerLon, mode))
    .filter(Boolean) as StormCamera[];

  const fromViewport = (viewportCameras?.cameras ?? [])
    .filter((cam) => cam.liveUrl && stormCameraAllowed(cam, mode))
    .filter((cam) => distanceMiles(centerLat, centerLon, cam.lat, cam.lon) <= STORM_CAMERA_RADIUS_MILES)
    .map((cam) => toStormCamera(cam, centerLat, centerLon));

  return pickStormCameraPool(centerLat, centerLon, [
    ...previousPool,
    ...fromAnalysis,
    ...fromPool,
    ...fromViewport,
  ], STORM_CAMERA_POOL_LIMIT, mode);
}

export function stormCameraIds(cameras: StormCamera[] | undefined) {
  return (cameras ?? []).map((cam) => cam.id).join('|');
}

export function stormCameraPoolIds(pool: StormCamera[] | undefined) {
  return stormCameraIds(pool);
}

export function stormCameraSectionTitle(mode: StormCameraMode) {
  return mode === 'live-only' ? 'Live views near this cell' : 'Views near this cell';
}

export function stormCameraEmptyLabel(mode: StormCameraMode) {
  return mode === 'live-only' ? 'No live cameras in range' : 'No cameras in range';
}

export function stormCameraEmptyDetail(mode: StormCameraMode) {
  return mode === 'live-only'
    ? 'No verified live stream nearby'
    : 'No working view in range';
}

export function stormCameraLoadingDetail(mode: StormCameraMode, camerasLoading: boolean) {
  if (camerasLoading) {
    return mode === 'live-only' ? 'Finding live cameras…' : 'Finding nearby cameras…';
  }
  return stormCameraEmptyLabel(mode);
}
