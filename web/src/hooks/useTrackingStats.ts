import { useEffect, useState } from 'react';
import { fetchJson } from '../lib/fetchJson';

import type { EmergencyRecentLists } from '../lib/emergencyRecent';

export interface EmergencyTrackingStats {
  liveIncidents: number;
  pulsePointLive: number;
  socrataLive: number;
  arcgisLive: number;
  wildfirePerimeters: number;
  wildfireIncidents: number;
  femaCounties: number;
  nwsAlerts: number;
  ipawsAlerts: number;
  approximate?: boolean;
  recentScope?: 'nationwide';
  recent?: EmergencyRecentLists;
  partial?: {
    pulsePoint?: boolean;
    nifc?: boolean;
    fema?: boolean;
    nws?: boolean;
    ipaws?: boolean;
    socrata?: boolean;
    arcgis?: boolean;
  };
}

export interface TrackingStatsPayload {
  fetchedAt: string;
  flights: number;
  cameras: number;
  boats: number;
  trains: number;
  emergency?: EmergencyTrackingStats;
  partial?: {
    cameras?: boolean;
    flights?: boolean;
    boats?: boolean;
    trains?: boolean;
    emergency?: boolean;
  };
}

const REFRESH_MS = 60_000;

export function useTrackingStats(enabled = true) {
  const [stats, setStats] = useState<TrackingStatsPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let intervalId: number | undefined;

    const load = async () => {
      if (!cancelled) setLoading(true);
      try {
        const payload = await fetchJson<TrackingStatsPayload>('/api/live/tracking-stats');
        if (!cancelled) setStats(payload);
      } catch {
        // Keep last good stats on refresh failure so the banner stays visible.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    intervalId = window.setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      if (intervalId != null) window.clearInterval(intervalId);
    };
  }, [enabled]);

  return { stats, loading };
}
