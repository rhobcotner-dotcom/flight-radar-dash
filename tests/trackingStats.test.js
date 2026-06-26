import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTrackingStats } from '../api/lib/trackingStats.js';

test('fetchTrackingStats returns nationwide tracking counts', async () => {
  const stats = await fetchTrackingStats();

  assert.ok(stats.fetchedAt);
  assert.equal(typeof stats.flights, 'number');
  assert.equal(typeof stats.cameras, 'number');
  assert.equal(typeof stats.boats, 'number');
  assert.equal(typeof stats.trains, 'number');
  assert.ok(stats.flights >= 0);
  assert.ok(stats.cameras >= 0);
  assert.ok(stats.boats >= 0);
  assert.ok(stats.trains >= 0);
  assert.equal(typeof stats.sources.flights, 'string');
});
