export interface PositionSample {
  lat: number;
  lon: number;
  time: number;
}

export interface TrackMotionHint {
  speedMph?: number | null;
  headingDeg?: number | null;
}

/** aircraft = ADSB-style motion; passenger-rail = capped rail speeds; beacon = fixed/snap (freight, crossings). */
export type TrackSmoothingProfile = 'aircraft' | 'passenger-rail' | 'beacon';

const PROFILE_MAX_SPEED_MPH: Record<TrackSmoothingProfile, number> = {
  aircraft: 600,
  'passenger-rail': 125,
  beacon: 0,
};

const MAX_JUMP_MILES: Record<TrackSmoothingProfile, number> = {
  aircraft: 80,
  'passenger-rail': 18,
  beacon: 2,
};

const MIN_AIRCRAFT_MOTION_MPH = 120;

function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function capMotionHint(hint: TrackMotionHint, profile: TrackSmoothingProfile): TrackMotionHint {
  const maxSpeed = PROFILE_MAX_SPEED_MPH[profile];
  const speedMph = hint.speedMph;
  if (speedMph == null || !Number.isFinite(Number(speedMph))) return hint;
  const capped = Math.max(0, Math.min(Number(speedMph), maxSpeed));
  return capped === speedMph ? hint : { ...hint, speedMph: capped };
}

export interface TrackSegment {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  startTime: number;
  durationMs: number;
}

interface TrackRecord {
  samples: PositionSample[];
  segment: TrackSegment | null;
  hint: TrackMotionHint;
  profile: TrackSmoothingProfile;
  intervalMs: number;
}

const MAX_SAMPLES = 5;
const MIN_SEGMENT_MS = 1_000;
const MAX_VISUAL_CORRECTION_MILES = 18;

function isFiniteCoord(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon);
}

function offsetLatLon(lat: number, lon: number, miles: number, headingDeg: number) {
  const headingRad = (headingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const dLat = (miles / 69) * Math.cos(headingRad);
  const dLon = (miles / (69 * Math.cos(latRad))) * Math.sin(headingRad);
  return { lat: lat + dLat, lon: lon + dLon };
}

function velocityFromSamples(samples: PositionSample[]) {
  if (samples.length < 2) return null;

  let latPerMs = 0;
  let lonPerMs = 0;
  let weightSum = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const prev = samples[index - 1];
    const next = samples[index];
    const dt = next.time - prev.time;
    if (dt <= 0) continue;
    const weight = index;
    latPerMs += weight * ((next.lat - prev.lat) / dt);
    lonPerMs += weight * ((next.lon - prev.lon) / dt);
    weightSum += weight;
  }

  if (weightSum <= 0) return null;
  return { latPerMs: latPerMs / weightSum, lonPerMs: lonPerMs / weightSum };
}

export function predictNextPosition(
  samples: PositionSample[],
  hint: TrackMotionHint,
  horizonMs: number,
  profile: TrackSmoothingProfile = 'aircraft'
): { lat: number; lon: number } {
  const last = samples[samples.length - 1];
  if (!last) return { lat: 0, lon: 0 };

  if (profile === 'beacon') {
    return { lat: last.lat, lon: last.lon };
  }

  const cappedHint = capMotionHint(hint, profile);
  const maxMiles =
    PROFILE_MAX_SPEED_MPH[profile] * Math.max(horizonMs / 3_600_000, 0);

  const history = velocityFromSamples(samples);
  const historyLat = history ? last.lat + history.latPerMs * horizonMs : last.lat;
  const historyLon = history ? last.lon + history.lonPerMs * horizonMs : last.lon;

  const speedMph = cappedHint.speedMph ?? null;
  const headingDeg = cappedHint.headingDeg ?? null;
  if (speedMph != null && speedMph > 0 && headingDeg != null && Number.isFinite(headingDeg)) {
    const miles = Math.min(speedMph * (horizonMs / 3_600_000), maxMiles);
    const deadReckoning = offsetLatLon(last.lat, last.lon, miles, headingDeg);
    if (history) {
      return {
        lat: deadReckoning.lat * 0.7 + historyLat * 0.3,
        lon: deadReckoning.lon * 0.7 + historyLon * 0.3,
      };
    }
    return deadReckoning;
  }

  if (history) {
    const latDelta = historyLat - last.lat;
    const lonDelta = historyLon - last.lon;
    const historyMiles = distanceMiles(last.lat, last.lon, historyLat, historyLon);
    if (historyMiles > maxMiles && historyMiles > 0) {
      const scale = maxMiles / historyMiles;
      return { lat: last.lat + latDelta * scale, lon: last.lon + lonDelta * scale };
    }
    return { lat: historyLat, lon: historyLon };
  }

  return { lat: last.lat, lon: last.lon };
}

function extrapolateFromPoint(
  lat: number,
  lon: number,
  hint: TrackMotionHint,
  elapsedMs: number,
  profile: TrackSmoothingProfile
) {
  if (profile === 'beacon' || elapsedMs <= 0) {
    return { lat, lon };
  }

  const cappedHint = capMotionHint(hint, profile);
  const speedMph = cappedHint.speedMph ?? null;
  const headingDeg = cappedHint.headingDeg ?? null;
  if (speedMph != null && speedMph > 0 && headingDeg != null && Number.isFinite(headingDeg)) {
    const maxMiles = PROFILE_MAX_SPEED_MPH[profile] * (elapsedMs / 3_600_000);
    const miles = Math.min(speedMph * (elapsedMs / 3_600_000), maxMiles);
    return offsetLatLon(lat, lon, Math.max(miles, 0), headingDeg);
  }

  return { lat, lon };
}

