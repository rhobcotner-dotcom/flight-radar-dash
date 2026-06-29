import type { AisVessel } from '../lib/mapLayers';
import { formatOccupancyLine, occupancyDetailLabel } from '../lib/occupancyUtils';
import { vesselSizeLabel, vesselTypeLabel } from '../lib/vesselUtils';
import { VesselVisual } from './VesselVisual';

interface Props {
  vessel: AisVessel;
  compact?: boolean;
  showVisual?: boolean;
}

export function VesselDetails({ vessel, compact = false, showVisual = true }: Props) {
  const typeLabel = vesselTypeLabel(vessel);
  const sizeLabel = vesselSizeLabel(vessel);

  if (compact) {
    return (
      <div className="vessel-details compact">
        {showVisual ? <VesselVisual vessel={vessel} size="md" /> : null}
        <div className="vessel-type-line">{typeLabel}</div>
        <div className="vessel-details-head">
          <strong>{vessel.name}</strong>
        </div>
        <div className="muted">
          {sizeLabel} · MMSI {vessel.mmsi} · {vessel.distanceMiles} mi away
        </div>
        <div>
          {vessel.speedKnots ?? '—'} kn · course {vessel.course ?? '—'}°
        </div>
        {vessel.destination ? <div className="muted">→ {vessel.destination}</div> : null}
      </div>
    );
  }

  return (
    <div className="vessel-details">
      {showVisual ? <VesselVisual vessel={vessel} size="lg" /> : null}
      <div className="vessel-type-line">{typeLabel}</div>
      <div className="vessel-details-head">
        <strong>{vessel.name}</strong>
      </div>
      <dl className="vessel-meta">
        <div><dt>Type</dt><dd>{typeLabel}{vessel.lengthMeters != null ? ` · ${Math.round(vessel.lengthMeters)} m` : ''}</dd></div>
        <div><dt>MMSI</dt><dd>{vessel.mmsi}</dd></div>
        <div><dt>Speed</dt><dd>{vessel.speedKnots ?? '—'} kn · course {vessel.course ?? '—'}°</dd></div>
        {vessel.destination ? <div><dt>Destination</dt><dd>{vessel.destination}</dd></div> : null}
        {vessel.occupancyLabel ? (
          <div>
            <dt>{occupancyDetailLabel(vessel.occupancyKind)}</dt>
            <dd>{formatOccupancyLine(vessel)?.value || vessel.occupancyLabel}</dd>
          </div>
        ) : null}
        {vessel.draughtMeters != null ? (
          <div><dt>Draft</dt><dd>{vessel.draughtMeters.toFixed(1)} m</dd></div>
        ) : null}
        <div><dt>Distance</dt><dd>{vessel.distanceMiles.toFixed(1)} mi from you</dd></div>
        {vessel.sourceLabel ? <div><dt>Source</dt><dd>{vessel.sourceLabel}</dd></div> : null}
      </dl>
    </div>
  );
}
