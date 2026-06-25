import { useState } from 'react';
import type { AisVessel } from '../lib/mapLayers';
import { vesselImageCandidates, vesselTypeLabel, type VesselVisualCandidate } from '../lib/vesselUtils';

interface Props {
  vessel: AisVessel;
  size?: 'sm' | 'md' | 'lg';
  showCaption?: boolean;
}

function ShipPlaceholder({ vessel, size }: { vessel: AisVessel; size: Props['size'] }) {
  return (
    <div className={`flight-visual-placeholder size-${size || 'md'}`} aria-hidden="true">
      <svg viewBox="0 0 120 48" className="ship-silhouette">
        <path
          d="M8 32 L20 28 L28 18 L92 18 L100 28 L112 32 L8 32 Z M36 18 L44 8 L76 8 L84 18 Z"
          fill="currentColor"
        />
      </svg>
      <span>{vesselTypeLabel(vessel)}</span>
    </div>
  );
}

function candidateCaption(vessel: AisVessel, candidate: VesselVisualCandidate) {
  if (candidate.kind === 'photo') {
    return candidate.label || vessel.name;
  }
  return candidate.label || vesselTypeLabel(vessel);
}

function VesselVisualImage({
  vessel,
  candidates,
  size,
  showCaption,
}: {
  vessel: AisVessel;
  candidates: VesselVisualCandidate[];
  size: Props['size'];
  showCaption: boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = candidates[index];

  if (!current) {
    return (
      <div className={`flight-visual size-${size}`}>
        <ShipPlaceholder vessel={vessel} size={size} />
        {showCaption ? <div className="flight-visual-caption">{vessel.name}</div> : null}
      </div>
    );
  }

  const caption = candidateCaption(vessel, current);

  return (
    <div className={`flight-visual size-${size} kind-${current.kind}`}>
      <img
        src={current.url}
        alt={caption}
        loading="lazy"
        onError={() => setIndex((i) => i + 1)}
      />
      {showCaption ? <div className="flight-visual-caption">{caption}</div> : null}
    </div>
  );
}

export function VesselVisual({ vessel, size = 'md', showCaption = true }: Props) {
  const candidates = vesselImageCandidates(vessel);

  if (candidates.length === 0) {
    return (
      <div className={`flight-visual size-${size}`}>
        <ShipPlaceholder vessel={vessel} size={size} />
        {showCaption ? <div className="flight-visual-caption">{vessel.name}</div> : null}
      </div>
    );
  }

  return (
    <VesselVisualImage
      key={vessel.mmsi}
      vessel={vessel}
      candidates={candidates}
      size={size}
      showCaption={showCaption}
    />
  );
}
