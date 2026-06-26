export interface PositionSample {
  lat: number;
  lon: number;
  time: number;
}

export interface TrackMotionHint {
  speedMph?: number | null;
  headingDeg?: number | null;
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
  horizonMs: number
): { lat: number; lon: number } {
  const last = samples[samples.length - 1];
  if (!last) return { lat: 0, lon: 0 };

  const history = velocityFromSamples(samples);
  const historyLat = history ? last.lat + history.latPerMs * horizonMs : last.lat;
  const historyLon = history ? last.lon + history.lonPerMs * horizonMs : last.lon;

  const speedMph = hint.speedMph ?? null;
  const headingDeg = hint.headingDeg ?? null;
  if (speedMph != null && speedMph > 0 && headingDeg != null && Number.isFinite(headingDeg)) {
    const miles = speedMph * (horizonMs / 3_600_000);
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
    now = Date.now()
  ) {
    const record = this.tracks.get(id) ?? { samples: [], segment: null };
    record.samples.push({ lat, lon, time: now });
    if (record.samples.length > MAX_SAMPLES) {
      record.samples.splice(0, record.samples.length - MAX_SAMPLES);
    }

    const predicted = predictNextPosition(record.samples, hint, intervalMs);
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
