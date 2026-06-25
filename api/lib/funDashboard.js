import funConfig from '../../config/fun-config.json' with { type: 'json' };

const SWPC_KP = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 5 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

function dayOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
}

function birdMigrationIndex(date = new Date()) {
  const doy = dayOfYear(date);
  const springPeak = 110;
  const fallPeak = 285;
  const spring = Math.max(0, 1 - Math.abs(doy - springPeak) / 45);
  const fall = Math.max(0, 1 - Math.abs(doy - fallPeak) / 45);
  const intensity = Math.round(Math.max(spring, fall) * 100);
  let message = 'Birds are chill. Ducks are not incoming.';
  if (intensity >= 75) message = 'DUCKS INCOMING (probably). Migration density spike!';
  else if (intensity >= 45) message = 'Moderate migration — look up after sunset.';
  else if (intensity >= 20) message = 'Light migration — a few honkers may pass.';
  return { intensity, message, season: fall > spring ? 'fall' : 'spring' };
}

function cardinalsFlyoverGuess(date = new Date()) {
  const month = date.getMonth();
  const day = date.getDay();
  const hour = date.getHours();
  const inSeason = funConfig.cardinalsHomeMonths.includes(month);
  const weekend = day === 0 || day === 6;
  const gameDayLikely = inSeason && weekend;
  let probability = 0.08;
  let message = 'Off-season or weekday — flyover unlikely.';
  if (gameDayLikely) {
    probability = hour >= 16 && hour <= 21 ? 0.42 : 0.22;
    message =
      hour >= 16 && hour <= 21
        ? 'Game day evening — watch for heritage flight / B-2 buzz (pure vibes).'
        : 'Weekend home-game window — mil traffic slightly elevated.';
  }
  return { gameDayLikely, probability, message };
}

async function fetchKpIndex() {
  const res = await fetch(SWPC_KP, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Space weather unavailable (${res.status})`);
  const rows = await res.json();
  if (!Array.isArray(rows) || rows.length < 1) return { kp: null, mood: 'unknown' };
  const last = rows[rows.length - 1];
  const kp = Number(last?.Kp ?? last?.[1]);
  let mood = 'calm';
  if (kp >= 7) mood = 'geomagnetic rage';
  else if (kp >= 5) mood = 'GPS having feelings';
  else if (kp >= 4) mood = 'restless';
  return { kp: Number.isFinite(kp) ? kp : null, mood, observedAt: last?.time_tag || last?.[0] || null };
}

export async function fetchFunStatus() {
  if (cache.data && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  let spaceWeather = { kp: null, mood: 'unknown', observedAt: null };
  try {
    spaceWeather = await fetchKpIndex();
  } catch {
    /* optional feed */
  }

  const now = new Date();
  const payload = {
    fetchedAt: now.toISOString(),
    spaceWeather,
    birdMigration: birdMigrationIndex(now),
    cardinals: cardinalsFlyoverGuess(now),
    config: {
      celebrityCount: funConfig.celebrityAircraft.length,
      rouletteCount: funConfig.rouletteCallsigns.length,
    },
  };

  cache = { fetchedAt: Date.now(), data: payload };
  return payload;
}
