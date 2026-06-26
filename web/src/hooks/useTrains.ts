import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Train } from '../types';
import type { MapViewportBounds } from '../lib/mapViewport';
import { stableViewportKey, viewportSearchParams } from '../lib/mapViewport';

const DEFAULT_REFRESH_SECONDS = 10;

interface TrainCounts {
  total: number;
  passenger: number;
  freight: number;
  crossing: number;
  yard?: number;
  corridor?: number;
}

export interface FreightHints {
  summary: string;
  active?: string[];
  optional?: string[];
  local?: string;
  aprsIs?: string | null;
}

export function useTrains(
  queryString: string,
  enabled = true,
  refreshSeconds = DEFAULT_REFRESH_SECONDS,
  viewportBounds: MapViewportBounds | null = null
) {
  const viewportKey = viewportBounds ? stableViewportKey(viewportBounds) : 'home';
  const requestQuery = useMemo(
    () => viewportSearchParams(queryString, viewportBounds).toString(),
    [queryString, viewportKey, viewportBounds]
  );
  const [trains, setTrains] = useState<Train[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [radiusMiles, setRadiusMiles] = useState<number | null>(null);
  const [counts, setCounts] = useState<TrainCounts | null>(null);
  const [coverage, setCoverage] = useState<string | null>(null);
  const [freightHints, setFreightHints] = useState<FreightHints | null>(null);
  const loadInFlight = useRef(false);

  const load = useCallback(async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    setLoading(true);

    try {
      const res = await fetch(`/api/live/trains?${requestQuery}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load trains');

      setTrains(Array.isArray(data.trains) ? data.trains : []);
      setFetchedAt(data.fetchedAt || new Date().toISOString());
      setRadiusMiles(data.radiusMiles ?? null);
      setCounts(data.counts ?? null);
      setCoverage(data.coverage ?? null);
      setFreightHints(data.freightHints ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trains');
    } finally {
      setLoading(false);
      loadInFlight.current = false;
    }
  }, [requestQuery]);

  useEffect(() => {
    if (!enabled) return undefined;

    void load();
    const id = window.setInterval(() => {
      void load();
    }, refreshSeconds * 1000);

    return () => window.clearInterval(id);
  }, [enabled, load, refreshSeconds]);

  return { trains, loading, error, fetchedAt, radiusMiles, counts, coverage, freightHints, refreshSeconds };
}
