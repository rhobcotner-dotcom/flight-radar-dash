import { useCallback, useEffect, useRef, useState } from 'react';
import type { HearingToast, WeatherAlert } from '../types';
import { fetchWeatherAlerts, weatherAlertSummary } from '../lib/weatherAlerts';
import { playHearingPop, playMilitarySiren } from '../lib/hearingPopSound';

const DISMISS_TTL_MS = 6 * 60 * 60 * 1000;
const TOAST_DISMISS_MS = 90000;

interface Options {
  lat: number;
  lon: number;
  refreshKey?: string | null;
  enabled?: boolean;
  toastsEnabled?: boolean;
  soundEnabled?: boolean;
}

export function useWeatherAlerts({
  lat,
  lon,
  refreshKey,
  enabled = true,
  toastsEnabled = true,
  soundEnabled = true,
}: Options) {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<HearingToast[]>([]);

  const notifiedRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Map<string, number>>(new Map());
  const initializedRef = useRef(false);

  const dismissToast = useCallback((toastId: string, alertId?: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
    if (alertId) {
      dismissedRef.current.set(alertId, Date.now());
      notifiedRef.current.add(alertId);
    }
  }, []);

  const scheduleDismiss = useCallback((toast: HearingToast) => {
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, TOAST_DISMISS_MS);
  }, []);

  useEffect(() => {
    if (!enabled || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;

    let cancelled = false;

    async function load() {
      try {
        const data = await fetchWeatherAlerts(lat, lon);
        if (cancelled) return;

        setAlerts(data.alerts);
        setFetchedAt(data.fetchedAt);
        setError(null);

        if (!initializedRef.current) {
          for (const alert of data.alerts) {
            notifiedRef.current.add(alert.id);
          }
          initializedRef.current = true;
          return;
        }

        if (!toastsEnabled) return;

        const now = Date.now();
        for (const [id, dismissedAt] of dismissedRef.current.entries()) {
          if (now - dismissedAt > DISMISS_TTL_MS) {
            dismissedRef.current.delete(id);
          }
        }

        const currentIds = new Set(data.alerts.map((alert) => alert.id));
        for (const id of notifiedRef.current) {
          if (!currentIds.has(id)) {
            notifiedRef.current.delete(id);
          }
        }

        const fresh: HearingToast[] = [];
        for (const alert of data.alerts) {
          if (notifiedRef.current.has(alert.id) || dismissedRef.current.has(alert.id)) continue;

          notifiedRef.current.add(alert.id);
          if (soundEnabled) {
            void (alert.severity === 'high' ? playMilitarySiren() : playHearingPop());
          }

          fresh.push({
            id: `weather-${alert.id}-${now}`,
            flightKey: alert.id,
            title: alert.event,
            body: weatherAlertSummary(alert),
            variant: 'weather',
            weatherAlert: alert,
            createdAt: now,
          });
        }

        if (fresh.length === 0) return;

        setToasts((prev) => [...prev, ...fresh].slice(-4));
        for (const toast of fresh) {
          scheduleDismiss(toast);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Weather alerts unavailable');
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    lat,
    lon,
    refreshKey,
    scheduleDismiss,
    soundEnabled,
    toastsEnabled,
  ]);

  useEffect(() => {
    initializedRef.current = false;
    notifiedRef.current.clear();
    dismissedRef.current.clear();
    setToasts([]);
  }, [lat, lon]);

  useEffect(() => {
    if (!toastsEnabled) {
      setToasts([]);
    }
  }, [toastsEnabled]);

  return {
    alerts,
    fetchedAt,
    error,
    toasts,
    dismissToast,
  };
}
