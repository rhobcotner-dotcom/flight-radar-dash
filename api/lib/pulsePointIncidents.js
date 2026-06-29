import pulsePointConfig from '../../config/emergency-pulsepoint-agencies.json' with { type: 'json' };
import { enrichEmsIncident } from './emergencyEnrichment.js';
import { distanceMiles } from '../../lib/geo.js';
import { filterAgenciesByBbox, filterIncidentsToBbox } from '../../lib/usStateBounds.js';
import { recordFeedFetch, classifyFeedStatus } from './feedTelemetry.js';
import { decryptPulsePointPayload } from './pulsePointCrypto.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const API_BASE = 'https://api.pulsepoint.org/v1/webapp';
const CACHE_MS = 60 * 1000;
const GLOBAL_CACHE_MS = 90 * 1000;
const FETCH_CONCURRENCY = Number(process.env.PULSEPOINT_FETCH_CONCURRENCY || 12);
const MAX_AGENCIES = Number(process.env.PULSEPOINT_MAX_AGENCIES || 0) || Infinity;
const AUTO_DISABLE_AFTER = Number(process.env.PULSEPOINT_AUTO_DISABLE_ERRORS || 3);

/** @type {Map<string, { fetchedAt: number, payload: unknown }>} */
const viewportCache = new Map();
/** @type {{ fetchedAt: number, incidents: unknown[], feeds: unknown[] } | null} */
let globalCache = null;
/** @type {Promise<void> | null} */
let globalRefreshPromise = null;

/** @type {Map<string, { failures: number, disabledUntil?: number }>} */
const agencyHealth = new Map();

const MEDICAL_CALL_TYPES = new Set(['ME', 'CPR', 'OD', 'BE', 'BEh', 'BEH']);

function pulsePointDisabled() {
  const flag = String(process.env.PULSEPOINT_ENABLED || 'true').toLowerCase();
  return flag === 'false' || flag === '0';
}

function agencyLabel(agencyConfig) {
  return agencyConfig.agencyName || agencyConfig.agency || agencyConfig.city;
}

