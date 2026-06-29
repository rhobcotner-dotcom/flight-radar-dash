import { extractVehiclePositions, fetchGtfsRtPayload } from './gtfsRtClient.js';
import { enrichVehicleRow } from './gtfsTransitDetails.js';
import { occupancyLevelFromLabel } from './occupancyEnrichment.js';
import {
  feedUrlWithAuth,
  parseTransitFeedList,
  parseTransitOccupancyFeedList,
} from './transitAgencies.js';
import { filterInSearchRegion, attachViewportToArea } from './viewportQuery.js';
import { resolveArea } from './area.js';
import { recordFeedFetch, classifyFeedStatus } from './feedTelemetry.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 45 * 1000;
const FETCH_TIMEOUT_MS = 12000;

let cache = { key: '', fetchedAt: 0, payload: null };

export function allOccupancyFeeds() {
  const rail = parseTransitFeedList();
  const transit = parseTransitOccupancyFeedList();
  const seen = new Set();
  return [...rail, ...transit].filter((feed) => {
    if (seen.has(feed.id)) return false;
    seen.add(feed.id);
    return feed.enabled !== false;
  });
}

async function fetchFeedPositions(feed) {
  const auth = feedUrlWithAuth(feed);
  if (auth.skipped) {
    return { feed, skipped: auth.skipped, points: [], scan: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let message;
    if (feed.format === 'gtfs-json') {
      const res = await fetch(auth.url, {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...auth.headers },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      message = await res.json();
    } else {
      const payload = await fetchGtfsRtPayload(auth.url, { headers: auth.headers });
      message = payload.message;
    }

    const positions = extractVehiclePositions(message);
    let occProtobuf = 0;
    let pctProtobuf = 0;
    for (const entity of message?.entity || []) {
      const v = entity?.vehicle;
      if (v && Object.hasOwnProperty.call(v, 'occupancyStatus')) occProtobuf += 1;
      if (v && Object.hasOwnProperty.call(v, 'occupancyPercentage')) pctProtobuf += 1;
    }

    const points = positions
      .map((row) => {
        const details = enrichVehicleRow(row, {});
        if (!details.occupancyLabel) return null;
        return {
          id: `${feed.id}:${row.vehicleId || row.tripId || `${row.lat}:${row.lon}`}`,
          lat: row.lat,
          lon: row.lon,
          agency: feed.agency || feed.name,
          feedId: feed.id,
          routeId: row.routeId || null,
          label: details.occupancyLabel,
          level: occupancyLevelFromLabel(details.occupancyLabel),
          source: 'gtfs-rt',
          kind: 'passenger',
          real: true,
        };
      })
      .filter(Boolean);

    return {
      feed,
      skipped: null,
      points,
      scan: {
        vehicles: positions.length,
        occupancyRows: points.length,
        occProtobuf,
        pctProtobuf,
        classification:
          points.length > 0 || occProtobuf > 0 || pctProtobuf > 0
            ? 'real'
            : positions.length > 0
              ? 'gap'
              : 'empty',
      },
    };
  } catch (err) {
    return { feed, skipped: err.message, points: [], scan: { classification: 'error', error: err.message } };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scan all configured GTFS-RT feeds for vehicle occupancy and return overlay points in viewport.
 * @param {Record<string, unknown>} [query] Express query — lat/lon/radius or west/south/east/north viewport
 */
export async function fetchOccupancyOverlay(query = null) {
  const feeds = allOccupancyFeeds();
  const cacheKey = feeds.map((f) => f.id).join(',');
  const area = query ? attachViewportToArea(resolveArea(query), query) : null;
  const radiusMiles = area?.queryRadiusMiles || area?.radiusMiles || 900;

  if (cache.payload && cache.key === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    const points = area
      ? filterInSearchRegion(cache.payload.points, area, radiusMiles)
      : cache.payload.points;
    return { ...cache.payload, points, filtered: Boolean(area) };
  }

  const results = await Promise.all(feeds.map((feed) => fetchFeedPositions(feed)));
  const feedScans = {};
  const sourceCounts = {};
  const points = [];

  for (const result of results) {
    feedScans[result.feed.id] = {
      name: result.feed.name,
      skipped: result.skipped,
      occupancyClass: result.feed.occupancyClass || result.scan?.classification || null,
      ...result.scan,
    };
    const entityCount = result.points?.length ?? 0;
    const status = classifyFeedStatus({
      skipped: Boolean(result.skipped),
      error: result.scan?.error || (typeof result.skipped === 'string' && !result.skipped.startsWith('missing') ? result.skipped : null),
      entityCount: result.skipped ? null : entityCount,
      degraded: result.scan?.classification === 'gap',
    });
    recordFeedFetch(result.feed.id, {
      group: 'transit',
      status,
      entityCount,
      endpoint: result.feed.url,
      warning:
        result.scan?.classification === 'gap'
          ? 'Feed reachable but occupancy not on wire'
          : entityCount === 0 && !result.skipped
            ? 'Zero occupancy rows after scan'
            : null,
    });
    if (result.skipped) {
      sourceCounts[result.feed.id] = result.skipped;
      continue;
    }
    sourceCounts[result.feed.id] = result.points.length;
    points.push(...result.points);
  }

  const payload = {
    fetchedAt: new Date().toISOString(),
    feedCount: feeds.length,
    pointCount: points.length,
    realCount: points.filter((p) => p.real).length,
    feedScans,
    sourceCounts,
    points,
  };

  cache = { key: cacheKey, fetchedAt: Date.now(), payload };
  const filteredPoints = area ? filterInSearchRegion(payload.points, area, radiusMiles) : payload.points;
  return { ...payload, points: filteredPoints, filtered: Boolean(area) };
}
