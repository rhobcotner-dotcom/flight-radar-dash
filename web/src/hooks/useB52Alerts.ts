import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Flight, HearingToast } from '../types';
import { b52AlertBody, b52AlertStats, b52AlertTitle } from '../lib/b52Alerts';
import { isB52 } from '../lib/military';
import { playMilitarySiren, unlockHearingSound } from '../lib/hearingPopSound';
import { flightKey } from '../lib/flightUtils';

const DISMISS_TTL_MS = 2 * 60 * 60 * 1000;
const B52_TOAST_DISMISS_MS = 90000;

interface Options {
  b52Flights: Flight[];
  flights: Flight[];
  enabled?: boolean;
  alertsEnabled?: boolean;
  soundEnabled?: boolean;
}

function mergeB52Flights(b52Flights: Flight[], flights: Flight[]) {
  const map = new Map<string, Flight>();

  for (const flight of [...b52Flights, ...flights.filter(isB52)]) {
    map.set(flightKey(flight), { ...map.get(flightKey(flight)), ...flight });
  }

  return [...map.values()];
}

export function useB52Alerts({
  b52Flights,
  flights,
  enabled = true,
  alertsEnabled = true,
  soundEnabled = true,
}: Options) {
  const [toasts, setToasts] = useState<HearingToast[]>([]);
  const notifiedRef = useRef<Set<string>>(new Set());
  const dismissedRef = useRef<Map<string, number>>(new Map());

  const activeB52 = useMemo(
    () => mergeB52Flights(b52Flights, flights),
    [b52Flights, flights]
  );

  const dismissToast = useCallback((toastId: string, flightId?: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
    if (flightId) {
      dismissedRef.current.set(flightId, Date.now());
      notifiedRef.current.add(flightId);
    }
  }, []);

  const scheduleDismiss = useCallback((toast: HearingToast, ms: number) => {
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== toast.id));
    }, ms);
  }, []);

  useEffect(() => {
    if (!enabled || !alertsEnabled) return;

    const now = Date.now();
    for (const [key, dismissedAt] of dismissedRef.current.entries()) {
      if (now - dismissedAt > DISMISS_TTL_MS) {
        dismissedRef.current.delete(key);
      }
    }

    const currentKeys = new Set(activeB52.map((flight) => flightKey(flight)));
    for (const key of notifiedRef.current) {
      if (!currentKeys.has(key)) {
        notifiedRef.current.delete(key);
      }
    }

    const fresh: HearingToast[] = [];

    for (const flight of activeB52) {
      const key = flightKey(flight);
      if (notifiedRef.current.has(key) || dismissedRef.current.has(key)) continue;

      notifiedRef.current.add(key);
      if (soundEnabled) {
        void playMilitarySiren();
      }

      fresh.push({
        id: `b52-${key}-${now}`,
        flightKey: key,
        title: b52AlertTitle(flight),
        body: b52AlertBody(flight),
        variant: 'b52',
        flight,
        createdAt: now,
      });
    }

    if (fresh.length === 0) return;

    setToasts((prev) => [...prev, ...fresh]);
    for (const toast of fresh) {
      scheduleDismiss(toast, B52_TOAST_DISMISS_MS);
    }
  }, [activeB52, alertsEnabled, enabled, scheduleDismiss, soundEnabled]);

  return {
    toasts,
    dismissToast,
    activeB52,
    b52AlertStats,
  };
}
