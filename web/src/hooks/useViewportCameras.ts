import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TrafficCameraPayload } from '../lib/mapLayers';
import { friendlyApiError } from '../lib/panelHelp';
import type { MapViewportBounds } from '../lib/mapViewport';
import { stableViewportKey } from '../lib/mapViewport';

export type { MapViewportBounds };

const CONUS_BOUNDS: MapViewportBounds = {
  west: -125,
  south: 24,
  east: -66,
  north: 50,
  zoom: 5,
};

const WARM_POLL_MS = 3000;

function isWideBounds(bounds: MapViewportBounds) {
  return bounds.east - bounds.west > 25 || bounds.north - bounds.south > 15;
}

function zoomTier(zoom: number) {
  if (zoom <= 6) return 6;
  if (zoom <= 8) return 8;
  if (zoom <= 10) return 10;
  return 12;
}

function cameraLimitForZoom(zoom: number, bounds: MapViewportBounds) {
  const wide = isWideBounds(bounds);
  if (wide) {
    if (zoom <= 6) return 144;
    if (zoom <= 8) return 192;
    if (zoom <= 10) return 240;
    return 288;
  }
  if (zoom <= 6) return 48;
  if (zoom <= 8) return 72;
  if (zoom <= 10) return 96;
  return 120;
}

function stableBoundsKey(bounds: MapViewportBounds) {
  return stableViewportKey(bounds);
}

function mergeCameraPayload(
  prev: TrafficCameraPayload | null,
  next: TrafficCameraPayload
): TrafficCameraPayload {
  if (!prev?.cameras?.length) return next;
  const byId = new Map<string, (typeof next.cameras)[number]>();
  for (const cam of prev.cameras) byId.set(cam.id, cam);
  for (const cam of next.cameras) byId.set(cam.id, cam);
  const cameras = [...byId.values()].sort((a, b) => {
    const da = a.distanceMiles ?? Number.POSITIVE_INFINITY;
    const db = b.distanceMiles ?? Number.POSITIVE_INFINITY;
    if (Math.abs(da - db) > 0.25) return da - db;
    return a.id.localeCompare(b.id);
  });
  return {
    ...next,
    cameras: cameras.slice(0, next.limit ?? cameras.length),
    count: Math.min(cameras.length, next.limit ?? cameras.length),
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to fetch');
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface StormCameraPriority {
  lat: number;
  lon: number;
  /** Changes when a new storm cell is clicked. */
  key: string;
}

/** ~35 mi box around a storm click for immediate regional camera load. */
function stormPriorityBounds(lat: number, lon: number): MapViewportBounds {
  const latDelta = 35 / 69;
  const lonDelta = 35 / (69 * Math.max(Math.cos((lat * Math.PI) / 180), 0.25));
  return {
    west: lon - lonDelta,
    south: lat - latDelta,
    east: lon + lonDelta,
    north: lat + latDelta,
    zoom: 10,
  };
}

export function useViewportCameras(
  homeQueryString: string,
  bounds: MapViewportBounds | null,
  enabled = true,
  stormPriority: StormCameraPriority | null = null
) {
  const [cameras, setCameras] = useState<TrafficCameraPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const stormRequestRef = useRef(0);
  const pollRef = useRef<number | null>(null);
  const effectiveBounds = bounds ?? CONUS_BOUNDS;
  const boundsKey = useMemo(() => stableBoundsKey(effectiveBounds), [effectiveBounds]);

  const clearPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearPoll();
      setCameras(null);
      setError(null);
      return undefined;
    }

    const reqId = ++requestRef.current;
    const params = new URLSearchParams(homeQueryString);
    params.set('west', effectiveBounds.west.toFixed(4));
    params.set('south', effectiveBounds.south.toFixed(4));
    params.set('east', effectiveBounds.east.toFixed(4));
    params.set('north', effectiveBounds.north.toFixed(4));
    // Sort/thin by viewport center so panned views get local pins, not cameras closest to home.
    const sortLat = (effectiveBounds.south + effectiveBounds.north) / 2;
    const sortLon = (effectiveBounds.west + effectiveBounds.east) / 2;
    params.set('lat', sortLat.toFixed(4));
    params.set('lon', sortLon.toFixed(4));
    params.set('limit', String(cameraLimitForZoom(effectiveBounds.zoom, effectiveBounds)));

    const url = `/api/live/traffic-cameras?${params.toString()}`;

    const load = (isPoll = false) => {
      void fetchJson<TrafficCameraPayload>(url)
        .then((data) => {
          if (reqId !== requestRef.current) return;
          setCameras((prev) => (isPoll ? mergeCameraPayload(prev, data) : data));
          setError(null);
          clearPoll();
          if (data.warming) {
            pollRef.current = window.setTimeout(() => load(true), WARM_POLL_MS);
          }
        })
        .catch((err) => {
          if (reqId !== requestRef.current) return;
          if (!isPoll) {
            setCameras(null);
            setError(friendlyApiError(err instanceof Error ? err.message : 'Cameras unavailable'));
          }
        });
    };

    const timer = window.setTimeout(() => load(false), bounds ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      clearPoll();
    };
  }, [enabled, boundsKey, homeQueryString, bounds, clearPoll]);

  useEffect(() => {
    if (!enabled || !stormPriority) return undefined;

    const reqId = ++stormRequestRef.current;
    const priorityBounds = stormPriorityBounds(stormPriority.lat, stormPriority.lon);
    const params = new URLSearchParams(homeQueryString);
    params.set('west', priorityBounds.west.toFixed(4));
    params.set('south', priorityBounds.south.toFixed(4));
    params.set('east', priorityBounds.east.toFixed(4));
    params.set('north', priorityBounds.north.toFixed(4));
    params.set('lat', stormPriority.lat.toFixed(4));
    params.set('lon', stormPriority.lon.toFixed(4));
    params.set('limit', '96');

    const url = `/api/live/traffic-cameras?${params.toString()}`;

    void fetchJson<TrafficCameraPayload>(url)
      .then((data) => {
        if (reqId !== stormRequestRef.current) return;
        setCameras((prev) => mergeCameraPayload(prev, data));
        setError(null);
      })
      .catch(() => {
        /* storm priority is best-effort; viewport fetch remains primary */
      });

    return undefined;
  }, [enabled, homeQueryString, stormPriority?.key, stormPriority, clearPoll]);

  return { cameras, error };
}
