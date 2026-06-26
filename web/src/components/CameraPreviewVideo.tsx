import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { hlsPreviewSources, hlsRefererForUrl, isModotRtplexUrl, MODOT_REFERER } from '../lib/cameraPlayback';
import {
  describePlaybackSource,
  emptyPlaybackStatus,
  formatHlsError,
  playerForSource,
  type CameraPlaybackStatus,
} from '../lib/cameraPlaybackStatus';

interface Props {
  src: string;
  fallbackSrc?: string;
  className?: string;
  loadTimeoutMs?: number;
  onError?: () => void;
  onReady?: () => void;
  onStatusChange?: (status: CameraPlaybackStatus) => void;
}

const DEFAULT_LOAD_TIMEOUT_MS = 18000;
const PROXY_TIMEOUT_MS = 12000;
const DIRECT_TIMEOUT_MS = 12000;
const MODOT_TIMEOUT_MS = 9000;

function timeoutForUrl(url: string, loadTimeoutMs: number) {
  if (url.startsWith('/api/')) return Math.min(loadTimeoutMs, PROXY_TIMEOUT_MS);
  if (isModotRtplexUrl(url)) return Math.min(loadTimeoutMs, MODOT_TIMEOUT_MS);
  return loadTimeoutMs;
}

/**
 * Mount video outside React's tree so player teardown cannot trigger removeChild
 * conflicts during Leaflet popup updates.
 */
