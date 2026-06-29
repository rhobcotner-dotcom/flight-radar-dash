import { CircleMarker, GeoJSON, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { PathOptions } from 'leaflet';
import type { EmergencyEntityProperties, EmergencyIncident, EmergencyServicesPayload } from '../hooks/useEmergencyServices';
import { formatEmergencyPopupHtml, formatEmsIncidentPopupHtml } from '../lib/emergencyPopup';
import { PulsePointClusterLayer } from './PulsePointClusterLayer';

function formatEmergencyPopup(props: EmergencyEntityProperties) {
  return formatEmergencyPopupHtml(props);
}

function wildfirePerimeterStyle(feature?: GeoJSON.Feature) {
  const pct = Number(feature?.properties?.containmentPct ?? feature?.properties?.attr_PercentContained);
  const contained = Number.isFinite(pct) && pct >= 100;
  const fill = contained ? '#78716c' : pct >= 50 ? '#ea580c' : '#dc2626';
  return {
    color: contained ? '#a8a29e' : '#f97316',
    weight: 2,
    fillColor: fill,
    fillOpacity: contained ? 0.12 : 0.28,
    dashArray: contained ? '4 6' : undefined,
  } as PathOptions;
}

function femaStyle(): PathOptions {
  return {
    color: '#a855f7',
    weight: 2,
    fillColor: '#7e22ce',
    fillOpacity: 0.16,
    dashArray: '8 6',
  };
}

function nwsEmergencyStyle(feature?: GeoJSON.Feature) {
  const kind = String(feature?.properties?.alertClass || 'nws-other');
  switch (kind) {
    case 'nws-emergency':
      return { color: '#fb7185', weight: 3, fillColor: '#881337', fillOpacity: 0.22 };
    case 'nws-warning':
      return { color: '#ef4444', weight: 2, fillColor: '#991b1b', fillOpacity: 0.18 };
    case 'nws-watch':
      return { color: '#fbbf24', weight: 2, fillColor: '#92400e', fillOpacity: 0.14, dashArray: '6 4' };
    case 'nws-advisory':
      return { color: '#fb923c', weight: 2, fillColor: '#9a3412', fillOpacity: 0.12 };
    default:
      return { color: '#94a3b8', weight: 1.5, fillColor: '#334155', fillOpacity: 0.1 };
  }
}

function ipawsStyle(): PathOptions {
  return {
    color: '#f43f5e',
    weight: 3,
    fillColor: '#be123c',
    fillOpacity: 0.24,
    dashArray: '2 4',
  };
}

function bindEmergencyPopup(layer: L.Layer, props: EmergencyEntityProperties) {
  layer.bindPopup(formatEmergencyPopup(props), {
    maxWidth: 320,
    closeOnClick: false,
    autoClose: false,
  });
  if (props.emergencyLabel) {
    layer.bindTooltip(String(props.emergencyLabel), { direction: 'top', opacity: 0.95, className: 'map-layer-tooltip' });
  }
}

function PointMarkers({
  incidents,
  kind,
  styleFor,
}: {
  incidents: EmergencyIncident[];
  kind: string;
  styleFor?: (incident: EmergencyIncident) => { color: string; fillColor: string; radius?: number };
}) {
  if (!incidents.length) return null;
  const defaultStyle =
    kind === 'wildfire-incident'
      ? { color: '#fb923c', fillColor: '#ea580c', radius: 9 }
      : { color: '#38bdf8', fillColor: '#0284c7', radius: 7 };

  return (
    <>
      {incidents.map((incident) => {
        const style = styleFor?.(incident) || defaultStyle;
        return (
          <CircleMarker
            key={incident.id}
            center={[incident.lat, incident.lon]}
            radius={style.radius ?? defaultStyle.radius ?? 7}
            pathOptions={{
              color: style.color,
              fillColor: style.fillColor,
              fillOpacity: 0.85,
              weight: 2,
            }}
          >
            <Tooltip direction="top" opacity={0.95} className="map-layer-tooltip">
              {incident.emergencyLabel || incident.title || kind}
            </Tooltip>
            <Popup maxWidth={340} closeOnClick={false} autoClose={false}>
              <div dangerouslySetInnerHTML={{ __html: formatEmsIncidentPopupHtml(incident) }} />
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

export function EmergencyServicesLayer({ payload }: { payload: EmergencyServicesPayload | null }) {
  if (!payload) return null;

  const perimeters = payload.nifc?.perimeterCollection;
  const fema = payload.fema?.collection;
  const nws = payload.nws?.collection;
  const ipaws = payload.ipaws?.inViewCollection;
  const fireIncidents = payload.nifc?.incidents || [];
  const emsIncidents = payload.cityEms?.incidents || [];
  const pulsePointIncidents = emsIncidents.filter(
    (incident) =>
      String(incident.sourceType || '').includes('pulsepoint') ||
      String(incident.emergencyKind || '').startsWith('pulsepoint-')
  );
  const otherEmsIncidents = emsIncidents.filter((incident) => !pulsePointIncidents.includes(incident));

  const hasData =
    (perimeters?.features?.length || 0) +
      (fema?.features?.length || 0) +
      (nws?.features?.length || 0) +
      (ipaws?.features?.length || 0) +
      fireIncidents.length +
      otherEmsIncidents.length +
      pulsePointIncidents.length >
    0;

  if (!hasData) return null;

  return (
    <>
      {perimeters?.features?.length ? (
        <GeoJSON
          key={`nifc-perimeters-${payload.fetchedAt}-${perimeters.features.length}`}
          data={perimeters as GeoJSON.FeatureCollection}
          style={(feature) => wildfirePerimeterStyle(feature)}
          onEachFeature={(feature, layer) => {
            if (feature?.properties) bindEmergencyPopup(layer, feature.properties as EmergencyEntityProperties);
          }}
        />
      ) : null}
      {fema?.features?.length ? (
        <GeoJSON
          key={`fema-${payload.fetchedAt}-${fema.features.length}`}
          data={fema as GeoJSON.FeatureCollection}
          style={femaStyle}
          onEachFeature={(feature, layer) => {
            if (feature?.properties) bindEmergencyPopup(layer, feature.properties as EmergencyEntityProperties);
          }}
        />
      ) : null}
      {nws?.features?.length ? (
        <GeoJSON
          key={`nws-emergency-${payload.fetchedAt}-${nws.features.length}`}
          data={nws as GeoJSON.FeatureCollection}
          style={(feature) => nwsEmergencyStyle(feature)}
          onEachFeature={(feature, layer) => {
            if (feature?.properties) bindEmergencyPopup(layer, feature.properties as EmergencyEntityProperties);
          }}
        />
      ) : null}
      {ipaws?.features?.length ? (
        <GeoJSON
          key={`ipaws-${payload.fetchedAt}-${ipaws.features.length}`}
          data={ipaws as GeoJSON.FeatureCollection}
          style={ipawsStyle}
          onEachFeature={(feature, layer) => {
            if (feature?.properties) bindEmergencyPopup(layer, feature.properties as EmergencyEntityProperties);
          }}
        />
      ) : null}
      <PointMarkers incidents={fireIncidents} kind="wildfire-incident" />
      <PointMarkers incidents={otherEmsIncidents} kind="ems-incident" />
      <PulsePointClusterLayer incidents={pulsePointIncidents} />
    </>
  );
}
