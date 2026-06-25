export interface TornadoPolygonProperties {
  id: string;
  kind: 'warning' | 'pds';
  event: string;
  headline: string;
  areaDesc: string;
  effective: string | null;
  expires: string | null;
  senderName: string;
}

export interface TornadoPolygonFeature {
  type: 'Feature';
  id?: string;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: TornadoPolygonProperties;
}

export interface TornadoPolygonCollection {
  type: 'FeatureCollection';
  features: TornadoPolygonFeature[];
  source?: string;
  fetchedAt?: string;
  count?: number;
  pdsCount?: number;
}

export async function fetchTornadoPolygons(): Promise<TornadoPolygonCollection> {
  const res = await fetch('/api/weather/tornado-polygons');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Tornado polygons unavailable');

  return {
    type: 'FeatureCollection',
    features: Array.isArray(data.features) ? data.features : [],
    source: data.source,
    fetchedAt: data.fetchedAt,
    count: data.count,
    pdsCount: data.pdsCount,
  };
}

export function tornadoPolygonKey(collection: TornadoPolygonCollection | null) {
  if (!collection?.features?.length) return 'empty';
  return collection.features
    .map((feature) => feature.properties?.id || feature.id || '')
    .sort()
    .join('|');
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function tornadoLabel(kind: TornadoPolygonProperties['kind']) {
  return kind === 'pds' ? 'PDS Tornado Warning' : 'Tornado Warning';
}

export function formatTornadoPolygonTooltip(props: TornadoPolygonProperties) {
  const lines = [
    `<strong>${escapeHtml(tornadoLabel(props.kind))}</strong>`,
    props.areaDesc ? `<div>${escapeHtml(props.areaDesc)}</div>` : '',
    props.effective ? `<div class="muted">Active since ${escapeHtml(formatTime(props.effective) || '')}</div>` : '',
    props.expires ? `<div class="muted">Until ${escapeHtml(formatTime(props.expires) || '')}</div>` : '',
  ].filter(Boolean);

  return `<div class="tornado-tooltip-body">${lines.join('')}</div>`;
}

export function formatTornadoPolygonPopup(props: TornadoPolygonProperties) {
  const lines = [
    `<strong>${escapeHtml(tornadoLabel(props.kind))}</strong>`,
    `<div>${escapeHtml(props.headline || props.event)}</div>`,
    props.areaDesc ? `<div class="muted">${escapeHtml(props.areaDesc)}</div>` : '',
    props.effective ? `<div class="muted">Active since ${escapeHtml(formatTime(props.effective) || '')}</div>` : '',
    props.expires ? `<div class="muted">Until ${escapeHtml(formatTime(props.expires) || '')}</div>` : '',
    props.senderName ? `<div class="muted">${escapeHtml(props.senderName)}</div>` : '',
  ].filter(Boolean);

  return `<div class="tornado-popup">${lines.join('')}</div>`;
}
