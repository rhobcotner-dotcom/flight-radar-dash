import feedRegistry from '../../config/feed-registry.json' with { type: 'json' };
import emergencyCityFeeds from '../../config/emergency-city-feeds.json' with { type: 'json' };
import { fetchWithTimeout, mapWithConcurrency } from './fetchWithTimeout.js';
import { getAllFeedTelemetry, classifyFeedStatus, recordFeedFetch } from './feedTelemetry.js';
import { allOccupancyFeeds } from './gtfsOccupancyScanner.js';
import { configuredCityFeeds } from './cityEmsFeeds.js';
import { configuredArcgisFeeds } from './arcgisEmsFeeds.js';
import { configuredPulsePointFeeds, fetchPulsePointIncidents } from './pulsePointIncidents.js';
import { fetchEmergencyServices } from './emergencyServices.js';
import { fetchOccupancyOverlay } from './gtfsOccupancyScanner.js';
import { getCameraPoolStatus } from './usTrafficCameras.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const PROBE_TIMEOUT_MS = 8000;

function registryFeeds() {
  return Array.isArray(feedRegistry.feeds) ? feedRegistry.feeds : [];
}

function statusFromClass(statusClass) {
  return statusClass;
}

async function probeHttpFeed(feed) {
  if (feed.enabled === false) {
    return {
      status: 'DISABLED',
      gap: feed.gapNote || 'Disabled in config',
      entityCount: 0,
    };
  }

  if (feed.authEnv && !process.env[feed.authEnv]) {
    return {
      status: 'SKIPPED',
      gap: `Missing ${feed.authEnv}`,
      entityCount: 0,
    };
  }

  if (!feed.probeUrl && !feed.url) {
    return { status: 'OFFLINE', error: 'No probe URL configured', entityCount: 0 };
  }

  const url = feed.probeUrl || feed.url;
  const started = Date.now();
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: feed.probeMethod || 'GET',
        headers: {
          Accept: feed.accept || '*/*',
          'User-Agent': USER_AGENT,
          ...(feed.authHeader && process.env[feed.authEnv]
            ? { [feed.authHeader]: process.env[feed.authEnv] }
            : {}),
        },
      },
      PROBE_TIMEOUT_MS
    );
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { status: 'OFFLINE', error: `HTTP ${res.status}`, latencyMs, entityCount: 0 };
    }
    return { status: 'LIVE', latencyMs, entityCount: null, note: 'Reachable (HEAD/GET only)' };
  } catch (err) {
    return {
      status: 'OFFLINE',
      error: err instanceof Error ? err.message : 'Probe failed',
      latencyMs: Date.now() - started,
      entityCount: 0,
    };
  }
}

function mergeTelemetry(feed) {
  const telemetry = getAllFeedTelemetry()[feed.id];
  if (!telemetry) return {};
  return {
    lastFetchAt: telemetry.lastFetchAt,
    lastSuccessAt: telemetry.lastSuccessAt,
    entityCount: telemetry.entityCount,
    dataAgeMs: telemetry.dataAgeMs,
    latestObservedAt: telemetry.latestObservedAt,
    warning: telemetry.warning,
    error: telemetry.error,
    status: telemetry.status,
    latencyMs: telemetry.latencyMs,
  };
}

function buildFeedEntry(feed, probeResult = {}) {
  const telemetry = mergeTelemetry(feed);
  const entityCount = probeResult.entityCount ?? telemetry.entityCount ?? null;
  const dataAgeMs = probeResult.dataAgeMs ?? telemetry.dataAgeMs ?? null;
  const status = classifyFeedStatus({
    disabled: feed.enabled === false,
    skipped: probeResult.status === 'SKIPPED',
    error: probeResult.error || telemetry.error,
    entityCount,
    dataAgeMs,
    staleAfterMs: feed.staleAfterMs || null,
    degraded: probeResult.degraded,
  });

  return {
    id: feed.id,
    name: feed.name,
    group: feed.group,
    status: probeResult.status === 'DISABLED' ? 'DISABLED' : statusFromClass(status),
    timingClass: feed.timingClass || null,
    endpoint: feed.endpoint || feed.url || feed.probeUrl || null,
    authEnv: feed.authEnv || null,
    enabled: feed.enabled !== false,
    entityCount,
    dataAgeMs,
    latestObservedAt: telemetry.latestObservedAt || probeResult.latestObservedAt || null,
    latencyMs: probeResult.latencyMs ?? telemetry.latencyMs ?? null,
    lastFetchAt: telemetry.lastFetchAt || null,
    lastSuccessAt: telemetry.lastSuccessAt || null,
    gap: feed.gapNote || probeResult.gap || null,
    warning: telemetry.warning || probeResult.warning || null,
    error: probeResult.error || telemetry.error || null,
    occupancyClass: feed.occupancyClass || null,
  };
}

