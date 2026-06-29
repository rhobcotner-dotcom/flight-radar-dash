import type { EmergencyEntityProperties } from '../hooks/useEmergencyServices';

export function formatEmergencyPopupHtml(props: EmergencyEntityProperties & {
  title?: string | null;
  address?: string | null;
  agency?: string | null;
  observedAt?: string | null;
  areaDesc?: string | null;
  headline?: string | null;
  event?: string | null;
}) {
  const timing = props.emergencyTimingClass
    ? props.emergencyTimingClass === 'real-time'
      ? 'Live feed'
      : props.emergencyTimingClass === 'delayed'
        ? 'Delayed feed'
        : 'Administrative / static'
    : 'Source unknown';
  const observed = props.observedAt ? new Date(String(props.observedAt)).toLocaleString() : '';
  const name = props.emergencyName || props.headline || props.title || props.event || 'Emergency';

  return `
    <div class="emergency-popup">
      <strong>${name}</strong>
      <div>${props.emergencyLabel || props.areaDesc || ''}</div>
      <div class="muted">${props.emergencyStatus || ''}${props.emergencySeverity ? ` · ${props.emergencySeverity}` : ''}</div>
      ${props.agency ? `<div>${props.agency}</div>` : ''}
      ${props.address ? `<div>${props.address}</div>` : ''}
      ${props.containmentPct != null ? `<div>Containment: ${props.containmentPct}%</div>` : ''}
      ${props.acres != null ? `<div>Acres: ${Math.round(Number(props.acres)).toLocaleString()}</div>` : ''}
      ${props.cause ? `<div>Cause: ${props.cause}</div>` : ''}
      ${props.countyName ? `<div>Area: ${props.countyName}</div>` : ''}
      ${props.geocodeNote ? `<div class="muted">${props.geocodeNote}</div>` : ''}
      ${observed ? `<div class="muted">${observed}</div>` : ''}
      <div class="muted">${timing} · ${props.emergencySource || 'unknown source'}</div>
    </div>
  `;
}
