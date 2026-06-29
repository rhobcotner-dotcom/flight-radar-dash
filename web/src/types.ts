export interface AreaSettings {
  name: string;
  address?: string;
  lat: number;
  lon: number;
  radiusMiles: number;
  mapFocusMiles?: number;
  nearbyAirport?: string;
}

export interface AirportMovement {
  fr24_id?: string;
  flight?: string;
  callsign?: string;
  carrierLabel?: string;
  type?: string;
  reg?: string;
  route?: string;
  alt?: number;
  gspeed?: number;
  eta?: string;
  etaLabel?: string;
  minutesUntilEta?: number | null;
  squawk?: number | string;
  status?: string;
  timeLabel?: string;
  ended?: boolean;
}

export interface AirportDelay {
  type: string;
  severity: 'high' | 'medium' | 'info';
  message: string;
  flight: AirportMovement;
}

export interface AirportHub {
  code: string;
  name: string;
  iata: string;
  icao: string;
  dateLabel: string;
  fetchedAt: string;
  stats: {
    liveOutbound: number;
    liveInbound: number;
    upcomingDepartures?: number;
    departuresToday: number;
    arrivalsToday: number;
    onGround: number;
    delayedCount: number;
  };
  upcomingDepartures: AirportMovement[];
  upcomingArrivals: AirportMovement[];
  recentDepartures: AirportMovement[];
  delays: AirportDelay[];
  liveOutbound: AirportMovement[];
  liveInbound: AirportMovement[];
  error?: string;
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
  squawk?: number | string;
  timestamp?: string;
  type?: string;
  reg?: string;
  hex?: string;
  orig_iata?: string;
  orig_icao?: string;
  orig_city?: string;
  orig_country?: string;
  orig_country_iso?: string;
  orig_lat?: number;
  orig_lon?: number;
  dest_iata?: string;
  dest_icao?: string;
  dest_city?: string;
  dest_country?: string;
  dest_country_iso?: string;
  dest_lat?: number;
  dest_lon?: number;
  eta?: string;
  painted_as?: string;
  operating_as?: string;
  source?: string;
  distanceMiles?: number;
  carrierIcao?: string | null;
  carrierName?: string | null;
  carrierLabel?: string;
  googleFlightsUrl?: string;
  occupancyLabel?: string | null;
  occupancyLevel?: number | null;
  occupancySource?: string | null;
  occupancyKind?: string | null;
}

export interface WeatherConditions {
  source: string;
  fetchedAt: string;
  observedAt?: string | null;
  temperatureC: number | null;
  temperatureF?: number | null;
  relativeHumidityPct: number | null;
  windSpeedMph: number | null;
  windDirectionDeg: number | null;
  surfacePressureHpa: number | null;
  surfaceInversion: boolean;
  weatherCode?: number | null;
  precipitationMm?: number | null;
  cloudCoverPct?: number | null;
  conditionLabel?: string;
  stationId?: string | null;
  stationName?: string | null;
}

export interface WeatherAlert {
  id: string;
  event: string;
  severity: 'high' | 'medium' | 'info';
  urgency: string;
  certainty: string;
  headline: string;
  description: string;
  instruction: string;
  areaDesc: string;
  effective: string | null;
  expires: string | null;
  senderName: string;
}

export interface HearingPrediction {
  flight: Flight;
  estimatedDb: number;
  horizontalMiles: number;
  slantMiles: number;
  phase: string;
  categoryKey: string;
  categoryLabel: string;
  bearingToObserver: number;
  secondsUntilAudible: number | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  audibleNow: boolean;
  alertTier: 'soon' | 'audible' | 'attention' | 'loud';
}

export interface HearingToast {
  id: string;
  flightKey: string;
  title: string;
  body: string;
  variant: 'hearing' | 'military' | 'weather' | 'fun' | 'b52';
  prediction?: HearingPrediction;
  flight?: Flight;
  weatherAlert?: WeatherAlert;
  createdAt: number;
}

export interface Alert {
  type: string;
  severity: 'high' | 'medium' | 'info';
  message: string;
  flight: Flight;
}

export interface TrainStop {
  name: string;
  code: string;
  status: string;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
}

export type TrainKind =
  | 'passenger'
  | 'subway'
  | 'light_rail'
  | 'commuter'
  | 'freight'
  | 'crossing'
  | 'yard'
  | 'corridor';

export interface Train {
  trainNum: string;
  trainId: string;
  routeName: string;
  routeId?: string | null;
  lat: number;
  lon: number;
  snappedLat?: number | null;
  snappedLon?: number | null;
  inferredRailroad?: string | null;
  heading?: string | number | null;
  velocityMph?: number | null;
  timely?: string | null;
  observedAt?: string | null;
  direction?: string | null;
  headsign?: string | null;
  lineCode?: string | null;
  tripStartTime?: string | null;
  delayMinutes?: number | null;
  tripId?: string | null;
  originCode?: string | null;
  destCode?: string | null;
  originName?: string | null;
  destName?: string | null;
  trainState?: string | null;
  trainKind?: TrainKind;
  railroad?: string | null;
  crossingStatus?: string | null;
  sourceLabel?: string | null;
  cargoClue?: boolean;
  nextStop?: TrainStop | null;
  previousStop?: TrainStop | null;
  originStop?: TrainStop | null;
  destStop?: TrainStop | null;
  stopsRemaining?: number | null;
  lineName?: string | null;
  occupancyLabel?: string | null;
  occupancyLevel?: number | null;
  occupancySource?: string | null;
  occupancyKind?: string | null;
  vehicleId?: string | null;
  activeAlerts?: Array<{ header: string; description?: string | null; url?: string | null }> | null;
  distanceMiles?: number;
}

export interface Satellite {
  noradId: string;
  name: string;
  group?: string;
  lat: number;
  lon: number;
  altitudeKm: number;
  elevationDeg: number;
  azimuthDeg: number;
  rangeKm: number;
  velocityKmh?: number | null;
  occupancyLabel?: string | null;
  occupancyLevel?: number | null;
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
