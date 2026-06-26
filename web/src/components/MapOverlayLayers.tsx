import { GeoJSON, CircleMarker, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { PathOptions, TooltipOptions } from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { CameraMapSnapshot } from './CameraMapSnapshot';
import { CameraMapLivePreview } from './CameraMapLivePreview';
import { MapLocationHeader } from './MapLocationHeader';
import { cameraHasMapMarker, cameraSourceSiteHref } from '../lib/cameraSnapshot';
import { VesselDetails } from './VesselDetails';
import {
  alertKindLabel,
  formatWeatherAlertPopup,
  formatWeatherAlertTooltip,
  flightCategoryClass,
  type AirQualityPayload,
  type AisVesselPayload,
  type AprsPayload,
  type DroughtCollection,
  type EarthquakePayload,
  type EbirdPayload,
  type INaturalistPayload,
  type LightningPayload,
  type MetarPayload,
  type NotamCollection,
  type RiverForecastPayload,
  type RiverGaugePayload,
  type RoadConditionCollection,
  type RoadConditionKind,
  type SondePayload,
  type TfrCollection,
  type TrafficCamera,
  type TrafficCameraPayload,
  type TransitVehicle,
  type WeatherAlertKind,
  type WeatherAlertPolygonCollection,
  type WildfirePayload,
} from '../lib/mapLayers';

const TOOLTIP_OPTIONS: TooltipOptions = {
  sticky: false,
  direction: 'top',
  opacity: 0.96,
  className: 'map-layer-tooltip',
};

const ALERT_TOOLTIP_OPTIONS: TooltipOptions = {
  sticky: false,
  direction: 'top',
  opacity: 1,
  className: 'weather-alert-tooltip',
};

function alertStyle(kind: WeatherAlertKind | undefined): PathOptions {
  switch (kind) {
    case 'tornado-pds':
      return { color: '#fb7185', weight: 3, fillColor: '#9f1239', fillOpacity: 0.34, dashArray: '6 4' };
    case 'tornado':
      return { color: '#ef4444', weight: 2, fillColor: '#991b1b', fillOpacity: 0.24 };
    case 'severe':
      return { color: '#fbbf24', weight: 2, fillColor: '#92400e', fillOpacity: 0.22 };
    case 'flash-flood':
      return { color: '#34d399', weight: 2, fillColor: '#065f46', fillOpacity: 0.22 };
    case 'flood':
      return { color: '#22d3ee', weight: 2, fillColor: '#155e75', fillOpacity: 0.2 };
    case 'winter':
      return { color: '#c4b5fd', weight: 2, fillColor: '#5b21b6', fillOpacity: 0.18 };
    case 'heat':
      return { color: '#fb923c', weight: 2, fillColor: '#9a3412', fillOpacity: 0.18 };
    default:
      return { color: '#94a3b8', weight: 1.5, fillColor: '#334155', fillOpacity: 0.14 };
  }
}

function tfrStyle(): PathOptions {
  return {
    color: '#fde047',
    weight: 2,
    fillColor: '#ca8a04',
    fillOpacity: 0.12,
    dashArray: '8 6',
  };
}

function metarIcon(category: string) {
  return L.divIcon({
    className: 'metar-marker',
    html: `<div class="metar-badge ${flightCategoryClass(category)}">${category || 'MET'}</div>`,
    iconSize: [42, 22],
    iconAnchor: [21, 11],
  });
}

function riverIcon(stageFt: number | null) {
  const label = stageFt != null ? `${stageFt.toFixed(1)} ft` : 'gauge';
  return L.divIcon({
    className: 'river-gauge-marker',
    html: `<div class="river-gauge-badge">${label}</div>`,
    iconSize: [56, 22],
    iconAnchor: [28, 11],
  });
}

function transitIcon(routeName: string, highlighted: boolean) {
  return L.divIcon({
    className: 'transit-marker',
    html: `<div class="transit-badge${highlighted ? ' transit-badge-active' : ''}">${routeName}</div>`,
    iconSize: [48, 22],
    iconAnchor: [24, 11],
  });
}

function roadStyle(kind: RoadConditionKind | undefined): PathOptions {
  switch (kind) {
    case 'flood-closed':
    case 'workzone-closed':
    case 'planned-closed':
    case 'winter-closed':
      return { color: '#f87171', weight: 4, opacity: 0.9 };
    case 'traffic-delay':
    case 'flood-delay':
    case 'workzone-delay':
    case 'workzone-possible':
      return { color: '#fbbf24', weight: 3, opacity: 0.85, dashArray: '6 4' };
    case 'winter-condition':
      return { color: '#67e8f9', weight: 3, opacity: 0.85 };
    default:
      return { color: '#94a3b8', weight: 2, opacity: 0.75 };
  }
}

function aqiIcon(payload: AirQualityPayload) {
  const label = payload.usAqi != null ? `AQI ${payload.usAqi}` : 'AQI';
  return L.divIcon({
    className: 'aqi-marker',
    html: `<div class="aqi-badge ${payload.aqiClass}">${label}</div>`,
    iconSize: [58, 22],
    iconAnchor: [29, 11],
  });
}

function vesselIcon(course: number | null) {
  const rotation = course != null && Number.isFinite(course) ? course : 0;
  return L.divIcon({
    className: 'vessel-marker',
    html: `<div class="vessel-ship" style="transform:rotate(${rotation}deg)" aria-hidden="true"><svg viewBox="0 0 24 24" role="img"><path d="M12 2.2 18.8 14.2H5.2L12 2.2zM6.2 14.8h11.6q-5.8 5.4-11.6 0z"/></svg></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function sondeIcon() {
  return L.divIcon({
    className: 'sonde-marker',
    html: '<div class="sonde-dot" aria-hidden="true"></div>',
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
}

function notamStyle(): PathOptions {
  return {
    color: '#c4b5fd',
    weight: 2,
    fillColor: '#7c3aed',
    fillOpacity: 0.14,
    dashArray: '4 4',
  };
}

function formatRoadPopup(props: RoadConditionCollection['features'][number]['properties']) {
  return `
    <div class="road-popup">
      <strong>${props.title}</strong>
      <div class="muted">${props.label}${props.county ? ` · ${props.county} County` : ''}</div>
      <div class="muted">${props.distanceMiles} mi away</div>
      ${props.comment ? `<div>${props.comment}</div>` : ''}
    </div>
  `;
}

function formatAqiPopup(payload: AirQualityPayload) {
  return `
    <div class="aqi-popup">
      <strong>Air quality · ${payload.category}</strong>
      <div>US AQI ${payload.usAqi ?? '—'} · PM2.5 ${payload.pm25 ?? '—'} · PM10 ${payload.pm10 ?? '—'}</div>
      <div class="muted">Source: ${payload.source}${payload.reportingArea ? ` · ${payload.reportingArea}` : ''}</div>
    </div>
  `;
}

const VESSEL_TOOLTIP_OPTIONS: TooltipOptions = {
  sticky: false,
  interactive: true,
  direction: 'top',
  opacity: 1,
  className: 'vessel-tooltip',
};

function VesselMarker({ vessel }: { vessel: AisVesselPayload['vessels'][number] }) {
  const [tooltipActive, setTooltipActive] = useState(false);

  return (
    <Marker
      position={[vessel.lat, vessel.lon]}
      icon={vesselIcon(vessel.course)}
      zIndexOffset={360}
    >
      <Tooltip
        {...VESSEL_TOOLTIP_OPTIONS}
        eventHandlers={{
          add: () => setTooltipActive(true),
          remove: () => setTooltipActive(false),
        }}
      >
        <VesselDetails vessel={vessel} compact showVisual={tooltipActive} />
      </Tooltip>
      <Popup maxWidth={360} minWidth={280}>
        <MapLocationHeader lat={vessel.lat} lon={vessel.lon} />
        <VesselDetails vessel={vessel} />
      </Popup>
    </Marker>
  );
}

function formatNotamPopup(props: NotamCollection['features'][number]['properties']) {
  const text = String(props.text || '').slice(0, 400);
  return `
    <div class="notam-popup">
      <strong>${props.airport} NOTAM ${props.notamNumber}</strong>
      <div class="muted">${props.feature}${props.distanceMiles != null ? ` · ${props.distanceMiles} mi away` : ''}</div>
      <div class="notam-text">${text}</div>
    </div>
  `;
}

function formatEarthquakePopup(event: EarthquakePayload['events'][number]) {
  return `
    <div class="earthquake-popup">
      <strong>M${event.magnitude ?? '?'} · ${event.place}</strong>
      <div class="muted">${event.distanceMiles} mi away · depth ${event.depthKm ?? '—'} km</div>
      ${event.time ? `<div class="muted">${new Date(event.time).toLocaleString()}</div>` : ''}
    </div>
  `;
}

function formatSondePopup(sonde: SondePayload['sondes'][number]) {
  return `
    <div class="sonde-popup">
      <strong>${sonde.type} · ${sonde.serial}</strong>
      <div class="muted">${sonde.distanceMiles} mi away · alt ${sonde.altitudeM ?? '—'} m</div>
      <div>Temp ${sonde.temperatureC ?? '—'}°C · humidity ${sonde.humidity ?? '—'}%</div>
    </div>
  `;
}

function formatWildfirePopup(hotspot: WildfirePayload['hotspots'][number]) {
  return `
    <div class="wildfire-popup">
      <strong>VIIRS hotspot</strong>
      <div class="muted">${hotspot.distanceMiles} mi away · ${hotspot.satellite}</div>
      <div>FRP ${hotspot.frp ?? '—'} · confidence ${hotspot.confidence ?? '—'}</div>
    </div>
  `;
}

function formatMetarPopup(station: MetarPayload['stations'][number]) {
  return `
    <div class="metar-popup">
      <strong>${station.icaoId}</strong>
      <div>${station.name}</div>
      <div class="muted">${station.flightCategory} · ${station.temperatureF ?? '—'}°F · wind ${station.windDirectionDeg ?? '—'}° @ ${station.windSpeedMph ?? '—'} mph</div>
      <div class="metar-raw">${station.rawOb}</div>
      ${station.taf?.rawTaf ? `<div class="metar-taf"><strong>TAF</strong><div class="metar-raw">${station.taf.rawTaf}</div></div>` : ''}
    </div>
  `;
}

function formatTfrPopup(props: TfrCollection['features'][number]['properties']) {
  return `
    <div class="tfr-popup">
      <strong>${props.legal} TFR</strong>
      <div>${props.title}</div>
      <div class="muted">${props.state} · ${props.distanceMiles} mi away</div>
      ${props.notamKey ? `<div class="muted">${props.notamKey}</div>` : ''}
    </div>
  `;
}

function formatRiverPopup(gauge: RiverGaugePayload['gauges'][number]) {
  return `
    <div class="river-popup">
      <strong>${gauge.name}</strong>
      <div class="muted">${gauge.siteId} · ${gauge.distanceMiles} mi away</div>
      <div>Stage ${gauge.stageFt ?? '—'} ft · Flow ${gauge.flowCfs ?? '—'} cfs</div>
    </div>
  `;
}

function formatTransitPopup(vehicle: TransitVehicle) {
  return `
    <div class="transit-popup">
      <strong>${vehicle.routeName}</strong>
      <div class="muted">${vehicle.label} · ${vehicle.distanceMiles?.toFixed(1) ?? '—'} mi away</div>
      <div>${vehicle.speedMph ?? '—'} mph · route ${vehicle.routeId || '—'}</div>
    </div>
  `;
}

export function WeatherAlertPolygonLayer({
  collection,
}: {
  collection: WeatherAlertPolygonCollection | null;
}) {
  if (!collection?.features?.length) return null;

  return (
    <GeoJSON
      data={collection}
      style={(feature) => alertStyle(feature?.properties?.kind)}
      onEachFeature={(feature, layer) => {
        const props = feature?.properties;
        if (!props) return;
        layer.bindTooltip(formatWeatherAlertTooltip(props), TOOLTIP_OPTIONS);
        layer.bindPopup(formatWeatherAlertPopup(props));
      }}
    />
  );
}

export function TfrPolygonLayer({ collection }: { collection: TfrCollection | null }) {
  if (!collection?.features?.length) return null;

  return (
    <GeoJSON
      data={collection}
      style={tfrStyle}
      onEachFeature={(feature, layer) => {
        const props = feature?.properties;
        if (!props) return;
        layer.bindTooltip(`<strong>${props.legal} TFR</strong><div>${props.title}</div>`, TOOLTIP_OPTIONS);
        layer.bindPopup(formatTfrPopup(props));
      }}
    />
  );
}

function lightningIcon(opacity: number, fresh: boolean) {
  const style = fresh ? '' : ` style="opacity:${opacity.toFixed(2)}"`;
  return L.divIcon({
    className: `lightning-marker${fresh ? ' lightning-marker-fresh' : ''}`,
    html: `<div class="lightning-bolt"${style} aria-hidden="true">
      <svg viewBox="0 0 12 16" width="10" height="13" role="presentation">
        <path d="M7.2 0 3.4 8.6H6L4.8 16 10.6 7.4H8l2.2-7.4Z" fill="#fff"/>
      </svg>
    </div>`,
    iconSize: [12, 14],
    iconAnchor: [6, 7],
  });
}

export function LightningLayer({ payload }: { payload: LightningPayload | null }) {
  if (!payload?.strikes?.length) return null;

  return (
    <>
      {payload.strikes.map((strike, index) => {
        const age = strike.ageMinutes ?? 0;
        const opacity = Math.max(0.35, 1 - age / 30);
        const fresh = age <= 5;
        return (
          <Marker
            key={`${strike.lat}-${strike.lon}-${strike.observedAt || index}`}
            position={[strike.lat, strike.lon]}
            icon={lightningIcon(opacity, fresh)}
            zIndexOffset={360}
          >
            <Tooltip direction="top" opacity={1}>
              Lightning · {age <= 1 ? 'just now' : `${age}m ago`}
            </Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

export function MetarLayer({ payload }: { payload: MetarPayload | null }) {
  if (!payload?.stations?.length) return null;

  return (
    <>
      {payload.stations.map((station) => (
        <Marker
          key={station.icaoId}
          position={[station.lat, station.lon]}
          icon={metarIcon(station.flightCategory)}
          zIndexOffset={300}
        >
          <Tooltip direction="top" opacity={1}>
            {station.icaoId} · {station.flightCategory} · {station.temperatureF ?? '—'}°F
          </Tooltip>
          <Popup maxWidth={360}>
            <MapLocationHeader lat={station.lat} lon={station.lon} />
            <div dangerouslySetInnerHTML={{ __html: formatMetarPopup(station) }} />
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export function RiverGaugeLayer({ payload }: { payload: RiverGaugePayload | null }) {
  if (!payload?.gauges?.length) return null;

  return (
    <>
      {payload.gauges.map((gauge) => (
        <Marker
          key={gauge.siteId}
          position={[gauge.lat, gauge.lon]}
          icon={riverIcon(gauge.stageFt)}
          zIndexOffset={250}
        >
          <Tooltip direction="top" opacity={1}>
            {gauge.name} · {gauge.stageFt ?? '—'} ft
          </Tooltip>
          <Popup maxWidth={320}>
            <MapLocationHeader lat={gauge.lat} lon={gauge.lon} />
            <div dangerouslySetInnerHTML={{ __html: formatRiverPopup(gauge) }} />
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export function TransitLayer({
  vehicles,
  highlightedId,
  mapHandlers,
}: {
  vehicles: TransitVehicle[];
  highlightedId?: string | null;
  mapHandlers?: (id: string) => {
    mouseover: () => void;
    mouseout: () => void;
  };
}) {
  if (!vehicles.length) return null;

  return (
    <>
      {vehicles.map((vehicle) => {
        const id = `transit:${vehicle.vehicleId}`;
        const highlighted = highlightedId === id;
        return (
          <Marker
            key={id}
            position={[vehicle.lat, vehicle.lon]}
            icon={transitIcon(vehicle.routeName, highlighted)}
            zIndexOffset={highlighted ? 650 : 420}
            eventHandlers={mapHandlers?.(id)}
          >
            <Popup maxWidth={280}>
              <MapLocationHeader lat={vehicle.lat} lon={vehicle.lon} />
              <div dangerouslySetInnerHTML={{ __html: formatTransitPopup(vehicle) }} />
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export function RoadConditionsLayer({ collection }: { collection: RoadConditionCollection | null }) {
  if (!collection?.features?.length) return null;

  return (
    <GeoJSON
      data={collection}
      style={(feature) => roadStyle(feature?.properties?.kind)}
      pointToLayer={(feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 6,
          ...roadStyle(feature?.properties?.kind),
          fillColor: '#0f172a',
          fillOpacity: 0.85,
        })
      }
      onEachFeature={(feature, layer) => {
        const props = feature?.properties;
        if (!props) return;
        layer.bindTooltip(`<strong>${props.title}</strong><div>${props.label}</div>`, TOOLTIP_OPTIONS);
        layer.bindPopup(formatRoadPopup(props));
      }}
    />
  );
}

export function AirQualityLayer({ payload }: { payload: AirQualityPayload | null }) {
  if (!payload || payload.usAqi == null) return null;

  return (
    <Marker position={[payload.lat, payload.lon]} icon={aqiIcon(payload)} zIndexOffset={280}>
      <Tooltip direction="top" opacity={1}>
        AQI {payload.usAqi} · {payload.category}
      </Tooltip>
      <Popup maxWidth={320}>
        <MapLocationHeader lat={payload.lat} lon={payload.lon} />
        <div dangerouslySetInnerHTML={{ __html: formatAqiPopup(payload) }} />
      </Popup>
    </Marker>
  );
}

export function AisVesselsLayer({ payload }: { payload: AisVesselPayload | null }) {
  if (!payload?.vessels?.length) return null;

  return (
    <>
      {payload.vessels.map((vessel) => (
        <VesselMarker key={vessel.mmsi} vessel={vessel} />
      ))}
    </>
  );
}

export function NotamLayer({ collection }: { collection: NotamCollection | null }) {
  if (!collection?.features?.length) return null;

  return (
    <GeoJSON
      data={collection}
      style={notamStyle}
      pointToLayer={(feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 5,
          color: '#c4b5fd',
          fillColor: '#7c3aed',
          fillOpacity: 0.7,
          weight: 2,
        })
      }
      onEachFeature={(feature, layer) => {
        const props = feature?.properties;
        if (!props) return;
        layer.bindTooltip(
          `<strong>${props.airport} NOTAM</strong><div>${props.notamNumber || props.feature}</div>`,
          TOOLTIP_OPTIONS
        );
        layer.bindPopup(formatNotamPopup(props));
      }}
    />
  );
}

export function EarthquakeLayer({ payload }: { payload: EarthquakePayload | null }) {
  if (!payload?.events?.length) return null;

  return (
    <>
      {payload.events.map((event) => {
        const mag = event.magnitude ?? 0;
        const radius = Math.max(4, Math.min(12, mag * 2));
        return (
          <CircleMarker
            key={event.id}
            center={[event.lat, event.lon]}
            radius={radius}
            pathOptions={{
              color: '#fb923c',
              fillColor: '#ea580c',
              fillOpacity: 0.55,
              weight: 2,
            }}
          >
            <Tooltip direction="top" opacity={1}>
              M{event.magnitude ?? '?'} · {event.distanceMiles} mi
            </Tooltip>
            <Popup maxWidth={320}>
              <MapLocationHeader lat={event.lat} lon={event.lon} />
              <div dangerouslySetInnerHTML={{ __html: formatEarthquakePopup(event) }} />
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

export function SondeLayer({ payload }: { payload: SondePayload | null }) {
  if (!payload?.sondes?.length) return null;

  return (
    <>
      {payload.sondes.map((sonde) => (
        <Marker
          key={sonde.serial}
          position={[sonde.lat, sonde.lon]}
          icon={sondeIcon()}
          zIndexOffset={340}
        >
          <Tooltip direction="top" opacity={1}>
            {sonde.type} · {sonde.altitudeM ?? '—'} m
          </Tooltip>
          <Popup maxWidth={300}>
            <MapLocationHeader lat={sonde.lat} lon={sonde.lon} />
            <div dangerouslySetInnerHTML={{ __html: formatSondePopup(sonde) }} />
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export function WildfireLayer({ payload }: { payload: WildfirePayload | null }) {
  if (!payload?.hotspots?.length) return null;

  return (
    <>
      {payload.hotspots.map((hotspot, index) => (
        <CircleMarker
          key={`${hotspot.lat}-${hotspot.lon}-${hotspot.observedAt || index}`}
          center={[hotspot.lat, hotspot.lon]}
          radius={5}
          pathOptions={{
            color: '#fdba74',
            fillColor: '#f97316',
            fillOpacity: 0.7,
            weight: 1,
          }}
        >
          <Tooltip direction="top" opacity={1}>
            Fire hotspot · {hotspot.distanceMiles} mi
          </Tooltip>
          <Popup maxWidth={280}>
            <MapLocationHeader lat={hotspot.lat} lon={hotspot.lon} />
            <div dangerouslySetInnerHTML={{ __html: formatWildfirePopup(hotspot) }} />
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

function cameraIcon(kind: 'road' | 'rail' | 'weather' = 'road') {
  if (kind === 'weather') {
    return L.divIcon({
      className: 'camera-marker weather-camera-marker',
      html: `<div class="weather-camera-dot" aria-hidden="true"><span class="weather-camera-sun"></span></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }
  const dotClass = kind === 'rail' ? 'camera-dot rail-camera-dot' : 'camera-dot';
  const size = kind === 'rail' ? 20 : 9;
  const anchor = size / 2;
  return L.divIcon({
    className: kind === 'rail' ? 'camera-marker rail-camera-marker' : 'camera-marker',
    html: `<div class="${dotClass}" aria-hidden="true"></div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
  });
}

function nwpsIcon(category: string) {
  const cls =
    category.includes('Major') || category.includes('Moderate')
      ? 'nwps-flood-high'
      : category.includes('Minor') || category.includes('Action')
        ? 'nwps-flood-watch'
        : 'nwps-flood-normal';
  return L.divIcon({
    className: 'nwps-marker',
    html: `<div class="nwps-badge ${cls}">NWPS</div>`,
    iconSize: [48, 22],
    iconAnchor: [24, 11],
  });
}

function ebirdIcon(name: string) {
  return L.divIcon({
    className: 'ebird-marker',
    html: `<div class="ebird-badge">${name.slice(0, 10)}</div>`,
    iconSize: [64, 22],
    iconAnchor: [32, 11],
  });
}

function inatIcon(name: string) {
  return L.divIcon({
    className: 'inat-marker',
    html: `<div class="inat-badge">${name.slice(0, 10)}</div>`,
    iconSize: [64, 22],
    iconAnchor: [32, 11],
  });
}

function aprsIcon(callsign: string) {
  return L.divIcon({
    className: 'aprs-marker',
    html: `<div class="aprs-badge">${callsign.slice(0, 8)}</div>`,
    iconSize: [56, 22],
    iconAnchor: [28, 11],
  });
}

function droughtStyle(level: number): PathOptions {
  const colors = ['#64748b', '#fef3c7', '#fdba74', '#fb923c', '#ef4444', '#991b1b'];
  return {
    color: colors[level] || '#94a3b8',
    fillColor: colors[level] || '#475569',
    fillOpacity: 0.12 + level * 0.05,
    weight: 1,
  };
}

const CAMERA_TOOLTIP_OPTIONS: TooltipOptions = {
  sticky: false,
  interactive: true,
  direction: 'top',
  opacity: 1,
  className: 'camera-preview-tooltip',
};

function CameraSnapshotPreview({ cam, className = 'camera-preview-image' }: { cam: TrafficCamera; className?: string }) {
  return <CameraMapSnapshot cam={cam} className={className} />;
}

function CameraMarker({ cam, zIndexOffset = 320 }: { cam: TrafficCamera; zIndexOffset?: number }) {
  const [previewActive, setPreviewActive] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const kind =
    cam.camKind === 'weather' ? 'weather' : cam.camKind === 'rail' ? 'rail' : 'road';
  const icon = useMemo(() => cameraIcon(kind), [kind]);

  return (
    <Marker position={[cam.lat, cam.lon]} icon={icon} zIndexOffset={zIndexOffset}>
      <Tooltip
        {...CAMERA_TOOLTIP_OPTIONS}
        eventHandlers={{
          add: () => setPreviewActive(true),
          remove: () => setPreviewActive(false),
        }}
      >
        <div className="camera-preview">
          <div className="camera-preview-title">{cam.description}</div>
          <div className="camera-preview-meta muted">
            {[cam.railroad, cam.source, cam.state, cam.distanceMiles != null ? `${cam.distanceMiles} mi away` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {previewActive ? <CameraSnapshotPreview cam={cam} /> : null}
        </div>
      </Tooltip>
      <Popup
        maxWidth={720}
        minWidth={480}
        eventHandlers={{
          add: () => setPopupOpen(true),
          remove: () => setPopupOpen(false),
        }}
      >
        <div className="camera-popup">
          <MapLocationHeader lat={cam.lat} lon={cam.lon} />
          <strong>{cam.description}</strong>
          <div className="muted">
            {[cam.railroad, cam.source, cam.state, cam.distanceMiles != null ? `${cam.distanceMiles} mi away` : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {popupOpen ? <CameraMapLivePreview cam={cam} /> : null}
          {(() => {
            const href = cameraSourceSiteHref(cam);
            if (!href) return null;
            const modot = /modot/i.test(cam.source || '') || /modot\.(mo\.gov|org)/i.test(href);
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {modot ? 'Open on MoDOT Traveler map ↗' : 'Open on source site'}
              </a>
            );
          })()}
        </div>
      </Popup>
    </Marker>
  );
}

export function RailCameraLayer({ payload }: { payload: TrafficCameraPayload | null }) {
  const cameras =
    payload?.cameras
      ?.filter((cam) => cameraHasMapMarker(cam))
      .map((cam) => ({ ...cam, camKind: 'rail' as const })) ?? [];
  if (!cameras.length) return null;
  return (
    <>
      {cameras.map((cam) => (
        <CameraMarker key={cam.id} cam={cam} zIndexOffset={410} />
      ))}
    </>
  );
}

export function TrafficCameraLayer({ payload }: { payload: TrafficCameraPayload | null }) {
  const cameras =
    payload?.cameras?.filter((cam) => cameraHasMapMarker(cam) && cam.camKind !== 'weather') ?? [];
  if (!cameras.length) return null;
  return (
    <>
      {cameras.map((cam) => (
        <CameraMarker key={cam.id} cam={cam} zIndexOffset={320} />
      ))}
    </>
  );
}

export function WeatherCameraLayer({ payload }: { payload: TrafficCameraPayload | null }) {
  const cameras =
    payload?.cameras?.filter((cam) => cameraHasMapMarker(cam) && cam.camKind === 'weather') ?? [];
  if (!cameras.length) return null;
  return (
    <>
      {cameras.map((cam) => (
        <CameraMarker key={cam.id} cam={cam} zIndexOffset={340} />
      ))}
    </>
  );
}

export function RiverForecastLayer({ payload }: { payload: RiverForecastPayload | null }) {
  if (!payload?.gauges?.length) return null;
  return (
    <>
      {payload.gauges.map((gauge) => (
        <Marker
          key={gauge.lid}
          position={[gauge.lat, gauge.lon]}
          icon={nwpsIcon(gauge.floodCategoryForecast || gauge.floodCategory)}
          zIndexOffset={290}
        >
          <Tooltip direction="top" opacity={1}>
            {gauge.name} · {gauge.observedStageFt ?? '—'} ft
          </Tooltip>
          <Popup maxWidth={340}>
            <MapLocationHeader lat={gauge.lat} lon={gauge.lon} />
            <div className="nwps-popup">
              <strong>{gauge.name}</strong>
              <div className="muted">{gauge.lid}</div>
              <div>
                Stage {gauge.observedStageFt ?? '—'} ft · {gauge.floodCategory}
              </div>
              {gauge.forecastPeakStageFt ? (
                <div>
                  Forecast peak {gauge.forecastPeakStageFt} ft
                  {gauge.forecastPeakTime ? ` · ${new Date(gauge.forecastPeakTime).toLocaleString()}` : ''}
                </div>
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export function EbirdLayer({ payload }: { payload: EbirdPayload | null }) {
  if (!payload?.observations?.length) return null;
  return (
    <>
      {payload.observations.map((obs, index) => (
        <Marker
          key={`${obs.speciesCode}-${obs.observedAt}-${index}`}
          position={[obs.lat, obs.lon]}
          icon={ebirdIcon(obs.commonName)}
          zIndexOffset={310}
        >
          <Tooltip direction="top" opacity={1}>
            {obs.commonName}
          </Tooltip>
          <Popup maxWidth={300}>
            <MapLocationHeader lat={obs.lat} lon={obs.lon} />
            <div>
              <strong>{obs.commonName}</strong>
              <div className="muted">{obs.locationName}</div>
              <div>{obs.observedAt}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export function INaturalistLayer({ payload }: { payload: INaturalistPayload | null }) {
  if (!payload?.observations?.length) return null;
  return (
    <>
      {payload.observations.map((obs) => (
        <Marker key={obs.id} position={[obs.lat, obs.lon]} icon={inatIcon(obs.commonName)} zIndexOffset={305}>
          <Tooltip direction="top" opacity={1}>
            {obs.commonName}
          </Tooltip>
          <Popup maxWidth={300}>
            <MapLocationHeader lat={obs.lat} lon={obs.lon} />
            <div>
              <strong>{obs.commonName}</strong>
              <div className="muted">{obs.observedOn}</div>
              {obs.photoUrl ? (
                <img src={obs.photoUrl} alt={obs.commonName} style={{ maxWidth: '100%', marginTop: '0.5rem' }} />
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export function AprsLayer({ payload }: { payload: AprsPayload | null }) {
  if (!payload?.stations?.length) return null;
  return (
    <>
      {payload.stations.map((station) => (
        <Marker
          key={station.callsign}
          position={[station.lat, station.lon]}
          icon={aprsIcon(station.callsign)}
          zIndexOffset={300}
        >
          <Tooltip direction="top" opacity={1}>
            {station.callsign} · {station.comment.slice(0, 40)}
          </Tooltip>
          <Popup maxWidth={280}>
            <MapLocationHeader lat={station.lat} lon={station.lon} />
            <div>
              <strong>{station.callsign}</strong>
              <div>{station.comment}</div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}

export function DroughtLayer({ collection }: { collection: DroughtCollection | null }) {
  if (!collection?.features?.length) return null;
  return (
    <GeoJSON
      data={collection}
      style={(feature) => droughtStyle(feature?.properties?.level || 0)}
      onEachFeature={(feature, layer) => {
        const props = feature?.properties;
        if (!props) return;
        layer.bindTooltip(`<strong>${props.label}</strong>`, TOOLTIP_OPTIONS);
      }}
    />
  );
}

export function alertLegendSummary(collection: WeatherAlertPolygonCollection | null) {
  if (!collection?.count) return null;
  const parts = Object.entries(collection.counts || {})
    .filter(([, count]) => count > 0)
    .slice(0, 4)
    .map(([kind, count]) => `${alertKindLabel(kind as WeatherAlertKind).replace(' Warning', '')}: ${count}`);
  return parts.join(' · ');
}
