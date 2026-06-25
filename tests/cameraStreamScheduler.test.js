import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCameraStreamTier,
  isPointInBounds,
  compareStreamRequests,
} from '../web/src/lib/cameraStreamScheduler.ts';

const bounds = {
  west: -91,
  south: 38.5,
  east: -90.5,
  north: 39,
  zoom: 11,
};

test('classifyCameraStreamTier marks center point as inView', () => {
  assert.equal(classifyCameraStreamTier(38.75, -90.75, bounds), 'inView');
});

test('classifyCameraStreamTier marks padded edge as nearby', () => {
  assert.equal(classifyCameraStreamTier(39.1, -90.75, bounds), 'nearby');
});

test('classifyCameraStreamTier marks far points as distant', () => {
  assert.equal(classifyCameraStreamTier(30, -120, bounds), 'distant');
});

test('isPointInBounds respects viewport edges', () => {
  assert.equal(isPointInBounds(38.75, -90.75, bounds), true);
  assert.equal(isPointInBounds(38.49, -90.75, bounds), false);
});

test('compareStreamRequests prefers in-view popup over nearby tooltip', () => {
  const popup = compareStreamRequests(
    { tier: 'inView', distance: 1, reason: 'popup' },
    { tier: 'nearby', distance: 0.1, reason: 'tooltip' }
  );
  assert.ok(popup < 0);
});
