import test from 'node:test';
import assert from 'node:assert/strict';
import {
  averageFrameStepSec,
  pickFrameBlend,
  virtualRadarTimeSec,
} from '../web/src/lib/radarSmoothing.ts';

const frames = [
  { time: 1000, path: '/a' },
  { time: 1600, path: '/b' },
  { time: 2200, path: '/c' },
];

test('averageFrameStepSec uses recent frame spacing', () => {
  assert.equal(averageFrameStepSec(frames), 600);
});

test('virtualRadarTimeSec advances with refresh progress', () => {
  const start = virtualRadarTimeSec(frames, 0);
  const end = virtualRadarTimeSec(frames, 1);
  assert.ok(end > start);
  assert.equal(start, 1000);
  assert.equal(end, 2200 + 600);
});

test('pickFrameBlend interpolates between bracketing frames', () => {
  const blend = pickFrameBlend(frames, 1300);
  assert.ok(blend);
  assert.equal(blend.from.path, '/a');
  assert.equal(blend.to.path, '/b');
  assert.ok(blend.t > 0 && blend.t < 1);
});
