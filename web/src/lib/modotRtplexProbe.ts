import { modotRtplexHostVariants, MODOT_REFERER } from './cameraPlayback';

const PROBE_MS = 4500;
const CACHE_MS = 90_000;
const probeCache = new Map<string, { ok: boolean; at: number }>();

function cacheKey(sourceUrl: string) {
  return sourceUrl.match(/MODOT_CAM_\d+/i)?.[0] || sourceUrl;
}

/** Quick parallel check — avoids cycling proxy + direct when MoDOT CDN is down. */
export async function probeModotRtplexStream(sourceUrl: string): Promise<boolean> {
  const key = cacheKey(sourceUrl);
  const cached = probeCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ok;

  const variants = modotRtplexHostVariants(sourceUrl);
  const headers = {
    Referer: MODOT_REFERER,
    Accept: '*/*',
  };

  const results = await Promise.all(
    variants.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(PROBE_MS),
          redirect: 'follow',
        });
        if (!res.ok) return false;
        const body = await res.text();
        return body.includes('#EXTM3U');
      } catch {
        return false;
      }
    })
  );

  const ok = results.some(Boolean);
  probeCache.set(key, { ok, at: Date.now() });
  return ok;
}

export function clearModotRtplexProbeCache() {
  probeCache.clear();
}
