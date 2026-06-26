import { distanceMiles } from '../../../lib/geo.js';

export const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
export const CACHE_MS = 5 * 60 * 1000;

/** Approximate WGS84 bounds per state/DC for viewport coverage hints. */
export const STATE_BOUNDS = {
  AL: { west: -88.5, south: 30.1, east: -84.9, north: 35.0 },
  AK: { west: -179.0, south: 51.0, east: -130.0, north: 71.5 },
  AZ: { west: -114.8, south: 31.3, east: -109.0, north: 37.0 },
  AR: { west: -94.6, south: 33.0, east: -89.6, north: 36.5 },
  CA: { west: -124.5, south: 32.5, east: -114.1, north: 42.0 },
  CO: { west: -109.1, south: 37.0, east: -102.0, north: 41.0 },
  CT: { west: -73.7, south: 41.0, east: -71.8, north: 42.1 },
  DE: { west: -75.8, south: 38.4, east: -75.0, north: 39.8 },
  DC: { west: -77.1, south: 38.8, east: -76.9, north: 39.0 },
  FL: { west: -87.6, south: 24.5, east: -80.0, north: 31.0 },
  GA: { west: -85.6, south: 30.4, east: -80.8, north: 35.0 },
  HI: { west: -160.3, south: 18.9, east: -154.8, north: 22.3 },
  IA: { west: -96.6, south: 40.4, east: -90.1, north: 43.5 },
  ID: { west: -117.2, south: 42.0, east: -111.0, north: 49.0 },
  IL: { west: -91.5, south: 37.0, east: -87.5, north: 42.5 },
  IN: { west: -88.1, south: 37.8, east: -84.8, north: 41.8 },
  KS: { west: -102.1, south: 37.0, east: -94.6, north: 40.0 },
  KY: { west: -89.6, south: 36.5, east: -82.0, north: 39.2 },
  LA: { west: -94.0, south: 29.0, east: -89.0, north: 33.0 },
  MA: { west: -73.5, south: 41.2, east: -69.9, north: 42.9 },
  MD: { west: -79.5, south: 37.9, east: -75.0, north: 39.7 },
  ME: { west: -71.1, south: 43.1, east: -66.9, north: 47.5 },
  MI: { west: -90.4, south: 41.7, east: -82.4, north: 48.3 },
  MN: { west: -97.2, south: 43.5, east: -89.5, north: 49.4 },
  MO: { west: -95.8, south: 36.0, east: -89.1, north: 40.6 },
  MS: { west: -91.7, south: 30.2, east: -88.1, north: 35.0 },
  MT: { west: -116.1, south: 44.4, east: -104.0, north: 49.0 },
  NC: { west: -84.3, south: 33.8, east: -75.5, north: 36.6 },
  ND: { west: -104.1, south: 45.9, east: -96.6, north: 49.0 },
  NE: { west: -104.1, south: 40.0, east: -95.3, north: 43.0 },
  NH: { west: -72.6, south: 42.7, east: -70.6, north: 45.3 },
  NJ: { west: -75.6, south: 38.9, east: -73.9, north: 41.4 },
  NM: { west: -109.1, south: 31.3, east: -103.0, north: 37.0 },
  NV: { west: -120.0, south: 35.0, east: -114.0, north: 42.0 },
  NY: { west: -79.8, south: 40.5, east: -71.9, north: 45.0 },
  OH: { west: -84.8, south: 38.4, east: -80.5, north: 42.0 },
  OK: { west: -103.0, south: 33.6, east: -94.4, north: 37.0 },
  OR: { west: -124.6, south: 42.0, east: -116.5, north: 46.3 },
  PA: { west: -80.5, south: 39.7, east: -74.7, north: 42.3 },
  RI: { west: -71.9, south: 41.1, east: -71.1, north: 42.0 },
  SC: { west: -83.4, south: 32.0, east: -78.5, north: 35.2 },
  SD: { west: -104.1, south: 42.5, east: -96.4, north: 46.0 },
  TN: { west: -90.3, south: 35.0, east: -81.6, north: 36.7 },
  TX: { west: -106.7, south: 25.8, east: -93.5, north: 36.5 },
  UT: { west: -114.1, south: 37.0, east: -109.0, north: 42.0 },
  VA: { west: -83.7, south: 36.5, east: -75.2, north: 39.5 },
  VT: { west: -73.4, south: 42.7, east: -71.5, north: 45.0 },
  WA: { west: -124.8, south: 45.5, east: -116.9, north: 49.0 },
  WI: { west: -92.9, south: 42.5, east: -86.8, north: 47.1 },
  WV: { west: -82.6, south: 37.2, east: -77.7, north: 40.6 },
  WY: { west: -111.1, south: 41.0, east: -104.0, north: 45.0 },
};

