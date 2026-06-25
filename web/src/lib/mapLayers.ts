export type WeatherAlertKind =
  | 'tornado'
  | 'tornado-pds'
  | 'severe'
  | 'flash-flood'
  | 'flood'
  | 'winter'
  | 'heat'
  | 'marine'
  | 'other';

export interface WeatherAlertPolygonProperties {
  id: string;
  kind: WeatherAlertKind;
  event: string;
  headline: string;
  areaDesc: string;
  effective: string | null;
  expires: string | null;
  senderName: string;
  severity?: string;
}

export interface WeatherAlertPolygonCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: string;
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
    properties: WeatherAlertPolygonProperties;
  }>;
  source?: string;
  fetchedAt?: string;
  count?: number;
  pdsCount?: number;
  tornadoCount?: number;
  counts?: Record<string, number>;
}

export interface LightningStrike {
  lat: number;
  lon: number;
  observedAt: string | null;
  ageMinutes: number | null;
  distanceMiles: number;
  intensity: number | null;
}

export interface LightningPayload {
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  strikes: LightningStrike[];
}

export interface MetarStation {
  icaoId: string;
  name: string;
  lat: number;
  lon: number;
  observedAt: string | null;
  rawOb: string;
  flightCategory: string;
  temperatureC: number | null;
  temperatureF: number | null;
  dewpointC: number | null;
  windDirectionDeg: number | null;
  windSpeedMph: number | null;
  visibility: string | null;
  altimeterInHg: number | null;
  wxString: string;
  clouds: Array<{ cover?: string; base?: number }>;
  taf: {
    icaoId: string;
    issuedAt: string | null;
    validFrom: string | null;
    validTo: string | null;
    rawTaf: string;
  } | null;
}

export interface MetarPayload {
  source: string;
  fetchedAt: string;
  count: number;
  stations: MetarStation[];
}

export interface TfrProperties {
  id: string;
  title: string;
  legal: string;
  state: string;
  notamKey: string;
  modifiedAt: string | null;
  distanceMiles: number;
}

export interface TfrCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: string;
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
    properties: TfrProperties;
  }>;
  source?: string;
  fetchedAt?: string;
  count?: number;
  radiusMiles?: number;
}

export interface RiverGauge {
  siteId: string;
  name: string;
  lat: number;
  lon: number;
  stageFt: number | null;
  flowCfs: number | null;
  observedAt: string | null;
  distanceMiles: number;
}

export interface RiverGaugePayload {
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  gauges: RiverGauge[];
}

export interface TransitVehicle {
  vehicleId: string;
  routeId: string | null;
  routeName: string;
  lat: number;
  lon: number;
  bearing: number | null;
  speedMph: number | null;
  tripId: string | null;
  label: string;
  distanceMiles?: number;
}

export interface TransitPayload {
  enabled: boolean;
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles?: number;
  message?: string;
  vehicles: TransitVehicle[];
}

export type RoadConditionKind =
  | 'flood-closed'
  | 'workzone-closed'
  | 'planned-closed'
  | 'winter-closed'
  | 'traffic-delay'
  | 'flood-delay'
  | 'workzone-delay'
  | 'workzone-possible'
  | 'winter-condition';

export interface RoadConditionProperties {
  id: string;
  kind: RoadConditionKind;
  label: string;
  title: string;
  county: string;
  impact: string;
  workType: string;
  comment: string;
  startDate: string | null;
  endDate: string | null;
  lat: number;
  lon: number;
  distanceMiles: number;
}

export interface RoadConditionCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: string;
    geometry: {
      type: 'Point' | 'LineString' | 'MultiLineString';
      coordinates: number[] | number[][] | number[][][];
    };
    properties: RoadConditionProperties;
  }>;
  source?: string;
  fetchedAt?: string;
  count?: number;
  radiusMiles?: number;
  counts?: Record<string, number>;
}

