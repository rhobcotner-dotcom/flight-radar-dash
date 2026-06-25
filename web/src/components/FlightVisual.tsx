import { useEffect, useState } from 'react';
import type { Flight } from '../types';
import { carrierName } from '../lib/airlineNames';
import { aircraftSpriteSheet, aircraftTypeSpritePosition } from '../lib/aircraftSprites';
import { aircraftImageCandidates, flightLabel, type AircraftVisualCandidate } from '../lib/flightUtils';

interface Props {
  flight: Flight;
  size?: 'sm' | 'md' | 'lg';
  showCaption?: boolean;
}

function PlanePlaceholder({ flight, size }: { flight: Flight; size: Props['size'] }) {
  return (
    <div className={`flight-visual-placeholder size-${size || 'md'}`} aria-hidden="true">
      <svg viewBox="0 0 120 48" className="plane-silhouette">
        <path
          d="M60 24 L20 28 L8 34 L14 24 L8 14 L20 20 Z M60 24 L100 28 L112 34 L106 24 L112 14 L100 20 Z M52 24 L48 8 L56 8 Z"
          fill="currentColor"
        />
      </svg>
      <span>{flight.type || 'Aircraft'}</span>
    </div>
  );
}

function AircraftTypeSprite({
  type,
  size,
  flight,
  onMissing,
}: {
  type: string;
  size: Props['size'];
  flight: Flight;
  onMissing: () => void;
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const sheet = aircraftSpriteSheet();

  useEffect(() => {
    let active = true;
    aircraftTypeSpritePosition(type)
      .then((pos) => {
        if (!active) return;
        if (pos) setPosition(pos);
        else onMissing();
      })
      .catch(() => {
        if (active) onMissing();
      });
    return () => {
      active = false;
    };
  }, [type, onMissing]);

  if (!position) {
    return <PlanePlaceholder flight={flight} size={size} />;
  }

  return (
    <div
      className={`flight-visual-sprite size-${size || 'md'}`}
      style={{
        backgroundImage: `url(${sheet.url})`,
        backgroundPosition: `-${position.x}px -${position.y}px`,
        backgroundSize: `${sheet.width}px ${sheet.height}px`,
      }}
      aria-hidden="true"
    />
  );
}

function candidateCaption(flight: Flight, candidate: AircraftVisualCandidate) {
  if (candidate.kind === 'photo') {
    return `${flight.reg || flightLabel(flight)}${flight.type ? ` · ${flight.type}` : ''}`;
  }
  if (candidate.kind === 'logo') {
    return carrierName(flight);
  }
  if (candidate.kind === 'livery-photo') {
    return candidate.label;
  }
  if (candidate.kind === 'type-photo') {
    return candidate.label;
  }
  return `${candidate.type} silhouette`;
}

function FlightVisualImage({
  flight,
  candidates,
  size,
  showCaption,
}: {
  flight: Flight;
  candidates: AircraftVisualCandidate[];
  size: Props['size'];
  showCaption: boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = candidates[index];

  if (!current) {
    return (
      <div className={`flight-visual size-${size}`}>
        <PlanePlaceholder flight={flight} size={size} />
        {showCaption ? <div className="flight-visual-caption">{flightLabel(flight)}</div> : null}
      </div>
    );
  }

  const caption = candidateCaption(flight, current);

  if (current.kind === 'type-sprite') {
    return (
      <div className={`flight-visual size-${size} kind-type`}>
        <AircraftTypeSprite
          type={current.type}
          size={size}
          flight={flight}
          onMissing={() => setIndex((i) => i + 1)}
        />
        {showCaption ? <div className="flight-visual-caption">{caption}</div> : null}
      </div>
    );
  }

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

export function FlightVisual({ flight, size = 'md', showCaption = true }: Props) {
  const candidates = aircraftImageCandidates(flight);

  if (candidates.length === 0) {
    return (
      <div className={`flight-visual size-${size}`}>
        <PlanePlaceholder flight={flight} size={size} />
        {showCaption ? <div className="flight-visual-caption">{flightLabel(flight)}</div> : null}
      </div>
    );
  }

  return (
    <FlightVisualImage
      key={flight.fr24_id || flight.hex || flight.reg || flight.type}
      flight={flight}
      candidates={candidates}
      size={size}
      showCaption={showCaption}
    />
  );
}
