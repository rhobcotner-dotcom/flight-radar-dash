import { bearingDegrees, distanceMiles } from '../../lib/geo.js';

const MIN_SAMPLE_MS = 2500;
const MAX_HISTORY_MS = 10 * 60 * 1000;
const MIN_DISTANCE_MILES = 0.008;
const MAX_SPEED_MPH = 85;

/** @type {Map<string, { lat: number, lon: number, t: number }>} */
const history = new Map();

function pruneHistory(now) {
  if (history.size < 5000) return;
  for (const [key, row] of history) {
    if (now - row.t > MAX_HISTORY_MS) history.delete(key);
  }
}

function normalizeReportedSpeedMph(speedMps) {
  const speed = Number(speedMps);
  if (!Number.isFinite(speed) || speed <= 0.5) return null;
  return Math.round(speed * 2.23694);
}

function normalizeReportedHeading(bearing) {
  const value = Number(bearing);
  if (!Number.isFinite(value)) return null;
  return Math.round(value) % 360;
}

/**
 * Fill in speed/heading when GTFS-RT omits them (common on MetroLink STL).
 * Uses successive position samples cached per vehicle.
 */
export function enrichTransitMotion(sourceKey, vehicleId, lat, lon, bearing, speedMps, nowMs = Date.now()) {
  const key = `${sourceKey}:${vehicleId}`;
  const now = nowMs;
  const prev = history.get(key);

  let speedMph = normalizeReportedSpeedMph(speedMps);
  let heading = normalizeReportedHeading(bearing);

  if (prev && now - prev.t >= MIN_SAMPLE_MS) {
    const dtHours = (now - prev.t) / 3_600_000;
    const dist = distanceMiles(prev.lat, prev.lon, lat, lon);
    if (dtHours > 0 && dist >= MIN_DISTANCE_MILES) {
      const inferred = Math.round(dist / dtHours);
      if (inferred > 0 && inferred <= MAX_SPEED_MPH) {
        if (speedMph == null) speedMph = inferred;
        if (heading == null || heading === 0) {
          heading = Math.round(bearingDegrees(prev.lat, prev.lon, lat, lon));
        }
      }
    }
  }

  history.set(key, { lat, lon, t: now });
  pruneHistory(now);

  return { speedMph, heading };
}

export function resetTransitMotionHistoryForTests() {
  history.clear();
}
