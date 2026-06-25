import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AreaSettings, Flight, HearingToast, WeatherConditions } from '../types';
import {
  getToastAutoDismissMs,
  hearingAlertBody,
  hearingAlertTitle,
  shouldNotifyHearingAlert,
} from '../lib/hearingAlerts';
import { isLikelyMilGov, MILITARY_ALERT_RADIUS_MILES } from '../lib/military';
import { predictAudibleFlights } from '../lib/hearingPredictor';
import { playHearingPop, playMilitarySiren, unlockHearingSound } from '../lib/hearingPopSound';
import { distanceMiles, flightKey, flightLabel } from '../lib/flightUtils';

const ALERTS_ENABLED_KEY = 'flight-radar-dash-hearing-toasts-enabled';
const SOUND_ENABLED_KEY = 'flight-radar-dash-hearing-sound-enabled';
const MILITARY_ALERTS_ENABLED_KEY = 'flight-radar-dash-military-alerts-enabled';
const CAT_MODE_KEY = 'flight-radar-dash-fun-cat-mode';
const DISMISS_TTL_MS = 20 * 60 * 1000;
const MIL_TOAST_DISMISS_MS = 18000;

function readFlag(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function militaryToastBody(flight: Flight, distance: number) {
  const parts = [
    flightLabel(flight),
    flight.type || 'Unknown type',
    `${distance.toFixed(1)} mi away`,
    flight.alt != null ? `${flight.alt} ft` : null,
    flight.gspeed != null ? `${flight.gspeed} kt` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

interface Options {
  area: AreaSettings;
  flights: Flight[];
  weather: WeatherConditions | null;
  enabled?: boolean;
}

export function useHearingAlerts({ area, flights, weather, enabled = true }: Options) {
  const [toasts, setToasts] = useState<HearingToast[]>([]);
  const [alertsEnabled, setAlertsEnabledState] = useState(() => readFlag(ALERTS_ENABLED_KEY, true));
  const [soundEnabled, setSoundEnabledState] = useState(() => readFlag(SOUND_ENABLED_KEY, true));
  const [militaryAlertsEnabled, setMilitaryAlertsEnabledState] = useState(() =>
    readFlag(MILITARY_ALERTS_ENABLED_KEY, false)
  );
  const [catMode, setCatMode] = useState(() => readFlag(CAT_MODE_KEY, false));

  const notifiedRef = useRef<Set<string>>(new Set());
  const milNotifiedRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const syncCatMode = () => setCatMode(readFlag(CAT_MODE_KEY, false));
    syncCatMode();
    window.addEventListener('storage', syncCatMode);
    const id = window.setInterval(syncCatMode, 2000);
    return () => {
      window.removeEventListener('storage', syncCatMode);
      window.clearInterval(id);
    };
  }, []);

  const predictions = useMemo(() => {
    if (!enabled || !alertsEnabled) return [];
    const base = predictAudibleFlights(flights, { lat: area.lat, lon: area.lon }, weather);
    if (!catMode) return base;
    return base.map((prediction) => ({
      ...prediction,
      estimatedDb: prediction.estimatedDb + 6,
      reason: prediction.reason === 'too_quiet' ? prediction.reason : prediction.reason,
    }));
  }, [area.lat, area.lon, alertsEnabled, catMode, enabled, flights, weather]);

  const nearbyMilitary = useMemo(() => {
    if (!enabled || !alertsEnabled || !militaryAlertsEnabled) return [];
    return flights
      .filter((flight) => isLikelyMilGov(flight))
      .map((flight) => ({
        flight,
        distance: distanceMiles(area.lat, area.lon, flight.lat, flight.lon),
      }))
      .filter(({ distance }) => distance <= MILITARY_ALERT_RADIUS_MILES)
      .sort((a, b) => a.distance - b.distance);
  }, [alertsEnabled, area.lat, area.lon, enabled, flights, militaryAlertsEnabled]);

  const setAlertsEnabled = useCallback((value: boolean) => {
    setAlertsEnabledState(value);
    localStorage.setItem(ALERTS_ENABLED_KEY, String(value));
    if (!value) {
      setToasts([]);
    }
  }, []);

  const setSoundEnabled = useCallback((value: boolean) => {
    setSoundEnabledState(value);
    localStorage.setItem(SOUND_ENABLED_KEY, String(value));
    unlockHearingSound();
  }, []);

  const setMilitaryAlertsEnabled = useCallback((value: boolean) => {
    setMilitaryAlertsEnabledState(value);
    localStorage.setItem(MILITARY_ALERTS_ENABLED_KEY, String(value));
    if (!value) {
      setToasts((prev) => prev.filter((toast) => toast.variant !== 'military'));
    }
  }, []);

  const dismissToast = useCallback((toastId: string, flightId?: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
    if (flightId) {
      dismissedRef.current.set(flightId, Date.now());
      notifiedRef.current.add(flightId);
      milNotifiedRef.current.add(flightId);
    }
  }, []);

  const scheduleDismiss = useCallback((toast: HearingToast, ms: number) => {
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, ms);
  }, []);

  useEffect(() => {
    const unlock = () => unlockHearingSound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !alertsEnabled || !militaryAlertsEnabled) return;

    const now = Date.now();
    for (const [key, dismissedAt] of dismissedRef.current.entries()) {
      if (now - dismissedAt > DISMISS_TTL_MS) {
        dismissedRef.current.delete(key);
      }
    }

    const currentMilKeys = new Set(nearbyMilitary.map(({ flight }) => flightKey(flight)));
    for (const key of milNotifiedRef.current) {
      if (!currentMilKeys.has(key)) {
        milNotifiedRef.current.delete(key);
      }
    }

    const fresh: HearingToast[] = [];

    for (const { flight, distance } of nearbyMilitary) {
      const key = flightKey(flight);
      if (milNotifiedRef.current.has(key) || dismissedRef.current.has(key)) continue;

      milNotifiedRef.current.add(key);
      if (soundEnabled) {
        void playMilitarySiren();
      }

      fresh.push({
        id: `mil-${key}-${now}`,
        flightKey: key,
        title: 'Military aircraft nearby!',
        body: militaryToastBody(flight, distance),
        variant: 'military',
        flight,
        createdAt: now,
      });
    }

    if (fresh.length === 0) return;

    setToasts((prev) => [...prev, ...fresh].slice(-4));
    for (const toast of fresh) {
      scheduleDismiss(toast, MIL_TOAST_DISMISS_MS);
    }
  }, [alertsEnabled, enabled, militaryAlertsEnabled, nearbyMilitary, scheduleDismiss, soundEnabled]);

  useEffect(() => {
    if (!enabled || !alertsEnabled || predictions.length === 0) {
      return;
    }

    const now = Date.now();
    const currentKeys = new Set(
      predictions
        .filter((prediction) => !isLikelyMilGov(prediction.flight))
        .map((prediction) => flightKey(prediction.flight))
    );
    for (const key of notifiedRef.current) {
      if (!currentKeys.has(key)) {
        notifiedRef.current.delete(key);
      }
    }

    const autoDismissMs = getToastAutoDismissMs();
    const fresh: HearingToast[] = [];

    for (const prediction of predictions) {
      if (isLikelyMilGov(prediction.flight)) continue;
      if (!shouldNotifyHearingAlert(prediction)) continue;

      const key = flightKey(prediction.flight);
      if (notifiedRef.current.has(key) || dismissedRef.current.has(key)) continue;

      notifiedRef.current.add(key);
      if (soundEnabled) {
        void playHearingPop();
      }

      fresh.push({
        id: `hearing-${key}-${now}`,
        flightKey: key,
        title: hearingAlertTitle(prediction),
        body: hearingAlertBody(prediction),
        variant: 'hearing',
        prediction,
        createdAt: now,
      });
    }

    if (fresh.length === 0) return;

    setToasts((prev) => [...prev, ...fresh].slice(-4));

    for (const toast of fresh) {
      scheduleDismiss(toast, autoDismissMs);
    }
  }, [alertsEnabled, enabled, predictions, scheduleDismiss, soundEnabled]);

  return {
    toasts,
    dismissToast,
    alertsEnabled,
    setAlertsEnabled,
    militaryAlertsEnabled,
    setMilitaryAlertsEnabled,
    soundEnabled,
    setSoundEnabled,
    predictions,
    nearbyMilitary,
  };
}
