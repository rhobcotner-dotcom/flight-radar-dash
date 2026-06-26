import { boundingBox, distanceMiles, pointInBoundingBox } from '../../lib/geo.js';

/** Parse map viewport bounds from query string (same params as flight search). */
export function parseViewportBBox(query = {}) {
  const west = Number(query.west);
  const south = Number(query.south);
  const east = Number(query.east);
  const north = Number(query.north);
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (east <= west || north <= south) return null;
  return {
    west: Math.max(-180, Math.min(180, west)),
    south: Math.max(-85, Math.min(85, south)),
    east: Math.max(-180, Math.min(180, east)),
    north: Math.max(-85, Math.min(85, north)),
  };
}

export function bboxCenter(bbox) {
  return {
    lat: (bbox.south + bbox.north) / 2,
    lon: (bbox.west + bbox.east) / 2,
  };
}

/** Approximate radius from viewport center to farthest corner — used for upstream circle queries. */
export function bboxRadiusMiles(bbox) {
  const center = bboxCenter(bbox);
  const corners = [
    [bbox.north, bbox.west],
    [bbox.north, bbox.east],
    [bbox.south, bbox.west],
    [bbox.south, bbox.east],
  ];
  const cornerRadius = Math.max(
    ...corners.map(([lat, lon]) => distanceMiles(center.lat, center.lon, lat, lon))
  );
  return Math.min(Math.max(cornerRadius, 25), 900);
}

export function attachViewportToArea(area, query = {}) {
  const viewport = parseViewportBBox(query);
  if (!viewport) return area;

  const center = bboxCenter(viewport);
  return {
    ...area,
    viewport,
    queryLat: center.lat,
    queryLon: center.lon,
    queryRadiusMiles: bboxRadiusMiles(viewport),
  };
}

export function searchCenter(area) {
  if (area.viewport) {
    return { lat: area.queryLat, lon: area.queryLon };
  }
  return { lat: area.lat, lon: area.lon };
}

export function searchBbox(area, radiusMiles) {
  if (area.viewport) return area.viewport;
  const center = searchCenter(area);
  return boundingBox(center.lat, center.lon, radiusMiles);
}

export function pointInSearchRegion(lat, lon, area, radiusMiles) {
  if (area.viewport) {
    return pointInBoundingBox(lat, lon, area.viewport);
  }
  const center = searchCenter(area);
  return distanceMiles(center.lat, center.lon, lat, lon) <= radiusMiles;
}

export function withDistanceFromSearch(items, area, latKey = 'lat', lonKey = 'lon') {
  const center = searchCenter(area);
  return items.map((item) => ({
    ...item,
    distanceMiles: Math.round(distanceMiles(center.lat, center.lon, item[latKey], item[lonKey]) * 10) / 10,
  }));
}

export function filterInSearchRegion(items, area, radiusMiles, latKey = 'lat', lonKey = 'lon') {
  return withDistanceFromSearch(items, area, latKey, lonKey)
    .filter((item) => pointInSearchRegion(item[latKey], item[lonKey], area, radiusMiles))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

/** Scale AIS cap with viewport area — more ships when zoomed out over coasts. */
export function maxAisVesselsForBbox(bbox) {
  const latSpan = bbox.north - bbox.south;
  const lonSpan = bbox.east - bbox.west;
  const area = latSpan * lonSpan;
  if (area > 900) return 320;
  if (area > 400) return 240;
  if (area > 120) return 160;
  if (area > 40) return 120;
  return 80;
}
