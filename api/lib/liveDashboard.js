import { fetchMisoGrid } from '../lib/misoGrid.js';
import { fetchSportsSchedule } from '../lib/sportsSchedule.js';
import { fetchFaaNasStatus } from '../lib/faaNasStatus.js';
import { fetchFunStatus } from '../lib/funDashboard.js';
import { fetchUsDrought } from '../lib/usDrought.js';

function goldenHour(lat, lon, date = new Date()) {
  // Approximate civil twilight windows — not a full solar calc library
  const month = date.getMonth();
  const summer = month >= 4 && month <= 8;
  const sunriseHour = summer ? 5.8 : 6.8;
  const sunsetHour = summer ? 20.2 : 17.4;
  const hour = date.getHours() + date.getMinutes() / 60;
  let phase = 'Daytime';
  if (hour < sunriseHour) phase = 'Pre-dawn';
  else if (hour < sunriseHour + 1) phase = 'Golden hour (sunrise)';
  else if (hour > sunsetHour - 1 && hour < sunsetHour) phase = 'Golden hour (sunset)';
  else if (hour >= sunsetHour) phase = 'Night';

  return {
    phase,
    sunriseApprox: `${Math.floor(sunriseHour)}:${String(Math.round((sunriseHour % 1) * 60)).padStart(2, '0')} local`,
    sunsetApprox: `${Math.floor(sunsetHour)}:${String(Math.round((sunsetHour % 1) * 60)).padStart(2, '0')} local`,
    milkyWayNote: hour >= sunsetHour + 1.5 || hour < sunriseHour - 1 ? 'Dark enough for Milky Way if skies are clear.' : 'Too bright for Milky Way core.',
  };
}

function auroraLine(kp) {
  if (kp == null) return 'Kp unknown — aurora unlikely at STL latitude.';
  if (kp >= 7) return `Kp ${kp} — rare chance of aurora on northern horizon. Look north after midnight.`;
  if (kp >= 5) return `Kp ${kp} — faint aurora possible up north; STL usually too far south.`;
  return `Kp ${kp} — aurora not expected in Missouri.`;
}

export async function fetchLiveDashboard(lat, lon) {
  const [miso, sports, nas, fun, drought] = await Promise.all([
    fetchMisoGrid().catch(() => null),
    fetchSportsSchedule().catch(() => null),
    fetchFaaNasStatus().catch(() => null),
    fetchFunStatus().catch(() => null),
    fetchUsDrought(lat, lon, 50).catch(() => null),
  ]);

  const kp = fun?.spaceWeather?.kp ?? null;

  return {
    fetchedAt: new Date().toISOString(),
    miso,
    sports,
    nas,
    aurora: { kp, message: auroraLine(kp) },
    goldenHour: goldenHour(lat, lon),
    drought: drought
      ? { homeLabel: drought.homeLabel, homeLevel: drought.homeLevel }
      : { homeLabel: 'Unknown', homeLevel: null },
    outages: {
      enabled: false,
      message:
        'Ameren granular outage map has no public API — check outagemap.ameren.com during storms.',
    },
    pulsepoint: {
      enabled: false,
      message:
        'PulsePoint encrypted feed is unofficial — enable when a stable STL agency source exists.',
    },
    pollen: {
      enabled: false,
      message:
        'US pollen APIs are limited — watch NWS Air Quality alerts and spring/fall migration toasts instead.',
    },
  };
}
