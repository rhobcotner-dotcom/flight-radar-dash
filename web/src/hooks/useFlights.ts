import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Alert, AirportHub, Flight } from '../types';
import type { MapViewportBounds } from '../lib/mapViewport';
import { stableViewportKey, viewportSearchParams } from '../lib/mapViewport';
import { flightListsEqual, mergeFlightList } from '../lib/mergeFlights';
import { friendlyApiError } from '../lib/panelHelp';

interface MapRefreshPayload {
  flights: Flight[];
  govFlights: Flight[];
  b52Flights?: Flight[];
  alerts: Alert[];
  alertCount: number;
  fetchedAt: string;
  count?: number;
  homeCount?: number;
  dataSource?: string;
  dataWarning?: string | null;
  error?: string;
}

interface AirportPayload {
  airport: AirportHub;
  fetchedAt: string;
  error?: string;
}

/** Seconds between map refreshes. 0 = off. */
export type AutoRefreshSeconds = 0 | 5 | 10 | 30 | 60 | 120 | 300 | 600;

export const AUTO_REFRESH_OPTIONS: Array<{ value: AutoRefreshSeconds; label: string }> = [
  { value: 0, label: 'Auto: off' },
  { value: 5, label: 'Auto: 5s' },
  { value: 10, label: 'Auto: 10s' },
  { value: 30, label: 'Auto: 30s' },
  { value: 60, label: 'Auto: 1m' },
  { value: 120, label: 'Auto: 2m' },
  { value: 300, label: 'Auto: 5m' },
  { value: 600, label: 'Auto: 10m' },
];

const AUTO_REFRESH_KEY = 'flight-radar-dash-auto-refresh-sec';
const LEGACY_REFRESH_KEY = 'flight-radar-dash-auto-refresh-min';

const VALID_SECONDS = new Set<AutoRefreshSeconds>(AUTO_REFRESH_OPTIONS.map((o) => o.value));

function readAutoRefreshSeconds(): AutoRefreshSeconds {
  try {
    const rawSec = localStorage.getItem(AUTO_REFRESH_KEY);
    if (rawSec !== null) {
      const sec = Number(rawSec);
      if (VALID_SECONDS.has(sec as AutoRefreshSeconds)) return sec as AutoRefreshSeconds;
    }

    const rawMin = localStorage.getItem(LEGACY_REFRESH_KEY);
    if (rawMin === '0' || rawMin === '2' || rawMin === '5' || rawMin === '10') {
      const migrated = Number(rawMin) * 60;
      if (VALID_SECONDS.has(migrated as AutoRefreshSeconds)) return migrated as AutoRefreshSeconds;
    }
  } catch {
    /* ignore */
  }
  return 5;
}

export function useFlights(queryString: string, viewportBounds: MapViewportBounds) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [govFlights, setGovFlights] = useState<Flight[]>([]);
  const [b52Flights, setB52Flights] = useState<Flight[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [inViewCount, setInViewCount] = useState(0);
  const [homeCount, setHomeCount] = useState(0);
  const [airport, setAirport] = useState<AirportHub | null>(null);
  const [loading, setLoading] = useState(false);
  const [airportLoading, setAirportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [airportError, setAirportError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [airportFetchedAt, setAirportFetchedAt] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [trendsKey, setTrendsKey] = useState(0);
  const [autoRefreshSeconds, setAutoRefreshSecondsState] = useState<AutoRefreshSeconds>(readAutoRefreshSeconds);
  const refreshInFlight = useRef(false);
  const hasFetchedRef = useRef(false);
  const viewportKey = useMemo(() => stableViewportKey(viewportBounds), [viewportBounds]);

  const refreshMap = useCallback(
    async (options: { snapshot?: boolean; silent?: boolean } = {}) => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      const showLoading = !hasLoaded && !options.silent;
      if (showLoading) {
        setLoading(true);
      }
      if (!options.silent) {
        setError(null);
        setDataWarning(null);
      }

      const params = viewportSearchParams(queryString, viewportBounds);
      if (options.snapshot === false) {
        params.set('snapshot', 'false');
      }

      try {
        const res = await fetch(`/api/live/refresh?${params.toString()}`);
        const data: MapRefreshPayload = await res.json();

        if (!res.ok) throw new Error(data.error || 'Failed to load flights');

        const incoming = data.flights || [];
        if (options.silent) {
          setFlights((prev) => {
            const merged = mergeFlightList(prev, incoming);
            return flightListsEqual(prev, merged) ? prev : merged;
          });
          setB52Flights(data.b52Flights || []);
        } else {
          setFlights(incoming);
          setGovFlights(data.govFlights || []);
          setB52Flights(data.b52Flights || []);
          setAlerts(data.alerts || []);
        }

        setFetchedAt(data.fetchedAt || new Date().toISOString());
        setInViewCount(data.count ?? incoming.length);
        setHomeCount(data.homeCount ?? 0);
        setError(null);
        setDataWarning(data.dataWarning || null);
        setHasLoaded(true);
        if (options.snapshot !== false && !options.silent) {
          setTrendsKey((k) => k + 1);
        }
      } catch (err) {
        const message = friendlyApiError(err instanceof Error ? err.message : 'Unknown error');
        if (!options.silent) {
          if (hasLoaded) {
            setDataWarning(message);
            setError(null);
          } else {
            setError(message);
          }
        }
      } finally {
        if (showLoading) {
          setLoading(false);
        }
        refreshInFlight.current = false;
      }
    },
    [queryString, viewportBounds, hasLoaded]
  );

  const loadAirport = useCallback(async () => {
    setAirportLoading(true);
    setAirportError(null);
    try {
      const res = await fetch(`/api/live/airport?${queryString}`);
      const data: AirportPayload = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to load airport board');

      setAirport(data.airport || null);
      setAirportFetchedAt(data.fetchedAt || new Date().toISOString());
    } catch (err) {
      setAirportError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAirportLoading(false);
    }
  }, [queryString]);

  const setAutoRefreshSeconds = useCallback((seconds: AutoRefreshSeconds) => {
    setAutoRefreshSecondsState(seconds);
    localStorage.setItem(AUTO_REFRESH_KEY, String(seconds));
  }, []);

  useEffect(() => {
    const delay = hasFetchedRef.current ? 150 : 0;
    const timer = window.setTimeout(() => {
      void refreshMap({ snapshot: false, silent: hasFetchedRef.current });
      hasFetchedRef.current = true;
    }, delay);
    return () => window.clearTimeout(timer);
    // Reload when the watched area or viewport changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString, viewportKey]);

  useEffect(() => {
    if (!autoRefreshSeconds || !hasLoaded) return undefined;

    const id = window.setInterval(() => {
      refreshMap({ snapshot: false, silent: true });
    }, autoRefreshSeconds * 1000);

    return () => window.clearInterval(id);
  }, [autoRefreshSeconds, hasLoaded, refreshMap]);

  useEffect(() => {
    if (!dataWarning) return undefined;
    const id = window.setTimeout(() => setDataWarning(null), 12_000);
    return () => window.clearTimeout(id);
  }, [dataWarning]);

  return {
    flights,
    govFlights,
    b52Flights,
    alerts,
    inViewCount,
    homeCount,
    airport,
    loading,
    airportLoading,
    error,
    dataWarning,
    airportError,
    fetchedAt,
    airportFetchedAt,
    hasLoaded,
    trendsKey,
    autoRefreshSeconds,
    setAutoRefreshSeconds,
    refreshMap,
    loadAirport,
    refresh: () => refreshMap({ snapshot: true }),
  };
}
