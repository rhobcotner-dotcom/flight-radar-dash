import { enrichWeatherConditions } from '../../lib/weatherCodes.js';
import { compassLabel, offsetLatLon } from '../../lib/geo.js';
import { fetchLightningStrikes } from './lightning.js';
import { fetchNwsAlerts } from './nwsAlerts.js';
import { fetchWeatherConditions } from './weather.js';
import { sampleRadarField } from './radarReflectivity.js';

function intensityFromDbz(dbz) {
  if (dbz >= 65) return { label: 'extreme hail-core signature', class: 'extreme', cloudType: 'supercell core / possible hail' };
  if (dbz >= 55) return { label: 'intense thunderstorm', class: 'intense', cloudType: 'cumulonimbus with heavy rain or hail' };
  if (dbz >= 45) return { label: 'strong thunderstorm', class: 'strong', cloudType: 'deep convection with heavy rain' };
  if (dbz >= 35) return { label: 'moderate storm', class: 'moderate', cloudType: 'robust shower or thunderstorm' };
  if (dbz >= 25) return { label: 'developing storm', class: 'developing', cloudType: 'convective shower building' };
  return { label: 'weak echo', class: 'weak', cloudType: 'stratiform or light convective rain' };
}

function structureFromProfile(peakDbz, clickDbz, diameterMiles) {
  if (peakDbz >= 55 && diameterMiles <= 12) {
    return 'Compact, high-reflectivity core — classic pulse or supercell structure with a focused updraft.';
  }
  if (peakDbz - clickDbz >= 8 && diameterMiles >= 10) {
    return 'Broader echo with a localized core — likely a multicell cluster or mesoscale convective element.';
  }
  if (diameterMiles >= 18) {
    return 'Wide stratiform/convective shield — organized rain area rather than an isolated cell.';
  }
  if (peakDbz >= 40) {
    return 'Organized convection with a well-defined precipitation core on radar.';
  }
  return 'Scattered convective echoes — individual shower or small cell on radar.';
}

function estimateMotion(weather, peakDbz) {
  const windMph = weather?.windSpeedMph ?? null;
  const windDir = weather?.windDirectionDeg ?? null;
  if (windMph == null || windDir == null) {
    return {
      directionDeg: null,
      directionLabel: null,
      speedMph: null,
      method: 'unknown',
      narrative: 'Storm motion is uncertain without a reliable surface wind observation nearby.',
    };
  }

  const directionLabel = compassLabel(windDir);
  const speedMph = Math.round(windMph);
  const steeringFactor = peakDbz >= 45 ? 0.85 : 0.7;
  const stormSpeed = Math.max(8, Math.round(speedMph * steeringFactor));

  return {
    directionDeg: Math.round(windDir),
    directionLabel,
    speedMph: stormSpeed,
    method: 'low-level steering flow',
    narrative: `Using the ambient low-level wind field as a steering layer, this echo is likely propagating toward the ${directionLabel} at roughly ${stormSpeed} mph. Individual cells often deviate slightly from mean wind, especially near outflow boundaries.`,
  };
}

function forecastTrack(lat, lon, directionDeg, speedMph) {
  if (directionDeg == null || speedMph == null) return null;
  const radians = (directionDeg * Math.PI) / 180;
  const miles1h = speedMph;
  const deltaLat = (miles1h * Math.cos(radians)) / 69;
  const deltaLon = (miles1h * Math.sin(radians)) / (69 * Math.cos((lat * Math.PI) / 180) || 1);
  const point1h = offsetLatLon(lat, lon, deltaLat, deltaLon);
  return {
    oneHour: point1h,
    summary: `If motion holds, the core could shift roughly ${miles1h} mi ${compassLabel(directionDeg).toLowerCase()} over the next hour.`,
  };
}

function hazardNotes(alerts, lightningCount, peakDbz) {
  const notes = [];
  if (alerts.length) {
    notes.push(
      `Active NWS headline: ${alerts[0].headline}. Treat warnings as ground truth over radar interpretation alone.`
    );
  }
  if (lightningCount >= 8) {
    notes.push(`Frequent cloud-to-ground lightning nearby (${lightningCount} strikes in the last ~30 minutes) — a sign of active electrification.`);
  } else if (lightningCount > 0) {
    notes.push(`Isolated lightning detected within range (${lightningCount} recent strikes).`);
  }
  if (peakDbz >= 55) {
    notes.push('Reflectivity this high supports hail or destructive wind gusts in the strongest core — stay weather-aware.');
  } else if (peakDbz >= 45) {
    notes.push('Heavy rain rates and localized gusty winds are likely under this echo top.');
  }
  if (!notes.length) {
    notes.push('No immediate warning products or dense lightning plumes detected at this location, but convection can strengthen quickly.');
  }
  return notes;
}

