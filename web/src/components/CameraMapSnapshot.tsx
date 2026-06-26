import { useEffect, useRef, useState } from 'react';
import type { TrafficCamera } from '../lib/mapLayers';
import {
  cameraCanFrameCapture,
  cameraMapPreviewMode,
  cameraStaticSnapshotUrl,
  isModotRtplexCamera,
} from '../lib/cameraSnapshot';
import { CameraHlsFrameCapture } from './CameraHlsFrameCapture';
import { CameraPreviewMedia } from './CameraPreviewMedia';

interface Props {
  cam: TrafficCamera;
  className?: string;
  loadingLabel?: string;
  /** Storm briefing: rotate to another camera when the still fails. */
  onGiveUp?: () => void;
}

export function CameraMapSnapshot({
  cam,
  className = 'camera-preview-image',
  loadingLabel = 'Loading snapshot…',
  onGiveUp,
}: Props) {
  const initialMode = cameraMapPreviewMode(cam);
  const [mode, setMode] = useState<'static' | 'capture' | 'failed'>(() => {
    if (initialMode === 'link') return 'failed';
    if (initialMode === 'capture') return 'capture';
    if (initialMode === 'static') return 'static';
    return 'failed';
  });
  const gaveUpRef = useRef(false);

  useEffect(() => {
    gaveUpRef.current = false;
  }, [cam.id]);

  useEffect(() => {
    if (!onGiveUp || gaveUpRef.current) return;
    const staticUrl = cameraStaticSnapshotUrl(cam);
    if (initialMode === 'link' || !staticUrl) {
      gaveUpRef.current = true;
      onGiveUp();
    }
  }, [cam, initialMode, onGiveUp]);

  if (initialMode === 'link') {
    if (onGiveUp) {
      return <div className="camera-preview-loading muted">Trying next camera…</div>;
    }
    return <div className="camera-preview-hover-hint muted">Click marker for live feed</div>;
  }

  if (mode === 'failed') {
    if (onGiveUp) {
      return <div className="camera-preview-loading muted">Trying next camera…</div>;
    }
    if (isModotRtplexCamera(cam)) {
      return <div className="camera-preview-hover-hint muted">Click marker for live feed</div>;
    }
    return <div className="camera-preview-unavailable muted">Snapshot unavailable</div>;
  }

  if (mode === 'capture') {
    return (
      <CameraHlsFrameCapture
        camId={cam.id}
        liveUrl={cam.liveUrl}
        sourceLiveUrl={cam.sourceLiveUrl}
        className={className}
        loadingLabel="Capturing frame…"
        maxSources={2}
        perSourceTimeoutMs={9000}
      />
    );
  }

  const staticUrl = cameraStaticSnapshotUrl(cam);
  if (!staticUrl) {
    if (onGiveUp) {
      return <div className="camera-preview-loading muted">Trying next camera…</div>;
    }
    return <div className="camera-preview-unavailable muted">Snapshot unavailable</div>;
  }

  return (
    <CameraPreviewMedia
      key={`${cam.id}-${staticUrl}`}
      liveUrl={staticUrl}
      sourceLiveUrl={cam.sourceLiveUrl}
      mediaType="snapshot"
      className={className}
      loadingLabel={loadingLabel}
      onGiveUp={
        onGiveUp ||
        (cameraCanFrameCapture(cam) ? () => setMode('capture') : () => setMode('failed'))
      }
    />
  );
}
