import test from 'node:test';
import assert from 'node:assert/strict';
import {
  altitudeTrendForFlight,
  isHighAltitudeFlight,
  pruneAltitudeTrends,
} from '../web/src/lib/flightAltitudeTrend.ts';

test('altitudeTrendForFlight compares successive refreshes', () => {
  const id = 'test-flight-1';
  assert.equal(altitudeTrendForFlight(id, 10000), null);
  assert.equal(altitudeTrendForFlight(id, 10100), 'up');
  assert.equal(altitudeTrendForFlight(id, 10050), null);
  assert.equal(altitudeTrendForFlight(id, 9900), 'down');
});

test('altitudeTrendForFlight ignores small jitter', () => {
  const id = 'test-flight-2';
  altitudeTrendForFlight(id, 25000);
  assert.equal(altitudeTrendForFlight(id, 25040), null);
});

test('pruneAltitudeTrends drops stale tracks', () => {
  altitudeTrendForFlight('keep-me', 12000);
  altitudeTrendForFlight('drop-me', 12000);
  pruneAltitudeTrends(new Set(['keep-me']));
  assert.equal(altitudeTrendForFlight('keep-me', 12100), 'up');
  assert.equal(altitudeTrendForFlight('drop-me', 12000), null);
});

test('isHighAltitudeFlight uses 30,000 ft threshold', () => {
  assert.equal(isHighAltitudeFlight(29999), false);
  assert.equal(isHighAltitudeFlight(30001), true);
});
