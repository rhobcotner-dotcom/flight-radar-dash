import { useEffect, useState } from 'react';
import { resolveMapPlaceLabel } from '../lib/mapLocation';

interface Props {
  lat: number;
  lon: number;
  className?: string;
}

export function MapLocationHeader({ lat, lon, className = 'map-popup-location' }: Props) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLabel(null);
    void resolveMapPlaceLabel(lat, lon)
      .then((place) => {
        if (!cancelled) setLabel(place.label);
      })
      .catch(() => {
        if (!cancelled) setLabel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (!label) return null;

  return <div className={className}>{label}</div>;
}
