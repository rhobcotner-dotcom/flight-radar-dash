import type { TrackingStatsPayload } from '../hooks/useTrackingStats';

interface Props {
  stats: TrackingStatsPayload | null;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

export function TrackingBanner({ stats }: Props) {
  if (!stats) return null;

  const warming = stats.partial?.cameras;

  return (
    <div className="map-tracking-banner" aria-live="polite">
      <span className="map-tracking-banner-label">Tracking</span>
      <span>{formatCount(stats.flights)} flights</span>
      <span className="map-tracking-banner-sep" aria-hidden="true">
        ·
      </span>
      <span>
        {formatCount(stats.cameras)} cams{warming ? '+' : ''}
      </span>
      <span className="map-tracking-banner-sep" aria-hidden="true">
        ·
      </span>
      <span>{formatCount(stats.boats)} boats</span>
      <span className="map-tracking-banner-sep" aria-hidden="true">
        ·
      </span>
      <span>{formatCount(stats.trains)} trains</span>
      <span className="map-tracking-banner-scope">nationwide</span>
    </div>
  );
}
