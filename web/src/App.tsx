import { useMemo, useState, useCallback } from 'react';
import { AreaSettingsPanel } from './components/AreaSettings';
import { FlightList } from './components/FlightList';
import { FlightMap } from './components/FlightMap';
import { HearingToastStack } from './components/HearingToastStack';
import { useWeather } from './hooks/useWeather';
import { useWeatherAlerts } from './hooks/useWeatherAlerts';
import { useAreaSettings } from './hooks/useAreaSettings';
import { useHearingAlerts } from './hooks/useHearingAlerts';
import { useB52Alerts } from './hooks/useB52Alerts';
import { useFlights, AUTO_REFRESH_OPTIONS } from './hooks/useFlights';
import type { MapViewportBounds } from './lib/mapViewport';
import { viewportFromArea } from './lib/mapViewport';
import { useTrains } from './hooks/useTrains';
import { useHighlight } from './hooks/useHighlight';
import { useFunMode } from './hooks/useFunMode';

export default function App() {
  const { area, setArea, queryString } = useAreaSettings();
  const [viewportBounds, setViewportBounds] = useState<MapViewportBounds | null>(null);
  const flightViewport = useMemo(
    () => viewportBounds ?? viewportFromArea(area),
    [viewportBounds, area]
  );
  const {
    flights,
    b52Flights,
    inViewCount,
    loading,
    error,
    dataWarning,
    fetchedAt,
    hasLoaded,
    autoRefreshSeconds,
    setAutoRefreshSeconds,
    refreshMap,
  } = useFlights(queryString, flightViewport);
  const homeFlights = useMemo(
    () => flights.filter((flight) => (flight.distanceMiles ?? Infinity) <= area.radiusMiles),
    [flights, area.radiusMiles]
  );
  const { trains, counts, freightHints, fetchedAt: trainsFetchedAt, refreshSeconds: trainRefreshSeconds } =
    useTrains(queryString, true);
  const { weather } = useWeather(area.lat, area.lon);
  const {
    toasts,
    dismissToast: dismissHearingToast,
    alertsEnabled,
    soundEnabled,
  } = useHearingAlerts({
    area,
    flights: homeFlights,
    weather,
    enabled: true,
  });
  const {
    toasts: b52Toasts,
    dismissToast: dismissB52Toast,
    b52AlertStats,
  } = useB52Alerts({
    b52Flights,
    flights,
    enabled: false,
    alertsEnabled,
    soundEnabled,
  });
  const {
    alerts: weatherAlerts,
    toasts: weatherToasts,
    dismissToast: dismissWeatherToast,
  } = useWeatherAlerts({
    lat: area.lat,
    lon: area.lon,
    refreshKey: fetchedAt,
    enabled: true,
    toastsEnabled: alertsEnabled,
    soundEnabled,
  });
  const fun = useFunMode({
    area,
    flights,
    trains,
    weather,
    weatherAlerts,
    enabled: hasLoaded,
  });
  const allToasts = useMemo(() => {
    const merged = [...weatherToasts, ...toasts, ...fun.funToasts, ...b52Toasts].sort(
      (a, b) => a.createdAt - b.createdAt
    );
    const b52 = merged.filter((toast) => toast.variant === 'b52');
    const rest = merged.filter((toast) => toast.variant !== 'b52').slice(-5);
    return [...rest, ...b52];
  }, [b52Toasts, fun.funToasts, toasts, weatherToasts]);
  const dismissToast = useCallback(
    (toastId: string, entityKey?: string) => {
      if (toastId.startsWith('weather-')) {
        dismissWeatherToast(toastId, entityKey);
      } else if (toastId.startsWith('fun-')) {
        fun.dismissFunToast(toastId);
      } else if (toastId.startsWith('b52-')) {
        dismissB52Toast(toastId, entityKey);
      } else {
        dismissHearingToast(toastId, entityKey);
      }
    },
    [dismissB52Toast, dismissHearingToast, dismissWeatherToast, fun.dismissFunToast]
  );
  const { highlightedId, setHighlight, clearHighlightNow, mapHandlers, listHandlers } = useHighlight();

  return (
    <div
      className={`app map-app${fun.disasterActive ? ' fun-disaster-movie' : ''}${fun.werewolfActive ? ' fun-werewolf' : ''}${fun.settings.solarMoodRing ? ` fun-${fun.kpClass}` : ''}`}
    >
      <div className="map-stage">
        <FlightMap
          fullPage
          area={area}
          flights={flights}
          trains={trains}
          weather={weather}
          fun={fun}
          highlightedId={highlightedId}
          mapHandlers={mapHandlers}
          clearHighlightNow={clearHighlightNow}
          mapFetchedAt={fetchedAt}
          inViewCount={inViewCount}
          onViewportChange={setViewportBounds}
          autoRefreshSeconds={autoRefreshSeconds}
          trainsFetchedAt={trainsFetchedAt}
          trainRefreshSeconds={trainRefreshSeconds}
        />
      </div>

      <div className="map-overlays">
        <div className="map-overlay map-overlay-controls">
          <span className="map-overlay-title">Flight Radar Dash</span>
          {fetchedAt ? <span className="muted">Map {new Date(fetchedAt).toLocaleTimeString()}</span> : null}
          {counts?.freight === 0 && freightHints ? (
            <span className="muted" title={[freightHints.local, ...(freightHints.optional || [])].join('\n')}>
              {freightHints.summary}
            </span>
          ) : null}
          <label className="auto-refresh-select">
            <span className="muted">Refresh</span>
            <select
              value={autoRefreshSeconds}
              onChange={(e) => setAutoRefreshSeconds(Number(e.target.value) as typeof autoRefreshSeconds)}
            >
              {AUTO_REFRESH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-secondary" onClick={() => refreshMap({ snapshot: true })} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh map'}
          </button>
        </div>

        {error ? <div className="map-overlay map-overlay-banner error">{error}</div> : null}
        {!error && dataWarning ? (
          <div className="map-overlay map-overlay-banner warning">{dataWarning}</div>
        ) : null}

        <div className="map-overlay map-overlay-home">
          <AreaSettingsPanel area={area} onSave={setArea} />
        </div>

        <div className="map-overlay map-overlay-flights">
          <FlightList
            area={area}
            flights={homeFlights}
            inViewCount={inViewCount}
            highlightedId={highlightedId}
            listHandlers={listHandlers}
          />
        </div>
      </div>

      <HearingToastStack
        toasts={allToasts}
        onDismiss={dismissToast}
        onSelect={(id) => setHighlight(id, 'list')}
        b52AlertStats={b52AlertStats}
      />
    </div>
  );
}
