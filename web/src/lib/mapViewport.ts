export interface MapViewportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
}

/** Default map viewport from home settings — used before Leaflet reports bounds. */
export function viewportFromArea(
  area: { lat: number; lon: number; radiusMiles?: number; mapFocusMiles?: number },
  zoom = 12
): MapViewportBounds {
  const radiusMiles = Math.max(area.radiusMiles ?? 85, area.mapFocusMiles ?? 12, 25);
  const latDelta = radiusMiles / 69;
  const lonDelta = radiusMiles / (69 * Math.cos((area.lat * Math.PI) / 180) || 1);
  return {
    west: area.lon - lonDelta,
    south: area.lat - latDelta,
    east: area.lon + lonDelta,
    north: area.lat + latDelta,
    zoom,
  };
}

/** Keep in sync with lib/viewportCacheKey.js */
export function zoomTier(zoom: number) {
  if (zoom <= 4) return 4;
  if (zoom <= 6) return 6;
  if (zoom <= 8) return 8;
  if (zoom <= 10) return 10;
  return 12;
}

export function stableViewportKey(bounds: MapViewportBounds) {
  const tier = zoomTier(bounds.zoom);
  const fmt = (value: number) => value.toFixed(2);
  return [fmt(bounds.west), fmt(bounds.south), fmt(bounds.east), fmt(bounds.north), String(tier)].join(':');
}

export function viewportSearchParams(
  homeQueryString: string,
  bounds: MapViewportBounds | null
) {
  const params = new URLSearchParams(homeQueryString);
  if (!bounds) return params;

  params.set('west', bounds.west.toFixed(4));
  params.set('south', bounds.south.toFixed(4));
  params.set('east', bounds.east.toFixed(4));
  params.set('north', bounds.north.toFixed(4));
  params.set('zoom', String(Math.round(bounds.zoom)));
  return params;
}

export function pointInViewportBounds(
  lat: number,
  lon: number,
  bounds: MapViewportBounds | null
) {
  if (!bounds) return true;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return lat >= bounds.south && lat <= bounds.north && lon >= bounds.west && lon <= bounds.east;
}
