import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TrackSmoothingEngine,
  predictNextPosition,
  interpolateSegment,
} from '../web/src/lib/trackSmoothing.ts';

test('predictNextPosition uses speed and heading when history is sparse', () => {
  const samples = [{ lat: 38.79, lon: -90.6, time: 0 }];
  const next = predictNextPosition(
    samples,
    { speedMph: 360, headingDeg: 90 },
    10_000
  );
  assert.ok(next.lat > samples[0].lat - 0.001);
  assert.ok(next.lon > samples[0].lon);
});

test('TrackSmoothingEngine interpolates toward predicted endpoint', () => {
  const engine = new TrackSmoothingEngine();
  engine.register('a', 38.79, -90.6, { speedMph: 360, headingDeg: 90 }, 10_000, 0);
  const mid = engine.getPosition('a', 5_000);
  const end = engine.getPosition('a', 10_000);
  assert.ok(mid);
  assert.ok(end);
  assert.ok(mid.lat !== 38.79 || mid.lon !== -90.6);
  assert.ok(end.lat !== mid.lat || end.lon !== mid.lon);
});

test('interpolateSegment reaches endpoint at duration', () => {
  const segment = {
    fromLat: 38,
    fromLon: -90,
    toLat: 39,
    toLon: -89,
    startTime: 1_000,
    durationMs: 10_000,
  };
  const start = interpolateSegment(segment, 1_000);
  const mid = interpolateSegment(segment, 6_000);
  const done = interpolateSegment(segment, 11_000);
  assert.equal(start.progress, 0);
  assert.equal(mid.progress, 0.5);
  assert.equal(done.progress, 1);
  assert.equal(done.lat, 39);
});
