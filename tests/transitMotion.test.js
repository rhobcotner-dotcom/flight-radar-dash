import assert from 'node:assert/strict';
import test from 'node:test';
import { bearingDegrees } from '../lib/geo.js';
import { enrichTransitMotion, resetTransitMotionHistoryForTests } from '../api/lib/transitMotion.js';

test('enrichTransitMotion ignores zero GTFS speed', () => {
  resetTransitMotionHistoryForTests();
  const first = enrichTransitMotion('test', '1', 38.64, -90.2, 0, 0);
  assert.equal(first.speedMph, null);
  assert.equal(first.heading, 0);
});

test('enrichTransitMotion infers speed from successive positions', () => {
  resetTransitMotionHistoryForTests();
  const t0 = Date.now();
  enrichTransitMotion('test', '2', 38.64, -90.2, 0, 0, t0);
  const movedLat = 38.64 + 0.00015;
  const movedLon = -90.2 + 0.00008;
  const second = enrichTransitMotion('test', '2', movedLat, movedLon, 0, 0, t0 + 5000);
  assert.ok(second.speedMph != null && second.speedMph > 0, `expected inferred speed, got ${second.speedMph}`);
  assert.ok(second.heading != null && second.heading > 0, `expected inferred heading, got ${second.heading}`);
  const expectedHeading = Math.round(bearingDegrees(38.64, -90.2, movedLat, movedLon));
  assert.equal(second.heading, expectedHeading);
});

test.after(() => {
  resetTransitMotionHistoryForTests();
});
