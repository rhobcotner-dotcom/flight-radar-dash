import type { MapViewportBounds } from './mapViewport';

export type CameraStreamTier = 'inView' | 'nearby' | 'distant';
export type CameraStreamReason = 'storm' | 'popup' | 'tooltip';

export const CAMERA_STREAM_MAX_CONCURRENT = 6;
export const CAMERA_STREAM_STAGGER_MS = 400;
export const CAMERA_STREAM_NEARBY_BUFFER = 0.35;
export const CAMERA_STREAM_HOVER_DELAY_MS = 200;

export function expandViewportBounds(
  bounds: MapViewportBounds,
  ratio = CAMERA_STREAM_NEARBY_BUFFER
): MapViewportBounds {
  const latSpan = bounds.north - bounds.south;
  const lonSpan = bounds.east - bounds.west;
  const latPad = latSpan * ratio;
  const lonPad = lonSpan * ratio;
  return {
    ...bounds,
    west: bounds.west - lonPad,
    south: bounds.south - latPad,
    east: bounds.east + lonPad,
    north: bounds.north + latPad,
  };
}

export function isPointInBounds(lat: number, lon: number, bounds: MapViewportBounds) {
  return lon >= bounds.west && lon <= bounds.east && lat >= bounds.south && lat <= bounds.north;
}

export function viewportCenter(bounds: MapViewportBounds) {
  return {
    lat: (bounds.south + bounds.north) / 2,
    lon: (bounds.west + bounds.east) / 2,
  };
}

export function distanceToViewportCenter(lat: number, lon: number, bounds: MapViewportBounds) {
  const center = viewportCenter(bounds);
  return Math.hypot(lat - center.lat, lon - center.lon);
}

export function classifyCameraStreamTier(
  lat: number,
  lon: number,
  bounds: MapViewportBounds | null
): CameraStreamTier {
  if (!bounds) return 'distant';
  if (isPointInBounds(lat, lon, bounds)) return 'inView';
  if (isPointInBounds(lat, lon, expandViewportBounds(bounds))) return 'nearby';
  return 'distant';
}

export function compareStreamRequests(
  a: { tier: CameraStreamTier; distance: number; reason: CameraStreamReason },
  b: { tier: CameraStreamTier; distance: number; reason: CameraStreamReason }
) {
  const reasonRank: Record<CameraStreamReason, number> = { storm: 0, popup: 1, tooltip: 2 };
  const reasonDiff = reasonRank[a.reason] - reasonRank[b.reason];
  if (reasonDiff !== 0) return reasonDiff;

  const tierRank: Record<CameraStreamTier, number> = { inView: 0, nearby: 1, distant: 2 };
  const tierDiff = tierRank[a.tier] - tierRank[b.tier];
  if (tierDiff !== 0) return tierDiff;
  return a.distance - b.distance;
}