async function fetchEncryptedResource(params) {
  const url = `${API_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Referer: 'https://web.pulsepoint.org/',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`PulsePoint HTTP ${res.status}`);
  const body = await res.json();
  if (!body?.ct) throw new Error('PulsePoint response missing encrypted payload');
  return decryptPulsePointPayload(body);
}

function callTypeLabel(raw) {
  const code = String(raw || '').trim();
  if (!code) return 'Emergency response';
  if (MEDICAL_CALL_TYPES.has(code)) return 'Medical emergency';
  if (code === 'SF' || code === 'ST') return 'Structure fire';
  if (code === 'VEG') return 'Vegetation fire';
  if (code === 'ALARM') return 'Alarm';
  return code;
}

function responseCategory(raw) {
  return MEDICAL_CALL_TYPES.has(String(raw || '').trim()) ? 'medical' : 'fire';
}

const DISPATCH_STATUS_LABELS = {
  AR: 'On scene',
  OS: 'On scene',
  ER: 'En route',
  DP: 'Dispatched',
  TR: 'Transport',
  AQ: 'Available',
  CL: 'Cleared',
  UT: 'Unavailable',
};

function dispatchStatusLabel(code) {
  const key = String(code || '').trim().toUpperCase();
  return DISPATCH_STATUS_LABELS[key] || key || 'Responding';
}

function normalizeUnits(row) {
  if (!Array.isArray(row.Unit)) return [];
  return row.Unit.map((unit) => ({
    id: String(unit.UnitID || '').trim(),
    status: String(unit.PulsePointDispatchStatus || '').trim(),
    statusLabel: dispatchStatusLabel(unit.PulsePointDispatchStatus),
    clearedAt: unit.UnitClearedDateTime || null,
  })).filter((unit) => unit.id);
}

function pulsePointLocationNotes(row) {
  const notes = [];
  if (String(row.AddressTruncated) === '1') notes.push('Address truncated for privacy');
  if (String(row.PublicLocation) === '0') notes.push('Exact location not public');
  if (String(row.IsShareable) === '0') notes.push('Limited public share');
  return notes;
}

function pulsePointIncidentStatus(row, units) {
  if (row.ClosedDateTime) return 'Closed';
  if (units.some((unit) => ['AR', 'OS'].includes(String(unit.status || '').toUpperCase()))) {
    return 'Units on scene';
  }
  if (units.length) return 'Units responding';
  return 'Active';
}

function isAgencyTemporarilyDisabled(agencyId) {
  const health = agencyHealth.get(agencyId);
  if (!health?.disabledUntil) return false;
  if (Date.now() < health.disabledUntil) return true;
  agencyHealth.delete(agencyId);
  return false;
}

function recordAgencySuccess(agencyId) {
  agencyHealth.set(agencyId, { failures: 0 });
}

function recordAgencyFailure(agencyId, error) {
  const prev = agencyHealth.get(agencyId) || { failures: 0 };
  const failures = prev.failures + 1;
  if (failures >= AUTO_DISABLE_AFTER) {
    const disabledUntil = Date.now() + 30 * 60 * 1000;
    agencyHealth.set(agencyId, { failures, disabledUntil });
    console.warn(
      `[pulsepoint:${agencyId}] Auto-disabled for 30m after ${failures} consecutive errors: ${error}`
    );
  } else {
    agencyHealth.set(agencyId, { failures });
  }
}

function normalizeIncident(row, agencyConfig) {
  const lat = Number(row.Latitude);
  const lon = Number(row.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (String(row.PublicLocation) === '0' && !row.FullDisplayAddress) return null;

  const callType = String(row.PulsePointIncidentCallType || '').trim();
  const title = callTypeLabel(callType);
  const address = String(row.FullDisplayAddress || row.MedicalEmergencyDisplayAddress || '').trim();
  const category = responseCategory(callType);
  const label = agencyLabel(agencyConfig);
  const units = normalizeUnits(row);

  const incident = enrichEmsIncident({
    id: `pulsepoint:${row.AgencyID}:${row.ID}`,
    lat,
    lon,
    city: agencyConfig.city,
    agency: label,
    source: agencyConfig.id,
    sourceType: 'pulsepoint',
    timingClass: 'real-time',
    title,
    type: title,
    address,
    status: pulsePointIncidentStatus(row, units),
    observedAt: row.CallReceivedDateTime || null,
    closedAt: row.ClosedDateTime || null,
    incidentNumber: String(row.ID || '').trim() || null,
    units,
    locationNotes: pulsePointLocationNotes(row),
    entityKind: 'ems-incident',
    pulsePointCallType: callType,
    responseCategory: category,
    emergencyKind: category === 'medical' ? 'pulsepoint-medical' : 'pulsepoint-fire',
  });

  incident.emergencyKind = category === 'medical' ? 'pulsepoint-medical' : 'pulsepoint-fire';
  incident.agencyName = label;
  return incident;
}

async function fetchAgencyIncidents(agencyConfig) {
  if (isAgencyTemporarilyDisabled(agencyConfig.agencyId)) {
    return {
      feed: agencyConfig.id,
      city: agencyConfig.city,
      agency: agencyLabel(agencyConfig),
      enabled: false,
      gap: 'Temporarily auto-disabled after repeated errors',
      incidents: [],
      count: 0,
      pulsePointStatus: 'DISABLED',
    };
  }

  const params = new URLSearchParams({
    resource: 'incidents',
    agencyid: String(agencyConfig.agencyId),
  });

  try {
    const body = await fetchEncryptedResource(params);
    if (body.StatusCode && body.StatusCode !== '200') {
      recordAgencyFailure(agencyConfig.agencyId, body.StatusMessage || body.StatusCode);
      return {
        feed: agencyConfig.id,
        city: agencyConfig.city,
        agency: agencyLabel(agencyConfig),
        enabled: true,
        gap: body.StatusMessage || `PulsePoint status ${body.StatusCode}`,
        incidents: [],
        count: 0,
        pulsePointStatus: 'DEAD',
      };
    }

    recordAgencySuccess(agencyConfig.agencyId);
    const bundle = body.incidents || body;
    const rows = [...(bundle.active || []), ...(bundle.recent || [])];
    const incidents = rows.map((row) => normalizeIncident(row, agencyConfig)).filter(Boolean);
    const status = incidents.length > 0 ? 'LIVE' : 'EMPTY';

    return {
      feed: agencyConfig.id,
      city: agencyConfig.city,
      state: agencyConfig.state,
      agency: agencyLabel(agencyConfig),
      agencyId: agencyConfig.agencyId,
      enabled: true,
      timingClass: 'real-time',
      count: incidents.length,
      incidents,
      pulsePointStatus: status,
      lastProbeCount: rows.length,
    };
  } catch (err) {
    recordAgencyFailure(agencyConfig.agencyId, err.message);
    throw err;
  }
}

async function fetchAgenciesParallel(agencies) {
  const results = new Array(agencies.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < agencies.length) {
      const index = nextIndex;
      nextIndex += 1;
      const agency = agencies[index];
      try {
        results[index] = await fetchAgencyIncidents(agency);
      } catch (err) {
        results[index] = {
          feed: agency.id,
          city: agency.city,
          agency: agencyLabel(agency),
          agencyId: agency.agencyId,
          enabled: true,
          gap: err.message,
          incidents: [],
          count: 0,
          pulsePointStatus: 'DEAD',
        };
      }
    }
  }

  const workers = Math.min(FETCH_CONCURRENCY, agencies.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results.filter(Boolean);
}

function mergeGlobalCache(results) {
  const byId = new Map((globalCache?.incidents || []).map((incident) => [incident.id, incident]));
  for (const result of results) {
    for (const incident of result.incidents || []) {
      byId.set(incident.id, incident);
    }
  }
  const feedsById = new Map((globalCache?.feeds || []).map((feed) => [feed.feed, feed]));
  for (const result of results) {
    feedsById.set(result.feed, result);
  }
  globalCache = {
    fetchedAt: Date.now(),
    incidents: [...byId.values()],
    feeds: [...feedsById.values()],
  };
}

function recordFeedTelemetry(results) {
  for (const result of results) {
    const latestObserved = (result.incidents || []).reduce((max, row) => {
      const ms = Date.parse(String(row.observedAt || ''));
      return Number.isFinite(ms) && ms > max ? ms : max;
    }, 0);
    const dataAgeMs = latestObserved ? Date.now() - latestObserved : null;
    const ppStatus = result.pulsePointStatus || (result.gap ? 'DEAD' : result.count ? 'LIVE' : 'EMPTY');
    recordFeedFetch(result.feed, {
      group: 'pulsepoint',
      status: classifyFeedStatus({
        disabled: result.enabled === false,
        error: result.gap && ppStatus === 'DEAD' ? result.gap : null,
        entityCount: result.count || 0,
        dataAgeMs,
        staleAfterMs: 2 * 60 * 60 * 1000,
      }),
      entityCount: result.count || 0,
      dataAgeMs,
      latestObservedAt: latestObserved ? new Date(latestObserved).toISOString() : null,
      endpoint: `${API_BASE}?resource=incidents&agencyid=${result.agencyId || ''}`,
      warning:
        ppStatus === 'EMPTY'
          ? 'Valid agency, zero incidents in feed'
          : result.gap || (result.count === 0 ? 'Zero mappable incidents in viewport' : null),
      meta: { pulsePointStatus: ppStatus, agencyId: result.agencyId, city: result.city },
    });
  }
}

function buildPayloadFromResults(results, bbox, agencyCount) {
  const incidents = filterIncidentsToBbox(
    results.flatMap((result) => result.incidents || []),
    bbox
  ).map((incident) => ({
    ...incident,
    distanceMiles: bbox
      ? Math.round(
          distanceMiles((bbox.north + bbox.south) / 2, (bbox.west + bbox.east) / 2, incident.lat, incident.lon) *
            10
        ) / 10
      : null,
  }));

  return {
    source: 'PulsePoint Respond',
    timingClass: 'real-time',
    enabled: true,
    feeds: results,
    count: incidents.length,
    incidents,
    agencyCount,
  };
}

function bboxAgenciesPolledInGlobalCache(bbox, agencies) {
  if (!globalCache?.feeds?.length) return false;
  const scoped = filterAgenciesByBbox(agencies, bbox);
  if (!scoped.length) return true;
  const polled = new Set(globalCache.feeds.map((feed) => feed.feed));
  return scoped.every((agency) => polled.has(agency.id));
}

function buildPayloadFromGlobalCache(bbox) {
  const incidents = filterIncidentsToBbox(globalCache.incidents, bbox).map((incident) => ({
    ...incident,
    distanceMiles: bbox
      ? Math.round(
          distanceMiles((bbox.north + bbox.south) / 2, (bbox.west + bbox.east) / 2, incident.lat, incident.lon) *
            10
        ) / 10
      : null,
  }));

  return {
    source: 'PulsePoint Respond',
    timingClass: 'real-time',
    enabled: true,
    feeds: globalCache.feeds,
    count: incidents.length,
    incidents,
    agencyCount: globalCache.feeds.length,
    cached: true,
  };
}

async function refreshAgenciesForBbox(bbox, agencies) {
  const scoped = filterAgenciesByBbox(agencies, bbox);
  const capped =
    Number.isFinite(MAX_AGENCIES) && scoped.length > MAX_AGENCIES ? scoped.slice(0, MAX_AGENCIES) : scoped;
  const results = await fetchAgenciesParallel(capped);
  mergeGlobalCache(results);
  recordFeedTelemetry(results);
  return buildPayloadFromResults(results, bbox, capped.length);
}

function scheduleGlobalRefresh(bbox, agencies) {
  if (globalRefreshPromise) return;
  globalRefreshPromise = refreshAgenciesForBbox(bbox, agencies)
    .catch((err) => {
      console.warn('[pulsepoint] Background refresh failed:', err.message);
    })
    .finally(() => {
      globalRefreshPromise = null;
    });
}

export function configuredPulsePointFeeds() {
  return pulsePointConfig.agencies || [];
}

export function getPulsePointAgencyHealth() {
  return Object.fromEntries(agencyHealth.entries());
}

export function getPulsePointGlobalStats() {
  if (!globalCache) return null;
  return {
    fetchedAt: globalCache.fetchedAt,
    incidentCount: globalCache.incidents.length,
    agencyCount: globalCache.feeds.length,
  };
}

export function getPulsePointGlobalIncidents() {
  return globalCache?.incidents ? [...globalCache.incidents] : [];
}

export function kickPulsePointGlobalRefresh() {
  if (pulsePointDisabled()) return null;
  const agencies = (pulsePointConfig.agencies || []).filter((a) => a.enabled && a.agencyId);
  if (!agencies.length || globalRefreshPromise) return globalRefreshPromise;
  scheduleGlobalRefresh(null, agencies);
  return globalRefreshPromise;
}

/** Search PulsePoint agencies by name token (for discovery scripts). */
export async function searchPulsePointAgencies(token) {
  if (String(token || '').length < 2) return [];
  const params = new URLSearchParams({ resource: 'searchagencies', token: String(token) });
  const body = await fetchEncryptedResource(params);
  return body.searchagencies || [];
}

export async function fetchPulsePointIncidents(bbox) {
  if (pulsePointDisabled()) {
    return {
      source: 'PulsePoint Respond',
      timingClass: 'real-time',
      enabled: false,
      gap: 'Set PULSEPOINT_ENABLED=true to enable PulsePoint polling',
      feeds: [],
      count: 0,
      incidents: [],
    };
  }

  let agencies = (pulsePointConfig.agencies || []).filter((a) => a.enabled && a.agencyId);
  if (agencies.length === 0) {
    return {
      source: 'PulsePoint Respond',
      timingClass: 'real-time',
      enabled: false,
      gap: pulsePointConfig.gapNote,
      feeds: (pulsePointConfig.agencies || []).map((a) => ({
        feed: a.id,
        city: a.city,
        enabled: false,
        gap: a.gapNote || pulsePointConfig.gapNote,
        incidents: [],
      })),
      count: 0,
      incidents: [],
    };
  }

  const cacheKey = JSON.stringify(bbox || {});
  const cached = viewportCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached.payload;
  }

  const globalFresh = globalCache && Date.now() - globalCache.fetchedAt < GLOBAL_CACHE_MS;
  if (globalFresh) {
    const payload = buildPayloadFromGlobalCache(bbox);
    if (payload.count === 0 && !bboxAgenciesPolledInGlobalCache(bbox, agencies)) {
      const fresh = await refreshAgenciesForBbox(bbox, agencies);
      viewportCache.set(cacheKey, { fetchedAt: Date.now(), payload: fresh });
      return fresh;
    }
    viewportCache.set(cacheKey, { fetchedAt: Date.now(), payload });
    return payload;
  }

  if (globalCache && !globalRefreshPromise) {
    const stalePayload = buildPayloadFromGlobalCache(bbox);
    if (stalePayload.count === 0 && !bboxAgenciesPolledInGlobalCache(bbox, agencies)) {
      const fresh = await refreshAgenciesForBbox(bbox, agencies);
      viewportCache.set(cacheKey, { fetchedAt: Date.now(), payload: fresh });
      return fresh;
    }
    scheduleGlobalRefresh(bbox, agencies);
    viewportCache.set(cacheKey, { fetchedAt: Date.now(), payload: stalePayload });
    return stalePayload;
  }

  const payload = await refreshAgenciesForBbox(bbox, agencies);
  viewportCache.set(cacheKey, { fetchedAt: Date.now(), payload });
  return payload;
}
