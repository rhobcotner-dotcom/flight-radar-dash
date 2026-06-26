import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import { hlsPreviewSources, isModotRtplexUrl } from '../lib/cameraPlayback';
import {
  cameraFrameCacheKey,
  getCachedCameraFrame,
  setCachedCameraFrame,
} from '../lib/cameraFrameCache';

interface Props {
  camId: string;
  liveUrl: string;
  sourceLiveUrl?: string;
  className?: string;
  loadingLabel?: string;
  onFailed?: () => void;
  /** Map hovers skip slow app-proxy attempts; storm fallbacks try everything. */
  directOnly?: boolean;
  maxSources?: number;
  perSourceTimeoutMs?: number;
}

const CAPTURE_TIMEOUT_MS = 16000;
const PROXY_TIMEOUT_MS = 14000;
const MODOT_TIMEOUT_MS = 16000;

function captureVideoFrame(video: HTMLVideoElement) {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  try {
    return canvas.toDataURL('image/jpeg', 0.84);
  } catch {
    return null;
  }
}

function timeoutForUrl(url: string, perSourceTimeoutMs?: number) {
  const base = perSourceTimeoutMs ?? CAPTURE_TIMEOUT_MS;
  if (url.startsWith('/api/')) return Math.min(base, PROXY_TIMEOUT_MS);
  if (isModotRtplexUrl(url)) return Math.min(base, MODOT_TIMEOUT_MS);
  return base;
}

export function CameraHlsFrameCapture({
  camId,
  liveUrl,
  sourceLiveUrl,
  className = 'camera-preview-image',
  loadingLabel = 'Capturing frame…',
  onFailed,
  directOnly = true,
  maxSources,
  perSourceTimeoutMs,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cacheKey = cameraFrameCacheKey(camId, sourceLiveUrl || liveUrl);
  const [dataUrl, setDataUrl] = useState<string | null>(() => getCachedCameraFrame(cacheKey));
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(!getCachedCameraFrame(cacheKey));

  useEffect(() => {
    if (dataUrl) {
      setLoading(false);
      return undefined;
    }

    const host = hostRef.current;
    let sources = hlsPreviewSources(liveUrl, sourceLiveUrl);
    if (directOnly) {
      sources = sources.filter((url) => !url.startsWith('/api/'));
    }
    if (maxSources && maxSources > 0) {
      sources = sources.slice(0, maxSources);
    }
    if (!host || !sources.length) {
      setFailed(true);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    let settled = false;
    let sourceIndex = 0;
    let hls: Hls | null = null;
    let player: Player | null = null;
    let video: HTMLVideoElement | null = null;
    let loadTimer = 0;
    let readyPoll = 0;

    const clearLoadTimer = () => {
      if (loadTimer) window.clearTimeout(loadTimer);
      loadTimer = 0;
    };

    const clearReadyPoll = () => {
      if (readyPoll) window.clearInterval(readyPoll);
      readyPoll = 0;
    };

    const teardown = () => {
      clearLoadTimer();
      clearReadyPoll();
      if (player && !player.isDisposed()) {
        player.dispose();
      }
      player = null;
      hls?.destroy();
      hls = null;
      video = null;
      host.replaceChildren();
    };

    const finishCapture = (frame: string | null) => {
      if (cancelled || settled) return;
      settled = true;
      teardown();
      if (frame) {
        setCachedCameraFrame(cacheKey, frame);
        setDataUrl(frame);
        setLoading(false);
        return;
      }
      sourceIndex += 1;
      if (sourceIndex < sources.length) {
        settled = false;
        startSource(sources[sourceIndex]);
        return;
      }
      setFailed(true);
      setLoading(false);
      onFailed?.();
    };

    const tryCapture = () => {
      if (cancelled || settled) return;
      const active =
        player && !player.isDisposed()
          ? (player.tech(true)?.el() as HTMLVideoElement | undefined)
          : video;
      if (!active || active.readyState < 2 || active.videoWidth <= 0) return;
      const frame = captureVideoFrame(active);
      if (frame) finishCapture(frame);
    };

    const armLoadTimer = (currentSrc: string) => {
      clearLoadTimer();
      loadTimer = window.setTimeout(() => finishCapture(null), timeoutForUrl(currentSrc, perSourceTimeoutMs));
    };

    const armReadyPoll = () => {
      clearReadyPoll();
      readyPoll = window.setInterval(tryCapture, 250);
    };

    const mountVideo = (useVideoJsSkin: boolean) => {
      const el = document.createElement('video');
      el.className = useVideoJsSkin ? 'video-js vjs-default-skin' : '';
      el.muted = true;
      el.playsInline = true;
      el.autoplay = true;
      el.controls = false;
      el.preload = 'auto';
      host.replaceChildren(el);
      video = el;
      return el;
    };

    const attachVideoJs = (currentSrc: string) => {
      teardown();
      const el = mountVideo(true);
      player = videojs(el, {
        autoplay: 'muted',
        muted: true,
        controls: false,
        fluid: false,
        fill: true,
        liveui: false,
        preload: 'auto',
        html5: { vhs: { overrideNative: true, limitRenditionByPlayerDimensions: false } },
      });
      const onFrame = () => tryCapture();
      player.one('playing', onFrame);
      player.one('loadeddata', onFrame);
      player.one('canplay', onFrame);
      player.one('error', () => finishCapture(null));
      player.src({ src: currentSrc, type: 'application/x-mpegURL' });
      void player.play()?.catch(() => undefined);
      armLoadTimer(currentSrc);
      armReadyPoll();
    };

    const attachHlsJs = (currentSrc: string) => {
      teardown();
      const el = mountVideo(false);
      if (!Hls.isSupported()) {
        finishCapture(null);
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
        maxBufferLength: 8,
        manifestLoadingTimeOut: timeoutForUrl(currentSrc, perSourceTimeoutMs),
        manifestLoadingMaxRetry: 1,
        levelLoadingTimeOut: timeoutForUrl(currentSrc, perSourceTimeoutMs),
        levelLoadingMaxRetry: 1,
        fragLoadingTimeOut: timeoutForUrl(currentSrc, perSourceTimeoutMs),
        fragLoadingMaxRetry: 1,
      });
      const onFrame = () => tryCapture();
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void el.play().catch(() => undefined);
      });
      hls.on(Hls.Events.FRAG_BUFFERED, onFrame);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal && !cancelled) finishCapture(null);
      });
      el.onplaying = onFrame;
      el.onloadeddata = onFrame;
      el.oncanplay = onFrame;
      el.onerror = () => finishCapture(null);
      hls.loadSource(currentSrc);
      armLoadTimer(currentSrc);
      armReadyPoll();
    };

    const startSource = (currentSrc: string) => {
      if (!currentSrc.startsWith('/api/') && isModotRtplexUrl(currentSrc)) {
        attachVideoJs(currentSrc);
        return;
      }
      attachHlsJs(currentSrc);
    };

    startSource(sources[0]);

    return () => {
      cancelled = true;
      settled = true;
      teardown();
    };
  }, [cacheKey, dataUrl, directOnly, liveUrl, maxSources, onFailed, perSourceTimeoutMs, sourceLiveUrl]);

  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt=""
        className={`${className} camera-preview-image is-playing`}
      />
    );
  }

  if (failed) {
    return <div className="camera-preview-unavailable muted">Snapshot unavailable</div>;
  }

  return (
    <div className="camera-preview-media">
      {loading ? <div className="camera-preview-loading muted">{loadingLabel}</div> : null}
      <div ref={hostRef} className="camera-frame-capture-host" aria-hidden="true" />
    </div>
  );
}
