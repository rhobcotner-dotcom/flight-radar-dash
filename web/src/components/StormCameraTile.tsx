import { memo } from 'react';
import { isLiveStormCamera, type StormCamera } from '../lib/stormCellCameras';
import type { TrafficCamera } from '../lib/mapLayers';
import { CameraMapLivePreview } from './CameraMapLivePreview';
import { CameraMapSnapshot } from './CameraMapSnapshot';

/** Storm briefing always tries live HLS/YouTube first; snapshots are last resort. */
export const StormCameraTile = memo(function StormCameraTile({
  cam,
  onGiveUp,
}: {
  cam: StormCamera;
  onGiveUp: () => void;
}) {
  if (!cam.liveUrl) {
    return (
      <div className="storm-analysis-cam">
        <div className="storm-analysis-cam-label muted">{cam.description}</div>
        <div className="storm-analysis-cam-media">
          <div className="storm-analysis-cam-video camera-preview-unavailable muted">
            No feed for this camera
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="storm-analysis-cam">
      <div className="storm-analysis-cam-label muted">{cam.description}</div>
      <div className="storm-analysis-cam-media">
        {isLiveStormCamera(cam) ? (
          <CameraMapLivePreview
            cam={cam as TrafficCamera}
            liveOnly
            streamReason="storm"
            onGiveUp={onGiveUp}
          />
        ) : (
          <CameraMapSnapshot
            cam={cam as TrafficCamera}
            className="camera-preview-video"
            loadingLabel="Loading view…"
            onGiveUp={onGiveUp}
          />
        )}
      </div>
    </div>
  );
});
