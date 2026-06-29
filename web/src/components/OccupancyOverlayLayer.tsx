import { CircleMarker, Popup, Tooltip } from 'react-leaflet';
import type { PathOptions } from 'leaflet';
import {
  collectLocalOccupancyPoints,
  formatOccupancyLine,
  isRealOccupancySource,
  occupancyOverlayStyle,
  type OccupancyPoint,
} from '../lib/occupancyUtils';
import type { Flight, Train } from '../types';
import type {
  AisVesselPayload,
  EarthquakePayload,
  RiverGaugePayload,
  RoadConditionCollection,
} from '../lib/mapLayers';

function overlayRadius(level: number | null | undefined) {
  const value = Number(level);
  if (!Number.isFinite(value)) return 10;
  return 8 + Math.round((value / 100) * 10);
}

function formatPopup(point: OccupancyPoint) {
  const line = formatOccupancyLine(point);
  const real = point.real ?? isRealOccupancySource(point.source ?? point.occupancySource);
  return `
    <div class="occupancy-popup">
      <strong>${line?.value || point.label || 'Occupancy'}</strong>
      <div class="muted">${real ? 'Measured · agency feed' : 'Estimated · proxy signal'}</div>
      ${point.agency ? `<div class="muted">${point.agency}</div>` : ''}
    </div>
  `;
}

export function OccupancyOverlayLayer({
  points,
}: {
  points: OccupancyPoint[];
}) {
  if (!points.length) return null;

  return (
    <>
      {points.map((point) => {
        const style = occupancyOverlayStyle(point) as PathOptions;
        const level = point.level ?? point.occupancyLevel ?? 0;
        return (
          <CircleMarker
            key={point.id}
            center={[point.lat, point.lon]}
            radius={overlayRadius(level)}
            pathOptions={style}
          >
            <Tooltip direction="top" opacity={0.95} className="map-layer-tooltip">
              {formatOccupancyLine(point)?.value || point.label || `${level}%`}
            </Tooltip>
            <Popup maxWidth={280}>
              <div dangerouslySetInnerHTML={{ __html: formatPopup(point) }} />
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

export function buildOccupancyOverlayPoints(input: {
  apiPoints?: OccupancyPoint[];
  flights?: Flight[];
  trains?: Train[];
  vessels?: AisVesselPayload | null;
  rivers?: RiverGaugePayload | null;
  roads?: RoadConditionCollection | null;
  earthquakes?: EarthquakePayload | null;
  flightsEnabled?: boolean;
  railEnabled?: boolean;
  metroEnabled?: boolean;
}) {
  const seen = new Set<string>();
  const merged: OccupancyPoint[] = [];

  for (const point of input.apiPoints || []) {
    if (!point?.id || seen.has(point.id)) continue;
    seen.add(point.id);
    merged.push(point);
  }

  for (const point of collectLocalOccupancyPoints(input)) {
    if (seen.has(point.id)) continue;
    seen.add(point.id);
    merged.push(point);
  }

  return merged;
}
