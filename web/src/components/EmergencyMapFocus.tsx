import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { EmergencyFocusRequest } from '../lib/emergencyRecent';
import { formatEmergencyPopupHtml } from '../lib/emergencyPopup';

function styleForCategory(category: string): L.PathOptions {
  switch (category) {
    case 'wildfire-perimeter':
      return { color: '#f97316', weight: 2, fillColor: '#dc2626', fillOpacity: 0.28 };
    case 'nws':
      return { color: '#ef4444', weight: 2, fillColor: '#991b1b', fillOpacity: 0.18 };
    case 'fema':
      return { color: '#a855f7', weight: 2, fillColor: '#7e22ce', fillOpacity: 0.16, dashArray: '8 6' };
    case 'ipaws':
      return { color: '#f43f5e', weight: 3, fillColor: '#be123c', fillOpacity: 0.24, dashArray: '2 4' };
    case 'ems':
    default:
      return { color: '#fda4af', weight: 2, fillColor: '#e11d48', fillOpacity: 0.88 };
  }
}

export function EmergencyMapFocus({ request }: { request: EmergencyFocusRequest | null }) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (!request?.item) return undefined;

    const { item } = request;
    const popupHtml = formatEmergencyPopupHtml(item.properties || { emergencyName: item.title });

    const openFocusedPopup = () => {
      const layer = layerRef.current;
      if (!layer || !('openPopup' in layer) || typeof layer.openPopup !== 'function') return;
      if (item.geometryType === 'polygon' && item.bounds) {
        const center = L.latLng(
          (item.bounds.south + item.bounds.north) / 2,
          (item.bounds.west + item.bounds.east) / 2
        );
        layer.openPopup(center);
        return;
      }
      layer.openPopup();
    };

    if (item.bounds) {
      map.fitBounds(
        [
          [item.bounds.south, item.bounds.west],
          [item.bounds.north, item.bounds.east],
        ],
        { padding: [48, 48], maxZoom: 11 }
      );
    } else if (item.lat != null && item.lon != null) {
      map.flyTo([item.lat, item.lon], 13, { duration: 1.1 });
    }

    let layer: L.Layer | null = null;
    if (item.geometry && item.geometryType === 'polygon') {
      const group = L.geoJSON(item.geometry as GeoJSON.Geometry, {
        style: () => styleForCategory(item.category),
      });
      const layers = group.getLayers();
      layer = layers[0] || group;
    } else if (item.lat != null && item.lon != null) {
      layer = L.circleMarker([item.lat, item.lon], {
        radius: item.category === 'ems' ? 9 : 8,
        ...styleForCategory(item.category),
        weight: 2,
      });
    }

    if (layer) {
      layer.bindPopup(popupHtml, { maxWidth: 320 });
      layer.addTo(map);
      layerRef.current = layer;
      map.once('moveend', openFocusedPopup);
      const timer = window.setTimeout(openFocusedPopup, 450);
      return () => {
        window.clearTimeout(timer);
        map.off('moveend', openFocusedPopup);
        if (layerRef.current) {
          map.removeLayer(layerRef.current);
          layerRef.current = null;
        }
      };
    }

    return undefined;
  }, [map, request?.seq, request?.item]);

  return null;
}
