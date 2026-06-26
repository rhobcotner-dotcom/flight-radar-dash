import { enrichWeatherConditions, fahrenheitFromCelsius } from '../../../lib/weatherCodes.js';
import type { WeatherConditions } from '../types';
import { escapeHtml, mapLocationHeaderHtml } from './mapLocation';

export function formatWindDirection(deg?: number | null) {
  if (deg == null || !Number.isFinite(Number(deg))) return '—';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(Number(deg) / 45) % 8];
}

export function formatWind(weather: Pick<WeatherConditions, 'windSpeedMph' | 'windDirectionDeg'>) {
  const speed = weather.windSpeedMph;
  const direction = formatWindDirection(weather.windDirectionDeg);
  if (speed == null || !Number.isFinite(Number(speed))) return 'Wind —';
  return `${Math.round(Number(speed))} mph ${direction}`;
}

export function formatGroundTemp(weather: Pick<WeatherConditions, 'temperatureF' | 'temperatureC'>) {
  const enriched = enrichWeatherConditions(weather as WeatherConditions);
  if (enriched.temperatureF != null && Number.isFinite(Number(enriched.temperatureF))) {
    return `${Math.round(Number(enriched.temperatureF))}°F`;
  }
  if (weather.temperatureC != null && Number.isFinite(Number(weather.temperatureC))) {
    return `${fahrenheitFromCelsius(Number(weather.temperatureC))}°F`;
  }
  return '—';
}

export function formatWeatherHover(weather: WeatherConditions) {
  const enriched = enrichWeatherConditions(weather);
  const temp = formatGroundTemp(enriched);
  const condition = enriched.conditionLabel || 'mixed conditions';
  const wind = formatWind(enriched);
  const observed = enriched.observedAt
    ? new Date(enriched.observedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const source = enriched.source?.includes('weather.gov')
    ? `NWS ${enriched.stationId || 'obs'}`
    : 'model';
  const meta = observed ? `${source} @ ${observed}` : source;
  return { temp, condition, wind, headline: `${temp} · ${condition}`, meta };
}

export function weatherHoverHtml(weather: WeatherConditions, locationLabel?: string | null) {
  const { headline, wind, meta } = formatWeatherHover(weather);
  return `
    <div class="map-weather-hover-body">
      ${mapLocationHeaderHtml(locationLabel)}
      <strong>${escapeHtml(headline)}</strong>
      <span class="muted">${escapeHtml(wind)}</span>
      <span class="muted">${escapeHtml(meta)}</span>
    </div>
  `;
}