async function probeRegistryFeeds(feeds, probe) {
  if (!probe) {
    return feeds.map((feed) => buildFeedEntry(feed));
  }
  return mapWithConcurrency(feeds, 6, async (feed) => {
    const result = await probeHttpFeed(feed);
    return buildFeedEntry(feed, result);
  });
}

async function buildEmergencyGroup(probe) {
  const bbox = { west: -125, south: 24, east: -66, north: 50 };
  let live = null;
  if (probe) {
    try {
      live = await fetchEmergencyServices({ west: bbox.west, south: bbox.south, east: bbox.east, north: bbox.north });
    } catch (err) {
      live = { error: err.message, gaps: [] };
    }
  }

  const cityFeedsList = [...configuredCityFeeds(), ...configuredArcgisFeeds()].map((feed) => {
    const liveFeed = live?.cityEms?.feeds?.find((f) => f.feed === feed.id);
    const count = liveFeed?.count ?? null;
    const latest = liveFeed?.incidents?.[0]?.observedAt || null;
    const dataAgeMs = latest ? Date.now() - Date.parse(String(latest)) : null;
    return buildFeedEntry(
      {
        id: feed.id,
        name: `${feed.city} ${feed.agency}`,
        group: 'emergency',
        timingClass: feed.timingClass,
        enabled: feed.enabled !== false,
        gapNote: feed.gapNote,
        staleAfterMs: (feed.hoursBack || 6) * 60 * 60 * 1000,
        endpoint: feed.url,
      },
      live
        ? {
            entityCount: count,
            dataAgeMs,
            latestObservedAt: latest,
            gap: liveFeed?.gap,
            status: feed.enabled === false ? 'DISABLED' : count === 0 ? 'EMPTY' : dataAgeMs > (feed.hoursBack || 6) * 3600000 ? 'STALE' : 'LIVE',
          }
        : {}
    );
  });

  let pulsePointLive = null;
  if (probe) {
    try {
      pulsePointLive = await fetchPulsePointIncidents(bbox);
    } catch (err) {
      pulsePointLive = { error: err.message, feeds: [] };
    }
  }

  const pulsePointFeedsList = configuredPulsePointFeeds().map((feed) => {
    const liveFeed = pulsePointLive?.feeds?.find((f) => f.feed === feed.id);
    const count = liveFeed?.count ?? null;
    const ppStatus = liveFeed?.pulsePointStatus || (feed.enabled === false ? 'DISABLED' : null);
    const latest = liveFeed?.incidents?.[0]?.observedAt || null;
    const dataAgeMs = latest ? Date.now() - Date.parse(String(latest)) : null;
    return buildFeedEntry(
      {
        id: feed.id,
        name: `${feed.city} ${feed.agencyName || feed.agency || 'PulsePoint'}`,
        group: 'pulsepoint',
        timingClass: 'real-time',
        enabled: feed.enabled !== false,
        gapNote: feed.gapNote,
        staleAfterMs: 2 * 60 * 60 * 1000,
        endpoint: `https://api.pulsepoint.org/v1/webapp?resource=incidents&agencyid=${feed.agencyId || ''}`,
      },
      probe
        ? {
            entityCount: count,
            dataAgeMs,
            latestObservedAt: latest,
            gap: liveFeed?.gap || feed.gapNote,
            error: pulsePointLive?.error,
            status:
              feed.enabled === false
                ? 'DISABLED'
                : ppStatus === 'DEAD'
                  ? 'OFFLINE'
                  : ppStatus === 'EMPTY'
                    ? 'EMPTY'
                    : ppStatus === 'LIVE'
                      ? 'LIVE'
                      : count === 0
                        ? 'EMPTY'
                        : 'LIVE',
          }
        : {}
    );
  });

  const emergencySources = [
    { id: 'nifc-wfigs', name: 'NIFC WFIGS', key: 'nifc' },
    { id: 'fema-open', name: 'FEMA OpenFEMA', key: 'fema' },
    { id: 'nws-cap-emergency', name: 'NWS CAP (emergency overlay)', key: 'nws' },
    { id: 'ipaws-cap', name: 'IPAWS All-Hazards', key: 'ipaws' },
  ].map(({ id, name, key }) => {
    const summary = live?.summary || {};
    const gap = live?.gaps?.find((g) => g.source === id || g.source?.includes(key));
    const countMap = {
      'nifc-wfigs': summary.wildfirePerimeters,
      'fema-open': summary.femaCounties,
      'nws-cap-emergency': summary.nwsAlerts,
      'ipaws-cap': summary.ipawsAlerts,
    };
    return buildFeedEntry(
      {
        id,
        name,
        group: 'emergency',
        timingClass: id === 'fema-open' ? 'static' : 'real-time',
        enabled: true,
        endpoint: feedRegistry.feeds.find((f) => f.id === id)?.endpoint || null,
      },
      live
        ? {
            entityCount: countMap[id] ?? 0,
            error: gap?.error,
            gap: gap?.gap,
            status: gap?.error ? 'OFFLINE' : countMap[id] === 0 && id === 'ipaws-cap' ? 'EMPTY' : 'LIVE',
          }
        : {}
    );
  });

  return [...emergencySources, ...cityFeedsList, ...pulsePointFeedsList];
}