export interface AirQualityPayload {
  lat: number;
  lon: number;
  fetchedAt: string;
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  category: string;
  aqiClass: string;
  observedAt: string | null;
  source: string;
  reportingArea?: string | null;
  state?: string | null;
  supplementalSource?: string | null;
}

export interface AisVessel {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  course: number | null;
  speedKnots: number | null;
  shipType: number | null;
  typeLabel?: string | null;
  rawVesselType?: string | null;
  photoType?: string | null;
  lengthMeters?: number | null;
  photoUrl?: string | null;
  destination: string | null;
  distanceMiles: number;
  sourceLabel?: string | null;
}

export interface AisVesselPayload {
  enabled: boolean;
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  filter?: string;
  message?: string;
  vessels: AisVessel[];
}

export interface NotamProperties {
  id: string;
  airport: string;
  notamNumber: string;
  feature: string;
  text: string;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  lat: number | null;
  lon: number | null;
  distanceMiles: number | null;
}

export interface NotamCollection {
  enabled: boolean;
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  message?: string;
  airports: string[];
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id?: string;
    geometry: {
      type: 'Point' | 'Polygon' | 'MultiPolygon';
      coordinates: number[] | number[][][] | number[][][][];
    };
    properties: NotamProperties;
  }>;
}

export interface EarthquakeEvent {
  id: string;
  lat: number;
  lon: number;
  magnitude: number | null;
  place: string;
  time: string | null;
  depthKm: number | null;
  url: string | null;
  distanceMiles: number;
}

export interface EarthquakePayload {
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  events: EarthquakeEvent[];
}

export interface WeatherSonde {
  serial: string;
  type: string;
  lat: number;
  lon: number;
  altitudeM: number | null;
  frequency: number | null;
  observedAt: string | null;
  temperatureC: number | null;
  humidity: number | null;
  velocityVertical: number | null;
  distanceMiles: number;
}

export interface SondePayload {
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  sondes: WeatherSonde[];
}

export interface WildfireHotspot {
  lat: number;
  lon: number;
  brightness: number | null;
  frp: number | null;
  confidence: string | null;
  observedAt: string | null;
  satellite: string;
  distanceMiles: number;
}

export interface WildfirePayload {
  enabled: boolean;
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  message?: string;
  hotspots: WildfireHotspot[];
}

export interface TrafficCamera {
  id: string;
  description: string;
  lat: number;
  lon: number;
  streamUrl: string;
  liveUrl: string;
  sourceLiveUrl?: string;
  mediaType: 'hls' | 'snapshot' | 'youtube';
  camKind?: 'road' | 'rail';
  source?: string;
  state?: string | null;
  railroad?: string | null;
  distanceMiles?: number;
}

export interface TrafficCameraPayload {
  source: string;
  sources?: string[];
  sourceCounts?: Record<string, number>;
  fetchedAt: string;
  count: number;
  limit?: number;
  bbox?: { west: number; south: number; east: number; north: number };
  radiusMiles?: number;
  cameras: TrafficCamera[];
  viewportStates?: string[];
  statesWithCameras?: string[];
  missingStates?: string[];
  directStateCoverage?: string[];
  nationwide?: boolean;
  partial?: boolean;
  warming?: boolean;
  poolStatus?: {
    partial: boolean;
    poolCount: number;
    verifiedCount: number;
    warming: boolean;
    fetchedAt: string | null;
  };
  coverageNote?: string | null;
}

export interface NwpsGauge {
  lid: string;
  name: string;
  lat: number;
  lon: number;
  observedStageFt: number | null;
  observedFlowKcfs: number | null;
  forecastStageFt: number | null;
  forecastPeakStageFt?: number | null;
  forecastPeakTime?: string | null;
  floodCategory: string;
  floodCategoryForecast: string;
  distanceMiles: number;
}

export interface RiverForecastPayload {
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  gauges: NwpsGauge[];
}

export interface EbirdObservation {
  speciesCode: string;
  commonName: string;
  scientificName: string;
  locationName: string;
  observedAt: string;
  count: number | null;
  lat: number;
  lon: number;
  distanceMiles: number;
}

