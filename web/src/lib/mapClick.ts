import type L from 'leaflet';

/** True when the click is on open map area (tiles, overlays), not popups/markers/tooltips. */
export function isMapDeadSpaceClick(event: L.LeafletMouseEvent): boolean {
  const target = event.originalEvent.target;
  if (!(target instanceof Element)) return true;
  if (target.closest('.leaflet-popup')) return false;
  if (target.closest('.leaflet-marker-icon')) return false;
  if (target.closest('.leaflet-tooltip')) return false;
  return true;
}

/** Radar storm clicks — ignore only the storm briefing popup and marker icons. */
export function isStormRadarClick(event: L.LeafletMouseEvent): boolean {
  const target = event.originalEvent.target;
  if (!(target instanceof Element)) return true;
  if (target.closest('.storm-analysis-leaflet-popup')) return false;
  if (target.closest('.leaflet-marker-icon')) return false;
  return true;
}
