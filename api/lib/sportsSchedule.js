const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 15 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

async function fetchCardinalsHome() {
  const { start, end } = todayRange();
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=138&startDate=${start}&endDate=${end}&hydrate=team,venue`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) return [];
  const body = await res.json();
  const games = [];
  for (const day of body?.dates || []) {
    for (const game of day.games || []) {
      if (game.teams?.home?.team?.id !== 138) continue;
      games.push({
        league: 'MLB',
        team: 'Cardinals',
        opponent: game.teams?.away?.team?.name || 'TBD',
        startTime: game.gameDate,
        venue: game.venue?.name || 'Busch Stadium',
        status: game.status?.detailedState || 'Scheduled',
        isHome: true,
      });
    }
  }
  return games;
}

async function fetchBluesHome() {
  const url = 'https://api-web.nhle.com/v1/club-schedule-season/STL/now';
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) return [];
  const body = await res.json();
  return (body?.games || [])
    .filter((game) => game.homeTeam?.abbrev === 'STL')
    .map((game) => ({
      league: 'NHL',
      team: 'Blues',
      opponent: game.awayTeam?.placeName?.default
        ? `${game.awayTeam.placeName.default} ${game.awayTeam.commonName?.default || ''}`.trim()
        : game.awayTeam?.abbrev || 'TBD',
      startTime: game.startTimeUTC || game.gameDate,
      venue: game.venue?.default || 'Enterprise Center',
      status: game.gameState || 'Scheduled',
      isHome: true,
    }));
}

export async function fetchSportsSchedule() {
  if (cache.data && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data;
  }

  const [cardinals, blues] = await Promise.all([fetchCardinalsHome(), fetchBluesHome()]);
  const now = Date.now();
  const upcoming = [...cardinals, ...blues]
    .filter((game) => game.startTime && new Date(game.startTime).getTime() >= now - 3 * 3600_000)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const tonight = upcoming.filter((game) => {
    const t = new Date(game.startTime).getTime();
    return t >= todayStart.getTime() && t < todayEnd.getTime();
  });

  const payload = {
    source: 'MLB Stats API + NHL API',
    fetchedAt: new Date().toISOString(),
    tonight,
    upcoming: upcoming.slice(0, 8),
    trafficNote:
      tonight.length > 0
        ? 'Home game tonight — expect I-64/I-44/Metro congestion near downtown.'
        : 'No Cardinals or Blues home game tonight.',
  };

  cache = { fetchedAt: Date.now(), data: payload };
  return payload;
}
