import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  className?: string;
  onError?: () => void;
  onReady?: () => void;
}

const PREVIEW_LOAD_TIMEOUT_MS = 12000;

export function CameraPreviewVideo({ src, className = 'camera-preview-video', onError, onReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  onErrorRef.current = onError;
  onReadyRef.current = onReady;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const video = videoRef.current;
    if (!video || !src) return;

    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      onErrorRef.current?.();
    };
    const markReady = () => {
      if (settled) return;
      settled = true;
      setReady(true);
      onReadyRef.current?.();
    };

    const loadTimer = window.setTimeout(fail, PREVIEW_LOAD_TIMEOUT_MS);

    const clearLoadTimer = () => {
      window.clearTimeout(loadTimer);
    };

    const onPlaying = () => {
      clearLoadTimer();
      markReady();
    };

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.onerror = () => {
        clearLoadTimer();
        fail();
      };
      video.onplaying = onPlaying;
      void video.play().catch(() => {
        clearLoadTimer();
        fail();
      });
      return () => {
        clearLoadTimer();
        video.onerror = null;
        video.onplaying = null;
        video.removeAttribute('src');
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      clearLoadTimer();
      fail();
      return undefined;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: 4,
      maxMaxBufferLength: 8,
      maxBufferSize: 8 * 1000 * 1000,
      manifestLoadingTimeOut: 8000,
      manifestLoadingMaxRetry: 2,
      levelLoadingTimeOut: 8000,
      levelLoadingMaxRetry: 2,
      fragLoadingTimeOut: 8000,
      fragLoadingMaxRetry: 2,
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void video.play().catch(() => {
        clearLoadTimer();
        fail();
      });
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        clearLoadTimer();
        fail();
      }
    });
    video.onerror = () => {
      clearLoadTimer();
      fail();
    };
    video.onplaying = onPlaying;

    return () => {
      clearLoadTimer();
      video.onerror = null;
      video.onplaying = null;
      hls.destroy();
    };
  }, [src]);

  return (
    <video
      ref={videoRef}
      className={`${className}${ready ? ' is-playing' : ' is-loading'}`}
      muted
      autoPlay
      playsInline
      controls={false}
      preload="auto"
      crossOrigin="anonymous"
    />
  );
}