async function buildTransitGroup(probe) {
  let overlay = null;
  if (probe) {
    try {
      overlay = await fetchOccupancyOverlay();
    } catch {
      overlay = null;
    }
  }

  const feeds = allOccupancyFeeds().map((feed) => {
    const scan = overlay?.feedScans?.[feed.id];
    const entityCount = scan?.occupancyRows ?? overlay?.sourceCounts?.[feed.id] ?? null;
    const skipped = typeof scan?.skipped === 'string' ? scan.skipped : null;
    return buildFeedEntry(
      {
        id: feed.id,
        name: feed.name || feed.agency,
        group: 'transit',
        timingClass: 'real-time',
        enabled: feed.enabled !== false,
        authEnv: feed.authEnv,
        endpoint: feed.url,
        occupancyClass: feed.occupancyClass || scan?.classification,
        staleAfterMs: 120000,
      },
      overlay
        ? {
            entityCount: typeof entityCount === 'number' ? entityCount : null,
            error: scan?.error || (skipped && !skipped.startsWith('missing') ? skipped : null),
            gap: skipped?.startsWith('missing') ? skipped : null,
            status: skipped ? 'SKIPPED' : scan?.classification === 'error' ? 'OFFLINE' : scan?.classification === 'real' ? 'LIVE' : scan?.classification === 'gap' ? 'DEGRADED' : 'EMPTY',
          }
        : {}
    );
  });

  return feeds;
}

async function buildPlatformGroup(probe) {
  const platformFeeds = registryFeeds().filter((f) => f.group === 'platform');
  return probeRegistryFeeds(platformFeeds, probe);
}

function summarizeFeeds(feeds) {
  const summary = { total: feeds.length, LIVE: 0, STALE: 0, DEGRADED: 0, OFFLINE: 0, EMPTY: 0, SKIPPED: 0, DISABLED: 0 };
  for (const feed of feeds) {
    summary[feed.status] = (summary[feed.status] || 0) + 1;
  }
  summary.healthy = summary.LIVE + summary.EMPTY;
  summary.unhealthy = summary.OFFLINE + summary.STALE + summary.DEGRADED;
  return summary;
}

