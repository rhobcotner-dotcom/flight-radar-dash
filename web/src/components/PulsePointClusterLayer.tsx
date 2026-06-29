import { useEffect, useMemo, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import type { EmergencyIncident } from '../hooks/useEmergencyServices';
import { formatEmsIncidentPopupHtml } from '../lib/emergencyPopup';

const POPUP_OPTIONS: L.PopupOptions = {
  maxWidth: 340,
  closeOnClick: false,
  autoClose: false,
};

function pulsePointStyle(incident: EmergencyIncident) {
  const kind = String(incident.emergencyKind || incident.responseCategory || '');
  if (kind.includes('medical') || incident.pulsePointCallType === 'ME') {
    return { color: '#fda4af', fillColor: '#e11d48', radius: 8 };
  }
  return { color: '#fdba74', fillColor: '#ea580c', radius: 8 };
}

function findOpenIncidentId(markers: Map<string, L.CircleMarker>) {
  for (const [id, marker] of markers) {
    if (marker.isPopupOpen()) return id;
  }
  return null;
}

function buildMarker(incident: EmergencyIncident) {
  const style = pulsePointStyle(incident);
  const marker = L.circleMarker([incident.lat, incident.lon], {
    radius: style.radius ?? 8,
    color: style.color,
    fillColor: style.fillColor,
    fillOpacity: 0.88,
    weight: 2,
  });
  marker.bindPopup(formatEmsIncidentPopupHtml(incident), POPUP_OPTIONS);
  if (incident.emergencyLabel || incident.title) {
    marker.bindTooltip(String(incident.emergencyLabel || incident.title), {
      direction: 'top',
      opacity: 0.95,
      className: 'map-layer-tooltip',
      sticky: true,
    });
  }
  return marker;
}

export function PulsePointClusterLayer({ incidents }: { incidents: EmergencyIncident[] }) {
  const map = useMap();
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersByIdRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const incidentKey = useMemo(() => incidents.map((incident) => incident.id).join('|'), [incidents]);

  useEffect(() => {
    return () => {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
        markersByIdRef.current.clear();
      }
    };
  }, [map]);

  useEffect(() => {
    if (!incidents.length) {
      if (clusterRef.current) {
        map.removeLayer(clusterRef.current);
        clusterRef.current = null;
        markersByIdRef.current.clear();
      }
      return;
    }

    const openIncidentId = clusterRef.current ? findOpenIncidentId(markersByIdRef.current) : null;

    if (!clusterRef.current) {
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
        const marker = buildMarker(incident);
        markersByIdRef.current.set(incident.id, marker);
        cluster.addLayer(marker);
      }

      clusterRef.current = cluster;
      map.addLayer(cluster);
    } else {
      const nextIds = new Set(incidents.map((incident) => incident.id));
      for (const [id, marker] of [...markersByIdRef.current.entries()]) {
        if (!nextIds.has(id)) {
          clusterRef.current.removeLayer(marker);
          markersByIdRef.current.delete(id);
        }
      }

      for (const incident of incidents) {
        let marker = markersByIdRef.current.get(incident.id);
        if (!marker) {
          marker = buildMarker(incident);
          markersByIdRef.current.set(incident.id, marker);
          clusterRef.current.addLayer(marker);
          continue;
        }

        marker.setLatLng([incident.lat, incident.lon]);
        marker.setPopupContent(formatEmsIncidentPopupHtml(incident));
        if (incident.emergencyLabel || incident.title) {
          marker.setTooltipContent(String(incident.emergencyLabel || incident.title));
        }
      }
    }

    if (openIncidentId) {
      markersByIdRef.current.get(openIncidentId)?.openPopup();
    }
  }, [map, incidentKey, incidents]);

  return null;
}
