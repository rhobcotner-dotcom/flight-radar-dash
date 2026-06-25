import { isHlsUrl, normalizeHlsUrl, USER_AGENT } from './cameraSources/helpers.js';

const HLS_FETCH_TIMEOUT_MS = 8000;

function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(HLS_FETCH_TIMEOUT_MS),
  });
}

/** Host suffixes used by state DOT / 511 live camera HLS feeds. */
const ALLOWED_HLS_HOST_SUFFIXES = [
  'dot.ca.gov',
  'modot.mo.gov',
  'ozarkstrafficoneview.com',
  'skyvdn.com',
  'wowza.com',
  'wzmedia.dot.ca.gov',
  'algotraffic.com',
  'video.deldot.gov',
  'iowadot.gov',
  'dot.ga.gov',
  'cotrip.org',
  'carsprogram.org',
  'road511.com',
];

function hostAllowed(hostname) {
  const host = hostname.toLowerCase();
  if (ALLOWED_HLS_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) {
    return true;
  }
  return host.includes('.dot.') || host.includes('511') || host.endsWith('.gov');
}

export function isAllowedHlsUrl(urlString) {
  const normalized = normalizeHlsUrl(urlString);
  if (!normalized) return false;
  try {
    const url = new URL(normalized);
    return hostAllowed(url.hostname);
  } catch {
    return false;
  }
}

export function cameraHlsPlaybackUrl(liveUrl) {
  const normalized = normalizeHlsUrl(liveUrl);
  if (!normalized || !isAllowedHlsUrl(normalized)) return normalized;
  return `/api/live/camera-hls?url=${encodeURIComponent(normalized)}`;
}

function rewritePlaylist(text, playlistUrl) {
  const base = new URL(playlistUrl);
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      try {
        const abs = new URL(trimmed, base).toString();
        if (isHlsUrl(abs)) {
          return `/api/live/camera-hls?url=${encodeURIComponent(abs)}`;
        }
        return `/api/live/camera-hls-segment?url=${encodeURIComponent(abs)}`;
      } catch {
        return line;
      }
    })
    .join('\n');
}

export async function fetchProxiedHlsManifest(urlString) {
  const normalized = normalizeHlsUrl(urlString);
  if (!normalized || !isAllowedHlsUrl(normalized)) {
    throw Object.assign(new Error('Camera stream host not allowed'), { status: 403 });
  }
  let res;
  try {
    res = await fetchWithTimeout(normalized, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      redirect: 'follow',
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw Object.assign(new Error(timedOut ? 'Camera stream timed out' : err.message || 'Camera stream unavailable'), {
      status: timedOut ? 504 : 502,
    });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Camera stream unavailable (${res.status})`), {
      status: res.status === 404 ? 404 : 502,
    });
  }
  const text = await res.text();
  if (!text.includes('#EXTM3U')) {
    throw Object.assign(new Error('Camera URL did not return an HLS manifest'), { status: 502 });
  }
  return {
    body: rewritePlaylist(text, normalized),
    contentType: 'application/vnd.apple.mpegurl',
    cacheControl: 'public, max-age=5',
  };
}

export async function fetchProxiedHlsSegment(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw Object.assign(new Error('Invalid segment URL'), { status: 400 });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw Object.assign(new Error('Invalid segment URL'), { status: 400 });
  }
  if (!hostAllowed(url.hostname)) {
    throw Object.assign(new Error('Camera segment host not allowed'), { status: 403 });
  }
  let res;
  try {
    res = await fetchWithTimeout(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
      redirect: 'follow',
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw Object.assign(new Error(timedOut ? 'Camera segment timed out' : err.message || 'Camera segment unavailable'), {
      status: timedOut ? 504 : 502,
    });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`Camera segment unavailable (${res.status})`), {
      status: res.status === 404 ? 404 : 502,
    });
  }
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
    cacheControl: res.headers.get('cache-control') || 'public, max-age=30',
  };
}
