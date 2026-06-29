/** @typedef {'real-time' | 'delayed' | 'static'} EmergencyTimingClass */

/**
 * @typedef {{
 *   emergencyLabel?: string | null,
 *   emergencyLevel?: number | null,
 *   emergencySource?: string | null,
 *   emergencyKind?: string | null,
 *   emergencyTimingClass?: EmergencyTimingClass | null,
 *   emergencyName?: string | null,
 *   emergencyStatus?: string | null,
 *   emergencySeverity?: string | null,
 * }} EmergencyFields
 */

/**
 * Attach normalized emergency fields to any entity record.
 * @param {Record<string, unknown>} entity
 * @param {{
 *   label?: string | null,
 *   level?: number | null,
 *   source?: string | null,
 *   kind?: string | null,
 *   timingClass?: EmergencyTimingClass | null,
 *   name?: string | null,
 *   status?: string | null,
 *   severity?: string | null,
 * }} info
 * @returns {EmergencyFields}
 */
export function attachEmergency(entity, info = {}) {
  const label = info.label?.trim() || null;
  const level =
    info.level != null && Number.isFinite(Number(info.level))
      ? Math.max(0, Math.min(100, Math.round(Number(info.level))))
      : null;

  const fields = {
    emergencyLabel: label,
    emergencyLevel: level,
    emergencySource: info.source || null,
    emergencyKind: info.kind || null,
    emergencyTimingClass: info.timingClass || null,
    emergencyName: info.name?.trim() || null,
    emergencyStatus: info.status?.trim() || null,
    emergencySeverity: info.severity?.trim() || null,
  };

  Object.assign(entity, fields);
  return fields;
}

export function severityFromContainment(pct) {
  const value = Number(pct);
  if (!Number.isFinite(value)) return 70;
  if (value >= 90) return 35;
  if (value >= 50) return 55;
  return 85;
}

export function severityFromAcres(acres) {
  const value = Number(acres);
  if (!Number.isFinite(value) || value <= 0) return 45;
  if (value >= 100000) return 100;
  if (value >= 10000) return 90;
  if (value >= 1000) return 75;
  if (value >= 100) return 60;
  return 45;
}

export function enrichWildfirePerimeter(feature) {
  const target = feature?.properties ?? feature;
  const props = feature?.properties || feature || {};
  const name = String(props.poly_IncidentName || props.IncidentName || props.name || 'Wildfire').trim();
  const containment = props.attr_PercentContained ?? props.PercentContained;
  const acres = props.poly_GISAcres ?? props.attr_IncidentSize ?? props.DiscoveryAcres;
  const cause = props.attr_FireCause ?? props.FireCause;
  const containmentText =
    containment != null && Number.isFinite(Number(containment)) ? `${Math.round(Number(containment))}% contained` : 'containment not reported';
  const acresText = acres != null && Number.isFinite(Number(acres)) ? `${Math.round(Number(acres)).toLocaleString()} ac` : 'size unknown';

  return attachEmergency(target, {
    name,
    status: containmentText,
    severity: Number(containment) >= 90 ? 'Contained' : Number(containment) >= 50 ? 'Moderate' : 'Active',
    label: `${name} · ${acresText} · ${containmentText}${cause ? ` · ${cause}` : ''}`,
    level: Math.max(severityFromContainment(containment), severityFromAcres(acres)),
    source: 'nifc-wfigs',
    kind: 'wildfire-perimeter',
    timingClass: 'real-time',
  });
}

export function enrichWildfireIncident(incident) {
  const name = String(incident.name || incident.IncidentName || 'Wildfire incident').trim();
  const containment = incident.containmentPct;
  const acres = incident.acres;
  attachEmergency(incident, {
    name,
    status: incident.status || (containment != null ? `${containment}% contained` : 'Active'),
    severity: incident.severity || 'Active',
    label: `${name}${acres ? ` · ${Math.round(Number(acres)).toLocaleString()} ac` : ''}${containment != null ? ` · ${containment}%` : ''}`,
    level: Math.max(severityFromContainment(containment), severityFromAcres(acres)),
    source: 'nifc-wfigs',
    kind: 'wildfire-incident',
    timingClass: 'real-time',
  });
  return incident;
}

