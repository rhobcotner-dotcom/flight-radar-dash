import { boundingBox, distanceMiles } from '../../lib/geo.js';
import { cameraHlsPlaybackUrl } from './cameraStreamProxy.js';
import { selectWorkingLiveCameras, isKnownDeadStream, isKnownGoodStream } from './cameraStreamValidation.js';
import {
  CACHE_MS,
  camerasInBbox,
  dedupeCameras,
  isUsableCamera,
  isWideViewport,
  STATE_BOUNDS,
  statesInBbox,
  thinCameras,
  thinCamerasByState,
} from './cameraSources/helpers.js';
import { cameraPreviewUrl } from './cameraProxy.js';
import { DIRECT_STATE_COVERAGE, fetchDirectCameras, STATE_FEED_GAPS } from './cameraSources/directSources.js';
import { fetchRoad511Cameras, hasRoad511Key } from './cameraSources/road511.js';

export const CONUS_BBOX = { west: -125, south: 24, east: -66, north: 50 };
const VERIFIED_HLS_PER_STATE = 24;
const VERIFIED_SNAP_PER_STATE = 24;
const LOCAL_POOL_RADIUS_MILES = 120;
const DEFAULT_WARM = {
  lat: Number(process.env.HOME_LAT) || 38.787,
  lon: Number(process.env.HOME_LON) || -90.629,
};

let responseCache = new Map();
let nationwidePool = { fetchedAt: 0, partial: false, cameras: [], sourceCounts: {}, sources: [] };
let verifiedPool = { fetchedAt: 0, cameras: [] };
let fullPoolWarmPromise = null;
let verifiedPoolWarmPromise = null;

export function bboxFromPoint(lat, lon, radiusMiles = 50) {
  return boundingBox(lat, lon, radiusMiles);
}

function quantize(value, step = 1) {
  return Math.round(value / step) * step;
}

function cacheKeyForRequest(bbox, limit, centerLat, centerLon) {
  const zoomBucket = limit >= 240 ? 'z4' : limit >= 192 ? 'z3' : limit >= 144 ? 'z2' : limit >= 96 ? 'z1' : 'z0';
  const poolBucket = nationwidePool.partial ? 'p0' : nationwidePool.cameras.length ? 'p1' : 'p-';
  const verifiedBucket = verifiedPool.cameras.length ? 'v1' : 'v0';
  return [
    quantize(bbox.west, 2),
    quantize(bbox.south, 2),
    quantize(bbox.east, 2),
    quantize(bbox.north, 2),
    zoomBucket,
    quantize(centerLat ?? 0, 0),
    quantize(centerLon ?? 0, 0),
    poolBucket,
    verifiedBucket,
    hasRoad511Key() ? 'r1' : 'r0',
  ].join(':');
}

function mapPlaybackCameras(cameras) {
  return cameras.map((cam) => {
    const sourceLiveUrl = cam.liveUrl;
    if (cam.mediaType === 'hls') {
      const playbackUrl = cameraHlsPlaybackUrl(cam.liveUrl);
      return {
        ...cam,
        sourceLiveUrl,
        liveUrl: playbackUrl,
        streamUrl: playbackUrl,
      };
    }
    const previewUrl = cameraPreviewUrl(cam.liveUrl, 'snapshot');
    return {
      ...cam,
      sourceLiveUrl,
      liveUrl: previewUrl,
      streamUrl: previewUrl,
    };
  });
}

function stateCenter(state) {
  const bounds = STATE_BOUNDS[state];
  if (!bounds) return { lat: 39, lon: -98 };
  return {
    lat: (bounds.south + bounds.north) / 2,
    lon: (bounds.west + bounds.east) / 2,
  };
}

function sortCamerasStable(cameras, centerLat, centerLon) {
  const sorted = [...cameras].sort((a, b) => a.id.localeCompare(b.id));
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) return sorted;

  return sorted
    .map((cam) => ({
      ...cam,
      distanceMiles: Math.round(distanceMiles(centerLat, centerLon, cam.lat, cam.lon) * 10) / 10,
    }))
    .sort((a, b) => {
      const delta = a.distanceMiles - b.distanceMiles;
      if (Math.abs(delta) > 0.25) return delta;
      return a.id.localeCompare(b.id);
    });
}

function selectForViewport(cameras, bbox, limit, centerLat, centerLon) {
  const sorted = sortCamerasStable(cameras, centerLat, centerLon);
  if (isWideViewport(bbox)) {
    return thinCamerasByState(sorted, bbox, limit, centerLat, centerLon);
  }
  return thinCameras(sorted, bbox, limit, centerLat, centerLon);
}

