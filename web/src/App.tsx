import { useMemo, useCallback, useState } from 'react';
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
import { useTrackingStats } from './hooks/useTrackingStats';
import { TrackingBanner } from './components/TrackingBanner';
import type { EmergencyFocusRequest, EmergencyRecentItem } from './lib/emergencyRecent';

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
    viewportLoading,
    error,
    dataWarning,
    fetchedAt,
    hasLoaded,
    viewportFlightsReady,
    autoRefreshSeconds,
    positionRefreshSeq,
    setAutoRefreshSeconds,
    refreshMap,
  } = useFlights(queryString, flightViewport);
  const homeFlights = useMemo(
    () => flights.filter((flight) => (flight.distanceMiles ?? Infinity) <= area.radiusMiles),
    [flights, area.radiusMiles]
  );
  const { trains, counts, freightHints, fetchedAt: trainsFetchedAt, refreshSeconds: trainRefreshSeconds } =
    useTrains(queryString, hasLoaded, 10, viewportBounds ?? viewportFromArea(area));
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
    enabled: hasLoaded,
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
    enabled: hasLoaded,
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
  const { stats: trackingStats, loading: trackingStatsLoading } = useTrackingStats(hasLoaded);
  const [emergencyFocusRequest, setEmergencyFocusRequest] = useState<EmergencyFocusRequest | null>(null);
  const handleEmergencySelect = useCallback((item: EmergencyRecentItem) => {
    setEmergencyFocusRequest({ item, seq: Date.now() });
  }, []);

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
          flightsLoaded={viewportFlightsReady}
          viewportLoading={viewportLoading}
          inViewCount={inViewCount}
          onViewportChange={setViewportBounds}
          autoRefreshSeconds={autoRefreshSeconds}
          positionRefreshSeq={positionRefreshSeq}
          trainsFetchedAt={trainsFetchedAt}
          trainRefreshSeconds={trainRefreshSeconds}
          emergencyFocusRequest={emergencyFocusRequest}
        />
      </div>

      <div className="map-overlays">
        <div className="map-overlay map-overlay-topbar">
          <div className="map-topbar-brand">
            <span className="map-overlay-title">HomeScope</span>
            <span className="map-overlay-tagline">Flights · weather · trains · cameras</span>
          </div>
          <div className="map-topbar-actions">
            {fetchedAt ? (
              <span
                className="map-topbar-status"
                title={
                  counts?.freight === 0 && freightHints
                    ? [freightHints.local, ...(freightHints.optional || [])].join('\n')
                    : undefined
                }
              >
                {viewportLoading ? 'Updating map view… · ' : ''}
                Updated {new Date(fetchedAt).toLocaleTimeString()}
              </span>
            ) : viewportLoading ? (
              <span className="map-topbar-status">Updating map view…</span>
            ) : null}
            <label className="auto-refresh-select auto-refresh-select-compact">
              <span className="sr-only">Auto refresh interval</span>
              <select
                value={autoRefreshSeconds}
                onChange={(e) => setAutoRefreshSeconds(Number(e.target.value) as typeof autoRefreshSeconds)}
                aria-label="Auto refresh interval"
              >
                {AUTO_REFRESH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn-secondary btn-compact"
              onClick={() => refreshMap({ snapshot: true })}
              disabled={loading}
              title="Refresh map and save trend snapshot"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
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

      <TrackingBanner
        stats={trackingStats}
        loading={trackingStatsLoading}
        onSelectEmergency={handleEmergencySelect}
      />
    </div>
  );
}
