import type { Satellite } from '../types';
import { fetchJson } from './fetchJson';

export interface SatelliteCollection {
  fetchedAt: string;
  minElevationDeg: number;
  catalogSize: number;
  count: number;
  source?: string;
  satellites: Satellite[];
}

export function satelliteKey(satellite: Satellite) {
  return satellite.noradId || satellite.name;
}

export async function fetchOverheadSatellites(queryString: string): Promise<SatelliteCollection> {
  const data = await fetchJson<SatelliteCollection & { error?: string }>(`/api/live/satellites?${queryString}`);

  return {
    fetchedAt: data.fetchedAt || new Date().toISOString(),
    minElevationDeg: data.minElevationDeg ?? 5,
    catalogSize: data.catalogSize ?? 0,
    count: data.count ?? 0,
    source: data.source,
    satellites: Array.isArray(data.satellites) ? data.satellites : [],
  };
}

export function formatAzimuth(deg: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(deg / 45) % 8;
  return `${Math.round(deg)}° ${directions[index]}`;
}