function buildSections({ radar, intensity, motion, track, weather, alerts, lightningCount }) {
  return [
    {
      title: 'Radar snapshot',
      body: `Peak reflectivity near your click is about ${radar.peakDbz} dBZ (${intensity.label}). At the exact point: ~${radar.clickDbz} dBZ on ${radar.source.toUpperCase()} composite.`,
    },
    {
      title: 'Size & structure',
      body: `${structureFromProfile(radar.peakDbz, radar.clickDbz, radar.approxDiameterMiles)} Estimated radar footprint: ~${radar.approxDiameterMiles} mi across the core echo.`,
    },
    {
      title: 'Cloud & precipitation type',
      body: `Meteorologically this reads as ${intensity.cloudType}. ${weather?.conditionLabel ? `Surface observation nearby: ${weather.conditionLabel}.` : ''} Temperature ${weather?.temperatureF != null ? `${Math.round(weather.temperatureF)}°F` : 'unknown'}${weather?.dewpointF != null ? ` with dew point ${Math.round(weather.dewpointF)}°F` : ''}.`,
    },
    {
      title: 'Motion & heading',
      body: motion.narrative,
    },
    {
      title: 'Where it is headed',
      body: track?.summary || 'Insufficient wind data to project a confident track.',
    },
    {
      title: 'Hazards & situational awareness',
      body: hazardNotes(alerts, lightningCount, radar.peakDbz).join(' '),
    },
  ];
}

export async function analyzeStormCell(lat, lon) {
  const radar = await sampleRadarField(lat, lon);
  if (!radar.hasStorm) {
    return { hasStorm: false, lat, lon };
  }

  const [weatherRaw, alertsPayload, lightningPayload] = await Promise.all([
    fetchWeatherConditions(lat, lon).catch(() => null),
    fetchNwsAlerts(lat, lon).catch(() => ({ alerts: [] })),
    fetchLightningStrikes(lat, lon, 35).catch(() => ({ count: 0, strikes: [] })),
  ]);
  const weather = weatherRaw ? enrichWeatherConditions(weatherRaw) : null;

  const intensity = intensityFromDbz(radar.peakDbz);
  const motion = estimateMotion(weather, radar.peakDbz);
  const track = forecastTrack(lat, lon, motion.directionDeg, motion.speedMph);
  const alerts = alertsPayload?.alerts || [];
  const lightningCount = lightningPayload?.count || 0;

  const summary = `${intensity.label.charAt(0).toUpperCase()}${intensity.label.slice(1)} ~${radar.approxDiameterMiles} mi wide${motion.directionLabel ? `, drifting ${motion.directionLabel}` : ''}. Peak ${radar.peakDbz} dBZ.`;

  return {
    hasStorm: true,
    lat,
    lon,
    summary,
    radar: {
      clickDbz: radar.clickDbz,
      peakDbz: radar.peakDbz,
      approxDiameterMiles: radar.approxDiameterMiles,
      intensityClass: intensity.class,
      intensityLabel: intensity.label,
      cloudType: intensity.cloudType,
      source: radar.source,
    },
    motion: {
      directionDeg: motion.directionDeg,
      directionLabel: motion.directionLabel,
      speedMph: motion.speedMph,
      method: motion.method,
    },
    track,
    environment: {
      temperatureF: weather?.temperatureF ?? null,
      dewpointF: weather?.dewpointF ?? null,
      windSpeedMph: weather?.windSpeedMph ?? null,
      windDirectionDeg: weather?.windDirectionDeg ?? null,
      conditionLabel: weather?.conditionLabel ?? null,
    },
    hazards: {
      lightningCount,
      alerts: alerts.slice(0, 3).map((alert) => ({
        event: alert.event,
        headline: alert.headline,
        severity: alert.severity,
        expires: alert.expires,
      })),
    },
    sections: buildSections({
      radar,
      intensity,
      motion,
      track,
      weather,
      alerts,
      lightningCount,
    }),
    disclaimer:
      'Interpretation uses base reflectivity, surface winds, and nearby observations — not dual-pol velocity or a human forecaster on duty. Use NWS warnings for life-safety decisions.',
  };
}
