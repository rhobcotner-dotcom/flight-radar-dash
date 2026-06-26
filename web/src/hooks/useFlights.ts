import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
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
  return 30;
}

interface RefreshOptions {
  snapshot?: boolean;
  silent?: boolean;
  generation?: number;
  enrich?: boolean;
}

function applyRefreshPayload(
  data: MapRefreshPayload,
  incoming: Flight[],
  options: RefreshOptions,
  hasLoadedRef: MutableRefObject<boolean>,
  setters: {
    setFlights: Dispatch<SetStateAction<Flight[]>>;
    setGovFlights: Dispatch<SetStateAction<Flight[]>>;
    setB52Flights: Dispatch<SetStateAction<Flight[]>>;
    setAlerts: Dispatch<SetStateAction<Alert[]>>;
    setFetchedAt: Dispatch<SetStateAction<string | null>>;
    setInViewCount: Dispatch<SetStateAction<number>>;
    setHomeCount: Dispatch<SetStateAction<number>>;
    setError: Dispatch<SetStateAction<string | null>>;
    setDataWarning: Dispatch<SetStateAction<string | null>>;
    setHasLoaded: Dispatch<SetStateAction<boolean>>;
    setLoading: Dispatch<SetStateAction<boolean>>;
    setTrendsKey: Dispatch<SetStateAction<number>>;
  }
) {
  if (options.silent) {
    if (incoming.length > 0) {
      if (hasLoadedRef.current) {
        setters.setFlights((prev) => {
          const merged = mergeFlightList(prev, incoming);
          return flightListsEqual(prev, merged) ? prev : merged;
        });
      } else {
        setters.setFlights(incoming);
      }
    }
    setters.setGovFlights(data.govFlights || []);
    setters.setAlerts(data.alerts || []);
    setters.setB52Flights(data.b52Flights || []);
  } else {
    setters.setFlights(incoming);
    setters.setGovFlights(data.govFlights || []);
    setters.setB52Flights(data.b52Flights || []);
    setters.setAlerts(data.alerts || []);
  }

  setters.setFetchedAt(data.fetchedAt || new Date().toISOString());
  setters.setInViewCount(data.count ?? incoming.length);
  setters.setHomeCount(data.homeCount ?? 0);
  setters.setError(null);
  setters.setDataWarning(data.dataWarning || null);
  setters.setHasLoaded(true);
  hasLoadedRef.current = true;
  setters.setLoading(false);
  if (options.snapshot !== false && !options.silent) {
    setters.setTrendsKey((k) => k + 1);
  }
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
  const [positionRefreshSeq, setPositionRefreshSeq] = useState(0);
  const [autoRefreshSeconds, setAutoRefreshSecondsState] = useState<AutoRefreshSeconds>(readAutoRefreshSeconds);
  const fastRefreshInFlight = useRef(false);
  const enrichRefreshInFlight = useRef(false);
  const pendingFastRefreshRef = useRef<RefreshOptions | null>(null);
  const pendingEnrichRefreshRef = useRef<RefreshOptions | null>(null);
  const loadGenerationRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const enrichViewportKeyRef = useRef<string | null>(null);
  const viewportKey = useMemo(() => stableViewportKey(viewportBounds), [viewportBounds]);

  useEffect(() => {
    hasLoadedRef.current = hasLoaded;
  }, [hasLoaded]);

  const refreshMap = useCallback(
    async (options: RefreshOptions = {}) => {
      const enrich = options.enrich !== false;
      const inFlightRef = enrich ? enrichRefreshInFlight : fastRefreshInFlight;
      const pendingRef = enrich ? pendingEnrichRefreshRef : pendingFastRefreshRef;

      if (inFlightRef.current) {
        pendingRef.current = options;
        return;
      }

      inFlightRef.current = true;
      const generation = options.generation ?? loadGenerationRef.current;
      const showLoading = !hasLoadedRef.current && !enrich;
      let scheduleEnrichment = false;

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
      if (!enrich) {
        params.set('enrich', '0');
      }

      try {
        const res = await fetch(`/api/live/refresh?${params.toString()}`);
        const data: MapRefreshPayload = await res.json();

        const incoming = data.flights || [];
        const isStale = generation !== loadGenerationRef.current;
        if (isStale && (hasLoadedRef.current || incoming.length === 0)) return;
        if (!res.ok) throw new Error(data.error || 'Failed to load flights');

        applyRefreshPayload(
          data,
          incoming,
          options,
          hasLoadedRef,
          {
            setFlights,
            setGovFlights,
            setB52Flights,
            setAlerts,
            setFetchedAt,
            setInViewCount,
            setHomeCount,
            setError,
            setDataWarning,
            setHasLoaded,
            setLoading,
            setTrendsKey,
          }
        );

        if (
          !enrich &&
          incoming.length > 0 &&
          enrichViewportKeyRef.current !== viewportKey
        ) {
          scheduleEnrichment = true;
        }

        if (!enrich && !isStale) {
          setPositionRefreshSeq((seq) => seq + 1);
        }
      } catch (err) {
        if (generation !== loadGenerationRef.current && hasLoadedRef.current) return;
        const message = friendlyApiError(err instanceof Error ? err.message : 'Unknown error');
        if (!options.silent && !enrich) {
          if (hasLoadedRef.current) {
            setDataWarning(message);
            setError(null);
          } else {
            setError(message);
            setLoading(false);
          }
        }
      } finally {
        inFlightRef.current = false;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) {
          void refreshMap(pending);
        } else if (showLoading && !hasLoadedRef.current) {
          setLoading(false);
        } else if (scheduleEnrichment) {
          enrichViewportKeyRef.current = viewportKey;
          window.setTimeout(() => {
            void refreshMap({
              snapshot: false,
              silent: true,
              enrich: true,
              generation: loadGenerationRef.current,
            });
          }, 0);
        }
      }
    },
    [queryString, viewportBounds, viewportKey]
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
    loadGenerationRef.current += 1;
    enrichViewportKeyRef.current = null;
    const generation = loadGenerationRef.current;
    const delay = hasLoadedRef.current ? 150 : 0;
    const timer = window.setTimeout(() => {
      void refreshMap({
        snapshot: false,
        silent: hasLoadedRef.current,
        generation,
        enrich: false,
      });
    }, delay);
    return () => window.clearTimeout(timer);
    // Reload when the watched area or viewport changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString, viewportKey]);

  useEffect(() => {
    if (!autoRefreshSeconds || !hasLoaded) return undefined;

    const id = window.setInterval(() => {
      refreshMap({
        snapshot: false,
        silent: true,
        enrich: false,
        generation: loadGenerationRef.current,
      });
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
    positionRefreshSeq,
    autoRefreshSeconds,
    setAutoRefreshSeconds,
    refreshMap,
    loadAirport,
    refresh: () => refreshMap({ snapshot: true, enrich: true }),
  };
}
