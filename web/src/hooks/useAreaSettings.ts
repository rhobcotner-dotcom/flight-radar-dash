import { useCallback, useEffect, useState } from 'react';
import type { AreaSettings } from '../types';

const STORAGE_KEY = 'flight-radar-dash-area';

const DEFAULTS: AreaSettings = {
  name: 'Saint Peters, MO',
  lat: 38.787,
  lon: -90.629,
  radiusMiles: 75,
};

function readStored(): AreaSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function useAreaSettings() {
  const [area, setAreaState] = useState<AreaSettings>(readStored);

  const setArea = useCallback((next: AreaSettings) => {
    setAreaState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    fetch('/api/settings/default')
      .then((res) => res.json())
      .then((defaults) => {
        const stored = readStored();
        if (stored.name === DEFAULTS.name && stored.lat === DEFAULTS.lat) {
          setAreaState({ ...defaults, ...stored });
        }
      })
      .catch(() => {});
  }, []);

  const queryString = new URLSearchParams({
    lat: String(area.lat),
    lon: String(area.lon),
    radiusMiles: String(area.radiusMiles),
    name: area.name,
  }).toString();

  return { area, setArea, queryString };
}
