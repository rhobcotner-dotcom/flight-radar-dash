import { distanceMiles as defaultDistanceMiles } from './geo.js';

export function createHearingPredictor({
  noiseModel,
  noiseCategories,
  noiseProfiles,
  distanceMiles = defaultDistanceMiles,
}) {
  const DEG = Math.PI / 180;

  function normalizeHeading(deg) {
    return ((deg % 360) + 360) % 360;
  }

  function headingDiff(a, b) {
    const delta = Math.abs(normalizeHeading(a) - normalizeHeading(b));
    return delta > 180 ? 360 - delta : delta;
  }

  function bearingDegrees(fromLat, fromLon, toLat, toLon) {
    const lat1 = fromLat * DEG;
    const lat2 = toLat * DEG;
    const dLon = (toLon - fromLon) * DEG;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return normalizeHeading((Math.atan2(y, x) / DEG));
  }

  function resolveNoiseCategory(typeCode) {
    const code = String(typeCode || '').trim().toUpperCase();
    if (!code) return noiseProfiles.defaultCategory || 'unknown';

    if (noiseProfiles.types?.[code]) return noiseProfiles.types[code];

    const rules = noiseProfiles.prefixRules || [];
    const sorted = [...rules].sort((a, b) => b.prefix.length - a.prefix.length);
    for (const rule of sorted) {
      if (code.startsWith(rule.prefix)) return rule.category;
    }

    if (/^[A-Z]\d/.test(code)) return noiseProfiles.defaultCategory || 'unknown_jet';
    return 'unknown';
  }

  function classifyFlightPhase(flight) {
    const alt = Number(flight?.alt);
    const vs = Number(flight?.vspeed);

    if (!Number.isFinite(alt) || alt <= 100) return 'ground';
    if (alt <= 3000) {
      if (Number.isFinite(vs) && vs > 80) return 'takeoff_climb';
      if (Number.isFinite(vs) && vs < -80) return 'approach_low';
      return 'level_low';
    }
    if (Number.isFinite(vs) && vs > 300) return 'takeoff_climb';
    if (Number.isFinite(vs) && vs > 80) return 'takeoff_climb';
    if (Number.isFinite(vs) && vs < -300) return 'descent';
    if (Number.isFinite(vs) && vs < -80) return 'descent';
    return 'cruise_overhead';
  }

  function slantMiles(horizontalMiles, altitudeFt) {
    const altMiles = Math.max(0, Number(altitudeFt) || 0) / 5280;
    return Math.sqrt(horizontalMiles ** 2 + altMiles ** 2);
  }

  function passesBackyardLimits(horizontal, alt, model) {
    const limits = model.limits || {};
    if (horizontal > (limits.maxHorizontalMiles ?? 7)) {
      return { ok: false, reason: 'too_far' };
    }
    if (
      alt > (limits.highAltitudeFt ?? 5000)
      && horizontal > (limits.maxHorizontalAtHighAltitudeMiles ?? 2)
    ) {
      return { ok: false, reason: 'too_high_and_far' };
    }
    if (
      alt > (limits.mediumAltitudeFt ?? 4000)
      && horizontal > (limits.maxHorizontalAtMediumAltitudeMiles ?? 3)
    ) {
      return { ok: false, reason: 'too_high_and_far' };
    }
    return { ok: true, reason: 'ok' };
  }

  function applyIndoorAdjustment(outdoorDb, model) {
    const loss = model.indoor?.transmissionLossDb ?? 15;
    const minDb = model.attenuation.minEstimatedDb ?? 10;
    const maxDb = model.attenuation.maxEstimatedDb ?? 88;
    return Math.max(minDb, Math.min(maxDb, outdoorDb - loss));
  }

  function horizontalAttenuationDb(horizontal, model) {
    const ref = model.reference.horizontalMiles;
    if (horizontal <= ref) return 0;
    const doublings = Math.log2(horizontal / ref);
    return doublings * model.attenuation.horizontalDbPerDistanceDoubling;
  }

  function altitudeAttenuationDb(altitudeFt, model) {
    const refAlt = model.reference.altitudeFt;
    const alt = Number(altitudeFt) || 0;
    if (alt <= refAlt) return 0;
    return ((alt - refAlt) / 1000) * model.attenuation.extraDbPer1000ftAboveReference;
  }

  function distanceFadeDb(horizontal, model) {
    const start = model.attenuation.distanceFadeStartMiles ?? 3.5;
    if (horizontal <= start) return 0;
    return (horizontal - start) * (model.attenuation.extraDbPerMileBeyondFadeStart ?? 3.4);
  }

  function phaseAdjustDb(phase, model) {
    return model.phaseDbAdjust?.[phase] ?? 0;
  }

  function approachGeometryDb(flight, observer, model) {
    const track = Number(flight?.track);
    const gs = Number(flight?.gspeed);
    if (!Number.isFinite(track) || !Number.isFinite(gs) || gs < model.approach.minGroundSpeedKt) return 0;

    const bearingToObserver = bearingDegrees(flight.lat, flight.lon, observer.lat, observer.lon);
    const delta = headingDiff(track, bearingToObserver);
    if (delta <= model.approach.headingToleranceDeg) return model.approach.approachingBonusDb;
    if (delta >= 180 - model.approach.headingToleranceDeg) return -model.approach.recedingPenaltyDb;
    return 0;
  }

  function weatherPropagationDb(weather, bearingFromAircraftToObserver) {
    if (!weather) return 0;
    const weatherModel = noiseModel.weather;
    let delta = 0;

    const windDir = Number(weather.windDirectionDeg);
    const windSpeed = Number(weather.windSpeedMph);
    if (Number.isFinite(windDir) && Number.isFinite(windSpeed) && windSpeed > 2) {
      const windToBearing = normalizeHeading(windDir + 180);
      const alignment = Math.cos((bearingFromAircraftToObserver - windToBearing) * DEG);
      const factor = Math.min(1, windSpeed / 18);
      if (alignment > 0) {
        delta += alignment * factor * weatherModel.tailwindAssistDbMax;
      } else {
        delta += alignment * factor * weatherModel.headwindPenaltyDbMax;
      }
    }

    if (Number(weather.relativeHumidityPct) >= weatherModel.humidityHighThresholdPct) {
      delta -= weatherModel.humidityHighPenaltyDb;
    }

    if (weather.surfaceInversion === true) {
      delta += weatherModel.inversionAssistDb;
    }

    return delta;
  }

  function estimateGroundLevelDb(flight, observer, weather = null, model = noiseModel) {
    const horizontal = distanceMiles(observer.lat, observer.lon, flight.lat, flight.lon);
    const alt = Number(flight?.alt) || 0;
    const phase = classifyFlightPhase(flight);
    const categoryKey = resolveNoiseCategory(flight?.type);
    const category = noiseCategories[categoryKey] || noiseCategories.unknown;
    const sourceDb = category.sourceDbByPhase[phase] ?? category.sourceDbByPhase.cruise_overhead;
    const limits = passesBackyardLimits(horizontal, alt, model);

    const currentSlant = slantMiles(horizontal, alt);
    let outdoorDb = sourceDb;

    if (limits.ok) {
      outdoorDb -= horizontalAttenuationDb(horizontal, model);
      outdoorDb -= altitudeAttenuationDb(alt, model);
      outdoorDb -= distanceFadeDb(horizontal, model);
      outdoorDb += phaseAdjustDb(phase, model);
      outdoorDb += approachGeometryDb(flight, observer, model);

      const bearingToObserver = bearingDegrees(flight.lat, flight.lon, observer.lat, observer.lon);
      outdoorDb += weatherPropagationDb(weather, bearingToObserver);
    } else {
      outdoorDb -= 40;
    }

    outdoorDb = Math.max(
      model.attenuation.minEstimatedDb ?? 10,
      Math.min(model.attenuation.maxEstimatedDb ?? 88, outdoorDb)
    );
    const estimated = applyIndoorAdjustment(outdoorDb, model);

    const bearingToObserver = bearingDegrees(flight.lat, flight.lon, observer.lat, observer.lon);

    return {
      estimatedDb: Math.round(estimated * 10) / 10,
      outdoorDb: Math.round(outdoorDb * 10) / 10,
      horizontalMiles: Math.round(horizontal * 10) / 10,
      slantMiles: Math.round(currentSlant * 10) / 10,
      phase,
      categoryKey,
      categoryLabel: category.label,
      bearingToObserver: Math.round(bearingToObserver),
      limitReason: limits.ok ? null : limits.reason,
    };
  }

  function closingSpeedMph(flight, observer) {
    const gs = Number(flight?.gspeed);
    const track = Number(flight?.track);
    if (!Number.isFinite(gs) || !Number.isFinite(track)) return 0;

    const bearingToObserver = bearingDegrees(flight.lat, flight.lon, observer.lat, observer.lon);
    const angle = (track - bearingToObserver) * DEG;
    return gs * 1.15078 * Math.cos(angle);
  }

  function estimateSecondsUntilAudible(flight, observer, weather, model = noiseModel) {
    const current = estimateGroundLevelDb(flight, observer, weather, model);
    const audibleDb = model.thresholds.audibleDb;

    if (current.limitReason) {
      return { secondsUntilAudible: null, confidence: 'low', reason: current.limitReason };
    }

    if (current.estimatedDb >= audibleDb) {
      return { secondsUntilAudible: 0, confidence: 'high', reason: 'audible_now' };
    }

    const closing = closingSpeedMph(flight, observer);
    if (closing <= 5) {
      return { secondsUntilAudible: null, confidence: 'low', reason: 'not_closing' };
    }

    const horizontal = current.horizontalMiles;
    if (horizontal > model.timing.audibleHorizonMiles) {
      return { secondsUntilAudible: null, confidence: 'low', reason: 'too_far' };
    }

    const dbGap = audibleDb - current.estimatedDb;
    const dbPerMile = Math.max(3, (model.attenuation.extraDbPerMileBeyondFadeStart ?? 3.4) + 1.5);
    const milesUntilAudible = dbGap / dbPerMile;
    const seconds = Math.round((milesUntilAudible / closing) * 3600);

    if (seconds > model.timing.maxLeadSeconds) {
      return { secondsUntilAudible: null, confidence: 'low', reason: 'beyond_horizon' };
    }
    if (seconds < model.timing.minLeadSeconds) {
      return { secondsUntilAudible: model.timing.minLeadSeconds, confidence: 'medium', reason: 'imminent' };
    }

    return { secondsUntilAudible: seconds, confidence: 'medium', reason: 'closing' };
  }

  function predictAudibleFlights(flights, observer, weather = null) {
    const model = noiseModel;
    const predictions = [];

    for (const flight of flights || []) {
      if (!Number.isFinite(flight?.lat) || !Number.isFinite(flight?.lon)) continue;

      const acoustics = estimateGroundLevelDb(flight, observer, weather, model);
      if (acoustics.limitReason) continue;

      const timing = estimateSecondsUntilAudible(flight, observer, weather, model);
      const audibleNow = acoustics.estimatedDb >= model.thresholds.audibleDb;
      const soon =
        (audibleNow && acoustics.estimatedDb >= model.thresholds.soonDb)
        || (
          timing.secondsUntilAudible !== null
          && timing.secondsUntilAudible <= model.timing.maxLeadSeconds
          && acoustics.estimatedDb >= model.thresholds.soonDb - 2
          && timing.reason !== 'not_closing'
        );

      if (!soon) continue;

      predictions.push({
        flight,
        ...acoustics,
        ...timing,
        audibleNow,
        alertTier:
          acoustics.estimatedDb >= model.thresholds.loudDb
            ? 'loud'
            : acoustics.estimatedDb >= model.thresholds.attentionDb
              ? 'attention'
              : audibleNow
                ? 'audible'
                : 'soon',
      });
    }

    return predictions.sort((a, b) => {
      if (a.audibleNow !== b.audibleNow) return a.audibleNow ? -1 : 1;
      const aSec = a.secondsUntilAudible ?? 9999;
      const bSec = b.secondsUntilAudible ?? 9999;
      if (aSec !== bSec) return aSec - bSec;
      return b.estimatedDb - a.estimatedDb;
    });
  }

  return {
    bearingDegrees,
    resolveNoiseCategory,
    classifyFlightPhase,
    weatherPropagationDb,
    estimateGroundLevelDb,
    predictAudibleFlights,
  };
}
