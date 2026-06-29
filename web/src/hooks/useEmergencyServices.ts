import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapViewportBounds } from '../lib/mapViewport';
import { stableViewportKey, viewportSearchParams } from '../lib/mapViewport';

export interface EmergencyDispatchUnit {
  id: string;
  status?: string | null;
  statusLabel?: string | null;
  clearedAt?: string | null;
}

export interface EmergencyDetailRow {
  label: string;
  value: string;
}

export interface EmergencyEntityProperties {
  entityKind?: string;
  emergencyLabel?: string | null;
  emergencyName?: string | null;
  emergencyStatus?: string | null;
  emergencySeverity?: string | null;
  emergencySource?: string | null;
  emergencyKind?: string | null;
  emergencyTimingClass?: string | null;
  emergencyLevel?: number | null;
  containmentPct?: number | null;
  acres?: number | null;
  cause?: string | null;
  countyName?: string | null;
  geocodeNote?: string | null;
  sourceType?: string | null;
  pulsePointCallType?: string | null;
  responseCategory?: string | null;
}

export interface EmergencyIncident extends EmergencyEntityProperties {
  id: string;
  lat: number;
  lon: number;
  city?: string | null;
  agency?: string | null;
  agencyName?: string | null;
  title?: string | null;
  type?: string | null;
  address?: string | null;
  observedAt?: string | null;
  closedAt?: string | null;
  status?: string | null;
  alarmLevel?: string | null;
  priority?: string | null;
  incidentNumber?: string | null;
  units?: EmergencyDispatchUnit[] | null;
  locationNotes?: string[] | null;
  details?: EmergencyDetailRow[] | null;
}

export interface EmergencyServicesPayload {
  fetchedAt?: string;
  summary?: {
    wildfirePerimeters?: number;
    wildfireIncidents?: number;
    femaCounties?: number;
    nwsAlerts?: number;
    ipawsAlerts?: number;
    cityEms?: number;
  };
  gaps?: Array<{ source?: string; gap?: string; error?: string; city?: string }>;
  nifc?: {
    perimeterCollection?: GeoJSON.FeatureCollection;
    incidents?: EmergencyIncident[];
  } | null;
  fema?: {
    collection?: GeoJSON.FeatureCollection;
  } | null;
  nws?: {
    collection?: GeoJSON.FeatureCollection;
    counts?: Record<string, number>;
  } | null;
  ipaws?: {
    inViewCollection?: GeoJSON.FeatureCollection;
    count?: number;
  } | null;
  cityEms?: {
    incidents?: EmergencyIncident[];
  } | null;
}

const VIEWPORT_QUERY_DEBOUNCE_MS = 350;

export function useEmergencyServices(
  queryString: string,
  viewportBounds: MapViewportBounds | null,
  enabled = false,
  refreshSeconds = 90
) {
  const viewportKey = viewportBounds ? stableViewportKey(viewportBounds) : 'home';
  const [debouncedViewportKey, setDebouncedViewportKey] = useState(viewportKey);
  const requestQuery = useMemo(
    () => viewportSearchParams(queryString, viewportBounds).toString(),
    [queryString, debouncedViewportKey, viewportBounds]
  );
  const [payload, setPayload] = useState<EmergencyServicesPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const res = await fetch(`/api/live/emergency-services?${requestQuery}`, { priority: 'low' });
      const data = (await res.json()) as EmergencyServicesPayload;
      if (generation !== loadGenerationRef.current) return;
      if (!res.ok) throw new Error((data as { error?: string }).error || 'Failed to load emergency services');
      setPayload(data);
      setError(null);
    } catch (err) {
      if (generation !== loadGenerationRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load emergency services');
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, requestQuery]);

  useEffect(() => {
    if (!enabled) {
      setPayload(null);
      return undefined;
    }
    loadGenerationRef.current += 1;
    void load();
    const timer = window.setInterval(() => void load(), refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [enabled, load, refreshSeconds, debouncedViewportKey]);

  return { payload, loading, error, reload: load };
}