function motionTarget(
  startLat: number,
  startLon: number,
  samples: PositionSample[],
  hint: TrackMotionHint,
  intervalMs: number,
  profile: TrackSmoothingProfile
) {
  const predicted = predictNextPosition(samples, hint, intervalMs, profile);
  if (distanceMiles(startLat, startLon, predicted.lat, predicted.lon) > 0.0001) {
    return predicted;
  }

  const extended = predictNextPosition(samples, hint, intervalMs * 2, profile);
  if (distanceMiles(startLat, startLon, extended.lat, extended.lon) > 0.0001) {
    return extended;
  }

  const cappedHint = capMotionHint(hint, profile);
  const speedMph = cappedHint.speedMph ?? 0;
  const headingDeg = cappedHint.headingDeg;
  if (
    profile !== 'beacon' &&
    speedMph > 0 &&
    headingDeg != null &&
    Number.isFinite(headingDeg)
  ) {
    const miles = Math.max(
      speedMph * (intervalMs / 3_600_000),
      profile === 'aircraft' ? MIN_AIRCRAFT_MOTION_MPH * (intervalMs / 3_600_000) : 0.02
    );
    return offsetLatLon(startLat, startLon, miles, headingDeg);
  }

  return predicted;
}

export function interpolateSegment(segment: TrackSegment, now: number) {
  const rawProgress = Math.min(1, Math.max(0, (now - segment.startTime) / segment.durationMs));
  const progress = rawProgress < 0.5 ? 2 * rawProgress * rawProgress : 1 - (-2 * rawProgress + 2) ** 2 / 2;
  return {
    lat: segment.fromLat + (segment.toLat - segment.fromLat) * progress,
    lon: segment.fromLon + (segment.toLon - segment.fromLon) * progress,
    progress: rawProgress,
  };
}

export class TrackSmoothingEngine {
  private tracks = new Map<string, TrackRecord>();
  private markerSinks = new Map<string, (now: number) => void>();

  registerMarkerSink(id: string, sink: (now: number) => void) {
    this.markerSinks.set(id, sink);
    return () => {
      this.markerSinks.delete(id);
    };
  }

  tickMarkers(now = Date.now()) {
    for (const sink of this.markerSinks.values()) {
      sink(now);
    }
  }

  register(
    id: string,
    lat: number,
    lon: number,
    hint: TrackMotionHint,
    intervalMs: number,
    profile: TrackSmoothingProfile = 'aircraft',
    now = Date.now()
  ) {
    const record = this.tracks.get(id) ?? {
      samples: [],
      segment: null,
      hint: {},
      profile: 'aircraft',
      intervalMs,
    };
    const currentVisual = this.getPosition(id, now);
    const previous = record.samples[record.samples.length - 1];
    const jumpMiles =
      previous != null ? distanceMiles(previous.lat, previous.lon, lat, lon) : 0;

    record.hint = hint;
    record.profile = profile;
    record.intervalMs = intervalMs;

    if (profile === 'beacon' || jumpMiles > MAX_JUMP_MILES[profile]) {
      record.samples = [{ lat, lon, time: now }];
    } else {
      record.samples.push({ lat, lon, time: now });
      if (record.samples.length > MAX_SAMPLES) {
        record.samples.splice(0, record.samples.length - MAX_SAMPLES);
      }
    }

    if (profile === 'beacon') {
      record.segment = {
        fromLat: lat,
        fromLon: lon,
        toLat: lat,
        toLon: lon,
        startTime: now,
        durationMs: intervalMs,
      };
      this.tracks.set(id, record);
      return;
    }

    const start = this.segmentStart(lat, lon, currentVisual, profile);
    const target = motionTarget(start.lat, start.lon, record.samples, hint, intervalMs, profile);
    record.segment = {
      fromLat: start.lat,
      fromLon: start.lon,
      toLat: target.lat,
      toLon: target.lon,
      startTime: now,
      durationMs: Math.max(MIN_SEGMENT_MS, intervalMs),
    };
    this.tracks.set(id, record);
  }

  remove(id: string) {
    this.tracks.delete(id);
  }

  prune(activeIds: Set<string>) {
    for (const id of this.tracks.keys()) {
      if (!activeIds.has(id)) this.tracks.delete(id);
    }
    for (const id of this.markerSinks.keys()) {
      if (!activeIds.has(id)) this.markerSinks.delete(id);
    }
  }

  getPosition(id: string, now = Date.now()) {
    const record = this.tracks.get(id);
    if (!record?.segment) return null;

    const pos = interpolateSegment(record.segment, now);
    if (!isFiniteCoord(pos.lat, pos.lon)) return null;

    if (pos.progress < 1) {
      return pos;
    }

    const overdueMs = now - (record.segment.startTime + record.segment.durationMs);
    const extrapolated = extrapolateFromPoint(
      record.segment.toLat,
      record.segment.toLon,
      record.hint,
      overdueMs,
      record.profile
    );
    if (!isFiniteCoord(extrapolated.lat, extrapolated.lon)) return pos;
    return extrapolated;
  }

  private segmentStart(
    lat: number,
    lon: number,
    currentVisual: { lat: number; lon: number } | null,
    profile: TrackSmoothingProfile
  ) {
    if (!currentVisual || profile === 'beacon' || !isFiniteCoord(currentVisual.lat, currentVisual.lon)) {
      return { lat, lon };
    }

    const driftMiles = distanceMiles(currentVisual.lat, currentVisual.lon, lat, lon);
    if (driftMiles > MAX_VISUAL_CORRECTION_MILES) {
      return { lat, lon };
    }

    return { lat: currentVisual.lat, lon: currentVisual.lon };
  }
}

export function parseTrainHeadingDeg(heading?: string | null) {
  const value = Number(heading);
  return Number.isFinite(value) ? value : null;
}
