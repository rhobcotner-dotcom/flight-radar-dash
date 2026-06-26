import { useEffect, useRef, useState } from 'react';
import { CameraPreviewVideo } from './CameraPreviewVideo';
import { emptyPlaybackStatus, type CameraPlaybackStatus } from '../lib/cameraPlaybackStatus';

interface Props {
  liveUrl?: string;
  sourceLiveUrl?: string;
  mediaType?: 'hls' | 'snapshot' | 'youtube';
  className?: string;
  loadTimeoutMs?: number;
  keepTrying?: boolean;
  /** Keep loading UI instead of collapsing to "unavailable" (storm briefing). */
  persistentPreview?: boolean;
  /** Link shown when live playback fails (storm briefing). */
  modotFallbackHref?: string;
  /** Called once when all playback attempts for this tile are exhausted. */
  onGiveUp?: () => void;
  /** Override loading line (storm briefing avoids "Loading live stream…"). */
  loadingLabel?: string;
}

const SNAPSHOT_LOAD_TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 2500;
const MAX_RETRIES = 4;

export function CameraPreviewMedia({
  liveUrl,
  sourceLiveUrl,
  mediaType = 'hls',
  className = 'camera-preview-video',
  loadTimeoutMs,
  keepTrying = false,
  persistentPreview = false,
  modotFallbackHref,
  onGiveUp,
  loadingLabel,
}: Props) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [playbackStatus, setPlaybackStatus] = useState<CameraPlaybackStatus>(emptyPlaybackStatus);
  const [retrying, setRetrying] = useState(false);
  const retryTimerRef = useRef<number | null>(null);
  const snapshotFailTimerRef = useRef<number | null>(null);
  const snapshotReadyRef = useRef(false);
  const gaveUpRef = useRef(false);

  const markGiveUp = () => {
    if (gaveUpRef.current) return;
    gaveUpRef.current = true;
    onGiveUp?.();
  };

  const exhaustPlayback = () => {
    if (onGiveUp) {
      markGiveUp();
      return;
    }
    setFailed(true);
  };

  const clearSnapshotFailTimer = () => {
    if (snapshotFailTimerRef.current != null) {
      window.clearTimeout(snapshotFailTimerRef.current);
      snapshotFailTimerRef.current = null;
    }
  };

  useEffect(() => {
    setFailed(false);
    setReady(false);
    snapshotReadyRef.current = false;
    gaveUpRef.current = false;
    setRetrying(false);
    setPlaybackStatus(emptyPlaybackStatus());
    clearSnapshotFailTimer();
    if (!liveUrl || mediaType !== 'snapshot') {
      setSnapshotSrc(null);
      return undefined;
    }

    const refresh = () => {
      const join = liveUrl.includes('?') ? '&' : '?';
      setSnapshotSrc(`${liveUrl}${join}_=${Date.now()}`);
    };
    refresh();
    const timer = window.setInterval(refresh, 8000);
    snapshotFailTimerRef.current = window.setTimeout(() => {
      if (!snapshotReadyRef.current) exhaustPlayback();
    }, SNAPSHOT_LOAD_TIMEOUT_MS);
    return () => {
      window.clearInterval(timer);
      clearSnapshotFailTimer();
    };
  }, [liveUrl, mediaType, attempt]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  const scheduleRetry = () => {
    if (persistentPreview) {
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
      }
      setRetrying(true);
      setPlaybackStatus((current) => ({
        ...current,
        phase: 'retrying',
        detail: 'All sources failed — retrying in 4s…',
      }));
      retryTimerRef.current = window.setTimeout(() => {
        setFailed(false);
        setReady(false);
        setRetrying(false);
        setPlaybackStatus(emptyPlaybackStatus());
        setAttempt((value) => value + 1);
      }, 4000);
      return;
    }
    if (!keepTrying || attempt >= MAX_RETRIES) {
      exhaustPlayback();
      return;
    }
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
    }
    retryTimerRef.current = window.setTimeout(() => {
      setFailed(false);
      setReady(false);
      setAttempt((value) => value + 1);
    }, RETRY_DELAY_MS);
  };

  if (!liveUrl) return null;

  const streamSrc = liveUrl || sourceLiveUrl || '';

  if (failed && !keepTrying && !onGiveUp) {
    return (
      <div className="camera-preview-unavailable muted">
        {mediaType === 'snapshot' ? 'Camera image unavailable' : 'Live stream unavailable'}
      </div>
    );
  }

  if (failed && keepTrying && attempt >= MAX_RETRIES && !onGiveUp) {
    return (
      <div className="camera-preview-unavailable muted">
        {mediaType === 'snapshot' ? 'Camera image unavailable' : 'Live stream unavailable'}
      </div>
    );
  }

  const loadingText = loadingLabel || (mediaType === 'snapshot' ? 'Loading camera…' : 'Loading live stream…');

  if (mediaType === 'snapshot' && snapshotSrc) {
    return (
      <div className="camera-preview-media">
        {!ready ? <div className="camera-preview-loading muted">{loadingText}</div> : null}
        <img
          key={attempt}
          src={snapshotSrc}
          alt=""
          className={`${className} camera-preview-image${ready ? ' is-playing' : ' is-loading'}`}
          onLoad={() => {
            snapshotReadyRef.current = true;
            clearSnapshotFailTimer();
            setFailed(false);
            setReady(true);
          }}
          onError={scheduleRetry}
        />
      </div>
    );
  }

  if (mediaType === 'youtube') {
    const watchUrl = sourceLiveUrl || liveUrl;
    return (
      <div className="camera-preview-media">
        {!ready ? <div className="camera-preview-loading muted">Loading rail cam…</div> : null}
        <iframe
          key={attempt}
          src={liveUrl}
          title="Rail camera live stream"
          className={`${className} camera-preview-youtube${ready ? ' is-playing' : ' is-loading'}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onLoad={() => setReady(true)}
          onError={scheduleRetry}
        />
        {watchUrl ? (
          <a className="camera-preview-youtube-fallback" href={watchUrl} target="_blank" rel="noreferrer">
            Preview blocked? Open live on YouTube
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className="camera-preview-media">
      {!ready ? (
        <div className="camera-preview-loading">
          <div className="camera-preview-loading-title muted">
            {retrying ? 'Reconnecting…' : loadingText}
          </div>
          {playbackStatus.phase !== 'idle' ? (
            <div className="camera-preview-debug muted">
              <div className="camera-preview-debug-line">
                {playbackStatus.sourceCount > 0
                  ? `[${playbackStatus.sourceIndex}/${playbackStatus.sourceCount}] `
                  : null}
                {playbackStatus.sourceLabel}
                {playbackStatus.player !== 'none' ? ` · ${playbackStatus.player}` : null}
              </div>
              {playbackStatus.detail ? (
                <div className="camera-preview-debug-detail">{playbackStatus.detail}</div>
              ) : null}
              {playbackStatus.failures.length > 0 ? (
                <ul className="camera-preview-debug-failures">
                  {playbackStatus.failures.slice(-3).map((line, index) => (
                    <li key={`${index}-${line}`}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {modotFallbackHref ? (
            <a
              className="camera-preview-modot-fallback"
              href={modotFallbackHref}
              target="_blank"
              rel="noreferrer"
            >
              {playbackStatus.phase === 'failed' || playbackStatus.phase === 'retrying'
                ? 'MoDOT CDN offline — open Traveler map ↗'
                : 'Open on MoDOT Traveler while loading ↗'}
            </a>
          ) : null}
        </div>
      ) : null}
      <CameraPreviewVideo
        key={`${streamSrc}:${attempt}`}
        src={streamSrc}
        fallbackSrc={sourceLiveUrl && sourceLiveUrl !== streamSrc ? sourceLiveUrl : undefined}
        className={className}
        loadTimeoutMs={loadTimeoutMs}
        onError={scheduleRetry}
        onReady={() => setReady(true)}
        onStatusChange={setPlaybackStatus}
      />
    </div>
  );
}
