import type L from 'leaflet';

type MapWithPopup = L.Map & { _popup?: L.Popup };

/** Leaflet 1.x has no public map.isPopupOpen — check the internal open popup layer. */
export function isMapPopupOpen(map: L.Map): boolean {
  const popup = (map as MapWithPopup)._popup;
  return popup != null && map.hasLayer(popup);
}

/** True when the open popup is an EMS / emergency-services dispatch popup. */
export function isEmergencyPopupOpen(map: L.Map): boolean {
  const popup = (map as MapWithPopup)._popup;
  if (!popup || !map.hasLayer(popup)) return false;
  const element = popup.getElement();
  return Boolean(element?.querySelector('.emergency-popup'));
}

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
