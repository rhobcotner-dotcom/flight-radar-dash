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

  useEffect(() => {
    if (!enabled) return undefined;

    let frame = 0;
    const tick = () => {
      engineRef.current.tickMarkers(Date.now());
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [enabled]);

  return <TrackSmoothingContext.Provider value={value}>{children}</TrackSmoothingContext.Provider>;
}

function useTrackSmoothingContext() {
  return useContext(TrackSmoothingContext);
}

function applyMarkerPosition(
  markerRef: MutableRefObject<Marker | null>,
  lat: number,
  lon: number,
  positionRef?: MutableRefObject<[number, number]>
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (positionRef) {
    positionRef.current[0] = lat;
    positionRef.current[1] = lon;
  }
  markerRef.current?.setLatLng([lat, lon]);
}

export function useAnimatedMarkerPosition({
  trackId,
  lat,
  lon,
  motionHint,
  refreshIntervalMs,
  anchorKey,
  markerRef,
  positionRef,
  profile = 'aircraft',
}: {
  trackId: string;
  lat: number;
  lon: number;
  motionHint?: TrackMotionHint;
  refreshIntervalMs: number;
  anchorKey: string | null | undefined;
  markerRef: MutableRefObject<Marker | null>;
  positionRef?: MutableRefObject<[number, number]>;
  profile?: TrackSmoothingProfile;
}) {
  const context = useTrackSmoothingContext();
  const smoothingEnabled = Boolean(context?.enabled && refreshIntervalMs > 0);
  const latestFixRef = useRef({ lat, lon });

  useEffect(() => {
    latestFixRef.current = { lat, lon };
  }, [lat, lon]);

  useEffect(() => {
    if (!smoothingEnabled || !context) return;
    context.engine.register(trackId, lat, lon, motionHint ?? {}, refreshIntervalMs, profile);
    const pos = context.engine.getPosition(trackId) ?? { lat, lon };
    applyMarkerPosition(markerRef, pos.lat, pos.lon, positionRef);
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
    markerRef,
    positionRef,
  ]);

  useEffect(() => {
    if (smoothingEnabled) return;
    applyMarkerPosition(markerRef, lat, lon, positionRef);
  }, [lat, lon, markerRef, positionRef, smoothingEnabled]);

  useEffect(() => {
    if (!smoothingEnabled || !context) return undefined;

    return context.engine.registerMarkerSink(trackId, (now) => {
      const pos = context.engine.getPosition(trackId, now) ?? latestFixRef.current;
      applyMarkerPosition(markerRef, pos.lat, pos.lon, positionRef);
    });
  }, [context, markerRef, positionRef, smoothingEnabled, trackId]);
}

export function useTrackSmoothingCleanup(activeIds: Set<string>) {
  const context = useTrackSmoothingContext();

  useEffect(() => {
    if (!context?.enabled) return;
    context.engine.prune(activeIds);
  }, [activeIds, context]);
}
