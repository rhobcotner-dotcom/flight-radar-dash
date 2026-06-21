/**
 * Compute FR24 bounds string (north,south,west,east) from center + radius.
 */
export function boundsFromCenter(lat, lon, radiusMiles) {
  const latNum = Number(lat);
  const lonNum = Number(lon);
  const radius = Number(radiusMiles);

  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum) || !Number.isFinite(radius) || radius <= 0) {
    throw new Error('Invalid lat, lon, or radiusMiles');
  }

  const latDelta = radius / 69;
  const lonDelta = radius / (69 * Math.cos((latNum * Math.PI) / 180));
  const north = roundCoord(latNum + latDelta);
  const south = roundCoord(latNum - latDelta);
  const west = roundCoord(lonNum - lonDelta);
  const east = roundCoord(lonNum + lonDelta);

  return {
    north,
    south,
    west,
    east,
    bounds: `${north},${south},${west},${east}`,
  };
}

function roundCoord(value) {
  return Math.round(value * 1000) / 1000;
}
