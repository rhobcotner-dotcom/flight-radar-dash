import funConfig from '../../../../config/fun-config.json';

export { funConfig };

const ARCH = { lat: 38.627, lon: -90.184, name: 'Gateway Arch' };

export interface MoonInfo {
  phase: number;
  label: string;
  isFullMoon: boolean;
  illuminationPct: number;
}

export function moonPhase(date = new Date()): MoonInfo {
  const synodic = 29.53058867;
  const ref = Date.UTC(2000, 0, 6, 18, 14, 0);
  const age = ((date.getTime() - ref) / 86400000) % synodic;
  const phase = age / synodic;
  const illuminationPct = Math.round((1 - Math.cos(phase * 2 * Math.PI)) / 2 * 100);
  let label = 'Waxing weird';
  if (phase < 0.03 || phase > 0.97) label = 'New moon';
  else if (phase < 0.22) label = 'Waxing crescent';
  else if (phase < 0.28) label = 'First quarter';
  else if (phase < 0.47) label = 'Waxing gibbous';
  else if (phase < 0.53) label = 'Full moon';
  else if (phase < 0.72) label = 'Waning gibbous';
  else if (phase < 0.78) label = 'Last quarter';
  else label = 'Waning crescent';
  const isFullMoon = phase >= 0.47 && phase <= 0.53;
  return { phase, label, isFullMoon, illuminationPct };
}

export function archShadowCountdown(lat: number, lon: number, date = new Date()) {
  const distMi = haversineMiles(lat, lon, ARCH.lat, ARCH.lon);
  const minutes = Math.max(3, Math.round((distMi * 7 + date.getHours() * 13) % 240));
  return {
    minutes,
    message: `The Arch shadow theoretically grazes your cul-de-sac in ~${minutes} min (${distMi.toFixed(0)} mi to ${ARCH.name}).`,
  };
}

export function tRavioliIndex(
  tempF: number | null | undefined,
  humidity: number | null | undefined,
  conditionLabel: string | null | undefined,
  date = new Date()
) {
  const warm = (tempF ?? 50) >= 68;
  const humid = (humidity ?? 50) >= 55;
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const clearish = !String(conditionLabel || '').toLowerCase().includes('rain');
  let score = 20;
  if (warm) score += 25;
  if (humid) score += 10;
  if (weekend) score += 20;
  if (clearish) score += 15;
  score = Math.min(100, score);
  let verdict = 'Frozen pizza energy.';
  if (score >= 85) verdict = 'Peak toasted ravioli weather. Someone is grilling.';
  else if (score >= 65) verdict = 'Solid STL patio vibes.';
  else if (score >= 45) verdict = 'Acceptable for Provel on a cracker.';
  return { score, verdict };
}

export function activeMeteorShower(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  for (const shower of funConfig.meteorShowers) {
    const start = shower.startMonth * 100 + shower.startDay;
    const end = shower.endMonth * 100 + shower.endDay;
    const now = month * 100 + day;
    if (now >= start && now <= end) {
      return {
        active: true,
        name: shower.name,
        radiantRa: shower.radiantRa,
        radiantDec: shower.radiantDec,
        message: `${shower.name} active — look up, idiot (peak hours after midnight).`,
      };
    }
  }
  return { active: false, name: null, message: 'No major meteor shower peak tonight.' };
}

export function disasterMovieScore(input: {
  weatherAlertCount: number;
  tornadoCount: number;
  lightningCount: number;
  earthquakeCount: number;
}) {
  let score = 0;
  if (input.tornadoCount > 0) score += 40;
  if (input.weatherAlertCount >= 2) score += 25;
  if (input.lightningCount >= 15) score += 20;
  if (input.earthquakeCount > 0) score += 10;
  return score;
}

export function mississippiMonsterVisible(
  lat: number,
  lon: number,
  weather: { relativeHumidityPct?: number | null; weatherCode?: number | null; conditionLabel?: string | null } | null,
  date = new Date()
) {
  const hour = date.getHours();
  const night = hour >= 22 || hour <= 4;
  const humid = (weather?.relativeHumidityPct ?? 0) >= 82;
  const foggy = [45, 48, 49].includes(Number(weather?.weatherCode)) ||
    String(weather?.conditionLabel || '').toLowerCase().includes('fog');
  if (!night || (!humid && !foggy)) return null;
  return {
    lat: lat - 0.42,
    lon: lon + 0.18,
    label: 'Unidentified surface contact',
  };
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function kpMoodClass(kp: number | null | undefined) {
  if (kp == null) return 'kp-unknown';
  if (kp >= 7) return 'kp-storm';
  if (kp >= 5) return 'kp-active';
  if (kp >= 4) return 'kp-restless';
  return 'kp-calm';
}
