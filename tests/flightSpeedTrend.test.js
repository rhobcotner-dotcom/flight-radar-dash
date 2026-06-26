import test from 'node:test';
import assert from 'node:assert/strict';
import {
  speedTrendForFlight,
  pruneSpeedTrends,
} from '../web/src/lib/flightSpeedTrend.ts';

test('speedTrendForFlight compares successive refreshes', () => {
  const id = 'test-speed-1';
  assert.equal(speedTrendForFlight(id, 280), null);
  assert.equal(speedTrendForFlight(id, 295), 'accel');
  assert.equal(speedTrendForFlight(id, 292), null);
  assert.equal(speedTrendForFlight(id, 275), 'decel');
});

test('speedTrendForFlight ignores taxi speeds and ground aircraft', () => {
  const id = 'test-speed-2';
  assert.equal(speedTrendForFlight(id, 30, false), null);
  speedTrendForFlight(id, 40);
  assert.equal(speedTrendForFlight(id, 55, false), null);
});

test('speedTrendForFlight ignores small jitter', () => {
  const id = 'test-speed-3';
  speedTrendForFlight(id, 420);
  assert.equal(speedTrendForFlight(id, 423), null);
});

test('pruneSpeedTrends drops stale tracks', () => {
  speedTrendForFlight('keep-speed', 300);
  speedTrendForFlight('drop-speed', 300);
  pruneSpeedTrends(new Set(['keep-speed']));
  assert.equal(speedTrendForFlight('keep-speed', 315), 'accel');
  assert.equal(speedTrendForFlight('drop-speed', 300), null);
});
