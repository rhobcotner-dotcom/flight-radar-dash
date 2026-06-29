import type { EmergencyEntityProperties, EmergencyIncident } from '../hooks/useEmergencyServices';
import { escapeHtml } from './mapLocation';

function formatTimestamp(value: string | null | undefined) {
  if (!value) return '';
  const ms = Date.parse(String(value));
  if (!Number.isFinite(ms)) return String(value);
  return new Date(ms).toLocaleString();
}

function formatDuration(startMs: number, endMs: number) {
  const minutes = Math.max(0, Math.round((endMs - startMs) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours} hr ${rem} min` : `${hours} hr`;
}

function popupLine(label: string, value: string | null | undefined) {
  const text = String(value || '').trim();
  if (!text) return '';
  return `<div><span class="emergency-popup-label">${escapeHtml(label)}:</span> ${escapeHtml(text)}</div>`;
}

function popupMuted(text: string | null | undefined) {
  const value = String(text || '').trim();
  if (!value) return '';
  return `<div class="muted">${escapeHtml(value)}</div>`;
}

function sourceLabel(incident: EmergencyIncident) {
  const sourceType = String(incident.sourceType || '').toLowerCase();
  if (sourceType.includes('pulsepoint')) return 'PulsePoint · live feed';
  if (sourceType.includes('arcgis')) return 'ArcGIS CAD · live feed';
  if (sourceType.includes('socrata') || incident.emergencySource) {
    return `${incident.emergencySource || 'Open data CAD'} · ${incident.emergencyTimingClass === 'real-time' ? 'live feed' : 'delayed feed'}`;
  }
  const timing =
    incident.emergencyTimingClass === 'real-time'
      ? 'Live feed'
      : incident.emergencyTimingClass === 'delayed'
        ? 'Delayed feed'
        : incident.emergencyTimingClass === 'static'
          ? 'Administrative / static'
          : 'Source unknown';
  return `${incident.emergencySource || 'Emergency feed'} · ${timing}`;
}

function formatUnits(units: EmergencyIncident['units']) {
  if (!units?.length) return '';
  return units
    .map((unit) => {
      const status = unit.statusLabel || unit.status || '';
      return status ? `${unit.id} · ${status}` : unit.id;
    })
    .join('; ');
}

function formatDetails(details: EmergencyIncident['details']) {
  if (!details?.length) return '';
  return details.map((row) => popupLine(row.label, row.value)).join('');
}

/** Rich popup for EMS / fire dispatch points (PulsePoint, Socrata, ArcGIS). */
export function formatEmsIncidentPopupHtml(incident: EmergencyIncident) {
  const title = incident.title || incident.emergencyName || 'Emergency dispatch';
  const callType = String(incident.pulsePointCallType || '').trim();
  const callTypeLine =
    callType && callTypeLabelFromCode(callType) !== title
      ? popupLine('Call type', `${callType} · ${callTypeLabelFromCode(callType)}`)
      : callType
        ? popupLine('Call type', callType)
        : incident.type && incident.type !== title
          ? popupLine('Type', incident.type)
          : '';

  const receivedMs = incident.observedAt ? Date.parse(String(incident.observedAt)) : NaN;
  const closedMs = incident.closedAt ? Date.parse(String(incident.closedAt)) : NaN;
  const duration =
    Number.isFinite(receivedMs) && Number.isFinite(closedMs) && closedMs >= receivedMs
      ? formatDuration(receivedMs, closedMs)
      : '';

  const locationNotes = (incident.locationNotes || []).filter(Boolean).join(' · ');

  return `
    <div class="emergency-popup">
      <strong>${escapeHtml(title)}</strong>
      ${incident.agencyName || incident.agency ? `<div>${escapeHtml(String(incident.agencyName || incident.agency))}</div>` : ''}
      ${incident.city ? popupLine('Area', incident.city) : ''}
      ${incident.address ? `<div>${escapeHtml(incident.address)}</div>` : ''}
      ${callTypeLine}
      ${popupLine('Status', incident.emergencyStatus || incident.status)}
      ${popupLine('Alarm level', incident.alarmLevel)}
      ${popupLine('Priority', incident.priority)}
      ${popupLine('Incident #', incident.incidentNumber)}
      ${formatUnits(incident.units) ? popupLine('Units', formatUnits(incident.units)) : ''}
      ${incident.observedAt ? popupLine('Received', formatTimestamp(incident.observedAt)) : ''}
      ${incident.closedAt ? popupLine('Closed', formatTimestamp(incident.closedAt)) : ''}
      ${duration ? popupLine('Duration', duration) : ''}
      ${formatDetails(incident.details)}
      ${locationNotes ? popupMuted(locationNotes) : ''}
      ${incident.geocodeNote ? popupMuted(incident.geocodeNote) : ''}
      <div class="muted">${escapeHtml(sourceLabel(incident))}</div>
    </div>
  `;
}

function callTypeLabelFromCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (['ME', 'CPR', 'OD', 'BE', 'BEH'].includes(normalized)) return 'Medical emergency';
  if (normalized === 'SF' || normalized === 'ST') return 'Structure fire';
  if (normalized === 'VEG') return 'Vegetation fire';
  if (normalized === 'ALARM') return 'Alarm';
  return code;
}

export function formatEmergencyPopupHtml(
  props: EmergencyEntityProperties & {
    title?: string | null;
    address?: string | null;
    agency?: string | null;
    observedAt?: string | null;
    areaDesc?: string | null;
    headline?: string | null;
    event?: string | null;
  }
) {
  const timing = props.emergencyTimingClass
    ? props.emergencyTimingClass === 'real-time'
      ? 'Live feed'
      : props.emergencyTimingClass === 'delayed'
        ? 'Delayed feed'
        : 'Administrative / static'
    : 'Source unknown';
  const observed = props.observedAt ? formatTimestamp(props.observedAt) : '';
  const name = props.emergencyName || props.headline || props.title || props.event || 'Emergency';

  return `
    <div class="emergency-popup">
      <strong>${escapeHtml(name)}</strong>
      ${props.emergencyLabel && props.emergencyLabel !== name ? `<div>${escapeHtml(props.emergencyLabel)}</div>` : ''}
      ${props.areaDesc ? `<div>${escapeHtml(props.areaDesc)}</div>` : ''}
      <div class="muted">${escapeHtml(props.emergencyStatus || '')}${props.emergencySeverity ? ` · ${escapeHtml(props.emergencySeverity)}` : ''}</div>
      ${props.agency ? `<div>${escapeHtml(props.agency)}</div>` : ''}
      ${props.address ? `<div>${escapeHtml(props.address)}</div>` : ''}
      ${props.containmentPct != null ? `<div>Containment: ${props.containmentPct}%</div>` : ''}
      ${props.acres != null ? `<div>Acres: ${Math.round(Number(props.acres)).toLocaleString()}</div>` : ''}
      ${props.cause ? `<div>Cause: ${escapeHtml(props.cause)}</div>` : ''}
      ${props.countyName ? `<div>Area: ${escapeHtml(props.countyName)}</div>` : ''}
      ${props.geocodeNote ? `<div class="muted">${escapeHtml(props.geocodeNote)}</div>` : ''}
      ${observed ? `<div class="muted">${escapeHtml(observed)}</div>` : ''}
      <div class="muted">${escapeHtml(timing)} · ${escapeHtml(props.emergencySource || 'unknown source')}</div>
    </div>
  `;
}
