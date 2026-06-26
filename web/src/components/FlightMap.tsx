import { MapContainer, TileLayer, Marker, Popup, Tooltip, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { TooltipOptions } from 'leaflet';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { useHighlight } from '../hooks/useHighlight';
import type { AreaSettings, Flight, Satellite, Train, WeatherConditions } from '../types';
import type { TrafficCameraPayload } from '../lib/mapLayers';
import { flightKey, isSquawk7700, knotsToMph } from '../lib/flightUtils';
import { trainKey } from '../lib/trainUtils';
import { satelliteKey } from '../lib/satelliteUtils';
import { parseTrainHeadingDeg } from '../lib/trackSmoothing';
import {
  TrackSmoothingProvider,
  useAnimatedMarkerPosition,
  useTrackSmoothingCleanup,
} from '../hooks/useTrackSmoothing';
import { isLikelyMilGov } from '../lib/military';
import { FlightDetails } from './FlightDetails';
import { TrainDetails } from './TrainDetails';
import { SatelliteDetails } from './SatelliteDetails';
import { MapLocationHeader } from './MapLocationHeader';
import { RadarOverlay } from './RadarOverlay';
import { StormCellClick } from './StormCellClick';
import {
  alertLegendSummary,
  AisVesselsLayer,
  EarthquakeLayer,
  LightningLayer,
  RoadConditionsLayer,
  RiverGaugeLayer,
  AprsLayer,
  DroughtLayer,
  EbirdLayer,
  INaturalistLayer,
  RiverForecastLayer,
  TrafficCameraLayer,
  WeatherCameraLayer,
  RailCameraLayer,
  TransitLayer,
  WeatherAlertPolygonLayer,
  WildfireLayer,
} from './MapOverlayLayers';
import { useMapLayers } from '../hooks/useMapLayers';
import { useViewportCameras, type StormCameraPriority } from '../hooks/useViewportCameras';
import { useViewportRailCameras } from '../hooks/useViewportRailCameras';
import type { MapViewportBounds } from '../lib/mapViewport';
import { stableViewportKey, viewportFromArea, viewportSearchParams } from '../lib/mapViewport';
import { CameraStreamSchedulerProvider } from '../hooks/useCameraStreamScheduler';
import { ChartMapDecor } from './ChartMapDecor';
import { ChartSeaMonsters } from './ChartSeaMonsters';
import { useSatellites } from '../hooks/useSatellites';
import { DEFAULT_RADAR_OPACITY } from '../lib/radar';
import { weatherAlertCollectionKey } from '../lib/mapLayers';
import { classifyHelicopter } from '../lib/helicopters';
import { MAP_LAYER_HELP, PANEL_HELP, FUN_TOGGLE_HELP } from '../lib/panelHelp';
import { PanelTip } from './PanelTip';
import { MapLayerFilterBox, type MapLayerFilterSection } from './MapLayerFilterBox';
import { FunMapLayers } from './FunMapLayers';
import type { useFunMode } from '../hooks/useFunMode';
import type { AutoRefreshSeconds } from '../hooks/useFlights';
import {
  buildFlightMapIcon,
  buildFlightMapIconPlaceholder,
  buildTrainMapIcon,
  buildSatelliteMapIcon,
  preloadMapMarkerSprites,
} from '../lib/mapMarkers';
import { altitudeTrendForFlight, pruneAltitudeTrends } from '../lib/flightAltitudeTrend';

type MapHighlightHandlers = ReturnType<typeof useHighlight>['mapHandlers'];

const FLIGHT_TOOLTIP_OPTIONS: TooltipOptions = {
  sticky: false,
  interactive: true,
  direction: 'top',
  opacity: 1,
  className: 'flight-tooltip',
};

const RADAR_ENABLED_KEY = 'flight-radar-dash-radar-enabled';
const SATELLITES_ENABLED_KEY = 'flight-radar-dash-satellites-enabled';
const LAYER_KEYS = {
  flights: 'flight-radar-dash-layer-flights',
  rail: 'flight-radar-dash-layer-rail',
  weatherAlerts: 'flight-radar-dash-layer-weather-alerts',
  lightning: 'flight-radar-dash-layer-lightning',
  helos: 'flight-radar-dash-layer-helos',
  rivers: 'flight-radar-dash-layer-rivers',
  transit: 'flight-radar-dash-layer-transit',
  roads: 'flight-radar-dash-layer-roads',
  aisVessels: 'flight-radar-dash-layer-ais-vessels',
  earthquakes: 'flight-radar-dash-layer-earthquakes',
  wildfires: 'flight-radar-dash-layer-wildfires',
  cameras: 'flight-radar-dash-layer-cameras',
  weatherCameras: 'flight-radar-dash-layer-weather-cameras',
  railCameras: 'flight-radar-dash-layer-rail-cameras',
  riverForecast: 'flight-radar-dash-layer-river-forecast',
  ebird: 'flight-radar-dash-layer-ebird',
  inaturalist: 'flight-radar-dash-layer-inaturalist',
  aprs: 'flight-radar-dash-layer-aprs',
  drought: 'flight-radar-dash-layer-drought',
} as const;

function readLayerFlag(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function readRadarFlag(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

const homeIcon = L.divIcon({
  className: 'home-marker',
  html: '<div class="home-pin"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function focusBounds(area: AreaSettings) {
  const focusMiles = area.mapFocusMiles ?? 12;
  const latDelta = focusMiles / 69;
  const lonDelta = focusMiles / (69 * Math.cos((area.lat * Math.PI) / 180));
  return L.latLngBounds(
    [area.lat - latDelta, area.lon - lonDelta],
    [area.lat + latDelta, area.lon + lonDelta]
  );
}

/** Fit map to the home neighborhood, not the full ADSB fetch radius. */
function FitToHome({ area }: { area: AreaSettings }) {
  const map = useMap();
  const fittedForArea = useRef<string | null>(null);

  useEffect(() => {
    fittedForArea.current = null;
  }, [area.lat, area.lon, area.mapFocusMiles]);

  useEffect(() => {
    if (!Number.isFinite(area.lat) || !Number.isFinite(area.lon)) return;

    const areaKey = `${area.lat}:${area.lon}:${area.mapFocusMiles ?? 12}`;
    if (fittedForArea.current === areaKey) return;

    const boundary = focusBounds(area);
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(boundary, { padding: [24, 24], maxZoom: 13 });
      fittedForArea.current = areaKey;
    };

    map.whenReady(() => {
      window.requestAnimationFrame(fit);
    });
  }, [area.lat, area.lon, area.mapFocusMiles, map]);

  return null;
}

function MapViewportReporter({
  onViewportChange,
}: {
  onViewportChange: (bounds: MapViewportBounds) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const report = () => {
      const bounds = map.getBounds();
      onViewportChange({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
        zoom: map.getZoom(),
      });
    };

    report();
    map.on('moveend', report);
    map.on('zoomend', report);

    return () => {
      map.off('moveend', report);
      map.off('zoomend', report);
    };
  }, [map, onViewportChange]);

  return null;
}

function MapHighlightExit({ onExit }: { onExit: () => void }) {
  const map = useMap();

  useEffect(() => {
    const node = map.getContainer();
    const handleLeave = (event: MouseEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && node.contains(next)) return;
      onExit();
    };
    node.addEventListener('mouseleave', handleLeave);
    return () => node.removeEventListener('mouseleave', handleLeave);
  }, [map, onExit]);

  return null;
}

const FlightMarker = memo(function FlightMarker({
  flight,
  highlighted,
  helosEnabled,
  mapHandlers,
  flightRefreshIntervalMs,
  flightAnchorKey,
}: {
  flight: Flight;
  highlighted: boolean;
  helosEnabled: boolean;
  mapHandlers?: MapHighlightHandlers;
  flightRefreshIntervalMs: number;
  flightAnchorKey?: string | null;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const military = isLikelyMilGov(flight);
  const emergency = isSquawk7700(flight);
  const heloKind = helosEnabled ? classifyHelicopter(flight) : null;
  const motionHint = useMemo(
    () => ({
      speedMph: knotsToMph(flight.gspeed),
      headingDeg: flight.track ?? null,
    }),
    [flight.gspeed, flight.track]
  );
  const id = flightKey(flight);
  const altitudeTrend = useMemo(
    () => altitudeTrendForFlight(id, flight.alt),
    [id, flight.alt]
  );
  const [icon, setIcon] = useState<L.DivIcon>(() =>
    buildFlightMapIconPlaceholder(flight, highlighted, military, emergency, heloKind, altitudeTrend)
  );
  const [tooltipActive, setTooltipActive] = useState(false);

  useAnimatedMarkerPosition({
    trackId: id,
    lat: flight.lat,
    lon: flight.lon,
    motionHint,
    refreshIntervalMs: flightRefreshIntervalMs,
    anchorKey: flightAnchorKey,
    markerRef,
  });

  useEffect(() => {
    let cancelled = false;
    setIcon(buildFlightMapIconPlaceholder(flight, highlighted, military, emergency, heloKind, altitudeTrend));
    void buildFlightMapIcon(flight, highlighted, military, emergency, heloKind, altitudeTrend).then((next) => {
      if (!cancelled) setIcon(next);
    });
    return () => {
      cancelled = true;
    };
  }, [
    flight.carrierName,
    flight.operating_as,
    flight.painted_as,
    flight.type,
    flight.track,
    flight.squawk,
    flight.callsign,
    flight.flight,
    flight.reg,
    flight.alt,
    flight.gspeed,
    altitudeTrend,
    highlighted,
    military,
    emergency,
    heloKind,
    helosEnabled,
  ]);

  useEffect(() => {
    markerRef.current?.setIcon(icon);
  }, [icon]);

  return (
    <Marker
      ref={markerRef}
      position={[flight.lat, flight.lon]}
      icon={icon}
      zIndexOffset={highlighted ? 800 : undefined}
      eventHandlers={mapHandlers?.(id)}
    >
      <Tooltip
        {...FLIGHT_TOOLTIP_OPTIONS}
        eventHandlers={{
          add: () => setTooltipActive(true),
          remove: () => setTooltipActive(false),
        }}
      >
        <FlightDetails flight={flight} compact showVisual={tooltipActive} />
      </Tooltip>
      <Popup maxWidth={360} minWidth={280}>
        <MapLocationHeader lat={flight.lat} lon={flight.lon} />
        <FlightDetails flight={flight} />
      </Popup>
    </Marker>
  );
}, (prev, next) => {
  return (
    prev.highlighted === next.highlighted &&
    prev.helosEnabled === next.helosEnabled &&
    prev.flight.lat === next.flight.lat &&
    prev.flight.lon === next.flight.lon &&
    prev.flight.track === next.flight.track &&
    prev.flight.type === next.flight.type &&
    prev.flight.carrierName === next.flight.carrierName &&
    prev.flight.operating_as === next.flight.operating_as &&
    prev.flight.painted_as === next.flight.painted_as &&
    prev.flight.hex === next.flight.hex &&
    prev.flight.squawk === next.flight.squawk &&
    prev.flight.alt === next.flight.alt &&
    prev.flight.gspeed === next.flight.gspeed &&
    prev.mapHandlers === next.mapHandlers
  );
});

const TrainMarker = memo(function TrainMarker({
  train,
  highlighted,
  mapHandlers,
  trainRefreshIntervalMs,
  trainAnchorKey,
}: {
  train: Train;
  highlighted: boolean;
  mapHandlers?: MapHighlightHandlers;
  trainRefreshIntervalMs: number;
  trainAnchorKey?: string | null;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const icon = useMemo(
    () => buildTrainMapIcon(train, highlighted),
    [train.trainKind, train.heading, train.velocityMph, train.crossingStatus, train.railroad, highlighted]
  );
  const id = trainKey(train);
  const motionHint = useMemo(
    () => ({
      speedMph: train.velocityMph ?? null,
      headingDeg: parseTrainHeadingDeg(train.heading),
    }),
    [train.velocityMph, train.heading]
  );

  useAnimatedMarkerPosition({
    trackId: id,
    lat: train.lat,
    lon: train.lon,
    motionHint,
    refreshIntervalMs: trainRefreshIntervalMs,
    anchorKey: trainAnchorKey,
    markerRef,
    profile: train.trainKind === 'passenger' ? 'passenger-rail' : 'beacon',
  });

  useEffect(() => {
    markerRef.current?.setIcon(icon);
  }, [icon]);

  return (
    <Marker
      ref={markerRef}
      position={[train.lat, train.lon]}
      icon={icon}
      zIndexOffset={highlighted ? 750 : undefined}
      eventHandlers={mapHandlers?.(id)}
    >
      <Popup maxWidth={420} minWidth={300}>
        <MapLocationHeader lat={train.lat} lon={train.lon} />
        <TrainDetails train={train} />
      </Popup>
    </Marker>
  );
}, (prev, next) => {
  return (
    prev.highlighted === next.highlighted &&
    prev.train.trainKind === next.train.trainKind &&
    prev.train.lat === next.train.lat &&
    prev.train.lon === next.train.lon &&
    prev.train.heading === next.train.heading &&
    prev.train.velocityMph === next.train.velocityMph &&
    prev.train.crossingStatus === next.train.crossingStatus &&
    prev.train.railroad === next.train.railroad &&
    prev.mapHandlers === next.mapHandlers
  );
});

const SatelliteMarker = memo(function SatelliteMarker({
  satellite,
  highlighted,
  mapHandlers,
}: {
  satellite: Satellite;
  highlighted: boolean;
  mapHandlers?: MapHighlightHandlers;
}) {
  const markerRef = useRef<L.Marker | null>(null);
  const icon = useMemo(
    () => buildSatelliteMapIcon(satellite, highlighted),
    [satellite.name, satellite.noradId, highlighted]
  );
  const id = satelliteKey(satellite);

  useEffect(() => {
    markerRef.current?.setLatLng([satellite.lat, satellite.lon]);
  }, [satellite.lat, satellite.lon]);

  useEffect(() => {
    markerRef.current?.setIcon(icon);
  }, [icon]);

  return (
    <Marker
      ref={markerRef}
      position={[satellite.lat, satellite.lon]}
      icon={icon}
      zIndexOffset={highlighted ? 700 : 500}
      eventHandlers={mapHandlers?.(id)}
    >
      <Popup maxWidth={320} minWidth={240}>
        <MapLocationHeader lat={satellite.lat} lon={satellite.lon} />
        <SatelliteDetails satellite={satellite} />
      </Popup>
    </Marker>
  );
}, (prev, next) => {
  return (
    prev.highlighted === next.highlighted &&
    prev.satellite.lat === next.satellite.lat &&
    prev.satellite.lon === next.satellite.lon &&
    prev.satellite.elevationDeg === next.satellite.elevationDeg &&
    prev.satellite.azimuthDeg === next.satellite.azimuthDeg &&
    prev.mapHandlers === next.mapHandlers
  );
});

const FlightMapInner = memo(function FlightMapInner({
  area,
  flights,
  trains,
  satellites,
  highlightedId,
  mapHandlers,
  clearHighlightNow,
  radarEnabled,
  radarOpacity,
  onRadarFrameLabel,
  onRadarAttribution,
  onRadarError,
  layerToggles,
  mapLayers,
  cameras,
  railCameras,
  viewportBounds,
  cameraStreamBoundsKey,
  onViewportChange,
  onStormCameraPriority,
  weather,
  fun,
  fullPage = false,
  smoothMovementEnabled = false,
  flightRefreshIntervalMs = 0,
  trainRefreshIntervalMs = 0,
  mapFetchedAt,
  trainsFetchedAt,
}: {
  area: AreaSettings;
  flights: Flight[];
  trains: Train[];
  satellites: Satellite[];
  highlightedId?: string | null;
  mapHandlers?: MapHighlightHandlers;
  clearHighlightNow?: () => void;
  radarEnabled: boolean;
  radarOpacity: number;
  onRadarFrameLabel: (label: string | null) => void;
  onRadarAttribution: (attribution: { name: string; url: string } | null) => void;
  onRadarError: (message: string | null) => void;
  layerToggles: {
    flights: boolean;
    rail: boolean;
    weatherAlerts: boolean;
    lightning: boolean;
    helos: boolean;
    rivers: boolean;
    transit: boolean;
    roads: boolean;
    aisVessels: boolean;
    earthquakes: boolean;
    wildfires: boolean;
    cameras: boolean;
    weatherCameras: boolean;
    railCameras: boolean;
    riverForecast: boolean;
    ebird: boolean;
    inaturalist: boolean;
    aprs: boolean;
    drought: boolean;
  };
  mapLayers: ReturnType<typeof useMapLayers>;
  cameras: TrafficCameraPayload | null;
  railCameras: TrafficCameraPayload | null;
  viewportBounds: MapViewportBounds | null;
  cameraStreamBoundsKey: string;
  onViewportChange: (bounds: MapViewportBounds) => void;
  onStormCameraPriority: (lat: number, lon: number) => void;
  weather: WeatherConditions | null;
  fun: ReturnType<typeof useFunMode>;
  fullPage?: boolean;
  smoothMovementEnabled?: boolean;
  flightRefreshIntervalMs?: number;
  trainRefreshIntervalMs?: number;
  mapFetchedAt?: string | null;
  trainsFetchedAt?: string | null;
}) {
  const focusMiles = area.mapFocusMiles ?? 12;
  const fetchMiles = area.radiusMiles;
  const focusMeters = focusMiles * 1609.34;
  const fetchMeters = fetchMiles * 1609.34;
  const homeLabel = area.address || area.name;
  const streamBounds = viewportBounds ?? viewportFromArea(area);
  const activeTrackIds = useMemo(() => {
    const ids = new Set<string>();
    if (layerToggles.flights) {
      for (const flight of flights) ids.add(flightKey(flight));
    }
    if (layerToggles.rail) {
      for (const train of trains) ids.add(trainKey(train));
    }
    return ids;
  }, [flights, layerToggles.flights, layerToggles.rail, trains]);

  return (
    <TrackSmoothingProvider enabled={smoothMovementEnabled}>
      <FlightMapTrackCleanup activeTrackIds={activeTrackIds} />
    <MapContainer
      center={[area.lat, area.lon]}
      zoom={12}
      className={`flight-map${fullPage ? ' flight-map-fullpage' : ''}${fun.werewolfActive ? ' flight-map-werewolf' : ''}${fun.disasterActive ? ' flight-map-disaster' : ''}${fun.settings.solarMoodRing ? ` flight-map-${fun.kpClass}` : ''}${fun.settings.radarNoir ? ' flight-map-radar-noir' : ''}`}
      scrollWheelZoom
      closePopupOnClick
    >
      <FitToHome area={area} />
      <MapViewportReporter onViewportChange={onViewportChange} />
      <CameraStreamSchedulerProvider bounds={streamBounds} boundsKey={cameraStreamBoundsKey}>
      {clearHighlightNow ? <MapHighlightExit onExit={clearHighlightNow} /> : null}
      {fun.settings.radarNoir ? (
        <>
          <TileLayer
            className="map-basemap-tiles"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png"
          />
          <TileLayer
            className="map-basemap-labels"
            attribution=""
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png"
            zIndex={250}
          />
          <ChartMapDecor />
          <ChartSeaMonsters />
        </>
      ) : (
        <TileLayer
          className="map-basemap-tiles"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
      )}
      <RadarOverlay
        enabled={radarEnabled}
        opacity={fun.settings.radarNoir ? 0.68 : radarOpacity}
        onFrameLabel={onRadarFrameLabel}
        onAttribution={onRadarAttribution}
        onError={onRadarError}
      />
      <StormCellClick
        radarEnabled={radarEnabled}
        radarNoir={fun.settings.radarNoir}
        viewportCameras={cameras}
        onStormCameraPriority={onStormCameraPriority}
      />
      {layerToggles.weatherAlerts ? (
        <WeatherAlertPolygonLayer
          key={weatherAlertCollectionKey(mapLayers.weatherAlerts)}
          collection={mapLayers.weatherAlerts}
        />
      ) : null}
      {layerToggles.lightning ? <LightningLayer payload={mapLayers.lightning} /> : null}
      {layerToggles.rivers ? <RiverGaugeLayer payload={mapLayers.rivers} /> : null}
      {layerToggles.transit ? (
        <TransitLayer
          vehicles={mapLayers.transit?.vehicles || []}
          highlightedId={highlightedId}
          mapHandlers={mapHandlers}
        />
      ) : null}
      {layerToggles.roads ? <RoadConditionsLayer collection={mapLayers.roads} /> : null}
      {layerToggles.aisVessels ? <AisVesselsLayer payload={mapLayers.aisVessels} /> : null}
      {layerToggles.earthquakes ? <EarthquakeLayer payload={mapLayers.earthquakes} /> : null}
      {layerToggles.wildfires ? <WildfireLayer payload={mapLayers.wildfires} /> : null}
      {layerToggles.cameras ? <TrafficCameraLayer payload={cameras} /> : null}
      {layerToggles.weatherCameras ? <WeatherCameraLayer payload={cameras} /> : null}
      {layerToggles.railCameras ? <RailCameraLayer payload={railCameras} /> : null}
      {layerToggles.riverForecast ? <RiverForecastLayer payload={mapLayers.riverForecast} /> : null}
      {layerToggles.ebird ? <EbirdLayer payload={mapLayers.ebird} /> : null}
      {layerToggles.inaturalist ? <INaturalistLayer payload={mapLayers.inaturalist} /> : null}
      {layerToggles.aprs ? <AprsLayer payload={mapLayers.aprs} /> : null}
      {layerToggles.drought ? <DroughtLayer collection={mapLayers.drought} /> : null}
      <FunMapLayers
        area={area}
        flights={layerToggles.flights ? flights : []}
        trains={layerToggles.rail ? trains : []}
        weather={weather}
        settings={fun.settings}
      />
      {fetchMiles > focusMiles + 2 ? (
        <Circle
          center={[area.lat, area.lon]}
          radius={fetchMeters}
          pathOptions={{
            color: '#334155',
            fillColor: '#1e293b',
            fillOpacity: 0.04,
            weight: 1,
            dashArray: '6 8',
          }}
        />
      ) : null}
      <Circle
        center={[area.lat, area.lon]}
        radius={focusMeters}
        pathOptions={{ color: '#f87171', fillColor: '#ef4444', fillOpacity: 0.08, weight: 2 }}
      />
      <Marker position={[area.lat, area.lon]} icon={homeIcon}>
        <Tooltip direction="top" opacity={1}>
          {homeLabel}
        </Tooltip>
      </Marker>
      {layerToggles.flights
        ? flights.map((flight) => (
            <FlightMarker
              key={flightKey(flight)}
              flight={flight}
              highlighted={highlightedId === flightKey(flight)}
              helosEnabled={layerToggles.helos}
              mapHandlers={mapHandlers}
              flightRefreshIntervalMs={flightRefreshIntervalMs}
              flightAnchorKey={mapFetchedAt}
            />
          ))
        : null}
      {layerToggles.rail
        ? trains.map((train) => (
            <TrainMarker
              key={trainKey(train)}
              train={train}
              highlighted={highlightedId === trainKey(train)}
              mapHandlers={mapHandlers}
              trainRefreshIntervalMs={trainRefreshIntervalMs}
              trainAnchorKey={trainsFetchedAt}
            />
          ))
        : null}
      {satellites.map((satellite) => (
        <SatelliteMarker
          key={satelliteKey(satellite)}
          satellite={satellite}
          highlighted={highlightedId === satelliteKey(satellite)}
          mapHandlers={mapHandlers}
        />
      ))}
      </CameraStreamSchedulerProvider>
    </MapContainer>
    </TrackSmoothingProvider>
  );
});

function FlightMapTrackCleanup({ activeTrackIds }: { activeTrackIds: Set<string> }) {
  useTrackSmoothingCleanup(activeTrackIds);
  useEffect(() => {
    pruneAltitudeTrends(activeTrackIds);
  }, [activeTrackIds]);
  return null;
}

interface Props {
  area: AreaSettings;
  flights: Flight[];
  trains: Train[];
  weather: WeatherConditions | null;
  fun: ReturnType<typeof useFunMode>;
  highlightedId?: string | null;
  mapHandlers?: MapHighlightHandlers;
  clearHighlightNow?: () => void;
  mapFetchedAt?: string | null;
  inViewCount?: number;
  onViewportChange?: (bounds: MapViewportBounds) => void;
  fullPage?: boolean;
  autoRefreshSeconds?: AutoRefreshSeconds;
  trainsFetchedAt?: string | null;
  trainRefreshSeconds?: number;
}

export function FlightMap({
  area,
  flights,
  trains,
  weather,
  fun,
  highlightedId,
  mapHandlers,
  clearHighlightNow,
  mapFetchedAt,
  inViewCount,
  onViewportChange,
  fullPage = false,
  autoRefreshSeconds = 0,
  trainsFetchedAt = null,
  trainRefreshSeconds = 10,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [radarEnabled, setRadarEnabled] = useState(() => readRadarFlag(RADAR_ENABLED_KEY, true));
  const [satellitesEnabled, setSatellitesEnabled] = useState(() => readRadarFlag(SATELLITES_ENABLED_KEY, false));
  const [flightsEnabled, setFlightsEnabled] = useState(() => readLayerFlag(LAYER_KEYS.flights, true));
  const [railEnabled, setRailEnabled] = useState(() => readLayerFlag(LAYER_KEYS.rail, true));
  const [weatherAlertsEnabled, setWeatherAlertsEnabled] = useState(() =>
    readLayerFlag(LAYER_KEYS.weatherAlerts, true)
  );
  const [lightningEnabled, setLightningEnabled] = useState(() => readLayerFlag(LAYER_KEYS.lightning, true));
  const [helosEnabled, setHelosEnabled] = useState(() => readLayerFlag(LAYER_KEYS.helos, true));
  const [riversEnabled, setRiversEnabled] = useState(() => readLayerFlag(LAYER_KEYS.rivers, true));
  const [transitEnabled, setTransitEnabled] = useState(() => readLayerFlag(LAYER_KEYS.transit, false));
  const [roadsEnabled, setRoadsEnabled] = useState(() => readLayerFlag(LAYER_KEYS.roads, true));
  const [aisVesselsEnabled, setAisVesselsEnabled] = useState(() =>
    readLayerFlag(LAYER_KEYS.aisVessels, true)
  );
  const [earthquakesEnabled, setEarthquakesEnabled] = useState(() =>
    readLayerFlag(LAYER_KEYS.earthquakes, true)
  );
  const [wildfiresEnabled, setWildfiresEnabled] = useState(() =>
    readLayerFlag(LAYER_KEYS.wildfires, false)
  );
  const [camerasEnabled, setCamerasEnabled] = useState(() => readLayerFlag(LAYER_KEYS.cameras, true));
  const [weatherCamerasEnabled, setWeatherCamerasEnabled] = useState(() =>
    readLayerFlag(LAYER_KEYS.weatherCameras, true)
  );
  const [railCamerasEnabled, setRailCamerasEnabled] = useState(() =>
    readLayerFlag(LAYER_KEYS.railCameras, true)
  );
  const [riverForecastEnabled, setRiverForecastEnabled] = useState(() =>
    readLayerFlag(LAYER_KEYS.riverForecast, true)
  );
  const [ebirdEnabled, setEbirdEnabled] = useState(() => readLayerFlag(LAYER_KEYS.ebird, false));
  const [inaturalistEnabled, setINaturalistEnabled] = useState(() =>
    readLayerFlag(LAYER_KEYS.inaturalist, true)
  );
  const [aprsEnabled, setAprsEnabled] = useState(() => readLayerFlag(LAYER_KEYS.aprs, false));
  const [droughtEnabled, setDroughtEnabled] = useState(() =>
    readLayerFlag(LAYER_KEYS.drought, false)
  );
  const [radarFrameLabel, setRadarFrameLabel] = useState<string | null>(null);
  const [radarAttribution, setRadarAttribution] = useState<{ name: string; url: string } | null>(
    null
  );
  const [radarError, setRadarError] = useState<string | null>(null);
  const radarOpacity = DEFAULT_RADAR_OPACITY;
  const [viewportBounds, setViewportBounds] = useState<MapViewportBounds | null>(null);
  const viewportKey = useMemo(
    () => (viewportBounds ? stableViewportKey(viewportBounds) : 'initial'),
    [viewportBounds]
  );
  const queryString = useMemo(() => {
    const homeParams = new URLSearchParams({
      lat: String(area.lat),
      lon: String(area.lon),
      radiusMiles: String(area.radiusMiles ?? 85),
    });
    return viewportSearchParams(homeParams.toString(), viewportBounds ?? viewportFromArea(area)).toString();
  }, [area.lat, area.lon, area.radiusMiles, viewportKey, viewportBounds]);
  const layerToggles = useMemo(
    () => ({
      flights: flightsEnabled,
      rail: railEnabled,
      weatherAlerts: weatherAlertsEnabled,
      lightning: lightningEnabled,
      helos: helosEnabled,
      rivers: riversEnabled,
      transit: transitEnabled,
      roads: roadsEnabled,
      aisVessels: aisVesselsEnabled,
      earthquakes: earthquakesEnabled,
      wildfires: wildfiresEnabled,
      riverForecast: riverForecastEnabled,
      ebird: ebirdEnabled,
      inaturalist: inaturalistEnabled,
      aprs: aprsEnabled,
      drought: droughtEnabled,
    }),
    [
      flightsEnabled,
      railEnabled,
      weatherAlertsEnabled,
      lightningEnabled,
      helosEnabled,
      riversEnabled,
      transitEnabled,
      roadsEnabled,
      aisVesselsEnabled,
      earthquakesEnabled,
      wildfiresEnabled,
      riverForecastEnabled,
      ebirdEnabled,
      inaturalistEnabled,
      aprsEnabled,
      droughtEnabled,
    ]
  );
  const mapDisplayToggles = useMemo(
    () => ({
      ...layerToggles,
      cameras: camerasEnabled,
      weatherCameras: weatherCamerasEnabled,
      railCameras: railCamerasEnabled,
    }),
    [layerToggles, camerasEnabled, weatherCamerasEnabled, railCamerasEnabled]
  );
  const [stormCameraPriority, setStormCameraPriority] = useState<StormCameraPriority | null>(null);
  const handleViewportChange = useCallback(
    (bounds: MapViewportBounds) => {
      setViewportBounds(bounds);
      onViewportChange?.(bounds);
    },
    [onViewportChange]
  );
  const handleStormCameraPriority = useCallback((lat: number, lon: number) => {
    setStormCameraPriority({
      lat,
      lon,
      key: `${lat.toFixed(2)}:${lon.toFixed(2)}:${Date.now()}`,
    });
  }, []);
  const smoothMovementEnabled = autoRefreshSeconds > 0;
  const flightRefreshIntervalMs = autoRefreshSeconds * 1000;
  const trainRefreshIntervalMs = trainRefreshSeconds * 1000;
  const mapLayers = useMapLayers(queryString, layerToggles, mounted);
  const { cameras: viewportCameras, error: cameraError } = useViewportCameras(
    queryString,
    viewportBounds,
    (camerasEnabled || weatherCamerasEnabled) && mounted,
    stormCameraPriority
  );
  const { cameras: viewportRailCameras, error: railCameraError } = useViewportRailCameras(
    queryString,
    viewportBounds,
    railCamerasEnabled && mounted
  );
  const {
    satellites,
    error: satelliteError,
    meta: satelliteMeta,
    loading: satellitesLoading,
  } = useSatellites(queryString, satellitesEnabled);
  const heloCount = useMemo(
    () => (helosEnabled ? flights.filter((flight) => classifyHelicopter(flight)).length : 0),
    [flights, helosEnabled]
  );
  const liveTrains = useMemo(
    () =>
      trains.filter(
        (train) =>
          train.trainKind === 'passenger' || train.trainKind === 'freight' || train.trainKind === 'crossing'
      ),
    [trains]
  );
  const layerErrors = useMemo(() => {
    const messages = [...new Set(Object.values(mapLayers.errors).filter(Boolean))] as string[];
    if (cameraError) messages.push(cameraError);
    if (railCameraError) messages.push(railCameraError);
    return messages;
  }, [cameraError, railCameraError, mapLayers.errors]);

  useEffect(() => {
    setMounted(true);
    void preloadMapMarkerSprites();
  }, []);

  const layerFilterSections = useMemo<MapLayerFilterSection[]>(
    () => [
      {
        title: 'Tracking',
        items: [
          {
            id: 'flights',
            label: 'Flights',
            tip: MAP_LAYER_HELP.flights,
            checked: flightsEnabled,
            onChange: setFlightsEnabled,
            storageKey: LAYER_KEYS.flights,
          },
          {
            id: 'rail',
            label: 'Rail',
            tip: MAP_LAYER_HELP.rail,
            checked: railEnabled,
            onChange: setRailEnabled,
            storageKey: LAYER_KEYS.rail,
          },
          {
            id: 'helos',
            label: 'Helos',
            tip: MAP_LAYER_HELP.helos,
            checked: helosEnabled,
            onChange: setHelosEnabled,
            storageKey: LAYER_KEYS.helos,
          },
          {
            id: 'satellites',
            label: 'Satellites',
            tip: MAP_LAYER_HELP.satellites,
            checked: satellitesEnabled,
            onChange: setSatellitesEnabled,
            storageKey: SATELLITES_ENABLED_KEY,
          },
          {
            id: 'aprs',
            label: 'APRS',
            tip: MAP_LAYER_HELP.aprs,
            checked: aprsEnabled,
            onChange: setAprsEnabled,
            storageKey: LAYER_KEYS.aprs,
          },
        ],
      },
      {
        title: 'Weather',
        items: [
          {
            id: 'weatherAlerts',
            label: 'Alerts',
            tip: MAP_LAYER_HELP.weatherAlerts,
            checked: weatherAlertsEnabled,
            onChange: setWeatherAlertsEnabled,
            storageKey: LAYER_KEYS.weatherAlerts,
          },
          {
            id: 'lightning',
            label: 'Lightning',
            tip: MAP_LAYER_HELP.lightning,
            checked: lightningEnabled,
            onChange: setLightningEnabled,
            storageKey: LAYER_KEYS.lightning,
          },
          {
            id: 'radar',
            label: 'Radar',
            tip: MAP_LAYER_HELP.radar,
            checked: radarEnabled,
            onChange: setRadarEnabled,
            storageKey: RADAR_ENABLED_KEY,
          },
          {
            id: 'radarNoir',
            label: 'Treasure chart',
            tip: FUN_TOGGLE_HELP.radarNoir,
            checked: fun.settings.radarNoir,
            onChange: (checked) => fun.setSetting('radarNoir', checked),
          },
          {
            id: 'drought',
            label: 'Drought',
            tip: MAP_LAYER_HELP.drought,
            checked: droughtEnabled,
            onChange: setDroughtEnabled,
            storageKey: LAYER_KEYS.drought,
          },
        ],
      },
      {
        title: 'Water & roads',
        items: [
          {
            id: 'rivers',
            label: 'Rivers',
            tip: MAP_LAYER_HELP.rivers,
            checked: riversEnabled,
            onChange: setRiversEnabled,
            storageKey: LAYER_KEYS.rivers,
          },
          {
            id: 'riverForecast',
            label: 'NWPS',
            tip: MAP_LAYER_HELP.riverForecast,
            checked: riverForecastEnabled,
            onChange: setRiverForecastEnabled,
            storageKey: LAYER_KEYS.riverForecast,
          },
          {
            id: 'aisVessels',
            label: 'Ships',
            tip: MAP_LAYER_HELP.aisVessels,
            checked: aisVesselsEnabled,
            onChange: setAisVesselsEnabled,
            storageKey: LAYER_KEYS.aisVessels,
          },
          {
            id: 'transit',
            label: 'Metro',
            tip: MAP_LAYER_HELP.transit,
            checked: transitEnabled,
            onChange: setTransitEnabled,
            storageKey: LAYER_KEYS.transit,
          },
          {
            id: 'roads',
            label: 'MoDOT',
            tip: MAP_LAYER_HELP.roads,
            checked: roadsEnabled,
            onChange: setRoadsEnabled,
            storageKey: LAYER_KEYS.roads,
          },
        ],
      },
      {
        title: 'Hazards & nature',
        items: [
          {
            id: 'earthquakes',
            label: 'Quakes',
            tip: MAP_LAYER_HELP.earthquakes,
            checked: earthquakesEnabled,
            onChange: setEarthquakesEnabled,
            storageKey: LAYER_KEYS.earthquakes,
          },
          {
            id: 'wildfires',
            label: 'Fires',
            tip: MAP_LAYER_HELP.wildfires,
            checked: wildfiresEnabled,
            onChange: setWildfiresEnabled,
            storageKey: LAYER_KEYS.wildfires,
          },
          {
            id: 'ebird',
            label: 'eBird',
            tip: MAP_LAYER_HELP.ebird,
            checked: ebirdEnabled,
            onChange: setEbirdEnabled,
            storageKey: LAYER_KEYS.ebird,
          },
          {
            id: 'inaturalist',
            label: 'iNat',
            tip: MAP_LAYER_HELP.inaturalist,
            checked: inaturalistEnabled,
            onChange: setINaturalistEnabled,
            storageKey: LAYER_KEYS.inaturalist,
          },
        ],
      },
      {
        title: 'Cameras',
        items: [
          {
            id: 'cameras',
            label: 'Cams',
            tip: MAP_LAYER_HELP.cameras,
            checked: camerasEnabled,
            onChange: setCamerasEnabled,
            storageKey: LAYER_KEYS.cameras,
          },
          {
            id: 'weatherCameras',
            label: 'Sky cams',
            tip: MAP_LAYER_HELP.weatherCameras,
            checked: weatherCamerasEnabled,
            onChange: setWeatherCamerasEnabled,
            storageKey: LAYER_KEYS.weatherCameras,
            extra:
              weatherCamerasEnabled && viewportCameras?.count ? (
                <span className="weather-cam-badge weather-cam-layer-status muted" title="Teal sun icons on map">
                  {viewportCameras.cameras.filter((cam) => cam.camKind === 'weather').length} sky
                </span>
              ) : null,
          },
          {
            id: 'railCameras',
            label: 'Rail cams',
            tip: MAP_LAYER_HELP.railCameras,
            checked: railCamerasEnabled,
            onChange: setRailCamerasEnabled,
            storageKey: LAYER_KEYS.railCameras,
            extra: (
              <>
                {railCamerasEnabled && viewportRailCameras?.count ? (
                  <span className="rail-cam-badge rail-cam-layer-status" title="Amber dots on map">
                    {viewportRailCameras.count} nearby
                    {viewportRailCameras.cameras?.[0]?.distanceMiles != null
                      ? ` · closest ${viewportRailCameras.cameras[0].distanceMiles} mi`
                      : ''}
                  </span>
                ) : null}
                {railCamerasEnabled && railCameraError ? (
                  <span className="muted rail-cam-layer-status">{railCameraError}</span>
                ) : null}
              </>
            ),
          },
        ],
      },
    ],
    [
      flightsEnabled,
      railEnabled,
      helosEnabled,
      satellitesEnabled,
      aprsEnabled,
      weatherAlertsEnabled,
      lightningEnabled,
      radarEnabled,
      fun,
      droughtEnabled,
      riversEnabled,
      riverForecastEnabled,
      aisVesselsEnabled,
      transitEnabled,
      roadsEnabled,
      earthquakesEnabled,
      wildfiresEnabled,
      ebirdEnabled,
      inaturalistEnabled,
      camerasEnabled,
      weatherCamerasEnabled,
      railCamerasEnabled,
      viewportCameras,
      viewportRailCameras,
      railCameraError,
    ]
  );

  return (
    <div className={`panel map-panel${fullPage ? ' map-panel-fullpage' : ''}`}>
      {!fullPage ? (
        <PanelTip tip={PANEL_HELP.liveMap} className="map-header-tip">
          <div className="panel-header map-panel-header">
            <div>
              <h2>Live map</h2>
              <span className="muted">
                {flightsEnabled
                  ? `${(inViewCount ?? flights.length).toLocaleString()} in view`
                  : 'Flights hidden'}
                {railEnabled ? ` · ${trains.length} trains` : ' · Rail hidden'}
                {helosEnabled && heloCount ? ` · ${heloCount} helos` : ''}
                {satellitesEnabled && satelliteMeta ? ` · ${satelliteMeta.count} satellites overhead` : ''}
                {' · '}pan/zoom worldwide · home ring {area.mapFocusMiles ?? 12} mi
              </span>
            </div>
          </div>
        </PanelTip>
      ) : null}
      <div className={`panel-header map-panel-header map-layer-controls${fullPage ? ' map-layer-controls-float' : ''}`}>
        <MapLayerFilterBox sections={layerFilterSections} float={fullPage} />
      </div>
      {!mounted ? (
        <div className="flight-map map-loading">Loading map…</div>
      ) : (
        <>
          <FlightMapInner
            area={area}
            flights={flights}
            trains={liveTrains}
            satellites={satellites}
            highlightedId={highlightedId}
            mapHandlers={mapHandlers}
            clearHighlightNow={clearHighlightNow}
            radarEnabled={radarEnabled}
            radarOpacity={radarOpacity}
            onRadarFrameLabel={setRadarFrameLabel}
            onRadarAttribution={setRadarAttribution}
            onRadarError={setRadarError}
            layerToggles={mapDisplayToggles}
            mapLayers={mapLayers}
            cameras={viewportCameras}
            railCameras={viewportRailCameras}
            viewportBounds={viewportBounds}
            cameraStreamBoundsKey={viewportKey}
            onViewportChange={handleViewportChange}
            onStormCameraPriority={handleStormCameraPriority}
            weather={weather}
            fun={fun}
            fullPage={fullPage}
            smoothMovementEnabled={smoothMovementEnabled}
            flightRefreshIntervalMs={flightRefreshIntervalMs}
            trainRefreshIntervalMs={trainRefreshIntervalMs}
            mapFetchedAt={mapFetchedAt}
            trainsFetchedAt={trainsFetchedAt}
          />
          {!fullPage ? (
          <div className="map-footer">
            {flightsEnabled ? (
              <span className="muted">
                Aircraft in view: {(inViewCount ?? flights.length).toLocaleString()}
              </span>
            ) : null}
            {railEnabled && trains.length ? (
              <span className="muted">Trains on map: {trains.length}</span>
            ) : null}
            {weatherAlertsEnabled && mapLayers.weatherAlerts?.count ? (
              <span className="muted map-tornado-legend">
                Weather alerts: {mapLayers.weatherAlerts.count}
                {alertLegendSummary(mapLayers.weatherAlerts)
                  ? ` · ${alertLegendSummary(mapLayers.weatherAlerts)}`
                  : ''}
              </span>
            ) : null}
            {lightningEnabled && mapLayers.lightning?.count ? (
              <span className="muted">Lightning strikes nearby: {mapLayers.lightning.count}</span>
            ) : null}
            {helosEnabled && heloCount ? (
              <span className="muted">Helicopters highlighted: {heloCount}</span>
            ) : null}
            {riversEnabled && mapLayers.rivers?.count ? (
              <span className="muted">River gauges: {mapLayers.rivers.count}</span>
            ) : null}
            {transitEnabled ? (
              <span className="muted">
                Metro vehicles
                {mapLayers.transit?.enabled === false
                  ? ` · ${mapLayers.transit.message || 'API key required'}`
                  : mapLayers.transit?.count
                    ? ` · ${mapLayers.transit.count}`
                    : ' · none nearby'}
              </span>
            ) : null}
            {roadsEnabled && mapLayers.roads?.count ? (
              <span className="muted">MoDOT incidents: {mapLayers.roads.count}</span>
            ) : null}
            {aisVesselsEnabled ? (
              <span className="muted">
                Large ships
                {mapLayers.aisVessels?.enabled === false
                  ? ` · ${mapLayers.aisVessels.message || 'username required'}`
                  : mapLayers.aisVessels?.count
                    ? ` · ${mapLayers.aisVessels.count}`
                    : ' · none nearby'}
              </span>
            ) : null}
            {earthquakesEnabled && mapLayers.earthquakes?.count ? (
              <span className="muted">Earthquakes (24h): {mapLayers.earthquakes.count}</span>
            ) : null}
            {wildfiresEnabled ? (
              <span className="muted">
                Wildfire hotspots
                {mapLayers.wildfires?.enabled === false
                  ? ` · ${mapLayers.wildfires.message || 'NASA key required'}`
                  : mapLayers.wildfires?.count
                    ? ` · ${mapLayers.wildfires.count}`
                    : ' · none nearby'}
              </span>
            ) : null}
            {camerasEnabled && viewportCameras?.count ? (
              <span className="muted">
                Highway cameras in view: {viewportCameras.count}
                {viewportCameras.statesWithCameras?.length
                  ? ` · ${viewportCameras.statesWithCameras.join(', ')}`
                  : ''}
                {viewportCameras.nationwide ? ' · nationwide' : ''}
              </span>
            ) : null}
            {camerasEnabled && viewportCameras?.coverageNote ? (
              <span className="muted">{viewportCameras.coverageNote}</span>
            ) : null}
            {camerasEnabled &&
            viewportCameras?.missingStates?.length &&
            viewportCameras.nationwide ? (
              <span className="muted">
                No cameras loaded for: {viewportCameras.missingStates.join(', ')}
              </span>
            ) : null}
            {railCamerasEnabled && viewportRailCameras?.count ? (
              <span className="rail-cam-badge">
                Rail cams nearby: {viewportRailCameras.count}
                {viewportRailCameras.cameras?.[0]?.distanceMiles != null
                  ? ` · closest ${viewportRailCameras.cameras[0].distanceMiles} mi`
                  : ''}
              </span>
            ) : null}
            {railCamerasEnabled && viewportRailCameras?.coverageNote && !viewportRailCameras.count ? (
              <span className="muted">{viewportRailCameras.coverageNote}</span>
            ) : null}
            {riverForecastEnabled && mapLayers.riverForecast?.count ? (
              <span className="muted">NWPS river forecasts: {mapLayers.riverForecast.count}</span>
            ) : null}
            {ebirdEnabled ? (
              <span className="muted">
                eBird
                {mapLayers.ebird?.enabled === false
                  ? ` · ${mapLayers.ebird.message || 'API key required'}`
                  : mapLayers.ebird?.count
                    ? ` · ${mapLayers.ebird.count}`
                    : ' · none recent'}
              </span>
            ) : null}
            {inaturalistEnabled && mapLayers.inaturalist?.count ? (
              <span className="muted">iNaturalist: {mapLayers.inaturalist.count}</span>
            ) : null}
            {aprsEnabled ? (
              <span className="muted">
                APRS
                {mapLayers.aprs?.enabled === false
                  ? ` · ${mapLayers.aprs.message || 'API key required'}`
                  : mapLayers.aprs?.count
                    ? ` · ${mapLayers.aprs.count}`
                    : ' · none nearby'}
              </span>
            ) : null}
            {droughtEnabled && mapLayers.drought?.homeLabel ? (
              <span className="muted">Drought here: {mapLayers.drought.homeLabel}</span>
            ) : null}
            {radarEnabled ? (
              <span className="muted">
                Radar {radarFrameLabel || 'loading…'}
                {radarAttribution ? (
                  <>
                    {' · '}
                    <a href={radarAttribution.url} target="_blank" rel="noreferrer">
                      {radarAttribution.name}
                    </a>
                  </>
                ) : null}
              </span>
            ) : (
              <span className="muted">Radar overlay off</span>
            )}
            <span className="muted">Click map for temp, wind, and conditions</span>
            {radarError ? <span className="map-radar-error">{radarError}</span> : null}
            {satellitesEnabled ? (
              <span className="muted">
                Satellites
                {satellitesLoading && !satelliteMeta ? ' loading…' : ''}
                {satelliteMeta ? ` · ${satelliteMeta.count} above ${satelliteMeta.minElevationDeg}°` : ''}
              </span>
            ) : (
              <span className="muted">Satellite overlay off</span>
            )}
            {satelliteError ? <span className="map-radar-error">{satelliteError}</span> : null}
            {layerErrors.map((message) => (
              <span key={message} className="map-radar-error">
                {message}
              </span>
            ))}
          </div>
          ) : null}
        </>
      )}
    </div>
  );
}
