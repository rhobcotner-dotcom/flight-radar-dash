/** Minimum ft change between refreshes before showing a climb/descent arrow. */
const ALT_TREND_THRESHOLD_FT = 60;

const previousAltFt = new Map<string, number>();

export type FlightAltitudeTrend = 'up' | 'down' | null;

/** Compare current altitude to the previous refresh for this track. */
export function altitudeTrendForFlight(trackId: string, alt?: number): FlightAltitudeTrend {
  if (!Number.isFinite(alt)) return null;
  const current = Number(alt);
  const previous = previousAltFt.get(trackId);
  previousAltFt.set(trackId, current);
  if (previous === undefined) return null;

  const delta = current - previous;
  if (Math.abs(delta) < ALT_TREND_THRESHOLD_FT) return null;
  return delta > 0 ? 'up' : 'down';
}

export function pruneAltitudeTrends(activeTrackIds: Set<string>) {
  for (const trackId of previousAltFt.keys()) {
    if (!activeTrackIds.has(trackId)) previousAltFt.delete(trackId);
  }
}

export function isHighAltitudeFlight(alt?: number, thresholdFt = 30_000) {
  return Number.isFinite(alt) && Number(alt) > thresholdFt;
}
