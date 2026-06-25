import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';

interface Props {
  src: string;
  className?: string;
  onError?: () => void;
  onReady?: () => void;
}

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

    const fail = () => onErrorRef.current?.();
    const markReady = () => {
      setReady(true);
      onReadyRef.current?.();
    };

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.onerror = fail;
      video.onloadeddata = markReady;
      void video.play().catch(fail);
      return () => {
        video.onerror = null;
        video.onloadeddata = null;
        video.removeAttribute('src');
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      fail();
      return undefined;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      maxBufferLength: 10,
      maxMaxBufferLength: 16,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 4,
    });
    hls.loadSource(src);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void video.play().catch(fail);
    });
    hls.on(Hls.Events.FRAG_BUFFERED, markReady);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) fail();
    });
    video.onerror = fail;

    return () => {
      video.onerror = null;
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
