import { useEffect, useState } from 'react';
import type { LiveDashboardPayload } from '../lib/liveData';
import { friendlyApiError } from '../lib/panelHelp';

export function useLiveDashboard(queryString: string, enabled = true) {
  const [data, setData] = useState<LiveDashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return undefined;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/live/dashboard?${queryString}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Dashboard unavailable');
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(friendlyApiError(err instanceof Error ? err.message : 'Dashboard unavailable'));
        }
      }
    }

    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, queryString]);

  return { data, error };
}
