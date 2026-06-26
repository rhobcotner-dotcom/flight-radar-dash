import { useCallback, useEffect, useRef, useState } from 'react';
import { Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { enrichWeatherConditions } from '../../../lib/weatherCodes.js';
import { fetchJson } from '../lib/fetchJson';
import { distanceMiles } from '../lib/flightUtils';
import {
  mergeStormCameraPool,
  nearestStormCamerasFromViewport,
  STORM_CAMERA_POOL_LIMIT,
  STORM_CAMERA_RADIUS_MILES,
  stormCameraModeParam,
  stormCameraPoolIds,
  stormPoolHasCameras,
  type StormAnalysis,
  type StormCamera,
  type StormCameraMode,
} from '../lib/stormCellCameras';
import type { TrafficCameraPayload } from '../lib/mapLayers';
import type { WeatherConditions } from '../types';
import { isMapDeadSpaceClick, isStormRadarClick } from '../lib/mapClick';
import { weatherHoverHtml } from '../lib/weatherFormat';
import { resolveMapPlaceLabel } from '../lib/mapLocation';
import { StormBriefingPopup } from './StormBriefingPopup';

const HOVER_CACHE_TTL_MS = 60 * 1000;
const STORM_CACHE_TTL_MS = 90 * 1000;
const SNAP_DEGREES = 0.05;
const MILES_TO_METERS = 1609.34;

export type { StormAnalysis, StormCamera };

function defaultGlowRadiusMiles(analysis: StormAnalysis) {
  return analysis.cellRadiusMiles ?? 4;
}

function clearWeatherTooltip(
  map: L.Map,
  tooltip: L.Tooltip | null,
  bumpRequest: () => void
) {
  if (!tooltip || !map.hasLayer(tooltip)) return;
  bumpRequest();
  map.removeLayer(tooltip);
}

function snapCoordinate(value: number) {
  return Math.round(value / SNAP_DEGREES) * SNAP_DEGREES;
}

function showStormMissHint(map: L.Map, latlng: L.LatLng, radarNoir = false) {
  const hint = L.tooltip({
    permanent: true,
    direction: 'top',
    offset: [0, -12],
    opacity: 1,
    className: 'storm-click-hint-tooltip',
  })
    .setLatLng(latlng)
    .setContent(
      `<div class="storm-click-hint">No storm echo here — click a ${radarNoir ? 'brown ink' : 'colored'} radar smudge</div>`
    );
  hint.addTo(map);
  window.setTimeout(() => {
    if (map.hasLayer(hint)) map.removeLayer(hint);
  }, 2800);
}

async function fetchNearStormCameras(
  clickLat: number,
  clickLon: number,
  cameraMode: StormCameraMode
): Promise<StormCamera[]> {
  const params = new URLSearchParams({
    lat: String(clickLat),
    lon: String(clickLon),
    radiusMiles: String(STORM_CAMERA_RADIUS_MILES),
    limit: String(STORM_CAMERA_POOL_LIMIT),
    cameraMode: stormCameraModeParam(cameraMode),
  });
  const data = await fetchJson<{ cameras?: StormCamera[] }>(`/api/live/cameras-near?${params.toString()}`);
  return (data.cameras ?? []).map((cam) => ({
    ...cam,
    distanceMiles: Math.round(distanceMiles(clickLat, clickLon, cam.lat, cam.lon) * 10) / 10,
  }));
}

interface BriefingState {
  key: string;
  position: [number, number];
  analysis: StormAnalysis;
  glowCenter: [number, number];
  glowRadiusMiles: number;
  locationLabel?: string | null;
}

interface Props {
  radarEnabled: boolean;
  radarNoir?: boolean;
  stormCameraMode?: StormCameraMode;
  viewportCameras?: TrafficCameraPayload | null;
  onStormCameraPriority?: (lat: number, lon: number) => void;
}

function StormCellGlow({ center, radiusMiles }: { center: [number, number]; radiusMiles: number }) {
  const coreMeters = Math.max(radiusMiles * MILES_TO_METERS, 1200);
  const pulseMeters = coreMeters * 1.45;

  return (
    <>
      <Circle
        center={center}
        radius={pulseMeters}
        className="storm-cell-glow-pulse"
        pathOptions={{
          color: '#7dd3fc',
          fillColor: '#0ea5e9',
          fillOpacity: 0.1,
          weight: 2,
          opacity: 0.55,
          interactive: false,
        }}
      />
      <Circle
        center={center}
        radius={coreMeters}
        className="storm-cell-glow-core"
        pathOptions={{
          color: '#38bdf8',
          fillColor: '#38bdf8',
          fillOpacity: 0.18,
          weight: 2.5,
          opacity: 0.95,
          interactive: false,
        }}
      />
    </>
  );
}

export function StormCellClick({
  radarEnabled,
  radarNoir = false,
  stormCameraMode = 'live-only',
  viewportCameras = null,
  onStormCameraPriority,
}: Props) {
  const map = useMap();
  const [briefing, setBriefing] = useState<BriefingState | null>(null);
  const weatherTooltipRef = useRef<L.Tooltip | null>(null);
  const weatherCacheRef = useRef(new Map<string, { weather: WeatherConditions; fetchedAt: number }>());
  const stormCacheRef = useRef(new Map<string, { analysis: StormAnalysis; fetchedAt: number }>());
  const weatherRequestRef = useRef(0);
  const stormRequestRef = useRef(0);
  const viewportCamerasRef = useRef(viewportCameras);
  const briefingPoolRef = useRef(new Map<string, StormCamera[]>());
  const nearCamerasPendingRef = useRef(false);
  const lastCameraIdsRef = useRef<string>('');
  const openBriefingKeyRef = useRef<string | null>(null);
  const openBriefingPositionRef = useRef<[number, number] | null>(null);
  const radarEnabledRef = useRef(radarEnabled);
  const radarNoirRef = useRef(radarNoir);
  const stormCameraModeRef = useRef(stormCameraMode);
  radarEnabledRef.current = radarEnabled;
  radarNoirRef.current = radarNoir;
  stormCameraModeRef.current = stormCameraMode;
  viewportCamerasRef.current = viewportCameras;

  const closeBriefing = useCallback(() => {
    openBriefingKeyRef.current = null;
    openBriefingPositionRef.current = null;
    setBriefing(null);
    lastCameraIdsRef.current = '';
    if (map.isPopupOpen()) {
      map.closePopup();
    }
  }, [map]);

  const publishBriefing = useCallback(
    (key: string, position: [number, number], analysis: StormAnalysis, locationLabel?: string | null) => {
      const mode = stormCameraModeRef.current;
      const previousPool = briefingPoolRef.current.get(key) ?? [];
      const cameraPool = mergeStormCameraPool(analysis, viewportCamerasRef.current, previousPool, mode);
      if (cameraPool.length) {
        briefingPoolRef.current.set(key, cameraPool);
      }

      const cameraIds = stormCameraPoolIds(cameraPool);
      const merged: StormAnalysis = {
        ...analysis,
        cameraPool,
        camerasLoading:
          analysis.camerasLoading ??
          (nearCamerasPendingRef.current && !stormPoolHasCameras(cameraPool, mode)),
      };
      const glowCenter: [number, number] = [
        merged.clickLat ?? position[0],
        merged.clickLon ?? position[1],
      ];
      const glowRadiusMiles = defaultGlowRadiusMiles(merged);

      setBriefing((current) => {
        if (
          current?.key === key &&
          cameraIds === lastCameraIdsRef.current &&
          current.analysis.loading === merged.loading &&
          Boolean(current.analysis.radar) === Boolean(merged.radar) &&
          current.analysis.summary === merged.summary &&
          (locationLabel ?? current.locationLabel) === current.locationLabel
        ) {
          return current;
        }
        lastCameraIdsRef.current = cameraIds;
        openBriefingKeyRef.current = key;
        openBriefingPositionRef.current = position;
        return {
          key,
          position,
          analysis: merged,
          glowCenter,
          glowRadiusMiles,
          locationLabel: locationLabel ?? current?.locationLabel ?? null,
        };
      });
    },
    []
  );

  const showStormAnalysis = useCallback(
    async (latlng: L.LatLng) => {
      const clickLat = latlng.lat;
      const clickLon = latlng.lng;
      const snapLat = snapCoordinate(clickLat);
      const snapLon = snapCoordinate(clickLon);
      const key = `${snapLat.toFixed(2)}:${snapLon.toFixed(2)}`;
      const reqId = ++stormRequestRef.current;
      const position: [number, number] = [clickLat, clickLon];

      briefingPoolRef.current.delete(key);
      lastCameraIdsRef.current = '';
      nearCamerasPendingRef.current = true;
      onStormCameraPriority?.(clickLat, clickLon);

      const locationPromise = resolveMapPlaceLabel(clickLat, clickLon).catch(() => null);
      const cameraMode = stormCameraModeRef.current;
      const nearCamerasPromise = fetchNearStormCameras(clickLat, clickLon, cameraMode);

      const instantPool = nearestStormCamerasFromViewport(
        clickLat,
        clickLon,
        viewportCamerasRef.current,
        STORM_CAMERA_RADIUS_MILES,
        STORM_CAMERA_POOL_LIMIT,
        cameraMode
      );

      const loadingShell: StormAnalysis = {
        hasStorm: true,
        lat: snapLat,
        lon: snapLon,
        clickLat,
        clickLon,
        summary: 'Analyzing storm cell…',
        brief: '',
        loading: true,
        camerasLoading: !stormPoolHasCameras(instantPool, cameraMode),
        cameraPool: instantPool,
      };

      publishBriefing(key, position, loadingShell, (await locationPromise)?.label ?? null);

      void nearCamerasPromise
        .then((nearCameras) => {
          nearCamerasPendingRef.current = false;
          if (reqId !== stormRequestRef.current) return;
          if (!nearCameras.length && !briefingPoolRef.current.get(key)?.length) return;
          const cached = stormCacheRef.current.get(key);
          publishBriefing(key, position, {
            ...(cached?.analysis ?? loadingShell),
            lat: snapLat,
            lon: snapLon,
            clickLat,
            clickLon,
            loading: cached?.analysis?.radar ? undefined : true,
            camerasLoading: !stormPoolHasCameras(nearCameras, cameraMode),
            cameras: nearCameras,
          });
        })
        .catch(() => {
          nearCamerasPendingRef.current = false;
          /* keep viewport / analysis cameras */
        });

      const cachedEntry = stormCacheRef.current.get(key);
      let analysis =
        cachedEntry && Date.now() - cachedEntry.fetchedAt < STORM_CACHE_TTL_MS
          ? cachedEntry.analysis
          : null;

      if (!analysis) {
        try {
          const params = new URLSearchParams({
            lat: String(snapLat),
            lon: String(snapLon),
            cameraMode: stormCameraModeParam(cameraMode),
          });
          analysis = await fetchJson<StormAnalysis>(`/api/weather/storm-analysis?${params.toString()}`);
          if (analysis.hasStorm) {
            stormCacheRef.current.set(key, { analysis, fetchedAt: Date.now() });
          }
        } catch {
          if (reqId !== stormRequestRef.current) return;
          closeBriefing();
          showStormMissHint(map, latlng, radarNoirRef.current);
          return;
        }
      }

      if (reqId !== stormRequestRef.current) return;

      if (!analysis.hasStorm) {
        closeBriefing();
        showStormMissHint(map, latlng, radarNoirRef.current);
        return;
      }

      publishBriefing(key, position, {
        ...analysis,
        clickLat,
        clickLon,
        cameras: analysis.cameras?.length ? analysis.cameras : undefined,
        camerasLoading:
          nearCamerasPendingRef.current &&
          !stormPoolHasCameras(briefingPoolRef.current.get(key), cameraMode),
      });
    },
    [closeBriefing, map, onStormCameraPriority, publishBriefing]
  );

  const showWeather = useCallback(
    async (latlng: L.LatLng) => {
      const weatherTooltip = weatherTooltipRef.current;
      if (!weatherTooltip) return;

      const snapLat = snapCoordinate(latlng.lat);
      const snapLon = snapCoordinate(latlng.lng);
      const key = `${snapLat.toFixed(2)}:${snapLon.toFixed(2)}`;
      const reqId = ++weatherRequestRef.current;
      const locationPromise = resolveMapPlaceLabel(latlng.lat, latlng.lng).catch(() => null);

      weatherTooltip
        .setLatLng(latlng)
        .setContent('<div class="map-weather-hover-body muted">Loading…</div>');
      if (!map.hasLayer(weatherTooltip)) weatherTooltip.addTo(map);

      const cached = weatherCacheRef.current.get(key);
      let weather =
        cached && Date.now() - cached.fetchedAt < HOVER_CACHE_TTL_MS
          ? enrichWeatherConditions(cached.weather)
          : null;

      if (!weather) {
        const params = new URLSearchParams({ lat: String(snapLat), lon: String(snapLon) });
        const data = await fetchJson<{ weather: WeatherConditions; error?: string }>(
          `/api/weather?${params.toString()}`
        );
        weather = enrichWeatherConditions(data.weather);
        weatherCacheRef.current.set(key, { weather, fetchedAt: Date.now() });
      }

      if (reqId !== weatherRequestRef.current) return;
      const place = await locationPromise;
      if (reqId !== weatherRequestRef.current) return;
      weatherTooltip.setContent(weatherHoverHtml(weather, place?.label));
    },
    [map]
  );

  useMapEvents({
    click(event) {
      if (radarEnabledRef.current) {
        if (!isStormRadarClick(event)) return;
        clearWeatherTooltip(map, weatherTooltipRef.current, () => {
          weatherRequestRef.current += 1;
        });
        void showStormAnalysis(event.latlng);
        return;
      }

      if (!isMapDeadSpaceClick(event)) return;

      const dismissingPopup = map.isPopupOpen();
      const dismissingWeather = weatherTooltipRef.current && map.hasLayer(weatherTooltipRef.current);
      const dismissingBriefing = openBriefingKeyRef.current != null;

      if (dismissingPopup) map.closePopup();
      if (dismissingBriefing) closeBriefing();
      if (dismissingWeather && weatherTooltipRef.current) {
        clearWeatherTooltip(map, weatherTooltipRef.current, () => {
          weatherRequestRef.current += 1;
        });
      }

      if (dismissingPopup || dismissingBriefing || dismissingWeather) return;

      void showWeather(event.latlng);
    },
  });

  useEffect(() => {
    const weatherTooltip = L.tooltip({
      permanent: true,
      direction: 'top',
      offset: [0, -14],
      opacity: 1,
      className: 'map-weather-click-tooltip',
    });
    weatherTooltipRef.current = weatherTooltip;

    return () => {
      weatherRequestRef.current += 1;
      stormRequestRef.current += 1;
      closeBriefing();
      map.getContainer().classList.remove('storm-analysis-cursor');
      if (map.hasLayer(weatherTooltip)) map.removeLayer(weatherTooltip);
      weatherTooltipRef.current = null;
      briefingPoolRef.current.clear();
    };
  }, [closeBriefing, map]);

  useEffect(() => {
    if (radarEnabled) {
      clearWeatherTooltip(map, weatherTooltipRef.current, () => {
        weatherRequestRef.current += 1;
      });
      return;
    }
    closeBriefing();
  }, [radarEnabled, closeBriefing, map]);

  useEffect(() => {
    const key = openBriefingKeyRef.current;
    const position = openBriefingPositionRef.current;
    if (!key || !position) return;
    const cached = stormCacheRef.current.get(key);
    if (!cached?.analysis?.hasStorm) return;
    publishBriefing(key, position, {
      ...cached.analysis,
      clickLat: position[0],
      clickLon: position[1],
    });
  }, [viewportCameras, publishBriefing]);

  useEffect(() => {
    const key = openBriefingKeyRef.current;
    const position = openBriefingPositionRef.current;
    if (!key || !position) return;
    const cached = stormCacheRef.current.get(key);
    if (!cached?.analysis?.hasStorm) return;

    const clickLat = position[0];
    const clickLon = position[1];
    briefingPoolRef.current.delete(key);
    lastCameraIdsRef.current = '';
    nearCamerasPendingRef.current = true;

    const instantPool = nearestStormCamerasFromViewport(
      clickLat,
      clickLon,
      viewportCamerasRef.current,
      STORM_CAMERA_RADIUS_MILES,
      STORM_CAMERA_POOL_LIMIT,
      stormCameraMode
    );

    publishBriefing(key, position, {
      ...cached.analysis,
      clickLat,
      clickLon,
      cameras: undefined,
      cameraPool: instantPool,
      camerasLoading: !stormPoolHasCameras(instantPool, stormCameraMode),
    });

    void fetchNearStormCameras(clickLat, clickLon, stormCameraMode)
      .then((nearCameras) => {
        nearCamerasPendingRef.current = false;
        publishBriefing(key, position, {
          ...cached.analysis,
          clickLat,
          clickLon,
          cameras: nearCameras,
          camerasLoading: !stormPoolHasCameras(nearCameras, stormCameraMode),
        });
      })
      .catch(() => {
        nearCamerasPendingRef.current = false;
      });
  }, [stormCameraMode, publishBriefing]);

  useEffect(() => {
    map.getContainer().classList.toggle('storm-analysis-cursor', radarEnabled);
    return () => map.getContainer().classList.remove('storm-analysis-cursor');
  }, [map, radarEnabled]);

  return (
    <>
      {briefing ? (
        <>
          <StormCellGlow center={briefing.glowCenter} radiusMiles={briefing.glowRadiusMiles} />
          <StormBriefingPopup
            position={briefing.position}
            analysis={briefing.analysis}
            locationLabel={briefing.locationLabel}
            stormCameraMode={stormCameraMode}
            onClose={closeBriefing}
          />
        </>
      ) : null}
    </>
  );
}
