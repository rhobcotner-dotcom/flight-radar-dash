import type { Flight, Train } from '../types';
import { FlightDetails } from './FlightDetails';
import { TrainDetails } from './TrainDetails';

interface Props {
  flight: Flight | null;
  train: Train | null;
}

export function SelectionPreview({ flight, train }: Props) {
  const active = Boolean(flight || train);

  return (
    <div className={`selection-preview${active ? ' selection-preview-active' : ''}`}>
      {flight ? (
        <FlightDetails flight={flight} compact showVisual={false} />
      ) : train ? (
        <TrainDetails train={train} compact />
      ) : (
        <p className="selection-preview-empty muted">Hover a track on the map or in the list.</p>
      )}
    </div>
  );
}
