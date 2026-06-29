import type { EmergencyEntityProperties } from '../hooks/useEmergencyServices';

export type EmergencyRecentCategory =
  | 'ems'
  | 'wildfirePerimeters'
  | 'nwsAlerts'
  | 'femaZones'
  | 'ipawsAlerts';

export interface EmergencyRecentItem {
  id: string;
  category: string;
  title: string;
  subtitle?: string | null;
  lat: number | null;
  lon: number | null;
  observedAt?: string | null;
  geometryType: 'point' | 'polygon';
  bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  } | null;
  geometry?: GeoJSON.Geometry | null;
  properties?: EmergencyEntityProperties & {
    title?: string | null;
    address?: string | null;
    agency?: string | null;
    observedAt?: string | null;
    areaDesc?: string | null;
    headline?: string | null;
    event?: string | null;
  };
}

export interface EmergencyRecentLists {
  ems: EmergencyRecentItem[];
  wildfirePerimeters: EmergencyRecentItem[];
  nwsAlerts: EmergencyRecentItem[];
  femaZones: EmergencyRecentItem[];
  ipawsAlerts: EmergencyRecentItem[];
}

export interface EmergencyFocusRequest {
  item: EmergencyRecentItem;
  seq: number;
}

export function formatEmergencyObservedAt(value?: string | null) {
  if (!value) return 'Time unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unknown';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const EMERGENCY_RECENT_MENU_LABELS: Record<EmergencyRecentCategory, string> = {
  ems: '10 newest nationwide · EMS calls',
  wildfirePerimeters: '10 newest nationwide · fire zones',
  nwsAlerts: '10 newest nationwide · Weather Alerts',
  femaZones: '10 newest nationwide · FEMA Zones',
  ipawsAlerts: '10 newest nationwide · IPAWS alerts',
};
