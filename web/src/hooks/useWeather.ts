import { useEffect, useState } from 'react';
import type { WeatherConditions } from '../types';

export function useWeather(lat: number, lon: number) {
  const [weather, setWeather] = useState<WeatherConditions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;

    let cancelled = false;

    async function load() {
      try {
        const params = new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
        });
        const res = await fetch(`/api/weather?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Weather lookup failed');
        if (!cancelled) {
          setWeather(data.weather || null);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Weather lookup failed');
        }
      }
    }

    load();
    const id = window.setInterval(load, 90 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [lat, lon]);

  return { weather, error };
}
