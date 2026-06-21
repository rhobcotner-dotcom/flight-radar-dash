import { useCallback, useEffect, useState } from 'react';
import type { Alert, Flight } from '../types';

interface LivePayload {
  flights: Flight[];
  count: number;
  fetchedAt: string;
  error?: string;
}

interface AlertsPayload {
  alerts: Alert[];
  alertCount: number;
  fetchedAt: string;
  error?: string;
}

export function useFlights(queryString: string, refreshMs = 60000) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [govFlights, setGovFlights] = useState<Flight[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [liveRes, govRes, alertsRes] = await Promise.all([
        fetch(`/api/live/flights?${queryString}`),
        fetch(`/api/live/flights/gov?${queryString}`),
        fetch(`/api/live/alerts?${queryString}`),
      ]);

      const live: LivePayload = await liveRes.json();
      const gov: LivePayload = await govRes.json();
      const alertData: AlertsPayload = await alertsRes.json();

      if (!liveRes.ok) throw new Error(live.error || 'Failed to load flights');
      if (!govRes.ok) throw new Error(gov.error || 'Failed to load gov flights');
      if (!alertsRes.ok) throw new Error(alertData.error || 'Failed to load alerts');

      setFlights(live.flights || []);
      setGovFlights(gov.flights || []);
      setAlerts(alertData.alerts || []);
      setFetchedAt(live.fetchedAt || new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, refreshMs);
    return () => window.clearInterval(id);
  }, [refresh, refreshMs]);

  return { flights, govFlights, alerts, loading, error, fetchedAt, refresh };
}