/**
 * @param {{ group?: string, probe?: boolean }} [options]
 */
export async function fetchFeedHealthReport(options = {}) {
  const probe = options.probe === true || options.probe === '1';
  const group = String(options.group || 'all').toLowerCase();

  const groups = {};
  if (group === 'all' || group === 'emergency') {
    groups.emergency = { feeds: await buildEmergencyGroup(probe) };
    groups.emergency.summary = summarizeFeeds(groups.emergency.feeds);
    groups.emergency.ok = groups.emergency.summary.OFFLINE === 0;
  }
  if (group === 'all' || group === 'pulsepoint') {
    const bbox = { west: -125, south: 24, east: -66, north: 50 };
    let pulsePointLive = null;
    if (probe) {
      try {
        pulsePointLive = await fetchPulsePointIncidents(bbox);
      } catch (err) {
        pulsePointLive = { error: err.message, feeds: [] };
      }
    }
    const pulsePointFeedsList = configuredPulsePointFeeds().map((feed) => {
      const liveFeed = pulsePointLive?.feeds?.find((f) => f.feed === feed.id);
      const count = liveFeed?.count ?? null;
      const ppStatus = liveFeed?.pulsePointStatus;
      const latest = liveFeed?.incidents?.[0]?.observedAt || null;
      const dataAgeMs = latest ? Date.now() - Date.parse(String(latest)) : null;
      return buildFeedEntry(
        {
          id: feed.id,
          name: `${feed.city} ${feed.agencyName || feed.agency || 'PulsePoint'}`,
          group: 'pulsepoint',
          timingClass: 'real-time',
          enabled: feed.enabled !== false,
          gapNote: feed.gapNote,
          endpoint: `https://api.pulsepoint.org/v1/webapp?resource=incidents&agencyid=${feed.agencyId || ''}`,
        },
        probe
          ? {
              entityCount: count,
              dataAgeMs,
              latestObservedAt: latest,
              gap: liveFeed?.gap,
              status:
                feed.enabled === false
                  ? 'DISABLED'
                  : ppStatus === 'DEAD'
                    ? 'OFFLINE'
                    : ppStatus === 'EMPTY' || count === 0
                      ? 'EMPTY'
                      : 'LIVE',
            }
          : {}
      );
    });
    groups.pulsepoint = { feeds: pulsePointFeedsList };
    groups.pulsepoint.summary = summarizeFeeds(pulsePointFeedsList);
    groups.pulsepoint.ok = pulsePointFeedsList.some((f) => f.status === 'LIVE' || f.status === 'EMPTY');
  }
  if (group === 'all' || group === 'transit') {
    groups.transit = { feeds: await buildTransitGroup(probe) };
    groups.transit.summary = summarizeFeeds(groups.transit.feeds);
    groups.transit.ok = groups.transit.summary.LIVE > 0;
  }
  if (group === 'all' || group === 'platform') {
    groups.platform = { feeds: await buildPlatformGroup(probe) };
    groups.platform.summary = summarizeFeeds(groups.platform.feeds);
    const cameraStatus = getCameraPoolStatus?.() || null;
    groups.platform.cameraPool = cameraStatus;
    groups.platform.ok = groups.platform.summary.OFFLINE < groups.platform.summary.total;
  }

  const allFeeds = Object.values(groups).flatMap((g) => g.feeds || []);
  const gaps = allFeeds
    .filter((f) => f.gap || f.error || f.status === 'STALE' || f.status === 'OFFLINE')
    .map((f) => ({ source: f.id, status: f.status, gap: f.gap, error: f.error, warning: f.warning }));

  return {
    ok: allFeeds.some((f) => f.status === 'LIVE') && allFeeds.filter((f) => f.status === 'OFFLINE').length < allFeeds.length,
    fetchedAt: new Date().toISOString(),
    probe,
    summary: summarizeFeeds(allFeeds),
    groups,
    gaps,
    telemetry: getAllFeedTelemetry(),
  };
}

export { registryFeeds };
