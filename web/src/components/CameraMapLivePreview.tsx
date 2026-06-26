import { useEffect, useState } from 'react';
import type { TrafficCamera } from '../lib/mapLayers';
import {
  cameraUsesModotRtplexStream,
  modotTravelerCameraHref,
} from '../lib/cameraSnapshot';
import { probeModotRtplexStream } from '../lib/modotRtplexProbe';
import { useCameraStreamScheduler } from '../hooks/useCameraStreamScheduler';
import { CameraMapSnapshot } from './CameraMapSnapshot';
import { CameraPreviewMedia } from './CameraPreviewMedia';
import { ModotCameraOffline } from './ModotCameraOffline';

interface Props {
  cam: TrafficCamera;
  /** Never fall back to map snapshot tiles — used in storm briefing. */
  liveOnly?: boolean;
  /** Rotate to another camera when live playback is exhausted. */
  onGiveUp?: () => void;
  /** Stream scheduler priority — storm briefing preempts map hovers. */
  streamReason?: 'storm' | 'popup';
}

export function CameraMapLivePreview({
  cam,
  liveOnly = false,
  onGiveUp,
  streamReason = 'popup',
}: Props) {
  const { requestStream, releaseStream, isStreamAllowed } = useCameraStreamScheduler();
  const needsStreamSlot =
    streamReason !== 'storm' && (cam.mediaType === 'hls' || cam.mediaType === 'youtube');
  const streamAllowed =
    streamReason === 'storm' || !needsStreamSlot || isStreamAllowed(cam.id);
  const modotRtplex = cameraUsesModotRtplexStream(cam);
  const modotHref = modotTravelerCameraHref(cam);
  const [modotReachable, setModotReachable] = useState<boolean | null>(
    modotRtplex ? null : true
  );

  useEffect(() => {
    if (!modotRtplex) return undefined;
    const source = cam.sourceLiveUrl || cam.liveUrl;
    if (!source?.includes('rtplive')) return undefined;
    let cancelled = false;
    void probeModotRtplexStream(source).then((ok) => {
      if (!cancelled) setModotReachable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [modotRtplex, cam.sourceLiveUrl, cam.liveUrl, cam.id]);

  useEffect(() => {
    if (!needsStreamSlot) return undefined;
    requestStream(cam.id, cam.lat, cam.lon, streamReason);
    return () => releaseStream(cam.id);
  }, [needsStreamSlot, cam.id, cam.lat, cam.lon, requestStream, releaseStream, streamReason]);

  useEffect(() => {
    if (streamReason === 'storm') return undefined;
    return () => releaseStream(cam.id);
  }, [cam.id, releaseStream, streamReason]);

  if (!cam.liveUrl || cam.mediaType === 'snapshot') {
    if (liveOnly) {
      return <div className="camera-preview-unavailable muted">No live stream for this camera</div>;
    }
    return (
      <CameraMapSnapshot
        cam={cam}
        className="camera-preview-video"
        loadingLabel="Loading snapshot…"
      />
    );
  }

  if (needsStreamSlot && !streamAllowed) {
    return <div className="camera-preview-loading muted">Starting live stream…</div>;
  }

  if (modotRtplex && modotReachable === null) {
    return <ModotCameraOffline cam={cam} href={modotHref} checking />;
  }

  if (modotRtplex && modotReachable === false) {
    if (liveOnly && onGiveUp) {
      return <ModotCameraOffline cam={cam} href={modotHref} onSkip={onGiveUp} />;
    }
    return <ModotCameraOffline cam={cam} href={modotHref} />;
  }

  const modotFallback = modotRtplex || /modot/i.test(cam.source || '') ? modotHref : undefined;

  return (
    <CameraPreviewMedia
      key={`${cam.id}-popup-live`}
      liveUrl={cam.liveUrl}
      sourceLiveUrl={cam.sourceLiveUrl}
      mediaType={cam.mediaType}
      className="camera-preview-video"
      loadTimeoutMs={modotRtplex ? 9000 : cam.mediaType === 'hls' ? (streamReason === 'storm' ? 9000 : 14000) : undefined}
      keepTrying={liveOnly ? true : !modotRtplex}
      persistentPreview={liveOnly || Boolean(onGiveUp)}
      loadingLabel={liveOnly ? 'Loading live view…' : undefined}
      modotFallbackHref={modotFallback}
      onGiveUp={onGiveUp}
    />
  );
}
