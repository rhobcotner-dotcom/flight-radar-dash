import { memo } from 'react';
import { Popup } from 'react-leaflet';
import type { StormAnalysis, StormCameraMode } from '../lib/stormCellCameras';
import { StormBriefingPanel } from './StormBriefingPanel';

interface Props {
  position: [number, number];
  analysis: StormAnalysis;
  locationLabel?: string | null;
  stormCameraMode?: StormCameraMode;
  onClose: () => void;
}

export const StormBriefingPopup = memo(function StormBriefingPopup({
  position,
  analysis,
  locationLabel,
  stormCameraMode = 'live-only',
  onClose,
}: Props) {
  return (
    <Popup
      position={position}
      className="storm-analysis-leaflet-popup"
      maxWidth={520}
      minWidth={320}
      closeOnClick={false}
      autoClose={false}
      keepInView={false}
      eventHandlers={{ remove: onClose }}
    >
      <StormBriefingPanel
        analysis={analysis}
        locationLabel={locationLabel}
        stormCameraMode={stormCameraMode}
      />
    </Popup>
  );
});