export interface EbirdPayload {
  enabled: boolean;
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  message?: string;
  observations: EbirdObservation[];
}

export interface INaturalistObservation {
  id: number;
  commonName: string;
  scientificName: string | null;
  observedOn: string;
  photoUrl: string | null;
  lat: number;
  lon: number;
  distanceMiles: number;
}

export interface INaturalistPayload {
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  totalResults?: number;
  observations: INaturalistObservation[];
}

export interface AprsStation {
  callsign: string;
  lat: number;
  lon: number;
  comment: string;
  course: number | null;
  speed: number | null;
  observedAt: string | null;
  distanceMiles: number;
}

export interface AprsPayload {
  enabled: boolean;
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  message?: string;
  stations: AprsStation[];
}

export interface DroughtCollection {
  type: 'FeatureCollection';
  source: string;
  fetchedAt: string;
  count: number;
  radiusMiles: number;
  homeLevel: number | null;
  homeLabel: string;
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
    properties: { level: number; label: string; date: string | null; distanceMiles: number };
  }>;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function alertKindLabel(kind: WeatherAlertKind) {
  switch (kind) {
    case 'tornado-pds':
      return 'PDS Tornado Warning';
    case 'tornado':
      return 'Tornado Warning';
    case 'severe':
      return 'Severe Thunderstorm Warning';
    case 'flash-flood':
      return 'Flash Flood Warning';
    case 'flood':
      return 'Flood Warning';
    case 'winter':
      return 'Winter Weather';
    case 'heat':
      return 'Heat Advisory';
    case 'marine':
      return 'Special Marine Warning';
    default:
      return 'Weather Alert';
  }
}

export function formatWeatherAlertTooltip(props: WeatherAlertPolygonProperties) {
  const lines = [
    `<strong>${escapeHtml(alertKindLabel(props.kind))}</strong>`,
    props.areaDesc ? `<div>${escapeHtml(props.areaDesc)}</div>` : '',
    props.effective ? `<div class="muted">Active since ${escapeHtml(formatTime(props.effective) || '')}</div>` : '',
    props.expires ? `<div class="muted">Until ${escapeHtml(formatTime(props.expires) || '')}</div>` : '',
  ].filter(Boolean);

  return `<div class="weather-alert-tooltip-body">${lines.join('')}</div>`;
}

export function formatWeatherAlertPopup(props: WeatherAlertPolygonProperties) {
  const lines = [
    `<strong>${escapeHtml(alertKindLabel(props.kind))}</strong>`,
    `<div>${escapeHtml(props.headline || props.event)}</div>`,
    props.areaDesc ? `<div class="muted">${escapeHtml(props.areaDesc)}</div>` : '',
    props.effective ? `<div class="muted">Active since ${escapeHtml(formatTime(props.effective) || '')}</div>` : '',
    props.expires ? `<div class="muted">Until ${escapeHtml(formatTime(props.expires) || '')}</div>` : '',
    props.senderName ? `<div class="muted">${escapeHtml(props.senderName)}</div>` : '',
  ].filter(Boolean);

  return `<div class="weather-alert-popup">${lines.join('')}</div>`;
}

export function weatherAlertCollectionKey(collection: WeatherAlertPolygonCollection | null) {
  if (!collection?.features?.length) return 'empty';
  return collection.features
    .map((feature) => feature.properties?.id || feature.id || '')
    .sort()
    .join('|');
}

export function tfrCollectionKey(collection: TfrCollection | null) {
  if (!collection?.features?.length) return 'empty';
  return collection.features.map((feature) => feature.properties?.id || feature.id || '').join('|');
}

export function flightCategoryClass(category: string) {
  switch (String(category || '').toUpperCase()) {
    case 'VFR':
      return 'metar-vfr';
    case 'MVFR':
      return 'metar-mvfr';
    case 'IFR':
      return 'metar-ifr';
    case 'LIFR':
      return 'metar-lifr';
    default:
      return 'metar-unknown';
  }
}
