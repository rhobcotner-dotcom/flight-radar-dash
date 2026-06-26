/** Minimum knot change between refreshes before showing accel/decel plume. */
const SPEED_TREND_THRESHOLD_KTS = 4;

/** Ignore taxi / slow ground-roll speeds. */
const MIN_PLUME_SPEED_KTS = 45;

const previousSpeedKts = new Map<string, number>();

export type FlightSpeedTrend = 'accel' | 'decel' | null;

/** Compare current ground speed to the previous refresh for this track. */
export function speedTrendForFlight(
  trackId: string,
  gspeed?: number,
  airborne = true
): FlightSpeedTrend {
  if (!airborne) return null;
  if (!Number.isFinite(gspeed) || Number(gspeed) < MIN_PLUME_SPEED_KTS) return null;

  const current = Number(gspeed);
  const previous = previousSpeedKts.get(trackId);
  previousSpeedKts.set(trackId, current);
  if (previous === undefined) return null;

  const delta = current - previous;
  if (Math.abs(delta) < SPEED_TREND_THRESHOLD_KTS) return null;
  return delta > 0 ? 'accel' : 'decel';
}

export function pruneSpeedTrends(activeTrackIds: Set<string>) {
  for (const trackId of previousSpeedKts.keys()) {
    if (!activeTrackIds.has(trackId)) previousSpeedKts.delete(trackId);
  }
}
