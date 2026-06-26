import { memo } from 'react';
import { Popup } from 'react-leaflet';
import type { StormAnalysis } from '../lib/stormCellCameras';
import { StormBriefingPanel } from './StormBriefingPanel';

interface Props {
  position: [number, number];
  analysis: StormAnalysis;
  onClose: () => void;
}

export const StormBriefingPopup = memo(function StormBriefingPopup({ position, analysis, onClose }: Props) {
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
      <StormBriefingPanel analysis={analysis} />
    </Popup>
  );
});
