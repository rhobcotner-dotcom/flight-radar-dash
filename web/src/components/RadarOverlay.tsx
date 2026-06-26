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
  type RadarFrame,
} from '../lib/radar';
import {
  blendFrameLabel,
  pickFrameBlend,
  virtualRadarTimeSec,
} from '../lib/radarSmoothing';

interface Props {
  enabled: boolean;
  opacity: number;
  onFrameLabel?: (label: string | null) => void;
  onAttribution?: (attribution: { name: string; url: string } | null) => void;
  onError?: (message: string | null) => void;
}

const RADAR_TILE_CLASS = 'radar-overlay-tiles';

interface RadarAnimationState {
  mode: 'live' | 'frames';
  refreshMs: number;
  segmentStart: number;
  host: string;
  frames: RadarFrame[];
  liveFromBust: number | null;
  liveToBust: number | null;
  livePayload: LiveRadarPayload | null;
}

function createLiveRadarLayer(payload: LiveRadarPayload, url: string, opacity: number) {
  return L.tileLayer(url, {
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

function ensureLayerOnMap(map: L.Map, layer: L.TileLayer | null) {
  if (layer && !map.hasLayer(layer)) {
    layer.addTo(map);
  }
}

export function RadarOverlay({
  enabled,
  opacity,
  onFrameLabel,
  onAttribution,
  onError,
}: Props) {
  const map = useMap();
  const backLayerRef = useRef<L.TileLayer | null>(null);
  const frontLayerRef = useRef<L.TileLayer | null>(null);
  const stateRef = useRef<RadarAnimationState | null>(null);
  const loadInFlightRef = useRef(false);
  const opacityRef = useRef(opacity);
  const onFrameLabelRef = useRef(onFrameLabel);
  const onAttributionRef = useRef(onAttribution);
  const onErrorRef = useRef(onError);
  const lastBlendKeyRef = useRef<string | null>(null);

  useEffect(() => {
    opacityRef.current = opacity;
  }, [opacity]);

  useEffect(() => {
    onFrameLabelRef.current = onFrameLabel;
    onAttributionRef.current = onAttribution;
    onErrorRef.current = onError;
  }, [onFrameLabel, onAttribution, onError]);

  useEffect(() => {
    if (enabled) return undefined;

    for (const layer of [backLayerRef.current, frontLayerRef.current]) {
      if (layer && map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    }
    backLayerRef.current = null;
    frontLayerRef.current = null;
    stateRef.current = null;
    lastBlendKeyRef.current = null;
    onFrameLabelRef.current?.(null);
    onAttributionRef.current?.(null);
    onErrorRef.current?.(null);

    return undefined;
  }, [enabled, map]);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let refreshId = 0;
    let frameId = 0;

    function applyLayerOpacities(backOpacity: number, frontOpacity: number) {
      const max = opacityRef.current;
      backLayerRef.current?.setOpacity(max * backOpacity);
      frontLayerRef.current?.setOpacity(max * frontOpacity);
    }

    function setFrameLayerUrls(fromUrl: string, toUrl: string) {
      const blendKey = `${fromUrl}|${toUrl}`;
      if (lastBlendKeyRef.current === blendKey) return;
      lastBlendKeyRef.current = blendKey;

      if (!backLayerRef.current) {
        backLayerRef.current = createFrameRadarLayer(fromUrl, 0);
        backLayerRef.current.addTo(map);
      } else {
        backLayerRef.current.setUrl(fromUrl);
      }

      if (!frontLayerRef.current) {
        frontLayerRef.current = createFrameRadarLayer(toUrl, 0);
        frontLayerRef.current.addTo(map);
      } else {
        frontLayerRef.current.setUrl(toUrl);
      }

      ensureLayerOnMap(map, backLayerRef.current);
      ensureLayerOnMap(map, frontLayerRef.current);
    }

    function setLiveLayerUrls(fromUrl: string, toUrl: string, payload: LiveRadarPayload) {
      const blendKey = `${fromUrl}|${toUrl}`;
      if (lastBlendKeyRef.current === blendKey) return;
      lastBlendKeyRef.current = blendKey;

      if (!backLayerRef.current) {
        backLayerRef.current = createLiveRadarLayer(payload, fromUrl, 0);
        backLayerRef.current.addTo(map);
      } else {
        backLayerRef.current.setUrl(fromUrl);
      }

      if (!frontLayerRef.current) {
        frontLayerRef.current = createLiveRadarLayer(payload, toUrl, 0);
        frontLayerRef.current.addTo(map);
      } else {
        frontLayerRef.current.setUrl(toUrl);
      }

      ensureLayerOnMap(map, backLayerRef.current);
      ensureLayerOnMap(map, frontLayerRef.current);
    }

    function renderFrame(state: RadarAnimationState, now: number) {
      if (state.frames.length < 2) {
        const latest = state.frames[state.frames.length - 1];
        if (!latest) return;
        const url = buildRainviewerTileUrl(state.host, latest.path);
        setFrameLayerUrls(url, url);
        applyLayerOpacities(0, 1);
        onFrameLabelRef.current?.(formatRadarFrameLabel(latest.time));
        return;
      }

      const progress = Math.min(1, Math.max(0, (now - state.segmentStart) / state.refreshMs));
      const virtualTime = virtualRadarTimeSec(state.frames, progress);
      const blend = pickFrameBlend(state.frames, virtualTime);
      if (!blend) return;

      const fromUrl = buildRainviewerTileUrl(state.host, blend.from.path);
      const toUrl = buildRainviewerTileUrl(state.host, blend.to.path);
      setFrameLayerUrls(fromUrl, toUrl);
      applyLayerOpacities(1 - blend.t, blend.t);
      onFrameLabelRef.current?.(formatRadarFrameLabel(blendFrameLabel(blend)));
    }

    function renderLive(state: RadarAnimationState, now: number) {
      const payload = state.livePayload;
      if (!payload || state.liveToBust == null) return;

      const toUrl = buildLiveTileUrl(payload.tileUrl, state.liveToBust);
      const crossfadeMs = Math.min(8_000, Math.max(2_000, state.refreshMs / 6));

      if (state.liveFromBust == null || state.liveFromBust === state.liveToBust) {
        setLiveLayerUrls(toUrl, toUrl, payload);
        applyLayerOpacities(0, 1);
      } else {
        const progress = Math.min(1, Math.max(0, (now - state.segmentStart) / crossfadeMs));
        const fromUrl = buildLiveTileUrl(payload.tileUrl, state.liveFromBust);
        setLiveLayerUrls(fromUrl, toUrl, payload);
        applyLayerOpacities(1 - progress, progress);
      }

      onFrameLabelRef.current?.(formatLiveRadarLabel({ ...payload, fetchedAt: state.liveToBust }));
    }

    function tick(now: number) {
      const state = stateRef.current;
      if (!state) return;
      if (state.mode === 'frames') {
        renderFrame(state, now);
      } else {
        renderLive(state, now);
      }
    }

    function beginSegment(patch: Partial<RadarAnimationState>) {
      const prev = stateRef.current;
      stateRef.current = {
        mode: patch.mode ?? prev?.mode ?? 'live',
        refreshMs: patch.refreshMs ?? prev?.refreshMs ?? 90_000,
        segmentStart: patch.segmentStart ?? Date.now(),
        host: patch.host ?? prev?.host ?? '',
        frames: patch.frames ?? prev?.frames ?? [],
        liveFromBust: patch.liveFromBust ?? prev?.liveFromBust ?? null,
        liveToBust: patch.liveToBust ?? prev?.liveToBust ?? null,
        livePayload: patch.livePayload ?? prev?.livePayload ?? null,
      };
      lastBlendKeyRef.current = null;
      tick(Date.now());
    }

    function scheduleRefreshLoop() {
      if (refreshId) {
        window.clearInterval(refreshId);
      }
      refreshId = window.setInterval(() => {
        void loadRadar();
      }, stateRef.current?.refreshMs ?? 90_000);
    }

    async function applyLiveRefresh(payload: LiveRadarPayload) {
      const cacheBust = Date.now();
      const prev = stateRef.current;
      beginSegment({
        mode: 'live',
        refreshMs: payload.refreshMs,
        segmentStart: Date.now(),
        livePayload: payload,
        liveFromBust: prev?.liveToBust ?? null,
        liveToBust: cacheBust,
        frames: [],
        host: '',
      });
      scheduleRefreshLoop();
    }

    async function applyFrameRefresh(payload: FramesRadarPayload) {
      if (!payload.frames.length) {
        onErrorRef.current?.('No radar frames available right now.');
        onFrameLabelRef.current?.(null);
        return;
      }

      onErrorRef.current?.(null);
      beginSegment({
        mode: 'frames',
        refreshMs: payload.refreshMs,
        segmentStart: Date.now(),
        host: payload.host,
        frames: payload.frames,
        liveFromBust: null,
        liveToBust: null,
        livePayload: null,
      });
      scheduleRefreshLoop();
    }

    async function loadRadar() {
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;

      try {
        const data = await fetchRadarConfig();
        if (cancelled) return;

        onAttributionRef.current?.(data.attribution);
        onErrorRef.current?.(null);

        if (data.mode === 'live') {
          await applyLiveRefresh(data);
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

    const animate = () => {
      tick(Date.now());
      frameId = window.requestAnimationFrame(animate);
    };
    frameId = window.requestAnimationFrame(animate);

    void loadRadar();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      if (refreshId) {
        window.clearInterval(refreshId);
      }
    };
  }, [enabled, map]);

  useEffect(() => {
    return () => {
      for (const layer of [backLayerRef.current, frontLayerRef.current]) {
        if (layer && map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      }
      backLayerRef.current = null;
      frontLayerRef.current = null;
    };
  }, [map]);

  return null;
}
