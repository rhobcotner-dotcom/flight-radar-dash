import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  buildLiveTileUrl,
  buildRainviewerTileUrl,
  fetchRadarConfig,
  formatLiveRadarLabel,
  formatRadarFrameLabel,
  type FramesRadarPayload,
  type LiveRadarPayload,
} from '../lib/radar';

interface Props {
  enabled: boolean;
  opacity: number;
  onFrameLabel?: (label: string | null) => void;
  onAttribution?: (attribution: { name: string; url: string } | null) => void;
  onError?: (message: string | null) => void;
}

const RADAR_TILE_CLASS = 'radar-overlay-tiles';

function createLiveRadarLayer(payload: LiveRadarPayload, opacity: number, cacheBust: number) {
  return L.tileLayer(buildLiveTileUrl(payload.tileUrl, cacheBust), {
    opacity,
    tileSize: payload.tileSize,
    maxNativeZoom: payload.maxNativeZoom,
    maxZoom: payload.maxZoom,
    zIndex: 450,
    className: RADAR_TILE_CLASS,
    updateWhenZooming: false,
    updateWhenIdle: true,
    keepBuffer: 2,
  });
}

function createFrameRadarLayer(url: string, opacity: number) {
  return L.tileLayer(url, {
    opacity,
    tileSize: 256,
    maxNativeZoom: 9,
    maxZoom: 12,
    zIndex: 450,
    className: RADAR_TILE_CLASS,
    updateWhenZooming: false,
    updateWhenIdle: true,
    keepBuffer: 2,
  });
}

function swapRadarLayer(map: L.Map, nextLayer: L.TileLayer, previous: L.TileLayer | null) {
  nextLayer.addTo(map);

  if (!previous || !map.hasLayer(previous)) {
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (map.hasLayer(previous)) {
      map.removeLayer(previous);
    }
  };

  nextLayer.once('load', finish);
  window.setTimeout(finish, 2500);
}

export function RadarOverlay({
  enabled,
  opacity,
  onFrameLabel,
  onAttribution,
  onError,
}: Props) {
  const map = useMap();
  const activeLayerRef = useRef<L.TileLayer | null>(null);
  const latestFramePathRef = useRef<string | null>(null);
  const liveConfigRef = useRef<LiveRadarPayload | null>(null);
  const loadInFlightRef = useRef(false);
  const opacityRef = useRef(opacity);
  const onFrameLabelRef = useRef(onFrameLabel);
  const onAttributionRef = useRef(onAttribution);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    opacityRef.current = opacity;
    activeLayerRef.current?.setOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    onFrameLabelRef.current = onFrameLabel;
    onAttributionRef.current = onAttribution;
    onErrorRef.current = onError;
  }, [onFrameLabel, onAttribution, onError]);

  useEffect(() => {
    if (enabled) return undefined;

    if (activeLayerRef.current) {
      map.removeLayer(activeLayerRef.current);
      activeLayerRef.current = null;
    }
    latestFramePathRef.current = null;
    liveConfigRef.current = null;
    onFrameLabelRef.current?.(null);
    onAttributionRef.current?.(null);
    onErrorRef.current?.(null);

    return undefined;
  }, [enabled, map]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let refreshId = 0;
    let refreshMs = 90_000;

    async function applyLiveRefresh(payload: LiveRadarPayload, forceSwap: boolean) {
      const cacheBust = Date.now();
      onFrameLabelRef.current?.(formatLiveRadarLabel({ ...payload, fetchedAt: cacheBust }));

      if (!forceSwap && liveConfigRef.current && activeLayerRef.current) {
        activeLayerRef.current.setUrl(buildLiveTileUrl(payload.tileUrl, cacheBust));
        return;
      }

      const nextLayer = createLiveRadarLayer(payload, opacityRef.current, cacheBust);
      const previous = activeLayerRef.current;
      activeLayerRef.current = nextLayer;
      liveConfigRef.current = payload;
      swapRadarLayer(map, nextLayer, previous);
    }

    async function applyFrameRefresh(payload: FramesRadarPayload) {
      if (!payload.frames.length) {
        onErrorRef.current?.('No radar frames available right now.');
        onFrameLabelRef.current?.(null);
        return;
      }

      onErrorRef.current?.(null);

      const latest = payload.frames[payload.frames.length - 1];
      const url = buildRainviewerTileUrl(payload.host, latest.path);
      onFrameLabelRef.current?.(formatRadarFrameLabel(latest.time));

      if (latestFramePathRef.current === latest.path && activeLayerRef.current) {
        return;
      }

      const nextLayer = createFrameRadarLayer(url, opacityRef.current);
      const previous = activeLayerRef.current;
      activeLayerRef.current = nextLayer;
      latestFramePathRef.current = latest.path;
      swapRadarLayer(map, nextLayer, previous);
    }

    async function loadRadar() {
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;

      try {
        const data = await fetchRadarConfig();
        if (cancelled) return;

        onAttributionRef.current?.(data.attribution);
        onErrorRef.current?.(null);
        refreshMs = data.refreshMs;

        if (data.mode === 'live') {
          await applyLiveRefresh(data, !liveConfigRef.current);
        } else {
          await applyFrameRefresh(data);
        }
      } catch (err) {
        if (!cancelled) {
          onErrorRef.current?.(err instanceof Error ? err.message : 'Radar overlay unavailable');
        }
      } finally {
        loadInFlightRef.current = false;
      }
    }

    function startRefreshLoop() {
      if (refreshId) return;
      refreshId = window.setInterval(() => {
        void loadRadar();
      }, refreshMs);
    }

    void loadRadar().finally(startRefreshLoop);

    return () => {
      cancelled = true;
      if (refreshId) {
        window.clearInterval(refreshId);
      }
    };
  }, [enabled, map]);

  useEffect(() => {
    return () => {
      if (activeLayerRef.current) {
        map.removeLayer(activeLayerRef.current);
        activeLayerRef.current = null;
      }
    };
  }, [map]);

  return null;
}