function regionalPoolFromRaw(pool, bbox, centerLat, centerLon) {
  const inBbox = sortCamerasStable(camerasInBbox(pool.cameras, bbox), centerLat, centerLon);
  const playable = inBbox.filter((cam) => {
    if (cam.mediaType === 'snapshot') return true;
    if (isKnownDeadStream(cam.liveUrl)) return false;
    return isKnownGoodStream(cam.liveUrl);
  });
  const snapshots = playable.filter((cam) => cam.mediaType === 'snapshot');
  const live = playable.filter((cam) => cam.mediaType === 'hls');
  return [...snapshots, ...live];
}

function selectCamerasForRequest({ verified, pool, bbox, limit, centerLat, centerLon }) {
  if (verified.length) {
    const verifiedInView = selectForViewport(camerasInBbox(verified, bbox), bbox, limit, centerLat, centerLon);
    if (verifiedInView.length >= Math.min(limit, 8)) {
      return verifiedInView;
    }

    const regionalPool = regionalPoolFromRaw(pool, bbox, centerLat, centerLon);
    const snapshotBackfill = selectForViewport(
      mapPlaybackCameras(regionalPool.filter((cam) => cam.mediaType === 'snapshot')),
      bbox,
      limit,
      centerLat,
      centerLon
    );
    return dedupeCameras([...verifiedInView, ...snapshotBackfill]).slice(0, limit);
  }

  const regionalPool = regionalPoolFromRaw(pool, bbox, centerLat, centerLon);
  return selectForViewport(mapPlaybackCameras(regionalPool), bbox, limit, centerLat, centerLon);
}

function clearResponseCache() {
  responseCache.clear();
}

function startFullPoolWarm() {
  if (fullPoolWarmPromise) return fullPoolWarmPromise;

  fullPoolWarmPromise = (async () => {
    const direct = await fetchDirectCameras(CONUS_BBOX);
    nationwidePool = {
      fetchedAt: Date.now(),
      partial: false,
      cameras: dedupeCameras(direct.cameras).filter(isUsableCamera),
      sourceCounts: direct.sourceCounts,
      sources: direct.sources,
    };
    clearResponseCache();
    verifiedPool = { fetchedAt: 0, cameras: [] };
    verifiedPoolWarmPromise = null;
    startVerifiedPoolWarm();
    return nationwidePool;
  })().catch((err) => {
    fullPoolWarmPromise = null;
    throw err;
  });

  return fullPoolWarmPromise;
}

function startVerifiedPoolWarm() {
  if (verifiedPoolWarmPromise) return verifiedPoolWarmPromise;
  if (!nationwidePool.cameras.length) return null;

  verifiedPoolWarmPromise = buildVerifiedPool()
    .then(() => {
      clearResponseCache();
    })
    .catch((err) => {
      verifiedPoolWarmPromise = null;
      throw err;
    });

  return verifiedPoolWarmPromise;
}

async function buildVerifiedPool() {
  if (verifiedPool.cameras.length && Date.now() - verifiedPool.fetchedAt < CACHE_MS) {
    return verifiedPool.cameras;
  }

  const pool = nationwidePool.cameras.length ? nationwidePool : await startFullPoolWarm();
  const stateCodes = [...new Set(pool.cameras.map((cam) => cam.state).filter(Boolean))].sort();
  let working = [];

  for (const state of stateCodes) {
    const stateCams = [...pool.cameras.filter((cam) => cam.state === state)].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    if (!stateCams.length) continue;

    const center = stateCenter(state);
    const stateBbox = STATE_BOUNDS[state] || CONUS_BBOX;
    const hlsCams = stateCams.filter((cam) => cam.mediaType === 'hls');
    const snapCams = stateCams.filter((cam) => cam.mediaType === 'snapshot');

    if (hlsCams.length) {
      const hlsSpread = thinCameras(
        hlsCams,
        stateBbox,
        VERIFIED_HLS_PER_STATE * 5,
        center.lat,
        center.lon
      );
      working.push(...(await selectWorkingLiveCameras(hlsSpread, VERIFIED_HLS_PER_STATE)));
    }

    if (snapCams.length) {
      const snapSpread = thinCameras(
        snapCams,
        stateBbox,
        VERIFIED_SNAP_PER_STATE * 5,
        center.lat,
        center.lon
      );
      working.push(...(await selectWorkingLiveCameras(snapSpread, VERIFIED_SNAP_PER_STATE)));
    }
  }

  verifiedPool = {
    fetchedAt: Date.now(),
    cameras: mapPlaybackCameras(working),
  };
  return verifiedPool.cameras;
}

