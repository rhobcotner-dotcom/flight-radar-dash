import typicalSeats from '../../config/aircraft-typical-seats.json' with { type: 'json' };
import vesselDraftRatios from '../../config/vessel-max-draft-ratio.json' with { type: 'json' };

/** @typedef {{ occupancyLabel?: string | null, occupancyLevel?: number | null, occupancySource?: string | null, occupancyKind?: string | null }} OccupancyFields */

/**
 * Attach normalized occupancy fields to any entity record.
 * @param {Record<string, unknown>} entity
 * @param {{ label?: string | null, level?: number | null, source?: string | null, kind?: string | null }} info
 * @returns {Record<string, unknown>}
 */
export function attachOccupancy(entity, info = {}) {
  const label = info.label?.trim() || null;
  const level =
    info.level != null && Number.isFinite(Number(info.level))
      ? Math.max(0, Math.min(100, Math.round(Number(info.level))))
      : null;
  const occupancyLabel = label;
  const occupancyLevel = level;
  const occupancySource = info.source || null;
  const occupancyKind = info.kind || null;
  Object.assign(entity, { occupancyLabel, occupancyLevel, occupancySource, occupancyKind });
  return entity;
}

function aqiLevel(usAqi) {
  const value = Number(usAqi);
  if (!Number.isFinite(value)) return null;
  if (value <= 50) return { label: 'Good air · low pollution load', level: 15, kind: 'environmental' };
  if (value <= 100) return { label: 'Moderate pollution load', level: 35, kind: 'environmental' };
  if (value <= 150) return { label: 'Unhealthy for sensitive groups', level: 55, kind: 'environmental' };
  if (value <= 200) return { label: 'Unhealthy air load', level: 75, kind: 'environmental' };
  if (value <= 300) return { label: 'Very unhealthy air load', level: 90, kind: 'environmental' };
  return { label: 'Hazardous air load', level: 100, kind: 'environmental' };
}

function floodLoadLabel(category, stageFt, floodStageFt) {
  const cat = String(category || '').toLowerCase();
  const map = {
    'no flooding': { label: 'Channel normal · low fill', level: 20 },
    normal: { label: 'Channel normal · low fill', level: 20 },
    action: { label: 'Approaching flood stage · rising fill', level: 45 },
    minor: { label: 'Minor flood · elevated channel fill', level: 60 },
    moderate: { label: 'Moderate flood · high channel fill', level: 80 },
    major: { label: 'Major flood · near capacity', level: 95 },
    record: { label: 'Record flood · at/over capacity', level: 100 },
  };
  for (const [key, value] of Object.entries(map)) {
    if (cat.includes(key.replace(' ', '')) || cat.includes(key)) {
      if (stageFt != null && floodStageFt != null && floodStageFt > 0) {
        const pct = Math.round((Number(stageFt) / Number(floodStageFt)) * 100);
        return {
          label: `${value.label} · ${pct}% of flood stage`,
          level: Math.max(value.level, Math.min(100, pct)),
          kind: 'hydrology',
        };
      }
      return { ...value, kind: 'hydrology' };
    }
  }
  if (stageFt != null && floodStageFt != null && floodStageFt > 0) {
    const pct = Math.round((Number(stageFt) / Number(floodStageFt)) * 100);
    return {
      label: `${pct}% of flood stage`,
      level: Math.min(100, pct),
      kind: 'hydrology',
    };
  }
  return null;
}

function roadImpactOccupancy(kind, impact) {
  const k = String(kind || '');
  const impactText = String(impact || '').trim();
  if (k.includes('closed')) {
    return { label: 'Road capacity · closed / fully blocked', level: 100, kind: 'infrastructure' };
  }
  if (k.includes('delay')) {
    const level = impactText.match(/major|high|significant/i) ? 85 : impactText.match(/moderate|medium/i) ? 65 : 50;
    return {
      label: impactText
        ? `Traffic load · ${impactText}`
        : 'Traffic load · delay reported',
      level,
      kind: 'infrastructure',
    };
  }
  if (k.includes('winter')) {
    return { label: 'Winter impact · reduced road capacity', level: 55, kind: 'infrastructure' };
  }
  return null;
}

function parseLoadedFlag(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'loaded', 'load', 'full'].includes(text)) {
    return { label: 'Freight · loaded', level: 85, kind: 'cargo' };
  }
  if (['false', '0', 'no', 'empty', 'mt', 'mty', 'bare'].includes(text)) {
    return { label: 'Freight · empty', level: 15, kind: 'cargo' };
  }
  return { label: `Freight · ${String(value)}`, level: 50, kind: 'cargo' };
}

