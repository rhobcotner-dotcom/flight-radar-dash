import { isModotRtplexUrl, isModotTisvcUrl } from './cameraPlayback';

export type CameraPlaybackPlayer = 'hls.js' | 'video.js' | 'native' | 'none';

export interface CameraPlaybackStatus {
  phase: 'idle' | 'loading' | 'playing' | 'failed' | 'retrying';
  sourceIndex: number;
  sourceCount: number;
  sourceLabel: string;
  player: CameraPlaybackPlayer;
  detail?: string;
  failures: string[];
}

export function emptyPlaybackStatus(): CameraPlaybackStatus {
  return {
    phase: 'idle',
    sourceIndex: 0,
    sourceCount: 0,
    sourceLabel: 'Starting…',
    player: 'none',
    failures: [],
  };
}

export function describePlaybackSource(url: string): string {
  if (url.startsWith('/api/live/camera-hls')) {
    try {
      const raw = new URL(url, 'http://localhost').searchParams.get('url') || '';
      if (isModotRtplexUrl(raw)) {
        const cam = raw.match(/MODOT_CAM_\d+/i)?.[0] || 'rtplive';
        const host = raw.match(/sfs0[1-3]/i)?.[0] || 'MoDOT CDN';
        return `App proxy → ${host} ${cam}`;
      }
      if (isModotTisvcUrl(raw)) return 'App proxy → MoDOT tisvc';
      const host = new URL(raw).hostname;
      return `App proxy → ${host}`;
    } catch {
      return 'App proxy';
    }
  }
  if (isModotRtplexUrl(url)) {
    const cam = url.match(/MODOT_CAM_\d+/i)?.[0] || 'stream';
    const host = url.match(/sfs0[1-3]/i)?.[0] || 'MoDOT CDN';
    return `Direct ${host} ${cam}`;
  }
  if (isModotTisvcUrl(url)) return 'MoDOT tisvc direct';
  try {
    return new URL(url).hostname;
  } catch {
    return 'Live stream';
  }
}

export function playerForSource(url: string): CameraPlaybackPlayer {
  if (url.startsWith('/api/')) return 'hls.js';
  if (isModotRtplexUrl(url)) return 'hls.js';
  return 'hls.js';
}

export function formatHlsError(data: {
  type?: string;
  details?: string;
  response?: { code?: number; text?: string };
}): string {
  const code = data.response?.code;
  if (code) return `HLS ${data.details || data.type || 'error'} (HTTP ${code})`;
  return `HLS ${data.details || data.type || 'error'}`;
}
