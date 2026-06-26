import { useEffect, useState } from 'react';
import { fetchJson } from '../lib/fetchJson';

export interface TrackingStatsPayload {
  fetchedAt: string;
  flights: number;
  cameras: number;
  boats: number;
  trains: number;
  partial?: {
    cameras?: boolean;
    flights?: boolean;
    boats?: boolean;
    trains?: boolean;
  };
}

const REFRESH_MS = 60_000;

export function useTrackingStats(enabled = true) {
  const [stats, setStats] = useState<TrackingStatsPayload | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    const load = async () => {
      try {
        const payload = await fetchJson<TrackingStatsPayload>('/api/live/tracking-stats');
        if (!cancelled) setStats(payload);
      } catch {
        if (!cancelled) setStats(null);
      }
    };

    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return stats;
}
