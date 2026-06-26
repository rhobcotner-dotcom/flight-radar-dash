import { fetchProxiedHlsManifest } from './cameraStreamProxy.js';
import { isModotRtplexStreamUrl, USER_AGENT } from './cameraSources/helpers.js';
import { fetchProxiedCameraImage, cameraNeedsProxy } from './cameraProxy.js';

const PROBE_CONCURRENCY = 36;
const PROBE_TIMEOUT_MS = 10000;
const CACHE_MS = 15 * 60 * 1000;

const manifestCache = new Map();

export function isKnownDeadStream(url) {
  if (isModotRtplexStreamUrl(url)) return false;
  const cached = manifestCache.get(url);
  return Boolean(cached && !cached.ok && Date.now() - cached.at < CACHE_MS);
}

export function isKnownGoodStream(url) {
  const cached = manifestCache.get(url);
  return Boolean(cached?.ok && Date.now() - cached.at < CACHE_MS);
}

async function probeSnapshot(sourceUrl) {
  const cached = manifestCache.get(`snap:${sourceUrl}`);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ok;

  try {
    let ok = false;
    if (cameraNeedsProxy(sourceUrl)) {
      const image = await fetchProxiedCameraImage(sourceUrl);
      ok = image.body.length > 500;
    } else {
      const res = await fetch(sourceUrl, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const contentType = res.headers.get('content-type') || '';
      ok =
        res.ok &&
        (/^image\//i.test(contentType) ||
          contentType.includes('octet-stream') ||
          contentType.includes('png'));
    }
    manifestCache.set(`snap:${sourceUrl}`, { ok, at: Date.now() });
    return ok;
  } catch {
    manifestCache.set(`snap:${sourceUrl}`, { ok: false, at: Date.now() });
    return false;
  }
}

function probeUrlForCamera(camera) {
  if (camera.sourceLiveUrl?.startsWith('http')) return camera.sourceLiveUrl;
  const live = camera.liveUrl;
  if (typeof live === 'string' && live.startsWith('http')) return live;
  if (typeof live === 'string' && live.startsWith('/api/live/camera-image?')) {
    try {
      const raw = new URL(live, 'http://localhost').searchParams.get('url');
      if (raw) return decodeURIComponent(raw);
    } catch {
      /* ignore */
    }
  }
  if (typeof live === 'string' && live.startsWith('/api/live/camera-hls?')) {
    try {
      const raw = new URL(live, 'http://localhost').searchParams.get('url');
      if (raw) return decodeURIComponent(raw);
    } catch {
      /* ignore */
    }
  }
  return live;
}

async function probeOne(camera) {
  if (camera.mediaType === 'snapshot') {
    return probeSnapshot(probeUrlForCamera(camera));
  }

  const sourceLiveUrl = probeUrlForCamera(camera);
  if (isModotRtplexStreamUrl(sourceLiveUrl)) {
    // Wowza rtplive CDN is often unreachable outside traveler.modot.org — do not mark verified.
    manifestCache.set(sourceLiveUrl, { ok: false, at: Date.now() });
    return false;
  }

  const cached = manifestCache.get(sourceLiveUrl);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ok;

  try {
    await Promise.race([
      fetchProxiedHlsManifest(sourceLiveUrl),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS);
      }),
    ]);
    manifestCache.set(sourceLiveUrl, { ok: true, at: Date.now() });
    return true;
  } catch (err) {
    const timedOut = /timeout|timed out/i.test(err?.message || '');
    if (!timedOut) {
      manifestCache.set(sourceLiveUrl, { ok: false, at: Date.now() });
    }
    return false;
  }
}

async function filterBatch(cameras) {
  const working = [];
  let index = 0;

  async function worker() {
    while (index < cameras.length) {
      const current = index;
      index += 1;
      const cam = cameras[current];
      if (await probeOne(cam)) working.push(cam);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PROBE_CONCURRENCY, cameras.length) }, () => worker())
  );
  return working;
}

/** Keep probing cameras until `limit` verified streams are found. */
export async function selectWorkingLiveCameras(cameras, limit) {
  if (!cameras.length) return cameras;

  const working = [];
  let cursor = 0;
  const batchSize = Math.max(limit * 2, 48);

  while (working.length < limit && cursor < cameras.length) {
    const batch = cameras.slice(cursor, cursor + batchSize);
    cursor += batchSize;
    const passed = await filterBatch(batch);
    working.push(...passed);
  }

  return working.slice(0, limit);
}
