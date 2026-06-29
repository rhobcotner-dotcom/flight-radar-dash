import type { Flight, Train } from '../types';
import type { AisVesselPayload, EarthquakePayload, RiverGaugePayload, RoadConditionCollection } from './mapLayers';

export interface OccupancyInfo {
  occupancyLabel?: string | null;
  occupancyLevel?: number | null;
  occupancySource?: string | null;
  occupancyKind?: string | null;
}

export interface OccupancyPoint extends OccupancyInfo {
  id: string;
  lat: number;
  lon: number;
  label?: string | null;
  level?: number | null;
  source?: string | null;
  kind?: string | null;
  real?: boolean;
  agency?: string | null;
}

const REAL_SOURCES = new Set(['gtfs-rt', 'tsa-wait', 'railstate-loaded', 'crossing-sensor']);

export function isRealOccupancySource(source?: string | null) {
  return REAL_SOURCES.has(String(source || '').trim().toLowerCase());
}

/** Green (low) → red (high) ramp for occupancyLevel 0–100. */
export function occupancyColor(level: number | null | undefined) {
  const value = Number(level);
  if (!Number.isFinite(value)) return '#64748b';
  if (value <= 20) return '#22c55e';
  if (value <= 40) return '#84cc16';
  if (value <= 55) return '#eab308';
  if (value <= 70) return '#f97316';
  if (value <= 85) return '#ef4444';
  return '#b91c1c';
}

export function occupancyOverlayStyle(point: OccupancyPoint) {
  const level = point.level ?? point.occupancyLevel;
  const source = point.source ?? point.occupancySource;
  const real = point.real ?? isRealOccupancySource(source);
  const color = occupancyColor(level);
  return {
    color,
    fillColor: color,
    fillOpacity: real ? 0.42 : 0.22,
    weight: real ? 2 : 1.5,
    opacity: real ? 0.95 : 0.7,
    dashArray: real ? undefined : ('6 5' as const),
  };
}

export function occupancyDetailLabel(kind?: string | null) {
  switch (kind) {
    case 'cargo':
      return 'Load';
    case 'hydrology':
      return 'Channel fill';
    case 'environmental':
      return 'Intensity';
    case 'infrastructure':
      return 'Capacity';
    default:
      return 'Crowding';
  }
}

export function formatOccupancyLine(info: OccupancyInfo | null | undefined) {
  if (!info?.occupancyLabel) return null;
  const label = occupancyDetailLabel(info.occupancyKind);
  const level = info.occupancyLevel != null ? ` · ${info.occupancyLevel}%` : '';
  return { label, value: `${info.occupancyLabel}${level}` };
}

export function occupancyPopupHtml(info: OccupancyInfo | null | undefined) {
  const line = formatOccupancyLine(info);
  if (!line) return '';
  return `<div><dt>${line.label}</dt><dd>${line.value}</dd></div>`;
}

function pushPoint(
  list: OccupancyPoint[],
  seen: Set<string>,
  point: OccupancyPoint | null | undefined
) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;
  const level = point.level ?? point.occupancyLevel;
  if (level == null || !Number.isFinite(Number(level))) return;
  if (seen.has(point.id)) return;
  seen.add(point.id);
  list.push({
    ...point,
    level: Number(level),
    source: point.source ?? point.occupancySource,
    label: point.label ?? point.occupancyLabel,
    real: point.real ?? isRealOccupancySource(point.source ?? point.occupancySource),
  });
}

export function collectLocalOccupancyPoints(input: {
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
  const points: OccupancyPoint[] = [];
  const seen = new Set<string>();

  if (input.flightsEnabled) {
    for (const flight of input.flights || []) {
      pushPoint(points, seen, {
        id: `flight:${flight.hex || flight.flight}`,
        lat: flight.lat,
        lon: flight.lon,
        occupancyLabel: flight.occupancyLabel,
        occupancyLevel: flight.occupancyLevel,
        occupancySource: flight.occupancySource,
        occupancyKind: flight.occupancyKind,
      } as OccupancyPoint);
    }
  }

  for (const train of input.trains || []) {
    const metro = train.trainKind === 'light_rail' || train.trainKind === 'subway';
    if (metro && !input.metroEnabled) continue;
    if (!metro && train.trainKind !== 'crossing' && !input.railEnabled) continue;
    pushPoint(points, seen, {
      id: `train:${train.trainId}`,
      lat: train.snappedLat ?? train.lat,
      lon: train.snappedLon ?? train.lon,
      occupancyLabel: train.occupancyLabel,
      occupancyLevel: train.occupancyLevel,
      occupancySource: train.occupancySource,
      occupancyKind: train.occupancyKind,
      agency: train.railroad || train.sourceLabel,
    } as OccupancyPoint);
  }

  for (const vessel of input.vessels?.vessels || []) {
    pushPoint(points, seen, {
      id: `vessel:${vessel.mmsi}`,
      lat: vessel.lat,
      lon: vessel.lon,
      occupancyLabel: vessel.occupancyLabel,
      occupancyLevel: vessel.occupancyLevel,
      occupancySource: vessel.occupancySource,
      occupancyKind: vessel.occupancyKind,
    } as OccupancyPoint);
  }

  for (const gauge of input.rivers?.gauges || []) {
    pushPoint(points, seen, {
      id: `river:${gauge.siteCode}`,
      lat: gauge.lat,
      lon: gauge.lon,
      occupancyLabel: gauge.occupancyLabel,
      occupancyLevel: gauge.occupancyLevel,
      occupancySource: gauge.occupancySource,
      occupancyKind: gauge.occupancyKind,
    } as OccupancyPoint);
  }

  for (const feature of input.roads?.features || []) {
    const props = feature.properties;
    const coords = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : null;
    if (!coords) continue;
    pushPoint(points, seen, {
      id: `road:${props.id || props.title}`,
      lat: coords[1],
      lon: coords[0],
      occupancyLabel: props.occupancyLabel,
      occupancyLevel: props.occupancyLevel,
      occupancySource: props.occupancySource,
      occupancyKind: props.occupancyKind,
    } as OccupancyPoint);
  }

  for (const event of input.earthquakes?.events || []) {
    pushPoint(points, seen, {
      id: `quake:${event.id}`,
      lat: event.lat,
      lon: event.lon,
      occupancyLabel: event.occupancyLabel,
      occupancyLevel: event.occupancyLevel,
      occupancySource: event.occupancySource,
      occupancyKind: event.occupancyKind,
    } as OccupancyPoint);
  }

  return points;
}
