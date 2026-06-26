import { memo } from 'react';
import type { StormAnalysis } from '../lib/stormCellCameras';
import { STORM_CAM_LIMIT } from '../lib/stormCellCameras';
import { StormCameraGrid } from './StormCameraGrid';

export const StormBriefingPanel = memo(function StormBriefingPanel({
  analysis,
  locationLabel,
}: {
  analysis: StormAnalysis;
  locationLabel?: string | null;
}) {
  const loading = analysis.loading || !analysis.radar;
  const radar = analysis.radar;
  const motion = analysis.motion;
  const hazards = analysis.hazards;
  const title = loading
    ? 'Analyzing storm cell…'
    : analysis.summary?.split('.')[0] ||
      `${radar!.intensityLabel.charAt(0).toUpperCase()}${radar!.intensityLabel.slice(1)}`;

  const meta = loading
    ? null
    : [
        `Peak ${radar!.peakDbz} dBZ`,
        `~${radar!.approxDiameterMiles} mi wide`,
        motion?.directionLabel && motion?.speedMph
          ? `${motion.directionLabel} ~${motion.speedMph} mph`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

  const showCameras =
    Boolean(analysis.cameraPool?.length) ||
    Boolean(analysis.camerasLoading) ||
    Boolean(loading && analysis.hasStorm);

  const pool = analysis.cameraPool ?? analysis.cameras ?? [];

  return (
    <div className="storm-analysis-popup">
      {locationLabel ? <div className="map-popup-location">{locationLabel}</div> : null}
      <div className="storm-analysis-kicker">Storm cell briefing</div>
      <strong className="storm-analysis-title">{title}</strong>
      {meta ? <div className="storm-analysis-meta muted">{meta}</div> : null}
      {!loading && hazards?.alerts?.[0] ? (
        <div className="storm-analysis-alert">{hazards.alerts[0].headline}</div>
      ) : null}
      {!loading && analysis.brief ? <p className="storm-analysis-brief">{analysis.brief}</p> : null}
      {!loading && analysis.hazardLine ? (
        <p className="storm-analysis-hazards muted">{analysis.hazardLine}</p>
      ) : null}
      {showCameras ? (
        <div className="storm-analysis-cameras">
          <h4 className="storm-analysis-cameras-title">Live views near this cell</h4>
          {pool.length ? (
            <StormCameraGrid pool={pool} />
          ) : (
            <div className="storm-analysis-camera-grid">
              {Array.from({ length: STORM_CAM_LIMIT }, (_, index) => (
                <div key={`cam-loading-${index}`} className="storm-analysis-cam">
                  <div className="storm-analysis-cam-label muted">Scanning nearby cameras…</div>
                  <div className="storm-analysis-cam-video camera-preview-media">
                    <div className="camera-preview-loading muted">
                    {analysis.camerasLoading ? 'Finding live views…' : 'Finding a working view…'}
                  </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {!loading && analysis.disclaimer ? (
        <div className="storm-analysis-disclaimer muted">{analysis.disclaimer}</div>
      ) : null}
    </div>
  );
});
