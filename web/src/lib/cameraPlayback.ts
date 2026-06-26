const MODOT_REFERER = 'https://traveler.modot.org/map/index.html';

export function isModotRtplexUrl(url?: string) {
  return /[-.]traveler\.modot\.mo\.gov\/rtplive\//i.test(url || '');
}

export function isModotTisvcUrl(url?: string) {
  return /traveler\.modot\.org\/tisvc\/api\/Tms\/CameraStream\//i.test(url || '');
}

export function cameraHlsProxyUrl(sourceUrl: string) {
  if (!sourceUrl || sourceUrl.startsWith('/api/')) return sourceUrl;
  return `/api/live/camera-hls?url=${encodeURIComponent(sourceUrl)}`;
}

/** Rotate sfs01–sfs03 CDN hosts for the same MODOT_CAM stream. */
export function modotRtplexHostVariants(url: string) {
  const match = url.match(
    /^https:\/\/(sfs0[1-3]-traveler\.modot\.mo\.gov)(\/rtplive\/MODOT_CAM_\d+\/playlist\.m3u8)$/i
  );
  if (!match) return [url];
  const [, originalHost, path] = match;
  const preferred = `https://${originalHost}${path}`;
  const variants = [1, 2, 3].map((n) => `https://sfs0${n}-traveler.modot.mo.gov${path}`);
  return [preferred, ...variants.filter((v) => v !== preferred)];
}

/** Playback order for a camera tile/popup. */
export function hlsPreviewSources(liveUrl: string, sourceLiveUrl?: string) {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (url?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };

  const decodeProxied = (url?: string) => {
    if (!url?.startsWith('/api/live/camera-hls?')) return null;
    try {
      const raw = new URL(url, 'http://localhost').searchParams.get('url');
      return raw ? decodeURIComponent(raw) : null;
    } catch {
      return null;
    }
  };

  const direct =
    sourceLiveUrl ||
    (liveUrl.startsWith('http') ? liveUrl : undefined) ||
    decodeProxied(liveUrl);

  if (direct?.startsWith('http') && isModotRtplexUrl(direct)) {
    // Browser-direct only — MoDOT CDN blocks our server proxy; match traveler.modot.org playback.
    for (const variant of modotRtplexHostVariants(direct)) {
      add(variant);
    }
    return out;
  }

  if (direct?.startsWith('http')) {
    add(cameraHlsProxyUrl(direct));
    add(direct);
  }

  if (!isModotRtplexUrl(direct) && !isModotRtplexUrl(sourceLiveUrl)) {
    add(liveUrl);
    if (sourceLiveUrl && sourceLiveUrl !== liveUrl && sourceLiveUrl !== direct) {
      add(cameraHlsProxyUrl(sourceLiveUrl));
      add(sourceLiveUrl);
    }
  }

  return out;
}

export function hlsRefererForUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('modot.mo.gov') || host.endsWith('.modot.org')) {
      return MODOT_REFERER;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function preferVideoJsPlayback(url: string) {
  return isModotRtplexUrl(url);
}

export { MODOT_REFERER };
