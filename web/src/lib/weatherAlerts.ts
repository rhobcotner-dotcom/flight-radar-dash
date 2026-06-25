import type { WeatherAlert } from '../types';

export function weatherAlertIcon(event: string) {
  const value = event.toLowerCase();
  if (value.includes('tornado')) return '🌪️';
  if (value.includes('thunder')) return '⛈️';
  if (value.includes('flood')) return '🌊';
  if (value.includes('winter') || value.includes('ice') || value.includes('snow') || value.includes('blizzard')) {
    return '❄️';
  }
  if (value.includes('heat')) return '🌡️';
  if (value.includes('wind')) return '💨';
  if (value.includes('fire')) return '🔥';
  if (value.includes('fog')) return '🌫️';
  return '⚠️';
}

export function weatherAlertTiming(alert: WeatherAlert) {
  if (!alert.expires) return '';
  const expires = new Date(alert.expires);
  if (Number.isNaN(expires.getTime())) return '';
  return `Until ${expires.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function weatherAlertSummary(alert: WeatherAlert) {
  return alert.headline || alert.areaDesc || alert.event;
}

export async function fetchWeatherAlerts(lat: number, lon: number) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });
  const res = await fetch(`/api/weather/alerts?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Weather alerts unavailable');

  return {
    source: data.source || 'weather.gov',
    fetchedAt: data.fetchedAt || new Date().toISOString(),
    alerts: Array.isArray(data.alerts) ? (data.alerts as WeatherAlert[]) : [],
  };
}
