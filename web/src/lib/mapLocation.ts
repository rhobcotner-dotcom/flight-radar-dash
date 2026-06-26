import { fetchJson } from './fetchJson';

const CACHE_TTL_MS = 10 * 60 * 1000;
const SNAP = 0.02;

export interface MapPlaceLabel {
  label: string;
  city: string | null;
  state: string | null;
  lat: number;
  lon: number;
}

const cache = new Map<string, { fetchedAt: number; place: MapPlaceLabel }>();

function snapCoordinate(value: number) {
  return Math.round(value / SNAP) * SNAP;
}

function cacheKey(lat: number, lon: number) {
  return `${snapCoordinate(lat).toFixed(2)}:${snapCoordinate(lon).toFixed(2)}`;
}

export async function resolveMapPlaceLabel(lat: number, lon: number): Promise<MapPlaceLabel> {
  const key = cacheKey(lat, lon);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.place;
  }

  const params = new URLSearchParams({
    lat: String(snapCoordinate(lat)),
    lon: String(snapCoordinate(lon)),
  });
  const place = await fetchJson<MapPlaceLabel>(`/api/reverse-geocode?${params.toString()}`);
  cache.set(key, { fetchedAt: Date.now(), place });
  return place;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function mapLocationHeaderHtml(label: string | null | undefined) {
  if (!label) return '';
  return `<div class="map-popup-location">${escapeHtml(label)}</div>`;
}
