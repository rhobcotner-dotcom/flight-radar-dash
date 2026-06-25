import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { enrichWeatherConditions } from '../../../lib/weatherCodes.js';
import { fetchJson } from '../lib/fetchJson';
import type { WeatherConditions } from '../types';
import { weatherHoverHtml } from '../lib/weatherFormat';

const HOVER_CACHE_TTL_MS = 60 * 1000;
const SNAP_DEGREES = 0.05;

function snapCoordinate(value: number) {
  return Math.round(value / SNAP_DEGREES) * SNAP_DEGREES;
}

export function MapWeatherClick() {
  const map = useMap();
  const tooltipRef = useRef<L.Tooltip | null>(null);
  const cacheRef = useRef(new Map<string, { weather: WeatherConditions; fetchedAt: number }>());
  const requestRef = useRef(0);

  useEffect(() => {
    const tooltip = L.tooltip({
      permanent: true,
      direction: 'top',
      offset: [0, -14],
      opacity: 1,
      className: 'map-weather-click-tooltip',
    });
    tooltipRef.current = tooltip;

    async function showWeather(latlng: L.LatLng) {
      const snapLat = snapCoordinate(latlng.lat);
      const snapLon = snapCoordinate(latlng.lng);
      const key = `${snapLat.toFixed(2)}:${snapLon.toFixed(2)}`;
      const reqId = ++requestRef.current;

      tooltip.setLatLng(latlng).setContent('<div class="map-weather-hover-body muted">Loading…</div>');
      if (!map.hasLayer(tooltip)) tooltip.addTo(map);

      const cached = cacheRef.current.get(key);
      let weather =
        cached && Date.now() - cached.fetchedAt < HOVER_CACHE_TTL_MS
          ? enrichWeatherConditions(cached.weather)
          : null;

      if (!weather) {
        try {
          const params = new URLSearchParams({
            lat: String(snapLat),
            lon: String(snapLon),
          });
          const data = await fetchJson<{ weather: WeatherConditions; error?: string }>(
            `/api/weather?${params.toString()}`
          );
          weather = enrichWeatherConditions(data.weather);
          cacheRef.current.set(key, { weather, fetchedAt: Date.now() });
        } catch (err) {
          if (reqId !== requestRef.current) return;
          const message = err instanceof Error ? err.message : 'Weather unavailable';
          tooltip.setContent(`<div class="map-weather-hover-body muted">${message}</div>`);
          return;
        }
      }

      if (reqId !== requestRef.current) return;
      tooltip.setContent(weatherHoverHtml(weather));
    }

    const onClick = (event: L.LeafletMouseEvent) => {
      void showWeather(event.latlng);
    };

    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
      requestRef.current += 1;
      if (map.hasLayer(tooltip)) map.removeLayer(tooltip);
      tooltipRef.current = null;
    };
  }, [map]);

  return null;
}
