import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapViewportBounds } from '../lib/mapViewport';
import { stableViewportKey, viewportSearchParams } from '../lib/mapViewport';
import type { OccupancyPoint } from '../lib/occupancyUtils';

interface OccupancyPayload {
  points?: OccupancyPoint[];
  pointCount?: number;
  realCount?: number;
  fetchedAt?: string;
}

const VIEWPORT_QUERY_DEBOUNCE_MS = 200;

export function useOccupancyOverlay(
  queryString: string,
  viewportBounds: MapViewportBounds | null,
  enabled = false,
  refreshSeconds = 45
) {
  const viewportKey = viewportBounds ? stableViewportKey(viewportBounds) : 'home';
  const [debouncedViewportKey, setDebouncedViewportKey] = useState(viewportKey);
  const requestQuery = useMemo(
    () => viewportSearchParams(queryString, viewportBounds).toString(),
    [queryString, debouncedViewportKey, viewportBounds]
  );
  const [points, setPoints] = useState<OccupancyPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ pointCount: number; realCount: number; fetchedAt: string | null }>({
    pointCount: 0,
    realCount: 0,
    fetchedAt: null,
  });
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedViewportKey(viewportKey);
    }, VIEWPORT_QUERY_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [viewportKey]);

  const load = useCallback(async () => {
    if (!enabled) return;
    const generation = loadGenerationRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/live/occupancy?${requestQuery}`);
      const data = (await res.json()) as OccupancyPayload;
      if (generation !== loadGenerationRef.current) return;
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to load occupancy');
      setPoints(Array.isArray(data.points) ? data.points : []);
      setMeta({
        pointCount: data.pointCount ?? data.points?.length ?? 0,
        realCount: data.realCount ?? 0,
        fetchedAt: data.fetchedAt ?? new Date().toISOString(),
      });
      setError(null);
    } catch (err) {
      if (generation !== loadGenerationRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load occupancy');
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, requestQuery]);

  useEffect(() => {
    if (!enabled) {
      setPoints([]);
      return undefined;
    }
    loadGenerationRef.current += 1;
    void load();
    const timer = window.setInterval(() => void load(), refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [enabled, load, refreshSeconds, debouncedViewportKey]);

  return { points, loading, error, meta, reload: load };
}
