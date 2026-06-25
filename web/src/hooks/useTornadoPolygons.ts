import { useEffect, useState } from 'react';
import { fetchTornadoPolygons, type TornadoPolygonCollection } from '../lib/tornadoPolygons';

export function useTornadoPolygons(enabled = true, refreshKey?: string | null) {
  const [polygons, setPolygons] = useState<TornadoPolygonCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    async function load() {
      try {
        const data = await fetchTornadoPolygons();
        if (!cancelled) {
          setPolygons(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Tornado polygons unavailable');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return { polygons, error };
}
