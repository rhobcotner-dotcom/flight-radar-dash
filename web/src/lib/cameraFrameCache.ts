const FRAME_CACHE = new Map<string, { dataUrl: string; at: number }>();
const CACHE_MS = 90_000;

export function cameraFrameCacheKey(camId: string, sourceKey: string) {
  return `${camId}:${sourceKey}`;
}

export function getCachedCameraFrame(key: string) {
  const hit = FRAME_CACHE.get(key);
  if (!hit || Date.now() - hit.at >= CACHE_MS) {
    if (hit) FRAME_CACHE.delete(key);
    return null;
  }
  return hit.dataUrl;
}

export function setCachedCameraFrame(key: string, dataUrl: string) {
  FRAME_CACHE.set(key, { dataUrl, at: Date.now() });
  if (FRAME_CACHE.size > 96) {
    const oldest = [...FRAME_CACHE.entries()].sort((a, b) => a[1].at - b[1].at)[0]?.[0];
    if (oldest) FRAME_CACHE.delete(oldest);
  }
}
