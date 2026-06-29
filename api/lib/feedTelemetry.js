/**
 * In-process feed telemetry for silent-failure detection.
 * Records last fetch outcome, entity counts, and data age per feed id.
 */

/** @typedef {'LIVE' | 'STALE' | 'DEGRADED' | 'OFFLINE' | 'EMPTY' | 'SKIPPED' | 'DISABLED'} FeedStatusClass */

const state = new Map();

/**
 * @param {string} feedId
 * @param {{
 *   group?: string,
 *   status?: FeedStatusClass,
 *   entityCount?: number | null,
 *   dataAgeMs?: number | null,
 *   latencyMs?: number | null,
 *   error?: string | null,
 *   warning?: string | null,
 *   latestObservedAt?: string | null,
 *   endpoint?: string | null,
 * }} result
 */
export function recordFeedFetch(feedId, result = {}) {
  if (!feedId) return;
  const prev = state.get(feedId) || {};
  const status = result.status || prev.status || 'OFFLINE';
  const entityCount = result.entityCount ?? prev.entityCount ?? null;
  const warning = result.warning || null;

  if (status === 'EMPTY' || entityCount === 0) {
    logFeedWarning(feedId, warning || 'Feed returned zero entities after filtering');
  } else if (status === 'STALE') {
    logFeedWarning(feedId, warning || 'Data age exceeds expected freshness');
  } else if (result.error) {
    logFeedWarning(feedId, result.error);
  } else if (warning) {
    logFeedWarning(feedId, warning);
  }

  const entry = {
    feedId,
    group: result.group || prev.group || 'unknown',
    status,
    entityCount,
    dataAgeMs: result.dataAgeMs ?? prev.dataAgeMs ?? null,
    latencyMs: result.latencyMs ?? prev.latencyMs ?? null,
    error: result.error || null,
    warning: warning || prev.warning || null,
    latestObservedAt: result.latestObservedAt || prev.latestObservedAt || null,
    endpoint: result.endpoint || prev.endpoint || null,
    lastFetchAt: new Date().toISOString(),
    lastSuccessAt:
      status === 'LIVE' || status === 'EMPTY' || status === 'STALE' || status === 'DEGRADED'
        ? new Date().toISOString()
        : prev.lastSuccessAt || null,
  };

  state.set(feedId, entry);
  return entry;
}

export function logFeedWarning(feedId, message) {
  if (!message) return;
  console.warn(`[feed:${feedId}] ${message}`);
}

export function getFeedTelemetry(feedId) {
  return state.get(feedId) || null;
}

export function getAllFeedTelemetry() {
  return Object.fromEntries(state.entries());
}

export function clearFeedTelemetry() {
  state.clear();
}

/**
 * Classify feed health from counts and age.
 * @param {{
 *   entityCount?: number | null,
 *   dataAgeMs?: number | null,
 *   staleAfterMs?: number | null,
 *   error?: string | null,
 *   skipped?: boolean,
 *   disabled?: boolean,
 * }} info
 * @returns {FeedStatusClass}
 */
export function classifyFeedStatus(info) {
  if (info.disabled) return 'DISABLED';
  if (info.skipped) return 'SKIPPED';
  if (info.error) return 'OFFLINE';
  if (info.entityCount === 0 || info.entityCount == null) {
    if (info.error) return 'OFFLINE';
    return 'EMPTY';
  }
  if (info.staleAfterMs != null && info.dataAgeMs != null && info.dataAgeMs > info.staleAfterMs) {
    return 'STALE';
  }
  if (info.degraded) return 'DEGRADED';
  return 'LIVE';
}