function flightPhaseLabel(flight) {
  const alt = Number(flight?.alt);
  const gspeed = Number(flight?.gspeed);
  const code = String(flight?.type || '').trim().toUpperCase();
  const seats = code ? typicalSeats[code] : null;
  const seatText = seats ? `~${seats} seats typical` : null;

  if (Number.isFinite(alt) && alt < 500) {
    return {
      label: seatText ? `On ground · ${seatText}` : 'On ground · passenger load not reported',
      level: 40,
      kind: 'passenger',
    };
  }
  if (Number.isFinite(alt) && alt < 8000 && Number.isFinite(gspeed) && gspeed < 200) {
    return {
      label: seatText ? `Climb/descent · ${seatText}` : 'Climb/descent · load not reported',
      level: 55,
      kind: 'passenger',
    };
  }
  return {
    label: seatText ? `En route · ${seatText} (load not reported live)` : 'En route · passenger load not reported',
    level: 60,
    kind: 'passenger',
  };
}

function vesselDraftProfile(typeLabel) {
  const text = String(typeLabel || '').toLowerCase();
  const defaults = vesselDraftRatios.defaults || { maxDraftRatio: 0.14, lightRatio: 0.05, moderateRatio: 0.09 };
  for (const [keyword, profile] of Object.entries(vesselDraftRatios.byTypeKeyword || {})) {
    if (text.includes(keyword)) return { ...defaults, ...profile };
  }
  return defaults;
}

function vesselLoadLabel(vessel) {
  const type = String(vessel?.typeLabel || vessel?.rawVesselType || '').toLowerCase();
  const draught = Number(vessel?.draughtMeters);
  const length = Number(vessel?.lengthMeters);

  if (/passenger|ferry|ro-?ro|cruise|sailing.*passenger/.test(type)) {
    return {
      label: 'Passenger vessel · pax count not in AIS feed',
      level: null,
      kind: 'passenger',
    };
  }

  if (Number.isFinite(draught) && draught > 0 && Number.isFinite(length) && length > 0) {
    const profile = vesselDraftProfile(type);
    const ratio = draught / length;
    const loadPct = Math.round(Math.min(100, (ratio / profile.maxDraftRatio) * 100));
    if (ratio >= profile.moderateRatio) {
      const heavy = ratio >= profile.maxDraftRatio * 0.85;
      return {
        label: heavy
          ? `Deep draft · ~${loadPct}% of type max (${draught.toFixed(1)} m / ${(length * profile.maxDraftRatio).toFixed(1)} m typ.)`
          : `Moderate draft · ~${loadPct}% of type max (${draught.toFixed(1)} m)`,
        level: loadPct,
        kind: 'cargo',
      };
    }
    if (ratio >= profile.lightRatio) {
      return {
        label: `Partial draft · ~${loadPct}% of type max (${draught.toFixed(1)} m)`,
        level: loadPct,
        kind: 'cargo',
      };
    }
    return {
      label: `Light draft · likely light load (${draught.toFixed(1)} m)`,
      level: Math.max(15, loadPct),
      kind: 'cargo',
    };
  }

  if (Number.isFinite(length) && length >= 200) {
    return { label: 'Large vessel · cargo load not reported', level: null, kind: 'cargo' };
  }

  return null;
}

export function enrichFlightOccupancy(flight) {
  const info = flightPhaseLabel(flight);
  return attachOccupancy(flight, { ...info, source: info.label?.includes('not reported') ? 'aircraft-registry' : 'adsb-phase' });
}

export function enrichVesselOccupancy(vessel) {
  const info = vesselLoadLabel(vessel);
  if (!info) return attachOccupancy(vessel, { label: null, source: 'ais' });
  const hasDraftRatio =
    Number.isFinite(Number(vessel?.draughtMeters)) &&
    Number.isFinite(Number(vessel?.lengthMeters)) &&
    info.level != null;
  return attachOccupancy(vessel, {
    ...info,
    source: hasDraftRatio ? 'ais-draft-ratio' : 'ais-draft',
  });
}

export function enrichCrossingOccupancy(train) {
  const status = String(train?.crossingStatus || train?.trainState || '').trim();
  if (!status) return train;
  return attachOccupancy(train, {
    label: `Crossing occupied · ${status}`,
    level: 100,
    source: 'crossing-sensor',
    kind: 'infrastructure',
  });
}

export function enrichFreightOccupancy(train) {
  const loaded = parseLoadedFlag(train?.trainState);
  if (loaded) {
    return attachOccupancy(train, { ...loaded, source: 'railstate-loaded' });
  }
  if (train?.cargoClue) {
    return attachOccupancy(train, {
      label: 'Freight · cargo indicated (APRS/comment)',
      level: 70,
      source: 'aprs-inference',
      kind: 'cargo',
    });
  }
  return train;
}

