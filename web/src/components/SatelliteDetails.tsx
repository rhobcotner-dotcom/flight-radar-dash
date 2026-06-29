import type { Satellite } from '../types';
import { formatAzimuth } from '../lib/satelliteUtils';
import { formatOccupancyLine } from '../lib/occupancyUtils';

interface Props {
  satellite: Satellite;
  compact?: boolean;
}

export function SatelliteDetails({ satellite, compact = false }: Props) {
  const className = compact ? 'satellite-details compact' : 'satellite-details';

  return (
    <div className={className}>
      <div className="carrier-line">{satellite.group || 'Satellite'}</div>
      <strong>{satellite.name}</strong>
      <div className="route-block-prominent">
        <div className="route-cities">
          {satellite.elevationDeg}° elevation · {formatAzimuth(satellite.azimuthDeg)}
        </div>
        <div className="route-codes muted">
          NORAD {satellite.noradId}
          {satellite.altitudeKm ? ` · ${satellite.altitudeKm.toLocaleString()} km alt` : ''}
          {satellite.rangeKm ? ` · ${satellite.rangeKm.toLocaleString()} km range` : ''}
        </div>
      </div>
      {satellite.velocityKmh ? (
        <div className="muted">
          {satellite.velocityKmh.toLocaleString()} km/h · TLE + SGP4
        </div>
      ) : (
        <div className="muted">Positions from TLE + SGP4</div>
      )}
      <div className="muted">
        Ground track {satellite.lat.toFixed(2)}°, {satellite.lon.toFixed(2)}°
      </div>
      {satellite.occupancyLabel ? (
        <div className="muted">{formatOccupancyLine(satellite)?.value || satellite.occupancyLabel}</div>
      ) : null}
    </div>
  );
}
