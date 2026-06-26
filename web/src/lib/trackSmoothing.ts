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
}

const MAX_SAMPLES = 5;

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

export function interpolateSegment(segment: TrackSegment, now: number) {
  const progress = Math.min(1, Math.max(0, (now - segment.startTime) / segment.durationMs));
  return {
    lat: segment.fromLat + (segment.toLat - segment.fromLat) * progress,
    lon: segment.fromLon + (segment.toLon - segment.fromLon) * progress,
    progress,
  };
}

export class TrackSmoothingEngine {
  private tracks = new Map<string, TrackRecord>();

  register(
    id: string,
    lat: number,
    lon: number,
    hint: TrackMotionHint,
    intervalMs: number,
    profile: TrackSmoothingProfile = 'aircraft',
    now = Date.now()
  ) {
    const record = this.tracks.get(id) ?? { samples: [], segment: null };
    const previous = record.samples[record.samples.length - 1];
    const jumpMiles =
      previous != null ? distanceMiles(previous.lat, previous.lon, lat, lon) : 0;

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

    const predicted = predictNextPosition(record.samples, hint, intervalMs, profile);
    record.segment = {
      fromLat: lat,
      fromLon: lon,
      toLat: predicted.lat,
      toLon: predicted.lon,
      startTime: now,
      durationMs: intervalMs,
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
  }

  getPosition(id: string, now = Date.now()) {
    const record = this.tracks.get(id);
    if (!record?.segment) return null;
    return interpolateSegment(record.segment, now);
  }
}

export function parseTrainHeadingDeg(heading?: string | null) {
  const value = Number(heading);
  return Number.isFinite(value) ? value : null;
}