async function ensureLocalPool(centerLat, centerLon) {
  const freshFull =
    nationwidePool.cameras.length &&
    !nationwidePool.partial &&
    Date.now() - nationwidePool.fetchedAt < CACHE_MS;
  if (freshFull) return nationwidePool;

  const freshPartial =
    nationwidePool.partial &&
    nationwidePool.cameras.length &&
    Date.now() - nationwidePool.fetchedAt < CACHE_MS;
  if (freshPartial) {
    if (!fullPoolWarmPromise) startFullPoolWarm();
    if (!verifiedPoolWarmPromise) startVerifiedPoolWarm();
    return nationwidePool;
  }

  const lat = Number.isFinite(centerLat) ? centerLat : DEFAULT_WARM.lat;
  const lon = Number.isFinite(centerLon) ? centerLon : DEFAULT_WARM.lon;
  const localBbox = boundingBox(lat, lon, LOCAL_POOL_RADIUS_MILES);
  const direct = await fetchDirectCameras(localBbox);
  const localCameras = dedupeCameras(direct.cameras).filter(isUsableCamera);

  nationwidePool = {
    fetchedAt: Date.now(),
    partial: true,
    cameras: localCameras,
    sourceCounts: direct.sourceCounts,
    sources: direct.sources,
  };
  clearResponseCache();

  if (!fullPoolWarmPromise) startFullPoolWarm();
  if (!verifiedPoolWarmPromise) startVerifiedPoolWarm();

  return nationwidePool;
}

export async function warmNationwideCameraPool({ lat, lon } = DEFAULT_WARM) {
  await ensureLocalPool(lat, lon);
  startFullPoolWarm();
  startVerifiedPoolWarm();
  return nationwidePool;
}

export function getCameraPoolStatus() {
  return {
    partial: nationwidePool.partial,
    poolCount: nationwidePool.cameras.length,
    verifiedCount: verifiedPool.cameras.length,
    warming: nationwidePool.partial || !verifiedPool.cameras.length,
    fetchedAt: nationwidePool.fetchedAt ? new Date(nationwidePool.fetchedAt).toISOString() : null,
  };
}

export async function fetchUsTrafficCameras({
  west,
  south,
  east,
  north,
  limit = 120,
  centerLat,
  centerLon,
}) {
  const bbox = { west, south, east, north };
  const cacheKey = cacheKeyForRequest(bbox, limit, centerLat, centerLon);
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached.payload;
  }

  const viewportStates = statesInBbox(bbox);
  const pool = await ensureLocalPool(centerLat, centerLon);
  const sourceCounts = { ...pool.sourceCounts };
  const sources = [...pool.sources];
  const verifiedReady =
    verifiedPool.cameras.length > 0 && Date.now() - verifiedPool.fetchedAt < CACHE_MS;
  const verified = verifiedReady ? verifiedPool.cameras : [];

  let cameras;
  cameras = selectCamerasForRequest({ verified, pool, bbox, limit, centerLat, centerLon });

  if (hasRoad511Key()) {
    try {
      const road511Cameras = await fetchRoad511Cameras(bbox, limit);
      sourceCounts.road511 = road511Cameras.length;
      if (road511Cameras.length) sources.push('road511');
      cameras = dedupeCameras([
        ...cameras,
        ...selectForViewport(
          mapPlaybackCameras(road511Cameras.filter(isUsableCamera)),
          bbox,
          limit,
          centerLat,
          centerLon
        ),
      ]).slice(0, limit);
    } catch (err) {
      sourceCounts.road511_error = err.message;
    }
  }

  const statesWithCameras = [...new Set(cameras.map((cam) => cam.state).filter(Boolean))].sort();
  const missingStates = viewportStates.filter((code) => !statesWithCameras.includes(code));
  const nationwide = hasRoad511Key() || statesWithCameras.length >= 2;
  const warming = nationwidePool.partial || !verifiedReady;

  const payload = {
    source: hasRoad511Key() ? 'Road511 + state DOT live streams' : 'State DOT live camera streams',
    sources,
    sourceCounts,
    fetchedAt: new Date().toISOString(),
    count: cameras.length,
    limit,
    bbox,
    cameras,
    viewportStates,
    statesWithCameras,
    missingStates,
    directStateCoverage: DIRECT_STATE_COVERAGE,
    stateFeedGaps: STATE_FEED_GAPS,
    nationwide,
    partial: nationwidePool.partial,
    warming,
    poolStatus: getCameraPoolStatus(),
    coverageNote:
      cameras.length === 0
        ? warming
          ? 'Loading nearby cameras…'
          : 'No verified cameras in this view. Pan/zoom to a covered state.'
        : null,
  };

  responseCache.set(cacheKey, { fetchedAt: Date.now(), payload });
  if (responseCache.size > 48) {
    const oldest = [...responseCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0]?.[0];
    if (oldest) responseCache.delete(oldest);
  }

  return payload;
}
