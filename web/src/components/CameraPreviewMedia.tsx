import { useEffect, useState } from 'react';
import { CameraPreviewVideo } from './CameraPreviewVideo';

interface Props {
  liveUrl?: string;
  sourceLiveUrl?: string;
  mediaType?: 'hls' | 'snapshot' | 'youtube';
  className?: string;
}

export function CameraPreviewMedia({
  liveUrl,
  sourceLiveUrl,
  mediaType = 'hls',
  className = 'camera-preview-video',
}: Props) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(null);

  useEffect(() => {
    setFailed(false);
    setReady(false);
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
    return () => window.clearInterval(timer);
  }, [liveUrl, mediaType]);

  if (!liveUrl) return null;

  if (failed) {
    return (
      <div className="camera-preview-unavailable muted">
        {mediaType === 'snapshot' ? 'Camera image unavailable' : 'Live stream unavailable'}
      </div>
    );
  }

  if (mediaType === 'snapshot' && snapshotSrc) {
    return (
      <div className="camera-preview-media">
        {!ready ? <div className="camera-preview-loading muted">Loading camera…</div> : null}
        <img
          src={snapshotSrc}
          alt=""
          className={`${className} camera-preview-image${ready ? ' is-playing' : ' is-loading'}`}
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
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
          src={liveUrl}
          title="Rail camera live stream"
          className={`${className} camera-preview-youtube${ready ? ' is-playing' : ' is-loading'}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
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
      {!ready ? <div className="camera-preview-loading muted">Loading live stream…</div> : null}
      <CameraPreviewVideo
        src={liveUrl}
        className={className}
        onError={() => setFailed(true)}
        onReady={() => setReady(true)}
      />
    </div>
  );
}