export function enrichRiverGaugeOccupancy(gauge, options = {}) {
  const info = floodLoadLabel(
    options.floodCategory,
    gauge?.stageFt,
    options.floodStageFt ?? gauge?.floodStageFt
  );
  if (!info) return gauge;
  return attachOccupancy(gauge, { ...info, source: 'usgs-stage' });
}

export function enrichNwpsGaugeOccupancy(gauge) {
  const info =
    floodLoadLabel(gauge?.floodCategory, gauge?.observedStageFt, gauge?.floodStageFt) ||
    floodLoadLabel(gauge?.floodCategoryForecast, gauge?.forecastStageFt, gauge?.floodStageFt);
  if (!info) return gauge;
  return attachOccupancy(gauge, { ...info, source: 'nwps-flood' });
}

export function enrichRoadConditionOccupancy(props) {
  const info = roadImpactOccupancy(props?.kind, props?.impact || props?.title);
  if (!info) return props;
  return attachOccupancy(props, { ...info, source: 'modot-impact' });
}

export function enrichAirQualityOccupancy(payload) {
  const info = aqiLevel(payload?.usAqi);
  if (!info) return payload;
  return attachOccupancy(payload, { ...info, source: 'aqi' });
}

export function enrichEarthquakeOccupancy(event) {
  const mag = Number(event?.magnitude);
  if (!Number.isFinite(mag)) return event;
  const level = Math.min(100, Math.round(mag * 15));
  return attachOccupancy(event, {
    label: `Seismic energy · M${mag.toFixed(1)}`,
    level,
    source: 'usgs-magnitude',
    kind: 'environmental',
  });
}

export function enrichWildfireOccupancy(hotspot) {
  const frp = Number(hotspot?.frp);
  if (!Number.isFinite(frp)) return hotspot;
  const level = Math.min(100, Math.round(Math.log10(frp + 1) * 35));
  const label =
    frp >= 500 ? 'Intense fire radiative load' : frp >= 100 ? 'Strong fire radiative load' : 'Moderate fire radiative load';
  return attachOccupancy(hotspot, { label, level, source: 'viirs-frp', kind: 'environmental' });
}

export function enrichLightningOccupancy(strike) {
  const intensity = Number(strike?.intensity);
  const age = Number(strike?.ageMinutes);
  const level = Number.isFinite(intensity)
    ? Math.min(100, Math.round(intensity))
    : age <= 2
      ? 90
      : age <= 10
        ? 60
        : 35;
  return attachOccupancy(strike, {
    label: age <= 2 ? 'Fresh strike · high local energy load' : `Lightning · ${age}m ago`,
    level,
    source: 'blitzortung',
    kind: 'environmental',
  });
}

export function enrichMetarOccupancy(station) {
  const cat = String(station?.flightCategory || '').toUpperCase();
  const map = {
    VFR: { label: 'Airspace · VFR (low congestion)', level: 25 },
    MVFR: { label: 'Airspace · MVFR (moderate constraints)', level: 45 },
    IFR: { label: 'Airspace · IFR (high constraints)', level: 70 },
    LIFR: { label: 'Airspace · LIFR (severe constraints)', level: 90 },
  };
  const info = map[cat];
  if (!info) return station;
  return attachOccupancy(station, { ...info, source: 'metar-category', kind: 'infrastructure' });
}

export function enrichTransitVehicleOccupancy(vehicle, details = {}) {
  if (details.occupancyLabel) {
    return attachOccupancy(vehicle, {
      label: details.occupancyLabel,
      level: details.occupancyLevel ?? occupancyLevelFromLabel(details.occupancyLabel),
      source: details.occupancySource || 'gtfs-rt',
      kind: 'passenger',
    });
  }
  return vehicle;
}

export function isRealOccupancySource(source) {
  const value = String(source || '').trim().toLowerCase();
  return value === 'gtfs-rt' || value === 'tsa-wait' || value === 'railstate-loaded' || value === 'crossing-sensor';
}

export function occupancyLevelFromLabel(label) {
  const text = String(label || '').toLowerCase();
  if (!text) return null;
  const pct = text.match(/(\d+)%/);
  if (pct) return Number(pct[1]);
  if (text.includes('empty') || text.includes('many seats')) return 20;
  if (text.includes('few seats')) return 45;
  if (text.includes('standing')) return 75;
  if (text.includes('crushed') || text.includes('full') || text.includes('not accepting')) return 95;
  return null;
}

export function enrichCameraOccupancy(camera) {
  return attachOccupancy(camera, {
    label: 'Live view · crowd/load not sensed from feed',
    level: null,
    source: 'camera-static',
    kind: 'infrastructure',
  });
}

export function enrichSatelliteOccupancy(satellite) {
  return attachOccupancy(satellite, {
    label: 'Orbital slot occupied · payload active',
    level: null,
    source: 'celestrak',
    kind: 'infrastructure',
  });
}
