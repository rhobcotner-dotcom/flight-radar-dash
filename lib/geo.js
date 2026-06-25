const EARTH_RADIUS_MILES = 3958.8;

export function boundingBox(lat, lon, radiusMiles) {
  const latDelta = radiusMiles / 69;
  const lonDelta = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180) || 1);
  return {
    south: lat - latDelta,
    north: lat + latDelta,
    west: lon - lonDelta,
    east: lon + lonDelta,
  };
}

export function pointInBoundingBox(lat, lon, box) {
  return lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;
}

/** Haversine distance in miles between two lat/lon points. */
export function distanceMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
