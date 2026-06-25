import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { enrichWeatherConditions } from '../../../lib/weatherCodes.js';
import { fetchJson } from '../lib/fetchJson';
import type { WeatherConditions } from '../types';
import { weatherHoverHtml } from '../lib/weatherFormat';

const HOVER_CACHE_TTL_MS = 60 * 1000;
const STORM_CACHE_TTL_MS = 90 * 1000;
const SNAP_DEGREES = 0.05;

interface StormSection {
  title: string;
  body: string;
}

export interface StormAnalysis {
  hasStorm: boolean;
  lat: number;
  lon: number;
  summary?: string;
  disclaimer?: string;
  radar?: {
    clickDbz: number;
    peakDbz: number;
    approxDiameterMiles: number;
    intensityLabel: string;
    cloudType: string;
  };
  motion?: {
    directionLabel: string | null;
    speedMph: number | null;
  };
  hazards?: {
    lightningCount: number;
    alerts: Array<{ event: string; headline: string; severity: string }>;
  };
  sections?: StormSection[];
}

function snapCoordinate(value: number) {
  return Math.round(value / SNAP_DEGREES) * SNAP_DEGREES;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function stormAnalysisHtml(analysis: StormAnalysis) {
  const radar = analysis.radar!;
  const motion = analysis.motion;
  const hazards = analysis.hazards;
  const meta = [
    `Peak ${radar.peakDbz} dBZ`,
    `~${radar.approxDiameterMiles} mi wide`,
    motion?.directionLabel && motion?.speedMph
      ? `drifting ${motion.directionLabel} ~${motion.speedMph} mph`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const sections =
    analysis.sections
      ?.map(
        (section) => `
          <section class="storm-analysis-section">
            <h4>${escapeHtml(section.title)}</h4>
            <p>${escapeHtml(section.body)}</p>
          </section>`
      )
      .join('') ?? '';

  const alerts =
    hazards?.alerts?.length
      ? `<div class="storm-analysis-alert">${escapeHtml(hazards.alerts[0].headline)}</div>`
      : '';

  return `
    <div class="storm-analysis-popup">
      <div class="storm-analysis-kicker">Storm cell briefing</div>
      <strong class="storm-analysis-title">${escapeHtml(analysis.summary || radar.intensityLabel)}</strong>
      <div class="storm-analysis-meta muted">${escapeHtml(meta)}</div>
      ${alerts}
      <div class="storm-analysis-sections">${sections}</div>
      <div class="storm-analysis-disclaimer muted">${escapeHtml(analysis.disclaimer || '')}</div>
    </div>
  `;
}

interface Props {
  radarEnabled: boolean;
}

export function StormCellClick({ radarEnabled }: Props) {
  const map = useMap();
  const popupRef = useRef<L.Popup | null>(null);
  const weatherTooltipRef = useRef<L.Tooltip | null>(null);
  const weatherCacheRef = useRef(new Map<string, { weather: WeatherConditions; fetchedAt: number }>());
  const stormCacheRef = useRef(new Map<string, { analysis: StormAnalysis; fetchedAt: number }>());
  const requestRef = useRef(0);

  useEffect(() => {
    const popup = L.popup({
      className: 'storm-analysis-leaflet-popup',
      maxWidth: 420,
      minWidth: 320,
      autoPan: true,
      keepInView: true,
    });
    popupRef.current = popup;

    const weatherTooltip = L.tooltip({
      permanent: true,
      direction: 'top',
      offset: [0, -14],
      opacity: 1,
      className: 'map-weather-click-tooltip',
    });
    weatherTooltipRef.current = weatherTooltip;

    async function showWeather(latlng: L.LatLng) {
      const snapLat = snapCoordinate(latlng.lat);
      const snapLon = snapCoordinate(latlng.lng);
      const key = `${snapLat.toFixed(2)}:${snapLon.toFixed(2)}`;
      const reqId = ++requestRef.current;

      weatherTooltip
        .setLatLng(latlng)
        .setContent('<div class="map-weather-hover-body muted">Loading…</div>');
      if (!map.hasLayer(weatherTooltip)) weatherTooltip.addTo(map);

      const cached = weatherCacheRef.current.get(key);
      let weather =
        cached && Date.now() - cached.fetchedAt < HOVER_CACHE_TTL_MS
          ? enrichWeatherConditions(cached.weather)
          : null;

      if (!weather) {
        const params = new URLSearchParams({ lat: String(snapLat), lon: String(snapLon) });
        const data = await fetchJson<{ weather: WeatherConditions; error?: string }>(
          `/api/weather?${params.toString()}`
        );
        weather = enrichWeatherConditions(data.weather);
        weatherCacheRef.current.set(key, { weather, fetchedAt: Date.now() });
      }

      if (reqId !== requestRef.current) return;
      weatherTooltip.setContent(weatherHoverHtml(weather));
    }

    async function showStormAnalysis(latlng: L.LatLng) {
      const snapLat = snapCoordinate(latlng.lat);
      const snapLon = snapCoordinate(latlng.lng);
      const key = `${snapLat.toFixed(2)}:${snapLon.toFixed(2)}`;
      const reqId = ++requestRef.current;

      popup.setLatLng(latlng).setContent('<div class="storm-analysis-popup muted">Analyzing storm cell…</div>');
      popup.openOn(map);

      const cached = stormCacheRef.current.get(key);
      let analysis =
        cached && Date.now() - cached.fetchedAt < STORM_CACHE_TTL_MS ? cached.analysis : null;

      if (!analysis) {
        try {
          const params = new URLSearchParams({ lat: String(snapLat), lon: String(snapLon) });
          analysis = await fetchJson<StormAnalysis>(`/api/weather/storm-analysis?${params.toString()}`);
          if (analysis.hasStorm) {
            stormCacheRef.current.set(key, { analysis, fetchedAt: Date.now() });
          }
        } catch {
          if (reqId !== requestRef.current) return;
          map.closePopup(popup);
          return;
        }
      }

      if (reqId !== requestRef.current) return;

      if (!analysis.hasStorm) {
        map.closePopup(popup);
        return;
      }

      popup.setContent(stormAnalysisHtml(analysis));
    }

    const onClick = (event: L.LeafletMouseEvent) => {
      if (radarEnabled) {
        void showStormAnalysis(event.latlng);
        return;
      }
      void showWeather(event.latlng);
    };

    map.on('click', onClick);

    return () => {
      map.off('click', onClick);
      requestRef.current += 1;
      map.getContainer().classList.remove('storm-analysis-cursor');
      if (map.hasLayer(weatherTooltip)) map.removeLayer(weatherTooltip);
      if (map.hasLayer(popup)) map.closePopup(popup);
      popupRef.current = null;
      weatherTooltipRef.current = null;
    };
  }, [map, radarEnabled]);

  useEffect(() => {
    map.getContainer().classList.toggle('storm-analysis-cursor', radarEnabled);
    return () => map.getContainer().classList.remove('storm-analysis-cursor');
  }, [map, radarEnabled]);

  return null;
}
