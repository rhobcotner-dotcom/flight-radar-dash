import { boundingBox, distanceMiles } from '../../lib/geo.js';
import { cameraHlsPlaybackUrl } from './cameraStreamProxy.js';
import { selectWorkingLiveCameras, isKnownDeadStream } from './cameraStreamValidation.js';
import {
  CACHE_MS,
  camerasInBbox,
  dedupeCameras,
  isModotRtplexStreamUrl,
  isMapVisibleCamera,
  isStormEligibleCamera,
  isWideViewport,
  modotRtplexSnapshotUrl,
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
/** Wisconsin has ~480 live HLS feeds — keep a larger verified slice for map + storm reliability. */
const VERIFIED_HLS_OVERRIDES = { WI: 96, OK: 96, MO: 96, AL: 96, MS: 96, NV: 96, CO: 96, CA: 96 };
/** Illinois is snapshot-only via Travel Midwest — verify more working feeds for dense map coverage. */
const VERIFIED_SNAP_OVERRIDES = {
  IL: 96,
  IN: 96,
  OH: 96,
  NE: 96,
  FL: 96,
  GA: 96,
  AZ: 96,
  UT: 96,
  ID: 96,
  NM: 96,
  WA: 96,
  AK: 96,
  HI: 96,
  SC: 96,
  SD: 96,
  PA: 96,
  ME: 96,
  VT: 96,
  VA: 96,
  TX: 96,
  KY: 96,
};
/** States where snapshots are the primary inventory (no public HLS). */
const SNAPSHOT_PRIMARY_STATES = new Set([
  'IL',
  'IN',
  'OH',
  'NE',
  'FL',
  'GA',
  'AZ',
  'UT',
  'ID',
  'NM',
  'HI',
  'WY',
  'WA',
  'AK',
  'SC',
  'SD',
  'PA',
  'ME',
  'VT',
  'VA',
  'TX',
  'KY',
]);
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
    'snap8',
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

function hlsSourceUrl(cam) {
  if (cam.sourceLiveUrl?.startsWith('http')) return cam.sourceLiveUrl;
  if (cam.liveUrl?.startsWith('http')) return cam.liveUrl;
  if (cam.liveUrl?.startsWith('/api/live/camera-hls?')) {
    try {
      const raw = new URL(cam.liveUrl, 'http://localhost').searchParams.get('url');
      return raw ? decodeURIComponent(raw) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function ensureMapPreviewUrls(cam) {
  if (cam.previewUrl) return cam;
  if (cam.mediaType === 'snapshot') {
    const raw = cam.sourceLiveUrl || cam.liveUrl;
    return raw ? { ...cam, previewUrl: cameraPreviewUrl(raw, 'snapshot') } : cam;
  }
  if (cam.mediaType === 'hls') {
    const rawPreview = modotRtplexSnapshotUrl(hlsSourceUrl(cam));
    if (rawPreview) {
      return { ...cam, previewUrl: cameraPreviewUrl(rawPreview, 'snapshot') };
    }
  }
  if (cam.mediaType === 'youtube') {
    const thumb = cam.previewUrl || (cam.youtubeId ? `https://img.youtube.com/vi/${cam.youtubeId}/hqdefault.jpg` : null);
    if (thumb) return { ...cam, previewUrl: cameraPreviewUrl(thumb, 'snapshot') };
  }
  return cam;
}

function mapPlaybackCameras(cameras) {
  return cameras.map((cam) => {
    const sourceLiveUrl = cam.liveUrl;
    if (cam.mediaType === 'hls') {
      const modotDirect = isModotRtplexStreamUrl(sourceLiveUrl);
      const playbackUrl = modotDirect ? sourceLiveUrl : cameraHlsPlaybackUrl(cam.liveUrl);
      const rawPreview =
        cam.previewUrl || modotRtplexSnapshotUrl(hlsSourceUrl({ ...cam, sourceLiveUrl: cam.liveUrl }));
      const previewUrl = rawPreview ? cameraPreviewUrl(rawPreview, 'snapshot') : null;
      return {
        ...cam,
        sourceLiveUrl,
        liveUrl: playbackUrl,
        streamUrl: playbackUrl,
        previewUrl,
      };
    }
    if (cam.mediaType === 'youtube') {
      const thumb = cam.previewUrl || (cam.youtubeId ? `https://img.youtube.com/vi/${cam.youtubeId}/hqdefault.jpg` : null);
      return {
        ...cam,
        sourceLiveUrl,
        previewUrl: thumb ? cameraPreviewUrl(thumb, 'snapshot') : null,
      };
    }
    const previewUrl = cameraPreviewUrl(cam.liveUrl, 'snapshot');
    return {
      ...cam,
      sourceLiveUrl,
      liveUrl: previewUrl,
      streamUrl: previewUrl,
      previewUrl,
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
  const playable = inBbox.filter(
    (cam) => cam.mediaType === 'snapshot' || !isKnownDeadStream(cam.sourceLiveUrl || cam.liveUrl)
  );
  const live = playable.filter((cam) => cam.mediaType === 'hls' || cam.mediaType === 'youtube');
  const snapshots = playable.filter((cam) => cam.mediaType === 'snapshot');
  return [...live, ...snapshots];
}

/** Snapshot-primary state under the viewport center (IL vs IN vs OH, etc.). */
function viewportSnapshotPrimaryState(centerLat, centerLon) {
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLon)) return null;
  for (const code of ['IL', 'IN', 'OH', 'NE', 'FL', 'GA', 'AZ', 'NV', 'UT', 'CO', 'ID', 'NM', 'WI', 'WY', 'HI']) {
    if (!SNAPSHOT_PRIMARY_STATES.has(code)) continue;
    const bounds = STATE_BOUNDS[code];
    if (!bounds) continue;
    if (
      centerLat >= bounds.south &&
      centerLat <= bounds.north &&
      centerLon >= bounds.west &&
      centerLon <= bounds.east
    ) {
      return code;
    }
  }
  return null;
}

function selectCamerasForRequest({ verified, pool, bbox, limit, centerLat, centerLon }) {
  const regionalPool = regionalPoolFromRaw(pool, bbox, centerLat, centerLon);
  const mappedRegional = mapPlaybackCameras(regionalPool);

  const snapshots = mappedRegional.filter((cam) => cam.mediaType === 'snapshot');
  const liveCount = mappedRegional.filter((cam) => cam.mediaType === 'hls').length;
  const viewportStates = statesInBbox(bbox);
  const snapshotPrimaryStates = viewportStates.filter((code) => SNAPSHOT_PRIMARY_STATES.has(code));

  // Snapshot-only states fill the viewport from their DOT feeds first. When the bbox spans
  // several (e.g. Indiana includes IL overlap), prefer the state at the viewport center.
  if (snapshotPrimaryStates.length) {
    const focusState = viewportSnapshotPrimaryState(centerLat, centerLon);
    const primarySnaps = focusState
      ? snapshots.filter((cam) => cam.state === focusState)
      : snapshots.filter((cam) => snapshotPrimaryStates.includes(cam.state));
    let picked = selectForViewport(primarySnaps, bbox, limit, centerLat, centerLon);
    const remaining = Math.max(0, limit - picked.length);
    if (remaining > 0) {
      const hlsPool = mappedRegional.filter((cam) => cam.mediaType === 'hls');
      const otherSnaps = focusState
        ? snapshots.filter((cam) => cam.state !== focusState)
        : snapshots.filter((cam) => !snapshotPrimaryStates.includes(cam.state));
      picked = [
        ...picked,
        ...selectForViewport([...otherSnaps, ...hlsPool], bbox, remaining, centerLat, centerLon),
      ];
    }
    return dedupeCameras(picked).slice(0, limit);
  }

  const snapQuota =
    liveCount >= limit
      ? 0
      : Math.min(snapshots.length, Math.max(1, Math.ceil(limit * 0.08)));
  const verifiedInView = verified.length
    ? selectForViewport(camerasInBbox(verified, bbox), bbox, limit, centerLat, centerLon)
    : [];

  let hlsPick = [];
  const hlsRemaining = Math.max(0, limit - verifiedInView.length);
  if (hlsRemaining > 0) {
    const hlsPool = mappedRegional.filter((cam) => cam.mediaType === 'hls');
    hlsPick = selectForViewport(hlsPool, bbox, hlsRemaining, centerLat, centerLon);
  }

  const remaining = Math.max(0, limit - verifiedInView.length - hlsPick.length);
  const snapPick =
    remaining > 0 && snapQuota > 0
      ? selectForViewport(snapshots, bbox, Math.min(remaining, snapQuota), centerLat, centerLon)
      : [];

  return dedupeCameras([...verifiedInView, ...hlsPick, ...snapPick]).slice(0, limit);
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
      cameras: dedupeCameras(direct.cameras).filter(isMapVisibleCamera),
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
    const hlsLimit = VERIFIED_HLS_OVERRIDES[state] ?? VERIFIED_HLS_PER_STATE;
    const hlsCams = stateCams.filter(
      (cam) => cam.mediaType === 'hls' && !isModotRtplexStreamUrl(cam.liveUrl)
    );
    const snapCams = stateCams.filter((cam) => cam.mediaType === 'snapshot');

    if (hlsCams.length) {
      const hlsSpread = thinCameras(
        hlsCams,
        stateBbox,
        hlsLimit * 5,
        center.lat,
        center.lon
      );
      working.push(...(await selectWorkingLiveCameras(hlsSpread, hlsLimit)));
    }

    if (snapCams.length) {
      const snapLimit = VERIFIED_SNAP_OVERRIDES[state] ?? VERIFIED_SNAP_PER_STATE;
      const snapSpread = thinCameras(
        snapCams,
        stateBbox,
        snapLimit * 5,
        center.lat,
        center.lon
      );
      working.push(...(await selectWorkingLiveCameras(snapSpread, snapLimit)));
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

  const lat = Number.isFinite(centerLat) ? centerLat : DEFAULT_WARM.lat;
  const lon = Number.isFinite(centerLon) ? centerLon : DEFAULT_WARM.lon;

  const freshPartial =
    nationwidePool.partial &&
    nationwidePool.cameras.length &&
    Date.now() - nationwidePool.fetchedAt < CACHE_MS;
  if (freshPartial) {
    const bootstrapLat = nationwidePool.centerLat;
    const bootstrapLon = nationwidePool.centerLon;
    const centerMoved =
      Number.isFinite(bootstrapLat) &&
      Number.isFinite(bootstrapLon) &&
      distanceMiles(lat, lon, bootstrapLat, bootstrapLon) > LOCAL_POOL_RADIUS_MILES * 0.45;

    if (!centerMoved) {
      if (!fullPoolWarmPromise) startFullPoolWarm();
      if (!verifiedPoolWarmPromise) startVerifiedPoolWarm();
      return nationwidePool;
    }
  }

  const localBbox = boundingBox(lat, lon, LOCAL_POOL_RADIUS_MILES);
  const direct = await fetchDirectCameras(localBbox);
  const localCameras = dedupeCameras(direct.cameras).filter(isMapVisibleCamera);

  nationwidePool = {
    fetchedAt: Date.now(),
    partial: true,
    centerLat: lat,
    centerLon: lon,
    cameras: freshPartial
      ? dedupeCameras([...nationwidePool.cameras, ...localCameras])
      : localCameras,
    sourceCounts: freshPartial
      ? { ...nationwidePool.sourceCounts, ...direct.sourceCounts }
      : direct.sourceCounts,
    sources: freshPartial
      ? [...new Set([...nationwidePool.sources, ...direct.sources])]
      : direct.sources,
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

/** Non-blocking regional pool merge when a storm cell is clicked far from home. */
export function primeCameraPoolAtPoint(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  void ensureLocalPool(lat, lon);
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

const STORM_CAMERA_MIN_RADIUS_MILES = 22;
const STORM_CAMERA_MAX_RADIUS_MILES = 60;

function stormReliabilityScore(cam) {
  let score = 0;
  if (cam.mediaType === 'snapshot') score -= 500;
  if (cam.camKind === 'weather') score -= 1;
  else if (cam.mediaType === 'hls') score += 100;
  else if (cam.mediaType === 'youtube') score += 80;
  return score;
}

function isLivePlaybackCamera(cam) {
  return cam.mediaType === 'hls' || cam.mediaType === 'youtube';
}

function liveCamerasNearPointFromPool(lat, lon, radiusMiles, limit, mapped) {
  return camerasNearPointFromPool(lat, lon, radiusMiles, limit, mapped).filter(isLivePlaybackCamera);
}

function camerasNearPointFromPool(lat, lon, radiusMiles, limit, mapped) {
  const inRange = mapped
    .filter((cam) => cam.liveUrl && distanceMiles(lat, lon, cam.lat, cam.lon) <= radiusMiles)
    .map((cam) => ({
      ...cam,
      distanceMiles: Math.round(distanceMiles(lat, lon, cam.lat, cam.lon) * 10) / 10,
    }));

  const sortByDistance = (a, b) => {
    if (Math.abs(a.distanceMiles - b.distanceMiles) > 0.2) {
      return a.distanceMiles - b.distanceMiles;
    }
    const scoreA = stormReliabilityScore(a);
    const scoreB = stormReliabilityScore(b);
    if (Math.abs(scoreA - scoreB) > 0.05) return scoreA - scoreB;
    return a.id.localeCompare(b.id);
  };

  const live = inRange.filter((cam) => cam.mediaType === 'hls').sort(sortByDistance);
  const youtube = inRange.filter((cam) => cam.mediaType === 'youtube').sort(sortByDistance);
  const snapshots = inRange.filter((cam) => cam.mediaType === 'snapshot').sort(sortByDistance);
  const picked = [];

  for (const group of [live, youtube, snapshots]) {
    for (const cam of group) {
      if (picked.length >= limit) break;
      if (picked.some((existing) => existing.id === cam.id)) continue;
      picked.push(cam);
    }
    if (picked.length >= limit) break;
  }

  return picked.slice(0, limit).map((cam) => ({
      id: cam.id,
      description: cam.description,
      lat: cam.lat,
      lon: cam.lon,
      liveUrl: cam.liveUrl,
      sourceLiveUrl: cam.sourceLiveUrl,
      mediaType: cam.mediaType,
      camKind: cam.camKind,
      source: cam.source,
      distanceMiles: cam.distanceMiles,
    }));
}

/** Fast regional camera lookup for storm cell previews — live HLS first, snapshots last. */
function mergeStormCameraSources(directMapped) {
  const verifiedReady =
    verifiedPool.cameras.length > 0 && Date.now() - verifiedPool.fetchedAt < CACHE_MS;
  if (!verifiedReady) return directMapped;

  const verifiedLive = mapPlaybackCameras(
    verifiedPool.cameras.filter(
      (cam) =>
        isStormEligibleCamera(cam) && (cam.mediaType === 'hls' || cam.mediaType === 'youtube')
    )
  );
  return dedupeCameras([...verifiedLive, ...directMapped]);
}

function countLiveCameras(cameras) {
  return cameras.filter(isLivePlaybackCamera).length;
}

export async function fetchCamerasNearPoint(lat, lon, radiusMiles, limit = 8, { liveOnly = true } = {}) {
  const searchRadius = Math.max(radiusMiles, STORM_CAMERA_MIN_RADIUS_MILES);
  const bbox = boundingBox(lat, lon, Math.max(searchRadius * 1.35, STORM_CAMERA_MIN_RADIUS_MILES));
  const direct = await fetchDirectCameras(bbox);
  const mapped = mergeStormCameraSources(
    mapPlaybackCameras(dedupeCameras(direct.cameras.filter(isStormEligibleCamera)))
  );

  async function pickVerified(searchR, pickLimit) {
    const candidateLimit = Math.max(pickLimit * 24, 72);
    const candidates = liveOnly
      ? liveCamerasNearPointFromPool(lat, lon, searchR, candidateLimit, mapped)
      : camerasNearPointFromPool(lat, lon, searchR, candidateLimit, mapped);
    return selectWorkingLiveCameras(candidates, pickLimit);
  }

  let cameras = await pickVerified(searchRadius, limit);

  if (cameras.length < limit && searchRadius < STORM_CAMERA_MAX_RADIUS_MILES) {
    const widerRadius = Math.min(STORM_CAMERA_MAX_RADIUS_MILES, Math.round(searchRadius * 1.75));
    const wider = await pickVerified(widerRadius, limit);
    if (wider.length > cameras.length) cameras = wider;
  }

  return cameras;
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
          mapPlaybackCameras(road511Cameras.filter(isMapVisibleCamera)),
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

  cameras = cameras.map(ensureMapPreviewUrls);

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
