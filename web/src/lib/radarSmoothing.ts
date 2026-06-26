import type { RadarFrame } from './radar';

export interface RadarFrameBlend {
  from: RadarFrame;
  to: RadarFrame;
  /** 0 = show `from`, 1 = show `to` */
  t: number;
}

export function averageFrameStepSec(frames: RadarFrame[], fallbackSec = 600) {
  if (frames.length < 2) return fallbackSec;
  let sum = 0;
  let count = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const step = frames[index].time - frames[index - 1].time;
    if (step > 0) {
      sum += step;
      count += 1;
    }
  }
  if (!count) return fallbackSec;
  return sum / count;
}

/** Map refresh-cycle progress (0–1) to a virtual time across recent + extrapolated frames. */
export function virtualRadarTimeSec(frames: RadarFrame[], progress: number) {
  if (!frames.length) return 0;
  const sorted = [...frames].sort((a, b) => a.time - b.time);
  const latest = sorted[sorted.length - 1];
  if (sorted.length === 1) return latest.time;

  const step = averageFrameStepSec(sorted);
  const start = sorted[Math.max(0, sorted.length - 3)].time;
  const end = latest.time + step;
  const clamped = Math.min(1, Math.max(0, progress));
  return start + (end - start) * clamped;
}

export function pickFrameBlend(frames: RadarFrame[], virtualTimeSec: number): RadarFrameBlend | null {
  if (!frames.length) return null;
  const sorted = [...frames].sort((a, b) => a.time - b.time);
  if (sorted.length === 1) {
    return { from: sorted[0], to: sorted[0], t: 0 };
  }

  if (virtualTimeSec <= sorted[0].time) {
    return { from: sorted[0], to: sorted[0], t: 0 };
  }

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index];
    const to = sorted[index + 1];
    if (virtualTimeSec >= from.time && virtualTimeSec <= to.time) {
      const span = to.time - from.time;
      const t = span > 0 ? (virtualTimeSec - from.time) / span : 0;
      return { from, to, t };
    }
  }

  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const step = Math.max(1, last.time - prev.time);
  const t = Math.min(1, (virtualTimeSec - last.time) / step);
  return { from: prev, to: last, t: Math.min(1, 0.5 + t * 0.5) };
}

export function blendFrameLabel(blend: RadarFrameBlend) {
  const fromMs = blend.from.time * 1000;
  const toMs = blend.to.time * 1000;
  const labelTime = fromMs + (toMs - fromMs) * blend.t;
  return Math.round(labelTime / 1000);
}
