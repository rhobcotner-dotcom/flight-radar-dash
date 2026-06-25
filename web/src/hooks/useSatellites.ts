import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchOverheadSatellites, type SatelliteCollection } from '../lib/satelliteUtils';
import type { Satellite } from '../types';

const DEFAULT_REFRESH_SECONDS = 30;

export function useSatellites(
  queryString: string,
  enabled = false,
  refreshSeconds = DEFAULT_REFRESH_SECONDS
) {
  const [satellites, setSatellites] = useState<Satellite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Pick<SatelliteCollection, 'fetchedAt' | 'minElevationDeg' | 'catalogSize' | 'count' | 'source'> | null>(null);
  const loadInFlight = useRef(false);

  const load = useCallback(async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    setLoading(true);

    try {
      const data = await fetchOverheadSatellites(`${queryString}&minElevation=5`);
      setSatellites(data.satellites);
      setMeta({
        fetchedAt: data.fetchedAt,
        minElevationDeg: data.minElevationDeg,
        catalogSize: data.catalogSize,
        count: data.count,
        source: data.source,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load satellites');
    } finally {
      setLoading(false);
      loadInFlight.current = false;
    }
  }, [queryString]);

  useEffect(() => {
    if (!enabled) {
      setSatellites([]);
      setMeta(null);
      setError(null);
      return undefined;
    }

    void load();
    const id = window.setInterval(() => {
      void load();
    }, refreshSeconds * 1000);

    return () => window.clearInterval(id);
  }, [enabled, load, refreshSeconds]);

  return { satellites, loading, error, meta, refreshSeconds };
}
