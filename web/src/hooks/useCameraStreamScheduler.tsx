import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CAMERA_STREAM_MAX_CONCURRENT,
  CAMERA_STREAM_STAGGER_MS,
  classifyCameraStreamTier,
  compareStreamRequests,
  distanceToViewportCenter,
  type CameraStreamReason,
  type CameraStreamTier,
} from '../lib/cameraStreamScheduler';
import type { MapViewportBounds } from '../lib/mapViewport';

interface PendingRequest {
  id: string;
  lat: number;
  lon: number;
  reason: CameraStreamReason;
  tier: CameraStreamTier;
  distance: number;
}

interface ActiveStream {
  id: string;
  reason: CameraStreamReason;
  tier: CameraStreamTier;
}

interface CameraStreamSchedulerContextValue {
  requestStream: (id: string, lat: number, lon: number, reason: CameraStreamReason) => void;
  releaseStream: (id: string) => void;
  isStreamAllowed: (id: string) => boolean;
  getStreamTier: (lat: number, lon: number) => CameraStreamTier;
}

const CameraStreamSchedulerContext = createContext<CameraStreamSchedulerContextValue | null>(null);

function useSchedulerState(bounds: MapViewportBounds | null, boundsKey: string) {
  const [allowedIds, setAllowedIds] = useState<string[]>([]);
  const activeRef = useRef<Map<string, ActiveStream>>(new Map());
  const pendingRef = useRef<PendingRequest[]>([]);
  const staggerRef = useRef<number | null>(null);

  const clearStagger = useCallback(() => {
    if (staggerRef.current != null) {
      window.clearTimeout(staggerRef.current);
      staggerRef.current = null;
    }
  }, []);

  const syncAllowed = useCallback(() => {
    setAllowedIds([...activeRef.current.keys()]);
  }, []);

  const grant = useCallback(
    (request: PendingRequest) => {
      activeRef.current.set(request.id, {
        id: request.id,
        reason: request.reason,
        tier: request.tier,
      });
      syncAllowed();
    },
    [syncAllowed]
  );

  const evictLowestPriority = useCallback(() => {
    let candidate: ActiveStream | null = null;
    for (const stream of activeRef.current.values()) {
      if (stream.reason === 'storm') continue;
      if (!candidate) {
        candidate = stream;
        continue;
      }
      const currentRank = compareStreamRequests(
        { tier: stream.tier, distance: 0, reason: stream.reason },
        { tier: candidate.tier, distance: 0, reason: candidate.reason }
      );
      if (currentRank > 0) candidate = stream;
    }
    if (!candidate) return false;
    activeRef.current.delete(candidate.id);
    syncAllowed();
    return true;
  }, [syncAllowed]);

  const processQueue = useCallback(() => {
    clearStagger();
    while (activeRef.current.size < CAMERA_STREAM_MAX_CONCURRENT && pendingRef.current.length) {
      pendingRef.current.sort((a, b) =>
        compareStreamRequests(
          { tier: a.tier, distance: a.distance, reason: a.reason },
          { tier: b.tier, distance: b.distance, reason: b.reason }
        )
      );
      const next = pendingRef.current.shift();
      if (!next) break;
      grant(next);
    }

    if (activeRef.current.size >= CAMERA_STREAM_MAX_CONCURRENT || !pendingRef.current.length) {
      return;
    }

    staggerRef.current = window.setTimeout(() => {
      staggerRef.current = null;
      processQueue();
    }, CAMERA_STREAM_STAGGER_MS);
  }, [clearStagger, grant]);

  const enqueue = useCallback(
    (request: PendingRequest) => {
      pendingRef.current = pendingRef.current.filter((item) => item.id !== request.id);
      pendingRef.current.push(request);
      processQueue();
    },
    [processQueue]
  );

  const reset = useCallback(() => {
    clearStagger();
    activeRef.current.clear();
    pendingRef.current = [];
    syncAllowed();
  }, [clearStagger, syncAllowed]);

  useEffect(() => {
    reset();
  }, [boundsKey, reset]);

  useEffect(() => () => clearStagger(), [clearStagger]);

  const getTier = useCallback(
    (lat: number, lon: number) => classifyCameraStreamTier(lat, lon, bounds),
    [bounds]
  );

  const requestStream = useCallback(
    (id: string, lat: number, lon: number, reason: CameraStreamReason) => {
      const tier = getTier(lat, lon);
      const distance = bounds ? distanceToViewportCenter(lat, lon, bounds) : Number.POSITIVE_INFINITY;

      if (reason === 'tooltip' && tier === 'distant') return;

      if (activeRef.current.has(id)) {
        const existing = activeRef.current.get(id)!;
        if (reason === 'storm') {
          existing.reason = 'storm';
        } else if (reason === 'popup' && existing.reason === 'tooltip') {
          existing.reason = 'popup';
        }
        pendingRef.current = pendingRef.current.filter((item) => item.id !== id);
        syncAllowed();
        return;
      }

      const request: PendingRequest = { id, lat, lon, reason, tier, distance };

      if (reason === 'storm') {
        while (activeRef.current.size >= CAMERA_STREAM_MAX_CONCURRENT && evictLowestPriority()) {
          /* make room for storm briefing tiles */
        }
        grant(request);
        processQueue();
        return;
      }

      if (reason === 'popup' || tier === 'inView') {
        if (activeRef.current.size < CAMERA_STREAM_MAX_CONCURRENT) {
          grant(request);
          return;
        }
        if (reason === 'popup' && evictLowestPriority()) {
          grant(request);
          processQueue();
          return;
        }
        enqueue(request);
        return;
      }

      if (tier === 'nearby') {
        enqueue(request);
      }
    },
    [bounds, enqueue, evictLowestPriority, getTier, grant, processQueue, syncAllowed]
  );

  const releaseStream = useCallback(
    (id: string) => {
      pendingRef.current = pendingRef.current.filter((item) => item.id !== id);
      if (!activeRef.current.delete(id)) return;
      syncAllowed();
      processQueue();
    },
    [processQueue, syncAllowed]
  );

  const isStreamAllowed = useCallback((id: string) => allowedIds.includes(id), [allowedIds]);

  return { requestStream, releaseStream, isStreamAllowed, getStreamTier: getTier };
}

export function CameraStreamSchedulerProvider({
  bounds,
  boundsKey,
  children,
}: {
  bounds: MapViewportBounds | null;
  boundsKey: string;
  children: ReactNode;
}) {
  const { requestStream, releaseStream, isStreamAllowed, getStreamTier } = useSchedulerState(bounds, boundsKey);
  const value = useMemo(
    () => ({ requestStream, releaseStream, isStreamAllowed, getStreamTier }),
    [requestStream, releaseStream, isStreamAllowed, getStreamTier]
  );
  return (
    <CameraStreamSchedulerContext.Provider value={value}>{children}</CameraStreamSchedulerContext.Provider>
  );
}

export function useCameraStreamScheduler() {
  const ctx = useContext(CameraStreamSchedulerContext);
  if (!ctx) {
    throw new Error('useCameraStreamScheduler must be used within CameraStreamSchedulerProvider');
  }
  return ctx;
}
