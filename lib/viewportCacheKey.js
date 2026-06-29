/** Shared viewport cache key — keep in sync with web/src/lib/mapViewport.ts */

export function zoomTier(zoom) {
  const z = Number(zoom ?? 10);
  if (z <= 4) return 4;
  if (z <= 6) return 6;
  if (z <= 8) return 8;
  if (z <= 10) return 10;
  return 12;
}

/** Quantized bbox + zoom tier for fetch/cache deduplication. */
export function stableViewportCacheKey(viewport, precision = 2) {
  const tier = zoomTier(viewport.zoom ?? 10);
  const fmt = (value) => Number(value).toFixed(precision);
  return [
    fmt(viewport.west),
    fmt(viewport.south),
    fmt(viewport.east),
    fmt(viewport.north),
    String(tier),
  ].join(':');
}