export function CameraPreviewVideo({
  src,
  fallbackSrc,
  className = 'camera-preview-video',
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS,
  onError,
  onReady,
  onStatusChange,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const onStatusRef = useRef(onStatusChange);
  onErrorRef.current = onError;
  onReadyRef.current = onReady;
  onStatusRef.current = onStatusChange;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const host = hostRef.current;
    const sources = hlsPreviewSources(src, fallbackSrc);
    if (!host || !sources.length) return;

    let cancelled = false;
    let settled = false;
    let sourceIndex = 0;
    let hls: Hls | null = null;
    let video: HTMLVideoElement | null = null;
    let loadTimer = 0;
    let readyPoll = 0;
    let startedAt = 0;
    const failures: string[] = [];

    const publishStatus = (patch: Partial<CameraPlaybackStatus>) => {
      if (cancelled) return;
      const currentSrc = sources[Math.min(sourceIndex, sources.length - 1)] || src;
      const displayIndex = Math.min(sourceIndex + 1, sources.length);
      onStatusRef.current?.({
        phase: patch.phase ?? 'loading',
        sourceIndex: displayIndex,
        sourceCount: sources.length,
        sourceLabel: patch.sourceLabel ?? describePlaybackSource(currentSrc),
        player: patch.player ?? playerForSource(currentSrc),
        detail: patch.detail,
        failures: patch.failures ?? [...failures],
      });
    };

    publishStatus({
      phase: 'loading',
      sourceLabel: describePlaybackSource(sources[0]),
      player: playerForSource(sources[0]),
      detail: `Trying ${sources.length} source${sources.length === 1 ? '' : 's'}…`,
      failures: [],
    });

    const clearLoadTimer = () => {
      if (loadTimer) window.clearTimeout(loadTimer);
      loadTimer = 0;
    };

    const clearReadyPoll = () => {
      if (readyPoll) window.clearInterval(readyPoll);
      readyPoll = 0;
    };

    const markReady = () => {
      if (cancelled || settled) return;
      settled = true;
      clearLoadTimer();
      clearReadyPoll();
      video?.classList.remove('is-loading');
      video?.classList.add('is-playing');
      setReady(true);
      publishStatus({ phase: 'playing', detail: undefined });
      onReadyRef.current?.();
    };

    const recordFailure = (reason: string) => {
      const currentSrc = sources[sourceIndex];
      const label = describePlaybackSource(currentSrc);
      const elapsed = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0;
      const line = `${label}: ${reason}${elapsed ? ` (${elapsed}s)` : ''}`;
      failures.push(line);
      return line;
    };

    const fail = (reason = 'Timed out waiting for video') => {
      if (cancelled || settled) return;
      recordFailure(reason);
      sourceIndex += 1;
      if (sourceIndex < sources.length) {
        const next = sources[sourceIndex];
        publishStatus({
          phase: 'loading',
          sourceLabel: describePlaybackSource(next),
          player: playerForSource(next),
          detail: reason,
          failures: [...failures],
        });
        startSource(next);
        return;
      }
      settled = true;
      clearLoadTimer();
      clearReadyPoll();
      publishStatus({
        phase: 'failed',
        detail: failures[failures.length - 1] || reason,
        failures: [...failures],
      });
      onErrorRef.current?.();
    };

    const armLoadTimer = (currentSrc: string) => {
      clearLoadTimer();
      const ms = timeoutForUrl(currentSrc, loadTimeoutMs);
      loadTimer = window.setTimeout(
        () => fail(`Timed out after ${Math.round(ms / 1000)}s`),
        ms
      );
    };

    const armReadyPoll = () => {
      clearReadyPoll();
      readyPoll = window.setInterval(() => {
        if (cancelled || settled) return;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          markReady();
        }
      }, 300);
    };

    const teardownStream = () => {
      clearLoadTimer();
      clearReadyPoll();
      hls?.destroy();
      hls = null;
      video = null;
      host.replaceChildren();
    };

    const mountVideo = () => {
      const el = document.createElement('video');
      el.className = `${className} is-loading`;
      el.muted = true;
      el.playsInline = true;
      el.autoplay = true;
      el.controls = false;
      el.preload = 'auto';
      host.replaceChildren(el);
      video = el;
      return el;
    };

    const attachHlsJs = (currentSrc: string) => {
      teardownStream();
      startedAt = Date.now();
      const modotStream =
        isModotRtplexUrl(currentSrc) ||
        isModotRtplexUrl(
          currentSrc.startsWith('/api/live/camera-hls?')
            ? (() => {
                try {
                  const raw = new URL(currentSrc, 'http://localhost').searchParams.get('url');
                  return raw ? decodeURIComponent(raw) : '';
                } catch {
                  return '';
                }
              })()
            : ''
        );
      publishStatus({
        sourceLabel: describePlaybackSource(currentSrc),
        player: 'hls.js',
        detail: modotStream
          ? 'MoDOT HLS (browser + Traveler referer)…'
          : currentSrc.startsWith('/api/')
            ? 'Fetching manifest via app proxy…'
            : 'HLS.js direct…',
      });
      const el = mountVideo();

      if (!Hls.isSupported()) {
        fail('HLS.js not supported in this browser');
        return;
      }

      if (currentSrc.startsWith('/api/')) {
        el.crossOrigin = 'anonymous';
      } else {
        el.removeAttribute('crossorigin');
      }

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 10,
        manifestLoadingTimeOut: timeoutForUrl(currentSrc, loadTimeoutMs),
        manifestLoadingMaxRetry: 1,
        levelLoadingTimeOut: timeoutForUrl(currentSrc, loadTimeoutMs),
        levelLoadingMaxRetry: 1,
        fragLoadingTimeOut: timeoutForUrl(currentSrc, loadTimeoutMs),
        fragLoadingMaxRetry: 1,
        xhrSetup: (xhr, url) => {
          const referer = hlsRefererForUrl(url);
          if (referer) xhr.setRequestHeader('Referer', referer);
          else if (modotStream) xhr.setRequestHeader('Referer', MODOT_REFERER);
        },
      });

      const onFrame = () => markReady();
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        publishStatus({ detail: 'Manifest OK — buffering…' });
        void el.play().catch(() => {
          /* wait for buffer */
        });
      });
      hls.on(Hls.Events.FRAG_BUFFERED, onFrame);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || cancelled) return;
        fail(formatHlsError(data));
      });
      el.onplaying = onFrame;
      el.onloadeddata = onFrame;
      el.oncanplay = onFrame;
      el.onerror = () => {
        if (cancelled) return;
        fail('Video element error');
      };

      hls.loadSource(currentSrc);
      armLoadTimer(currentSrc);
      armReadyPoll();
    };

    const startSource = (currentSrc: string) => {
      settled = false;
      startedAt = Date.now();
      attachHlsJs(currentSrc);
    };

    startSource(sources[0]);

    return () => {
      cancelled = true;
      settled = true;
      teardownStream();
      onStatusRef.current?.(emptyPlaybackStatus());
    };
  }, [src, fallbackSrc, loadTimeoutMs, className]);

  return (
    <div
      ref={hostRef}
      className={`camera-preview-video-host${ready ? ' is-playing' : ' is-loading'}`}
    />
  );
}
