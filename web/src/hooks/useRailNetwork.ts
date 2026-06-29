import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeatureCollection, LineString } from 'geojson';
import { friendlyApiError } from '../lib/panelHelp';
import type { MapViewportBounds } from '../lib/mapViewport';
import { stableViewportKey } from '../lib/mapViewport';

export type RailNetworkPayload = FeatureCollection<LineString, {
  id: string;
  railwayType: string;
  operator: string | null;
  railroad: string | null;
  name: string | null;
}> & {
  count?: number;
  warming?: boolean;
  bbox?: MapViewportBounds;
};

const WARM_POLL_MS = 3000;

export function useRailNetwork(viewport: MapViewportBounds | null, enabled: boolean) {
  const [payload, setPayload] = useState<RailNetworkPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<string | null>(null);

  const fetchNetwork = useCallback(async (bounds: MapViewportBounds, allowWarmPoll = false) => {
    const key = stableViewportKey(bounds);
    if (inFlightRef.current === key && !allowWarmPoll) return;
    inFlightRef.current = key;

    const params = new URLSearchParams({
      west: String(bounds.west),
      south: String(bounds.south),
      east: String(bounds.east),
      north: String(bounds.north),
    });

    try {
      const res = await fetch(`/api/rail-network?${params.toString()}`);
      if (!res.ok) throw new Error(await friendlyApiError(res));
      const data = (await res.json()) as RailNetworkPayload;
      setPayload(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rail network unavailable');
      return null;
    } finally {
      if (inFlightRef.current === key) inFlightRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !viewport) {
      setPayload(null);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    let warmTimer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      const data = await fetchNetwork(viewport);
      if (cancelled || !data?.warming) return;
      warmTimer = setInterval(async () => {
        const next = await fetchNetwork(viewport, true);
        if (!cancelled && next && !next.warming && warmTimer) {
          clearInterval(warmTimer);
          warmTimer = null;
        }
      }, WARM_POLL_MS);
    };

    const debounce = setTimeout(() => {
      load();
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(debounce);
      if (warmTimer) clearInterval(warmTimer);
    };
  }, [enabled, viewport, fetchNetwork]);

  return { payload, error };
}
