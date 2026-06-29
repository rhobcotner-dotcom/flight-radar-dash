import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFeedStatus,
  recordFeedFetch,
  getFeedTelemetry,
  clearFeedTelemetry,
} from '../api/lib/feedTelemetry.js';
import { capAlertLevel } from '../api/lib/emergencyEnrichment.js';
import { fetchFeedHealthReport } from '../api/lib/feedHealth.js';

test('classifyFeedStatus marks stale and empty feeds', () => {
  assert.equal(classifyFeedStatus({ entityCount: 0 }), 'EMPTY');
  assert.equal(classifyFeedStatus({ entityCount: 5, dataAgeMs: 999999, staleAfterMs: 1000 }), 'STALE');
  assert.equal(classifyFeedStatus({ entityCount: 5 }), 'LIVE');
  assert.equal(classifyFeedStatus({ skipped: true }), 'SKIPPED');
});

test('recordFeedFetch stores telemetry snapshot', () => {
  clearFeedTelemetry();
  recordFeedFetch('test-feed', { group: 'platform', status: 'LIVE', entityCount: 12 });
  const row = getFeedTelemetry('test-feed');
  assert.equal(row.entityCount, 12);
  assert.equal(row.status, 'LIVE');
  clearFeedTelemetry();
});

test('capAlertLevel uses severity urgency certainty matrix', () => {
  const high = capAlertLevel({ severity: 'Extreme', urgency: 'Immediate', certainty: 'Observed', event: 'Tornado Warning' });
  const amber = capAlertLevel({ severity: 'Severe', urgency: 'Immediate', certainty: 'Observed', event: 'AMBER Alert' });
  assert.ok(high >= 90);
  assert.ok(amber >= 95);
});

test('fetchFeedHealthReport returns grouped feed status without probe', async () => {
  const report = await fetchFeedHealthReport({ probe: false, group: 'emergency' });
  assert.ok(report.groups.emergency);
  assert.ok(Array.isArray(report.groups.emergency.feeds));
  assert.ok(report.summary.total > 0);
});
