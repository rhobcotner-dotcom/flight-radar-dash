import { useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { EmergencyIncident } from '../hooks/useEmergencyServices';

function pulsePointStyle(incident: EmergencyIncident) {
  const kind = String(incident.emergencyKind || incident.responseCategory || '');
  if (kind.includes('medical') || incident.pulsePointCallType === 'ME') {
    return { color: '#fda4af', fillColor: '#e11d48', radius: 8 };
  }
  return { color: '#fdba74', fillColor: '#ea580c', radius: 8 };
}

function formatPulsePointPopup(incident: EmergencyIncident) {
  const observed = incident.observedAt ? new Date(String(incident.observedAt)).toLocaleString() : '';
  const agency = incident.agencyName || incident.agency || 'PulsePoint agency';
  return `
    <div class="emergency-popup">
      <strong>${incident.title || incident.emergencyName || 'PulsePoint incident'}</strong>
      <div>${agency}</div>
      <div>${incident.type || ''}</div>
      <div>${incident.address || ''}</div>
      ${observed ? `<div class="muted">${observed}</div>` : ''}
      <div class="muted">PulsePoint · live feed</div>
    </div>
  `;
}

export function PulsePointClusterLayer({ incidents }: { incidents: EmergencyIncident[] }) {
  const map = useMap();
  const incidentKey = useMemo(
    () => incidents.map((i) => i.id).join('|'),
    [incidents]
  );

  useEffect(() => {
    if (!incidents.length) return undefined;

    const cluster = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      disableClusteringAtZoom: 15,
      iconCreateFunction: (group) => {
        const count = group.getChildCount();
        const size = count >= 100 ? 44 : count >= 25 ? 40 : 36;
        return L.divIcon({
          html: `<div class="pp-cluster-icon"><span>${count}</span></div>`,
          className: 'pp-marker-cluster',
          iconSize: L.point(size, size),
        });
      },
    });

    for (const incident of incidents) {
      const style = pulsePointStyle(incident);
      const marker = L.circleMarker([incident.lat, incident.lon], {
        radius: style.radius ?? 8,
        color: style.color,
        fillColor: style.fillColor,
        fillOpacity: 0.88,
        weight: 2,
      });
      marker.bindPopup(formatPulsePointPopup(incident), { maxWidth: 320 });
      if (incident.emergencyLabel || incident.title) {
        marker.bindTooltip(String(incident.emergencyLabel || incident.title), {
          direction: 'top',
          opacity: 0.95,
          className: 'map-layer-tooltip',
        });
      }
      cluster.addLayer(marker);
    }

    map.addLayer(cluster);
    return () => {
      map.removeLayer(cluster);
    };
  }, [map, incidentKey, incidents]);

  return null;
}
