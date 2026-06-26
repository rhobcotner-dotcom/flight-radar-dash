import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { Marker } from 'leaflet';
import { TrackSmoothingEngine, type TrackMotionHint, type TrackSmoothingProfile } from '../lib/trackSmoothing';

interface TrackSmoothingContextValue {
  engine: TrackSmoothingEngine;
  enabled: boolean;
}

const TrackSmoothingContext = createContext<TrackSmoothingContextValue | null>(null);

export function TrackSmoothingProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const engineRef = useRef(new TrackSmoothingEngine());
  const value = useMemo(
    () => ({ engine: engineRef.current, enabled }),
    [enabled]
  );

  useEffect(() => {
    if (!enabled) {
      engineRef.current = new TrackSmoothingEngine();
    }
  }, [enabled]);

  return <TrackSmoothingContext.Provider value={value}>{children}</TrackSmoothingContext.Provider>;
}

function useTrackSmoothingContext() {
  return useContext(TrackSmoothingContext);
}

export function useAnimatedMarkerPosition({
  trackId,
  lat,
  lon,
  motionHint,
  refreshIntervalMs,
  anchorKey,
  markerRef,
  profile = 'aircraft',
}: {
  trackId: string;
  lat: number;
  lon: number;
  motionHint?: TrackMotionHint;
  refreshIntervalMs: number;
  anchorKey: string | null | undefined;
  markerRef: MutableRefObject<Marker | null>;
  profile?: TrackSmoothingProfile;
}) {
  const context = useTrackSmoothingContext();
  const smoothingEnabled = Boolean(context?.enabled && refreshIntervalMs > 0);

  useEffect(() => {
    if (!smoothingEnabled || !context) return;
    context.engine.register(trackId, lat, lon, motionHint ?? {}, refreshIntervalMs, profile);
  }, [
    anchorKey,
    context,
    lat,
    lon,
    motionHint?.headingDeg,
    motionHint?.speedMph,
    profile,
    refreshIntervalMs,
    smoothingEnabled,
    trackId,
  ]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return undefined;

    if (!smoothingEnabled || !context) {
      marker.setLatLng([lat, lon]);
      return undefined;
    }

    let frame = 0;
    const tick = () => {
      const pos = context.engine.getPosition(trackId);
      if (pos) {
        markerRef.current?.setLatLng([pos.lat, pos.lon]);
      }
      frame = window.requestAnimationFrame(tick);
    };

    marker.setLatLng([lat, lon]);
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [anchorKey, context, lat, lon, markerRef, profile, refreshIntervalMs, smoothingEnabled, trackId]);
}

export function useTrackSmoothingCleanup(activeIds: Set<string>) {
  const context = useTrackSmoothingContext();

  useEffect(() => {
    if (!context?.enabled) return;
    context.engine.prune(activeIds);
  }, [activeIds, context]);
}
