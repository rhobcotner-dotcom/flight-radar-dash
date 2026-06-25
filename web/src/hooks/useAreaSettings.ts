import { useCallback, useEffect, useState } from 'react';
import type { AreaSettings } from '../types';

const STORAGE_KEY = 'flight-radar-dash-area';

const DEFAULTS: AreaSettings = {
  name: 'Saint Peters, MO',
  address: '',
  lat: 38.787,
  lon: -90.629,
  radiusMiles: 85,
  mapFocusMiles: 12,
  nearbyAirport: 'STL',
};

function normalizeArea(value: Partial<AreaSettings>): AreaSettings {
  return {
    name: value.name || DEFAULTS.name,
    address: value.address ?? DEFAULTS.address ?? '',
    lat: Number.isFinite(Number(value.lat)) ? Number(value.lat) : DEFAULTS.lat,
    lon: Number.isFinite(Number(value.lon)) ? Number(value.lon) : DEFAULTS.lon,
    radiusMiles: Number.isFinite(Number(value.radiusMiles)) ? Number(value.radiusMiles) : DEFAULTS.radiusMiles,
    mapFocusMiles: Number.isFinite(Number(value.mapFocusMiles)) ? Number(value.mapFocusMiles) : DEFAULTS.mapFocusMiles!,
    nearbyAirport: value.nearbyAirport || DEFAULTS.nearbyAirport || 'STL',
  };
}

function readStored(): AreaSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = normalizeArea({ ...DEFAULTS, ...JSON.parse(raw) });
    if (parsed.radiusMiles > 85 && parsed.name === DEFAULTS.name && !parsed.address) {
      parsed.radiusMiles = 85;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return DEFAULTS;
  }
}

export function useAreaSettings() {
  const [area, setAreaState] = useState<AreaSettings>(readStored);

  const setArea = useCallback((next: AreaSettings) => {
    const normalized = normalizeArea(next);
    setAreaState(normalized);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }, []);

  useEffect(() => {
    fetch('/api/settings/default')
      .then((res) => res.json())
      .then((defaults) => {
        const stored = readStored();
        if (stored.name === DEFAULTS.name && stored.lat === DEFAULTS.lat && !stored.address) {
          setAreaState(normalizeArea({ ...defaults, ...stored }));
        }
      })
      .catch(() => {});
  }, []);

  const queryString = new URLSearchParams({
    lat: String(area.lat),
    lon: String(area.lon),
    radiusMiles: String(area.radiusMiles),
    name: area.name,
    nearbyAirport: area.nearbyAirport || 'STL',
  }).toString();

  return { area, setArea, queryString };
}
