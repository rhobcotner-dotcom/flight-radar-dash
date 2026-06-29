/** Drop emergency map callouts older than this (dispatch / alert effective time). */
export const EMERGENCY_CALLOUT_MAX_AGE_MS = 4 * 60 * 60 * 1000;
/** Hide EMS incidents this long after they are marked closed. */
export const EMERGENCY_CLOSED_MAX_AGE_MS = 60 * 60 * 1000;

export function parseEmergencyObservedMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

export function isEmergencyCalloutFresh(observedMs, now = Date.now()) {
  if (!Number.isFinite(observedMs)) return false;
  return now - observedMs <= EMERGENCY_CALLOUT_MAX_AGE_MS;
}

export function incidentObservedMs(incident) {
  return parseEmergencyObservedMs(incident?.observedAt);
}

export function incidentClosedMs(incident) {
  return parseEmergencyObservedMs(incident?.closedAt);
}

export function isEmergencyIncidentFresh(incident, now = Date.now()) {
  const observedMs = incidentObservedMs(incident);
  if (!Number.isFinite(observedMs)) return false;
  if (now - observedMs > EMERGENCY_CALLOUT_MAX_AGE_MS) return false;

  const closedMs = incidentClosedMs(incident);
  if (Number.isFinite(closedMs) && now - closedMs > EMERGENCY_CLOSED_MAX_AGE_MS) {
    return false;
  }

  return true;
}

export function nwsAlertObservedMs(props = {}) {
  return parseEmergencyObservedMs(props.effective || props.onset || props.sent);
}

export function ipawsAlertObservedMs(props = {}) {
  return parseEmergencyObservedMs(props.sent);
}

export function wildfirePerimeterObservedMs(props = {}) {
  return (
    parseEmergencyObservedMs(props.FireDiscoveryDateTime ?? props.attr_FireDiscoveryDateTime) ??
    parseEmergencyObservedMs(props.poly_DateCurrent ?? props.attr_ModifiedOnDateTime_dt)
  );
}

export function wildfireIncidentObservedMs(incident = {}) {
  return parseEmergencyObservedMs(incident.observedAt ?? incident.FireDiscoveryDateTime);
}

export function filterFreshIncidents(incidents) {
  return (incidents || []).filter((incident) => isEmergencyIncidentFresh(incident));
}

export function filterFreshGeoFeatures(features, observedMsForProps) {
  return (features || []).filter((feature) =>
    isEmergencyCalloutFresh(observedMsForProps(feature?.properties || {}))
  );
}

/**
 * Remove stale callouts from the emergency map overlay payload and refresh counts.
 * FEMA disaster counties are administrative (not dispatch call-ins) and are kept as-is.
 */
export function applyEmergencyMapFreshness(payload) {
  if (!payload) return payload;

  const next = { ...payload };

  if (next.nifc && !next.nifc.error) {
    const incidents = filterFreshIncidents(next.nifc.incidents);
    const perimeterFeatures = filterFreshGeoFeatures(
      next.nifc.perimeterCollection?.features,
      wildfirePerimeterObservedMs
    );
    next.nifc = {
      ...next.nifc,
      incidents,
      incidentCount: incidents.length,
      perimeterCollection: {
        type: 'FeatureCollection',
        features: perimeterFeatures,
      },
      perimeterCount: perimeterFeatures.length,
    };
  }

  if (next.nws && !next.nws.error) {
    const features = filterFreshGeoFeatures(next.nws.collection?.features, nwsAlertObservedMs);
    next.nws = {
      ...next.nws,
      count: features.length,
      collection: { type: 'FeatureCollection', features },
    };
  }

  if (next.ipaws && !next.ipaws.error) {
    const alerts = (next.ipaws.alerts || []).filter((alert) =>
      isEmergencyCalloutFresh(ipawsAlertObservedMs(alert))
    );
    const features = filterFreshGeoFeatures(next.ipaws.collection?.features, ipawsAlertObservedMs);
    const inViewFeatures = filterFreshGeoFeatures(
      next.ipaws.inViewCollection?.features,
      ipawsAlertObservedMs
    );
    next.ipaws = {
      ...next.ipaws,
      count: alerts.length,
      alerts,
      collection: { type: 'FeatureCollection', features },
      inViewCollection: { type: 'FeatureCollection', features: inViewFeatures },
      inViewCount: inViewFeatures.length,
    };
  }

  if (next.cityEms && !next.cityEms.error) {
    const incidents = filterFreshIncidents(next.cityEms.incidents);
    next.cityEms = {
      ...next.cityEms,
      incidents,
      count: incidents.length,
    };
  }

  if (next.summary) {
    next.summary = {
      ...next.summary,
      wildfirePerimeters: next.nifc?.perimeterCount ?? 0,
      wildfireIncidents: next.nifc?.incidentCount ?? 0,
      nwsAlerts: next.nws?.count ?? 0,
      ipawsAlerts: next.ipaws?.inViewCount ?? next.ipaws?.count ?? 0,
      cityEms: next.cityEms?.count ?? 0,
    };
  }

  return next;
}
