import { useEffect, useMemo, useRef, useState } from 'react';
import type { TrafficCameraPayload } from '../lib/mapLayers';
import type { MapViewportBounds } from '../lib/mapViewport';
import { stableViewportKey } from '../lib/mapViewport';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export function useViewportRailCameras(
  homeQueryString: string,
  bounds: MapViewportBounds | null,
  enabled = true
) {
  const [cameras, setCameras] = useState<TrafficCameraPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boundsKey = useMemo(() => (bounds ? stableViewportKey(bounds) : ''), [bounds]);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!enabled || !bounds) {
      setCameras(null);
      setError(null);
      return undefined;
    }

    const reqId = ++requestRef.current;
    const homeParams = new URLSearchParams(homeQueryString);
    const homeLat = Number(homeParams.get('lat'));
    const homeLon = Number(homeParams.get('lon'));
    const params = new URLSearchParams(homeQueryString);
    params.set('west', bounds.west.toFixed(4));
    params.set('south', bounds.south.toFixed(4));
    params.set('east', bounds.east.toFixed(4));
    params.set('north', bounds.north.toFixed(4));
    params.set('limit', '128');
    params.set('radiusMiles', '125');
    if (Number.isFinite(homeLat) && Number.isFinite(homeLon)) {
      params.set('lat', homeLat.toFixed(4));
      params.set('lon', homeLon.toFixed(4));
    }

    const timer = window.setTimeout(() => {
      void fetchJson<TrafficCameraPayload>(`/api/live/rail-cameras?${params.toString()}`)
        .then((data) => {
          if (reqId !== requestRef.current) return;
          setCameras(data);
          setError(null);
        })
        .catch((err) => {
          if (reqId !== requestRef.current) return;
          setCameras(null);
          setError(err instanceof Error ? err.message : 'Rail cam fetch failed');
        });
    }, 60);

    return () => {
      window.clearTimeout(timer);
    };
  }, [enabled, boundsKey, homeQueryString, bounds]);

  return { cameras, error };
}
