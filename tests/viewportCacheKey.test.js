import test from 'node:test';
import assert from 'node:assert/strict';
import { stableViewportCacheKey, zoomTier } from '../lib/viewportCacheKey.js';

test('zoomTier buckets map zoom levels', () => {
  assert.equal(zoomTier(3), 4);
  assert.equal(zoomTier(10), 10);
  assert.equal(zoomTier(11), 12);
});

test('stableViewportCacheKey uses 0.01 degree precision and zoom tier', () => {
  const key = stableViewportCacheKey({
    west: -88.234,
    south: 41.567,
    east: -87.412,
    north: 42.198,
    zoom: 10,
  });
  assert.equal(key, '-88.23:41.57:-87.41:42.20:10');
});

test('stableViewportCacheKey ignores small zoom changes within a tier', () => {
  const a = stableViewportCacheKey({ west: -90, south: 38, east: -89, north: 39, zoom: 9 });
  const b = stableViewportCacheKey({ west: -90, south: 38, east: -89, north: 39, zoom: 10 });
  assert.equal(a, b);
});
