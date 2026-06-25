import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundsFromCenter } from '../lib/bounds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AREA_PATH = path.resolve(__dirname, '../../config/area.default.json');

export function loadDefaultArea() {
  const raw = fs.readFileSync(DEFAULT_AREA_PATH, 'utf8');
  return JSON.parse(raw);
}

export function resolveArea(query = {}) {
  const defaults = loadDefaultArea();
  const lat = query.lat ?? defaults.lat;
  const lon = query.lon ?? defaults.lon;
  const radiusMiles = query.radiusMiles ?? defaults.radiusMiles;
  const name = query.name ?? defaults.name;
  const nearbyAirport = query.nearbyAirport ?? defaults.nearbyAirport ?? 'STL';
  const { bounds, north, south, west, east } = boundsFromCenter(lat, lon, radiusMiles);

  return {
    name,
    lat: Number(lat),
    lon: Number(lon),
    radiusMiles: Number(radiusMiles),
    nearbyAirport,
    bounds,
    box: { north, south, west, east },
  };
}
