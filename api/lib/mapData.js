import { fetchViewportFlights, resolveFlightViewport } from './flightViewport.js';

const LAST_GOOD_MAX_MS = Number(process.env.FLIGHT_LAST_GOOD_MS || 5 * 60_000);
const lastGoodByViewport = new Map();

function viewportCacheKey(viewport) {
  return [
    viewport.west.toFixed(1),
    viewport.south.toFixed(1),
    viewport.east.toFixed(1),
    viewport.north.toFixed(1),
    String(Math.round(viewport.zoom ?? 10)),
  ].join(':');
}

export async function fetchAreaFlights(area, query = {}) {
  const viewport = resolveFlightViewport(query, area);
  const enrich = query.enrich !== '0' && query.enrich !== 'false';
  const cacheKey = viewportCacheKey(viewport);

  try {
    const payload = await fetchViewportFlights(viewport, area, { enrich });
    lastGoodByViewport.set(cacheKey, { ts: Date.now(), payload });
    return payload;
  } catch (err) {
    const cached = lastGoodByViewport.get(cacheKey);
    if (cached && Date.now() - cached.ts < LAST_GOOD_MAX_MS) {
      const message =
        err?.status === 429 || err?.status === 420
          ? 'ADSB.lol rate limited — showing last good aircraft data.'
          : err?.message || 'Flight feed temporarily unavailable — showing last good data.';
      return {
        ...cached.payload,
        dataWarning: message,
        stale: true,
      };
    }

    if (err?.status === 429 || err?.status === 420) {
      return {
        flights: [],
        homeFlights: [],
        viewport,
        dataSource: 'adsb.lol',
        dataWarning:
          'ADSB.lol is rate limiting requests. Aircraft will reload automatically in about a minute — or click Refresh.',
        inViewCount: 0,
        homeCount: 0,
        thinned: false,
        stale: true,
      };
    }

    throw err;
  }
}