export function regionsOverlap(a, b) {
  return !(a.west > b.east || a.east < b.west || a.south > b.north || a.north < b.south);
}

export function pointInBbox(lat, lon, bbox) {
  return lat >= bbox.south && lat <= bbox.north && lon >= bbox.west && lon <= bbox.east;
}

export function stateFromCoords(lat, lon) {
  for (const [code, bounds] of Object.entries(STATE_BOUNDS)) {
    if (pointInBbox(lat, lon, bounds)) return code;
  }
  return null;
}

export function statesInBbox(bbox) {
  return Object.entries(STATE_BOUNDS)
    .filter(([, bounds]) => regionsOverlap(bounds, bbox))
    .map(([code]) => code);
}

export function roundCoord(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function isModotTisvcStreamUrl(url) {
  return /traveler\.modot\.org\/tisvc\/api\/Tms\/CameraStream\//i.test(url);
}

/** MoDOT Wowza rtplive feeds are reachable from the browser but often time out via our server proxy. */
export function isModotRtplexStreamUrl(url) {
  return /[-.]traveler\.modot\.mo\.gov\/rtplive\//i.test(url || '');
}

/** Mississippi River ~lon at St. Louis metro — west side is MO suburbs (St. Peters, St. Charles). */
export const STL_MISSISSIPPI_LON = -90.18;

export function isWestOfStLouisMississippi(lon) {
  return Number.isFinite(lon) && lon < STL_MISSISSIPPI_LON;
}

/** Rotate sfs01–sfs03 CDN hosts for the same MODOT_CAM stream (original host first). */
export function modotRtplexHostVariants(url) {
  if (!url || typeof url !== 'string') return [];
  const match = url.match(
    /^https:\/\/(sfs0[1-3]-traveler\.modot\.mo\.gov)(\/rtplive\/MODOT_CAM_\d+\/playlist\.m3u8)$/i
  );
  if (!match) return [url];
  const [, originalHost, path] = match;
  const variants = [1, 2, 3].map((n) => `https://sfs0${n}-traveler.modot.mo.gov${path}`);
  const preferred = `https://${originalHost}${path}`;
  return [preferred, ...variants.filter((v) => v !== preferred)];
}

export function isHlsUrl(url) {
  if (isModotTisvcStreamUrl(url)) return true;
  return /\.m3u8(?:$|\?)/i.test(url);
}

function httpsUrl(url) {
  return typeof url === 'string' ? url.replace(/^http:\/\//i, 'https://') : url;
}

/** Hosts that only serve HLS over plain HTTP. */
const HTTP_HLS_HOSTS = ['video.deldot.gov'];

/** Normalize DOT stream base URLs (e.g. Caltrans *.stream/) to a manifest URL. */
export function normalizeHlsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let normalized = url.trim();
  const keepHttp = HTTP_HLS_HOSTS.some((host) => normalized.includes(host));
  if (!keepHttp) normalized = httpsUrl(normalized);
  if (/\.stream\/?$/i.test(normalized)) {
    normalized = `${normalized.replace(/\/?$/, '')}/playlist.m3u8`;
  }
  normalized = normalized.replace(/\.stream\.stream\//i, '.stream/');
  return isHlsUrl(normalized) ? normalized : null;
}

export function pickMediaUrl(...candidates) {
  for (const url of candidates) {
    if (typeof url === 'string' && url.startsWith('http')) return url;
  }
  return null;
}

/** Return the first HLS manifest URL, or null if none. */
export function pickLiveFirst(...candidates) {
  const urls = candidates.filter((url) => typeof url === 'string' && url.startsWith('http'));
  for (const url of urls) {
    const live = normalizeHlsUrl(url);
    if (live) return live;
  }
  return null;
}

export function isSnapshotUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (isHlsUrl(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (/\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(parsed.pathname)) return true;
    if (/\/map\/Cctv\//i.test(parsed.pathname)) return true;
    if (/tripcheck\.com\/RoadCams\//i.test(parsed.href)) return true;
    if (/images\.wsdot\.wa\.gov\//i.test(parsed.href)) return true;
    if (/trimarc\.org\/images\//i.test(parsed.href)) return true;
    if (/itscameras\.dot\.state\.oh\.us\//i.test(parsed.href)) return true;
    if (/webapps\.arlingtontx\.gov\/webcams\//i.test(parsed.href)) return true;
    if (/micamerasimages\.net\//i.test(parsed.href)) return true;
    if (/nmroads\.com\//i.test(parsed.href)) return true;
    if (/traveler\.modot\.org\/traffic_camera_snapshots\//i.test(parsed.href)) return true;
    if (/img\.cdn\.prod\.alertwest\.com\//i.test(parsed.href)) return true;
    if (/[-.]traveler\.modot\.mo\.gov\/rtplive\//i.test(parsed.href)) return true;
    return /camera|cctv|snapshot|webcam|roadcam|milestone/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** Best-effort still frame URL for MoDOT rtplive HLS feeds (may 404 when CDN has no JPEG). */
export function modotRtplexSnapshotUrl(hlsUrl) {
  if (!isModotRtplexStreamUrl(hlsUrl)) return null;
  const match = hlsUrl.match(/MODOT_CAM_(\d+)/i);
  if (!match) return null;
  const id = match[1];
  const hostMatch = hlsUrl.match(/^https:\/\/(sfs0[1-3]-traveler\.modot\.mo\.gov)/i);
  const host = hostMatch?.[1] || 'sfs02-traveler.modot.mo.gov';
  return `https://${host}/rtplive/MODOT_CAM_${id}/thumbnail.jpg`;
}

function inferHlsPreviewUrl(hlsUrl, explicitPreview) {
  const picked = pickMediaUrl(explicitPreview);
  if (picked && isSnapshotUrl(picked)) return httpsUrl(picked);
  return modotRtplexSnapshotUrl(hlsUrl);
}

export function normalizeCamera({
  id,
  description,
  lat,
  lon,
  streamUrl,
  liveUrl,
  previewUrl,
  source,
  state,
  camKind = 'road',
}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const kind = camKind === 'weather' || camKind === 'rail' ? camKind : 'road';

  const live = normalizeHlsUrl(liveUrl || streamUrl);
  if (live) {
    const snapshotPreview = inferHlsPreviewUrl(live, previewUrl);
    return {
      id: String(id),
      description: description || `Camera ${id}`,
      lat,
      lon,
      streamUrl: live,
      liveUrl: live,
      previewUrl: snapshotPreview,
      mediaType: 'hls',
      camKind: kind,
      source,
      state: state || null,
    };
  }

  const snapshot = pickMediaUrl(streamUrl, liveUrl, previewUrl);
  if (snapshot && isSnapshotUrl(snapshot)) {
    const imageUrl = httpsUrl(snapshot);
    return {
      id: String(id),
      description: description || `Camera ${id}`,
      lat,
      lon,
      streamUrl: imageUrl,
      liveUrl: imageUrl,
      previewUrl: imageUrl,
      mediaType: 'snapshot',
      camKind: kind,
      source,
      state: state || null,
    };
  }

  return null;
}

export function isUsableCamera(cam) {
  return Boolean(cam?.liveUrl && (cam.mediaType === 'hls' || cam.mediaType === 'snapshot'));
}

/** MoDOT Wowza rtplive feeds fail outside traveler.modot.org — hide from map markers. */
export function isBrokenModotRtplexCamera(cam) {
  if (cam?.mediaType !== 'hls') return false;
  const raw = cam.sourceLiveUrl || cam.liveUrl;
  if (typeof raw !== 'string') return false;
  if (raw.startsWith('/api/live/camera-hls?')) {
    try {
      const decoded = new URL(raw, 'http://localhost').searchParams.get('url');
      return isModotRtplexStreamUrl(decoded ? decodeURIComponent(decoded) : '');
    } catch {
      return false;
    }
  }
  return isModotRtplexStreamUrl(raw);
}

export function isMapVisibleCamera(cam) {
  return isUsableCamera(cam);
}

function cameraUrlStrings(cam) {
  const urls = [];
  for (const value of [cam?.sourceLiveUrl, cam?.liveUrl, cam?.streamUrl, cam?.previewUrl]) {
    if (typeof value !== 'string' || !value) continue;
    if (value.startsWith('/api/live/camera-hls?')) {
      try {
        const decoded = new URL(value, 'http://localhost').searchParams.get('url');
        if (decoded) urls.push(decodeURIComponent(decoded));
      } catch {
        /* ignore malformed proxy URLs */
      }
    }
    urls.push(value);
  }
  return urls;
}

/** Any MoDOT-sourced feed — excluded from storm briefing and Missouri map inventory. */
export function isModotTrafficCamera(cam) {
  if (/modot/i.test(String(cam?.source || ''))) return true;
  if (/^modot[-_]/i.test(String(cam?.id || ''))) return true;
  for (const url of cameraUrlStrings(cam)) {
    if (/modot\.(mo\.gov|org)/i.test(url)) return true;
    if (isModotRtplexStreamUrl(url) || isModotTisvcStreamUrl(url)) return true;
  }
  return false;
}

export function isStormEligibleCamera(cam) {
  return isMapVisibleCamera(cam) && !isModotTrafficCamera(cam);
}

export function isLiveCamera(cam) {
  return Boolean(cam?.liveUrl && cam.mediaType === 'hls');
}

export async function queryArcGis(baseUrl, params) {
  const res = await fetch(`${baseUrl}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Camera source unavailable (${res.status})`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message || 'Camera query failed');
  return Array.isArray(body.features) ? body.features : [];
}

export const LIVE_QUERY_RECORD_COUNT = 2000;

export function arcGisEnvelopeParams(bbox, extra = {}) {
  return new URLSearchParams({
    where: extra.where || '1=1',
    outFields: extra.outFields || '*',
    returnGeometry: extra.returnGeometry ?? 'true',
    geometry: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: String(extra.resultRecordCount || LIVE_QUERY_RECORD_COUNT),
    f: extra.f || 'json',
  });
}

function cameraPickScore(cam) {
  if (!cam?.liveUrl) return -1;
  if (cam.camKind === 'weather') return 4;
  if (cam.mediaType === 'hls') return 5;
  if (cam.mediaType === 'youtube') return 4;
  if (cam.mediaType === 'snapshot') return 1;
  return 0;
}

function shouldPreferCamera(existing, candidate) {
  if (existing.liveUrl && !candidate.liveUrl) return false;
  if (!existing.liveUrl && candidate.liveUrl) return true;
  const existingScore = cameraPickScore(existing);
  const candidateScore = cameraPickScore(candidate);
  if (candidateScore !== existingScore) return candidateScore > existingScore;
  if (existing.mediaType === 'hls' && candidate.mediaType === 'hls') {
    return modotStreamPreference(candidate.liveUrl) > modotStreamPreference(existing.liveUrl);
  }
  return false;
}

export function dedupeCameras(cameras) {
  const byCell = new Map();
  for (const cam of cameras) {
    const key = cam?.id ? String(cam.id) : `${roundCoord(cam.lat, 2)}:${roundCoord(cam.lon, 2)}`;
    const existing = byCell.get(key);
    if (!existing) {
      byCell.set(key, cam);
      continue;
    }
    if (shouldPreferCamera(existing, cam)) {
      byCell.set(key, cam);
    }
  }
  return [...byCell.values()];
}

function modotStreamPreference(url) {
  if (isModotTisvcStreamUrl(url)) return 2;
  if (isModotRtplexStreamUrl(url)) return 0;
  return 1;
}

export function isWideViewport(bbox) {
  return bbox.east - bbox.west > 25 || bbox.north - bbox.south > 15;
}

export function camerasInBbox(cameras, bbox) {
  return cameras.filter((cam) => pointInBbox(cam.lat, cam.lon, bbox));
}

export function thinCameras(cameras, bbox, limit, centerLat, centerLon) {
  if (cameras.length <= limit) return cameras;

  const lonSpan = bbox.east - bbox.west;
  const latSpan = bbox.north - bbox.south;
  const denseViewport = lonSpan < 10 && latSpan < 8;
  const cellMultiplier = denseViewport ? 8 : 2;
  const targetCells = Math.min(cameras.length, Math.max(limit, Math.ceil(limit * cellMultiplier)));
  const cols = Math.ceil(Math.sqrt(targetCells));
  const rows = Math.ceil(targetCells / cols);
  const lonStep = Math.max((bbox.east - bbox.west) / cols, 0.001);
  const latStep = Math.max((bbox.north - bbox.south) / rows, 0.001);
  const picked = new Map();

  const rank = (cam) => {
    if (Number.isFinite(centerLat) && Number.isFinite(centerLon)) {
      return distanceMiles(centerLat, centerLon, cam.lat, cam.lon);
    }
    return 0;
  };

  for (const cam of cameras) {
    const col = Math.min(cols - 1, Math.max(0, Math.floor((cam.lon - bbox.west) / lonStep)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((cam.lat - bbox.south) / latStep)));
    // Keep distinct directional views (Travel Midwest, 511WI, etc.) at the same intersection.
    const key = cam?.id ? `${col}:${row}:${cam.id}` : `${col}:${row}`;
    const existing = picked.get(key);
    if (!existing || rank(cam) < rank(existing) || (rank(cam) === rank(existing) && cam.id < existing.id)) {
      picked.set(key, cam);
    }
  }

  return [...picked.values()]
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, limit);
}

export function thinCamerasByState(cameras, bbox, limit, centerLat, centerLon) {
  const inView = camerasInBbox(cameras, bbox);
  if (inView.length <= limit) return inView;

  const stateCodes = [...new Set(inView.map((cam) => cam.state).filter(Boolean))].sort();
  if (stateCodes.length <= 1) {
    return thinCameras(inView, bbox, limit, centerLat, centerLon);
  }

  const perState = Math.max(6, Math.ceil(limit / stateCodes.length));
  let picked = [];
  for (const state of stateCodes) {
    const stateCams = inView.filter((cam) => cam.state === state);
    picked.push(...thinCameras(stateCams, bbox, perState, centerLat, centerLon));
  }

  if (picked.length <= limit) return picked;
  return thinCameras(picked, bbox, limit, centerLat, centerLon);
}

const listCaches = new Map();

export async function fetchCachedJson(url, cacheKey, ttlMs = CACHE_MS) {
  const cached = listCaches.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached.data;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Camera feed unavailable (${res.status})`);
  const data = await res.json();
  listCaches.set(cacheKey, { fetchedAt: Date.now(), data });
  return data;
}

export async function fetchCachedText(url, cacheKey, ttlMs = CACHE_MS) {
  const cached = listCaches.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached.data;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
  });
  if (!res.ok) throw new Error(`Camera feed unavailable (${res.status})`);
  const data = await res.text();
  listCaches.set(cacheKey, { fetchedAt: Date.now(), data });
  return data;
}

export function filterByBbox(items, bbox, latFn, lonFn) {
  return items.filter((item) => {
    const lat = latFn(item);
    const lon = lonFn(item);
    return pointInBbox(lat, lon, bbox);
  });
}
