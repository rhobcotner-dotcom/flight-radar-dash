const EMERGENCY_SQUAWKS = new Set([7500, 7600, 7700]);
const HEAVY_TYPES = /^(A3|B7|B77|B78|A35|A38|B74|MD11|IL76|C17|KC10|KC135|B52)/i;
const MIL_CALLSIGN = /^(RCH|CNV|EVAC|NAVY|ARMY|USAF|SPAR|DUKE|IRON|REACH|SAM|CONVOY|HOMER)/i;

export function detectAlerts(flights = []) {
  const alerts = [];

  for (const flight of flights) {
    const squawk = Number(flight.squawk);
    if (EMERGENCY_SQUAWKS.has(squawk)) {
      alerts.push({
        type: 'emergency_squawk',
        severity: 'high',
        message: `Emergency squawk ${squawk} on ${label(flight)}`,
        flight,
      });
    }

    const alt = Number(flight.alt);
    const type = String(flight.type || '');
    if (Number.isFinite(alt) && alt > 0 && alt < 1500 && HEAVY_TYPES.test(type)) {
      alerts.push({
        type: 'low_heavy',
        severity: 'medium',
        message: `Low altitude (${alt} ft) heavy ${type} — ${label(flight)}`,
        flight,
      });
    }

    if (isLikelyMilGov(flight)) {
      alerts.push({
        type: 'mil_gov',
        severity: 'info',
        message: `Military/government aircraft — ${label(flight)}`,
        flight,
      });
    }
  }

  return dedupeAlerts(alerts);
}

export function isLikelyMilGov(flight) {
  const callsign = String(flight.callsign || flight.flight || '');
  const reg = String(flight.reg || '');
  if (MIL_CALLSIGN.test(callsign)) return true;
  if (/^(AF|AE|AD|CN|AN)\d/i.test(reg)) return true;
  return false;
}

export function summarizeCategories(flights = []) {
  const counts = {
    passenger: 0,
    cargo: 0,
    mil_gov: 0,
    business: 0,
    ga: 0,
    helicopter: 0,
    other: 0,
    unknown: 0,
  };

  for (const flight of flights) {
    if (isLikelyMilGov(flight)) {
      counts.mil_gov += 1;
      continue;
    }
    const type = String(flight.type || '').toUpperCase();
    if (/^H/.test(type) || type.startsWith('EC')) {
      counts.helicopter += 1;
    } else if (/^B7|^A3|^A2|^E7|^CRJ|^E75|^E90|^B38|^B39|^A21|^A22|^A35|^A38|^B77|^B78|^MD|^DC|^74|^76|^77|^78|^73/.test(type)) {
      counts.passenger += 1;
    } else if (/^B74|^74F|^76F|^77F|^MD1|^AN|^CL|^C5|^C17/.test(type)) {
      counts.cargo += 1;
    } else if (/^GL|^G[0-9]|^SR2|^PC12|^C56|^C68|^C72|^C82|^C25|^C55|^C60|^FA|^HA|^BE|^PA|^DA|^M20|^TBM/.test(type)) {
      counts.ga += 1;
    } else if (/^GLF|^GLEX|^CL60|^CL35|^FA7|^E55|^C68|^C56|^PC24|^G150|^G280/.test(type)) {
      counts.business += 1;
    } else {
      counts.unknown += 1;
    }
  }

  return counts;
}

function label(flight) {
  return flight.callsign || flight.flight || flight.reg || flight.hex || 'unknown';
}

function dedupeAlerts(alerts) {
  const seen = new Set();
  return alerts.filter((alert) => {
    const key = `${alert.type}:${alert.flight?.fr24_id || alert.flight?.hex || alert.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
