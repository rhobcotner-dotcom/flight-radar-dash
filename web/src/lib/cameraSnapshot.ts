import type { TrafficCamera } from './mapLayers';
import { isModotRtplexUrl, isModotTisvcUrl } from './cameraPlayback';

/** Mississippi River ~lon at St. Louis metro. */
export const STL_MISSISSIPPI_LON = -90.18;

export function isWestOfStLouisMississippi(lon?: number | null) {
  return Number.isFinite(lon) && (lon as number) < STL_MISSISSIPPI_LON;
}

function decodeProxiedHlsUrl(liveUrl?: string) {
  if (!liveUrl?.startsWith('/api/live/camera-hls?')) return null;
  try {
    const params = new URL(liveUrl, 'http://localhost').searchParams;
    const raw = params.get('url');
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return null;
  }
}

export function modotRtplexSnapshotUrl(hlsUrl?: string | null) {
  if (!hlsUrl || !/[-.]traveler\.modot\.mo\.gov\/rtplive\//i.test(hlsUrl)) return null;
  const match = hlsUrl.match(/MODOT_CAM_(\d+)/i);
  if (!match) return null;
  const hostMatch = hlsUrl.match(/^https:\/\/(sfs0[1-3]-traveler\.modot\.mo\.gov)/i);
  const host = hostMatch?.[1] || 'sfs02-traveler.modot.mo.gov';
  return `https://${host}/rtplive/MODOT_CAM_${match[1]}/thumbnail.jpg`;
}

function proxiedSnapshotUrl(imageUrl: string) {
  if (imageUrl.startsWith('/api/')) return imageUrl;
  return `/api/live/camera-image?url=${encodeURIComponent(imageUrl)}`;
}

function hlsSourceUrl(cam: TrafficCamera) {
  if (cam.sourceLiveUrl?.startsWith('http')) return cam.sourceLiveUrl;
  const direct = cam.liveUrl?.startsWith('http') ? cam.liveUrl : null;
  if (direct) return direct;
  return decodeProxiedHlsUrl(cam.liveUrl);
}

/** Best still image URL for map hover/click — never returns an HLS manifest. */
export function cameraStaticSnapshotUrl(cam: TrafficCamera) {
  if (cam.previewUrl && !isModotRtplexThumbnailUrl(cam.previewUrl)) return cam.previewUrl;
  if (cam.mediaType === 'snapshot' && cam.liveUrl) return cam.liveUrl;
  if (cam.mediaType === 'youtube') {
    if (cam.previewUrl) return cam.previewUrl;
    if (cam.liveUrl?.includes('img.youtube.com')) return cam.liveUrl;
  }
  return null;
}

/** @deprecated use cameraStaticSnapshotUrl */
export function cameraSnapshotUrl(cam: TrafficCamera) {
  return cameraStaticSnapshotUrl(cam) || inferModotProxiedThumbnail(cam);
}

function inferModotProxiedThumbnail(cam: TrafficCamera) {
  const hlsSource = hlsSourceUrl(cam);
  const modotThumb = modotRtplexSnapshotUrl(hlsSource);
  if (modotThumb) return proxiedSnapshotUrl(modotThumb);
  return null;
}

function isModotRtplexThumbnailUrl(url: string) {
  return /rtplive\/MODOT_CAM_\d+\/thumbnail\.jpg/i.test(decodeURIComponent(url));
}

export function isModotRtplexCamera(cam: TrafficCamera) {
  if (cam.mediaType !== 'hls') return false;
  const src = hlsSourceUrl(cam);
  return Boolean(src && /[-.]traveler\.modot\.mo\.gov\/rtplive\//i.test(src));
}

function stormCameraUrlStrings(cam: Pick<TrafficCamera, 'liveUrl' | 'sourceLiveUrl'>) {
  const urls: string[] = [];
  for (const value of [cam.sourceLiveUrl, cam.liveUrl]) {
    if (typeof value !== 'string' || !value) continue;
    if (value.startsWith('/api/live/camera-hls?')) {
      const decoded = decodeProxiedHlsUrl(value);
      if (decoded) urls.push(decoded);
    }
    urls.push(value);
  }
  return urls;
}

/** Any MoDOT-sourced feed — excluded from storm briefing live views. */
export function isModotTrafficCamera(
  cam: Pick<TrafficCamera, 'id' | 'source' | 'liveUrl' | 'sourceLiveUrl' | 'lon'>
) {
  if (/modot/i.test(cam.source || '')) return true;
  if (/^modot[-_]/i.test(cam.id || '')) return true;
  for (const url of stormCameraUrlStrings(cam)) {
    if (/modot\.(mo\.gov|org)/i.test(url)) return true;
    if (/[-.]traveler\.modot\.mo\.gov\/rtplive\//i.test(url)) return true;
    if (/traveler\.modot\.org\/tisvc\//i.test(url)) return true;
  }
  return false;
}

export function modotTravelerMapHref() {
  return 'https://traveler.modot.org/map/index.html';
}

/** Deep-link to MoDOT Traveler map centered on a camera (m3u8 URLs 504 in a new tab). */
export function modotTravelerCameraHref(cam: Pick<TrafficCamera, 'lat' | 'lon'>) {
  const lon = Number(cam.lon);
  const lat = Number(cam.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return modotTravelerMapHref();
  return `https://traveler.modot.org/map/index.html?cx=${lon}&cy=${lat}&z=15`;
}

export function cameraUsesModotRtplexStream(cam: TrafficCamera) {
  const src = hlsSourceUrl(cam);
  return Boolean(src && isModotRtplexUrl(src));
}

export function cameraSourceSiteHref(cam: TrafficCamera) {
  const src = hlsSourceUrl(cam) || cam.sourceLiveUrl || cam.liveUrl || '';
  if (
    /modot/i.test(cam.source || '') ||
    isModotRtplexUrl(src) ||
    isModotTisvcUrl(src) ||
    /modot\.(mo\.gov|org)/i.test(src)
  ) {
    return modotTravelerCameraHref(cam);
  }
  if (typeof src === 'string' && src.startsWith('http')) return src;
  return undefined;
}

export function cameraCanFrameCapture(cam: TrafficCamera) {
  if (cam.mediaType !== 'hls' || isModotRtplexCamera(cam)) return false;
  return Boolean(hlsSourceUrl(cam) || cam.liveUrl?.startsWith('/api/live/camera-hls'));
}

export function cameraMapPreviewMode(cam: TrafficCamera): 'static' | 'capture' | 'link' | 'none' {
  if (isModotRtplexCamera(cam)) return 'link';
  if (cam.mediaType === 'hls') return 'capture';
  if (cam.mediaType === 'snapshot' || cam.mediaType === 'youtube') {
    return cameraStaticSnapshotUrl(cam) ? 'static' : 'none';
  }
  return 'none';
}

export function cameraHasMapMarker(cam: TrafficCamera) {
  if (!Number.isFinite(cam.lat) || !Number.isFinite(cam.lon)) return false;
  return Boolean(cam.liveUrl || cam.previewUrl);
}
