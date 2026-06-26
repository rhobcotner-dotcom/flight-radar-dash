import {
  isHlsUrl,
  isModotRtplexStreamUrl,
  isModotTisvcStreamUrl,
  modotRtplexHostVariants,
  normalizeHlsUrl,
  USER_AGENT,
} from './cameraSources/helpers.js';

const HLS_FETCH_TIMEOUT_MS = 8000;
const MODOT_HLS_FETCH_TIMEOUT_MS = 8000;
const MODOT_REFERER = 'https://traveler.modot.org/map/index.html';

function hlsFetchTimeoutMs(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (host.includes('modot.mo.gov') || host.endsWith('.modot.org')) {
      return MODOT_HLS_FETCH_TIMEOUT_MS;
    }
  } catch {
    /* ignore */
  }
  return HLS_FETCH_TIMEOUT_MS;
}

function fetchWithTimeout(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(hlsFetchTimeoutMs(url)),
  });
}

function refererForUrl(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (
      host.includes('modot.mo.gov') ||
      host.endsWith('.modot.org') ||
      host.includes('ozarkstrafficoneview.com')
    ) {
      return MODOT_REFERER;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function fetchHeaders(urlString) {
  const headers = { Accept: '*/*' };
  const referer = refererForUrl(urlString);
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (host.includes('modot.mo.gov') || host.endsWith('.modot.org')) {
      headers['User-Agent'] = BROWSER_USER_AGENT;
    } else {
      headers['User-Agent'] = USER_AGENT;
    }
  } catch {
    headers['User-Agent'] = USER_AGENT;
  }
  if (referer) headers.Referer = referer;
  return headers;
}

/** Host suffixes used by state DOT / 511 live camera HLS feeds. */
const ALLOWED_HLS_HOST_SUFFIXES = [
  'dot.ca.gov',
  'modot.mo.gov',
  'modot.org',
  'ozarkstrafficoneview.com',
  'streamlock.net',
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
  if (isModotTisvcStreamUrl(urlString)) return true;
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
        if (isHlsUrl(abs) || isModotTisvcStreamUrl(abs)) {
          return `/api/live/camera-hls?url=${encodeURIComponent(abs)}`;
        }
        return `/api/live/camera-hls-segment?url=${encodeURIComponent(abs)}`;
      } catch {
        return line;
      }
    })
    .join('\n');
}

async function fetchProxiedHlsManifestOnce(urlString) {
  let res;
  try {
    res = await fetchWithTimeout(urlString, {
      headers: fetchHeaders(urlString),
      redirect: 'follow',
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw Object.assign(new Error(timedOut ? 'Camera stream timed out' : err.message || 'Camera stream unavailable'), {
      status: timedOut ? 504 : 502,
    });
  }
  if (!res.ok) {
    const status = res.status;
    const message =
      status === 503
        ? 'MoDOT stream unavailable (503 — camera offline or CDN busy)'
        : status === 404
          ? 'MoDOT stream not found (404)'
          : `Camera stream unavailable (${status})`;
    throw Object.assign(new Error(message), {
      status: status === 404 ? 404 : 502,
    });
  }
  const text = await res.text();
  if (!text.includes('#EXTM3U')) {
    throw Object.assign(new Error('Camera URL did not return an HLS manifest'), { status: 502 });
  }
  return {
    body: rewritePlaylist(text, res.url || urlString),
    contentType: 'application/vnd.apple.mpegurl',
    cacheControl: 'public, max-age=5',
  };
}

export async function fetchProxiedHlsManifest(urlString) {
  const normalized = normalizeHlsUrl(urlString);
  if (!normalized || !isAllowedHlsUrl(normalized)) {
    throw Object.assign(new Error('Camera stream host not allowed'), { status: 403 });
  }
  if (isModotRtplexStreamUrl(normalized)) {
    let lastErr;
    for (const variant of modotRtplexHostVariants(normalized)) {
      try {
        return await fetchProxiedHlsManifestOnce(variant);
      } catch (err) {
        lastErr = err;
      }
    }
    throw (
      lastErr ||
      Object.assign(new Error('MoDOT stream unavailable on all CDN hosts'), { status: 502 })
    );
  }
  return fetchProxiedHlsManifestOnce(normalized);
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
      headers: fetchHeaders(url.toString()),
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
