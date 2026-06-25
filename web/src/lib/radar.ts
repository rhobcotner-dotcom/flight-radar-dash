import { fetchJson } from './fetchJson';

export interface RadarFrame {
  time: number;
  path: string;
}

export interface RadarAttribution {
  name: string;
  url: string;
}

interface RadarPayloadBase {
  source: string;
  mode: 'live' | 'frames';
  label: string;
  refreshMs: number;
  typicalLatencyMinutes: number;
  attribution: RadarAttribution;
  error?: string;
}

export interface LiveRadarPayload extends RadarPayloadBase {
  mode: 'live';
  tileUrl: string;
  tileSize: number;
  maxNativeZoom: number;
  maxZoom: number;
  fetchedAt?: number;
}

export interface FramesRadarPayload extends RadarPayloadBase {
  mode: 'frames';
  host: string;
  frames: RadarFrame[];
  generated?: number;
}

export type RadarPayload = LiveRadarPayload | FramesRadarPayload;

export const RADAR_TILE_SIZE = 256;
export const DEFAULT_RADAR_OPACITY = 0.38;

/** RainViewer: color 1 = Universal Blue, smooth on, snow off — softer than raw TITAN. */
export function buildRainviewerTileUrl(host: string, path: string) {
  return `${host}${path}/${RADAR_TILE_SIZE}/{z}/{x}/{y}/1/1_0.png`;
}

export function buildLiveTileUrl(template: string, cacheBust: number) {
  const separator = template.includes('?') ? '&' : '?';
  return `${template}${separator}_=${cacheBust}`;
}

export async function fetchRadarConfig(): Promise<RadarPayload> {
  const data = await fetchJson<RadarPayload & { error?: string }>('/api/radar/frames');

  if (data.error) {
    throw new Error(data.error);
  }

  return data;
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

export function formatLiveRadarLabel(payload: LiveRadarPayload, nowMs = Date.now()) {
  const fetchedAt = payload.fetchedAt ?? nowMs;
  const timeLabel = new Date(fetchedAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `live · ~${payload.typicalLatencyMinutes}m scan lag · checked ${timeLabel}`;
}
