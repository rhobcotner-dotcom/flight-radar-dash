import { fetchJson } from './fetchJson';

export interface RadarFrame {
  time: number;
  path: string;
}

export interface RadarFramesPayload {
  host: string;
  frames: RadarFrame[];
  generated?: number;
}

/** RainViewer tiles are 256px; keep URL size and Leaflet tileSize matched. */
export const RADAR_TILE_SIZE = 256;

export function buildRadarTileUrl(host: string, path: string) {
  return `${host}${path}/${RADAR_TILE_SIZE}/{z}/{x}/{y}/1/1_0.png`;
}

export async function fetchRadarFrames(): Promise<RadarFramesPayload> {
  const data = await fetchJson<RadarFramesPayload & { error?: string }>('/api/radar/frames');

  return {
    host: data.host,
    frames: Array.isArray(data.frames) ? data.frames : [],
    generated: data.generated,
  };
}

export function formatRadarFrameTime(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatRadarFrameLabel(unixSeconds: number, nowMs = Date.now()) {
  const frameMs = unixSeconds * 1000;
  const timeLabel = formatRadarFrameTime(unixSeconds);
  const ageMinutes = Math.max(0, Math.round((nowMs - frameMs) / 60000));

  if (ageMinutes <= 1) return `@ ${timeLabel} · current`;
  return `@ ${timeLabel} · ${ageMinutes}m old`;
}
