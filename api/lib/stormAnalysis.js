import { enrichWeatherConditions } from '../../lib/weatherCodes.js';
import { compassLabel, offsetLatLon } from '../../lib/geo.js';
import { fetchLightningStrikes } from './lightning.js';
import { fetchNwsAlerts } from './nwsAlerts.js';
import { fetchWeatherConditions } from './weather.js';
import { sampleRadarField } from './radarReflectivity.js';
import { fetchCamerasNearPoint } from './usTrafficCameras.js';

function intensityFromDbz(dbz) {
  if (dbz >= 65) return { label: 'extreme hail-core signature', class: 'extreme', cloudType: 'supercell core / possible hail' };
  if (dbz >= 55) return { label: 'intense thunderstorm', class: 'intense', cloudType: 'cumulonimbus with heavy rain or hail' };
  if (dbz >= 45) return { label: 'strong thunderstorm', class: 'strong', cloudType: 'deep convection with heavy rain' };
  if (dbz >= 35) return { label: 'moderate storm', class: 'moderate', cloudType: 'robust shower or thunderstorm' };
  if (dbz >= 25) return { label: 'developing storm', class: 'developing', cloudType: 'convective shower building' };
  return { label: 'weak echo', class: 'weak', cloudType: 'stratiform or light convective rain' };
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

function buildBrief({ radar, intensity, motion, track }) {
  const motionBit =
    motion.directionLabel && motion.speedMph
      ? ` Moving ${motion.directionLabel} ~${motion.speedMph} mph`
      : '';
  const trackBit = track?.summary ? ` ${track.summary.replace(/^If motion holds, /i, '')}` : '';
  return `${intensity.label} roughly ${radar.approxDiameterMiles} mi across with peak ${radar.peakDbz} dBZ (${radar.clickDbz} dBZ at your click).${motionBit}.${trackBit}`.replace(/\.\./g, '.');
}

function buildHazardLine(alerts, lightningCount, peakDbz) {
  const bits = [];
  if (alerts.length > 1) bits.push(`${alerts.length} active NWS alerts nearby`);
  if (lightningCount >= 4) bits.push(`${lightningCount} recent lightning strikes`);
  else if (lightningCount > 0) bits.push('Isolated lightning nearby');
  if (peakDbz >= 55) bits.push('Hail or destructive wind possible in core');
  else if (peakDbz >= 45) bits.push('Heavy rain and gusty winds likely');
  if (!bits.length) return 'No warnings or dense lightning at this pin — convection can strengthen quickly.';
  return bits.join(' · ');
}

const STORM_CAMERA_RADIUS_MILES = 22;

async function camerasInStormCell(lat, lon, { liveOnly = true } = {}) {
  return fetchCamerasNearPoint(lat, lon, STORM_CAMERA_RADIUS_MILES, 3, { liveOnly });
}

export async function analyzeStormCell(lat, lon, { liveOnly = true } = {}) {
  const radar = await sampleRadarField(lat, lon);
  if (!radar.hasStorm) {
    return { hasStorm: false, lat, lon };
  }

  const [weatherRaw, alertsPayload, lightningPayload, cameras] = await Promise.all([
    fetchWeatherConditions(lat, lon).catch(() => null),
    fetchNwsAlerts(lat, lon).catch(() => ({ alerts: [] })),
    fetchLightningStrikes(lat, lon, 35).catch(() => ({ count: 0, strikes: [] })),
    camerasInStormCell(lat, lon).catch(() => []),
  ]);
  const weather = weatherRaw ? enrichWeatherConditions(weatherRaw) : null;

  const intensity = intensityFromDbz(radar.peakDbz);
  const motion = estimateMotion(weather, radar.peakDbz);
  const track = forecastTrack(lat, lon, motion.directionDeg, motion.speedMph);
  const alerts = alertsPayload?.alerts || [];
  const lightningCount = lightningPayload?.count || 0;
  const cellRadiusMiles = Math.max(3, (radar.approxDiameterMiles / 2) * 1.15);

  const summary = `${intensity.label.charAt(0).toUpperCase()}${intensity.label.slice(1)} ~${radar.approxDiameterMiles} mi wide${motion.directionLabel ? `, ${motion.directionLabel}` : ''}. Peak ${radar.peakDbz} dBZ.`;

  return {
    hasStorm: true,
    lat,
    lon,
    summary,
    brief: buildBrief({ radar, intensity, motion, track }),
    hazardLine: buildHazardLine(alerts, lightningCount, radar.peakDbz),
    cellRadiusMiles,
    cameras,
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
    disclaimer: 'Radar reflectivity + nearby obs — not a NWS forecast. Heed official warnings.',
  };
}
