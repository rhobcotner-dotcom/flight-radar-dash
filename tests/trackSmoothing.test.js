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

test('TrackSmoothingEngine blends toward the reported fix then dead-reckons', () => {
  const engine = new TrackSmoothingEngine();
  engine.register('a', 38.79, -90.6, { speedMph: 360, headingDeg: 90 }, 10_000, 'aircraft', 0);
  const midBlend = engine.getPosition('a', 225);
  const afterBlend = engine.getPosition('a', 2_000);
  assert.ok(midBlend);
  assert.ok(afterBlend);
  assert.ok(afterBlend.lon > -90.6);
});

test('beacon profile keeps freight/crossing markers pinned without dead reckoning', () => {
  const engine = new TrackSmoothingEngine();
  engine.register('freight', 41.8, -87.6, { speedMph: 360, headingDeg: 90 }, 10_000, 'beacon', 0);
  const mid = engine.getPosition('freight', 5_000);
  const end = engine.getPosition('freight', 10_000);
  assert.equal(mid?.lat, 41.8);
  assert.equal(mid?.lon, -87.6);
  assert.equal(end?.lat, 41.8);
  assert.equal(end?.lon, -87.6);
});

test('passenger-rail profile caps unrealistic APRS speeds', () => {
  const engine = new TrackSmoothingEngine();
  engine.register('amtrak', 41.8, -87.6, { speedMph: 360, headingDeg: 90 }, 10_000, 'passenger-rail', 0);
  const end = engine.getPosition('amtrak', 10_000);
  assert.ok(end);
  const miles = Math.abs(end.lat - 41.8) * 69;
  assert.ok(miles < 5, `expected capped rail motion, got ~${miles.toFixed(1)} mi`);
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

test('TrackSmoothingEngine continues from current visual position on refresh', () => {
  const engine = new TrackSmoothingEngine();
  engine.register('a', 38.79, -90.6, { speedMph: 360, headingDeg: 90 }, 10_000, 'aircraft', 0);
  const mid = engine.getPosition('a', 5_000);
  assert.ok(mid);

  engine.register('a', 38.795, -90.58, { speedMph: 360, headingDeg: 90 }, 10_000, 'aircraft', 5_000);
  const afterRefresh = engine.getPosition('a', 5_000);
  assert.ok(afterRefresh);
  const jumpMiles = Math.hypot((afterRefresh.lat - mid.lat) * 69, (afterRefresh.lon - mid.lon) * 69);
  assert.ok(jumpMiles < 0.5, `expected small visual correction, got ~${jumpMiles.toFixed(2)} mi`);
});

test('TrackSmoothingEngine keeps dead reckoning after segment duration', () => {
  const engine = new TrackSmoothingEngine();
  engine.register('a', 38.79, -90.6, { speedMph: 360, headingDeg: 90 }, 10_000, 'aircraft', 0);
  const atEnd = engine.getPosition('a', 10_000);
  const later = engine.getPosition('a', 20_000);
  assert.ok(atEnd);
  assert.ok(later);
  assert.ok(later.lat !== atEnd.lat || later.lon !== atEnd.lon);
});

test('TrackSmoothingEngine ignores duplicate refreshes with no movement', () => {
  const engine = new TrackSmoothingEngine();
  engine.register('a', 38.79, -90.6, { speedMph: 360, headingDeg: 90 }, 10_000, 'aircraft', 0);
  const beforeDuplicate = engine.getPosition('a', 2_000);
  engine.register('a', 38.79, -90.6, { speedMph: 360, headingDeg: 90 }, 10_000, 'aircraft', 2_100);
  const afterDuplicate = engine.getPosition('a', 2_200);
  assert.ok(beforeDuplicate);
  assert.ok(afterDuplicate);
  const jumpMiles = Math.hypot(
    (afterDuplicate.lat - beforeDuplicate.lat) * 69,
    (afterDuplicate.lon - beforeDuplicate.lon) * 69
  );
  assert.ok(jumpMiles < 0.05, `duplicate refresh should not snap, got ~${jumpMiles.toFixed(3)} mi`);
});
