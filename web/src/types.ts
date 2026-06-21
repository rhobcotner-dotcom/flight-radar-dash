export interface AreaSettings {
  name: string;
  lat: number;
  lon: number;
  radiusMiles: number;
}

export interface Flight {
  fr24_id?: string;
  flight?: string;
  callsign?: string;
  lat: number;
  lon: number;
  track?: number;
  alt?: number;
  gspeed?: number;
  vspeed?: number;
  squawk?: number;
  timestamp?: string;
  type?: string;
  reg?: string;
  orig_iata?: string;
  dest_iata?: string;
  hex?: string;
}

export interface Alert {
  type: string;
  severity: 'high' | 'medium' | 'info';
  message: string;
  flight: Flight;
}

export interface TrendPoint {
  ts: string;
  totalCount: number;
  byCategory: Record<string, number>;
  notableEvents: Alert[];
}

export interface TrendSummary {
  hours: number;
  snapshotCount: number;
  avgCount: number;
  peakCount: number;
  peakHour: number | null;
  categoryTotals: Record<string, number>;
  alertCount: number;
  points: TrendPoint[];
}