export function enrichFemaDisaster(record) {
  const title = String(record.declarationTitle || record.femaDeclarationString || 'FEMA disaster').trim();
  const area = String(record.designatedArea || record.state || '').trim();
  const type = String(record.declarationType || record.incidentType || 'Disaster').trim();
  attachEmergency(record, {
    name: title,
    status: record.incidentEndDate ? 'Closed' : 'Active declaration',
    severity: record.declarationType === 'DR' ? 'Major disaster' : record.declarationType === 'EM' ? 'Emergency' : type,
    label: `${title} · ${area} · ${type}`,
    level: record.declarationType === 'DR' ? 85 : record.declarationType === 'FM' ? 70 : 60,
    source: 'fema-open',
    kind: 'fema-disaster',
    timingClass: 'static',
  });
  return record;
}

export function capAlertLevel({ severity, urgency, certainty, event } = {}) {
  const severityWeight = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 1 };
  const urgencyWeight = { Immediate: 4, Expected: 3, Future: 2, Past: 1, Unknown: 1 };
  const certaintyWeight = { Observed: 4, Likely: 3, Possible: 2, Unlikely: 1, Unknown: 1 };
  const s = severityWeight[String(severity)] || 2;
  const u = urgencyWeight[String(urgency)] || 2;
  const c = certaintyWeight[String(certainty)] || 2;
  const label = String(event || '').toLowerCase();
  let base = Math.round(((s + u + c) / 12) * 100);
  if (label.includes('amber') || label.includes('child abduction')) base = Math.max(base, 95);
  if (label.includes('civil emergency')) base = Math.max(base, 90);
  if (label.includes('law enforcement')) base = Math.max(base, 85);
  if (label.includes('911') && label.includes('outage')) base = Math.max(base, 80);
  return Math.max(35, Math.min(100, base));
}

export function enrichNwsEmergencyAlert(feature) {
  const target = feature?.properties ?? feature;
  const props = feature?.properties || feature || {};
  const event = String(props.event || 'Weather alert').trim();
  const severity = String(props.severity || props.urgency || '').trim();
  const kind = props.alertClass || props.kind || 'nws-alert';
  return attachEmergency(target, {
    name: event,
    status: props.expires ? `Until ${props.expires}` : 'Active',
    severity: [severity, props.urgency, props.certainty].filter(Boolean).join(' · ') || props.alertClass || 'Alert',
    label: `${event}${props.headline ? ` · ${props.headline}` : ''}`,
    level: capAlertLevel(props),
    source: 'nws-cap',
    kind: String(kind).startsWith('nws-') ? kind : 'nws-alert',
    timingClass: 'real-time',
  });
}

export function enrichIpawsAlert(alert) {
  const headline = String(alert.headline || alert.event || 'IPAWS alert').trim();
  attachEmergency(alert, {
    name: headline,
    status: alert.status || alert.msgType || 'Public alert',
    severity: alert.severity || 'Emergency',
    label: `${headline}${alert.areaDesc ? ` · ${alert.areaDesc}` : ''}`,
    level: alert.severity === 'Extreme' ? 100 : alert.severity === 'Severe' ? 90 : 80,
    source: 'ipaws-cap',
    kind: 'ipaws-alert',
    timingClass: 'real-time',
  });
  return alert;
}

export function enrichEmsIncident(incident) {
  const name = String(incident.title || incident.type || 'EMS / Fire call').trim();
  attachEmergency(incident, {
    name,
    status: incident.status || 'Dispatched',
    severity: incident.priority || incident.alarmLevel || 'Response',
    label: `${incident.agency || incident.city || 'EMS'} · ${name}${incident.address ? ` · ${incident.address}` : ''}`,
    level: /red|1st alarm|2nd alarm|working fire|structure fire/i.test(`${name} ${incident.type || ''}`) ? 80 : 55,
    source: incident.source || 'city-open-data',
    kind: 'ems-incident',
    timingClass: incident.timingClass || 'delayed',
  });
  return incident;
}

export function isLiveEmergencySource(source) {
  const value = String(source || '').trim().toLowerCase();
  return ['nifc-wfigs', 'nws-cap', 'ipaws-cap'].includes(value);
}
