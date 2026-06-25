import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchRailCameras } from '../api/lib/railCameras.js';

const STL = { lat: 38.785, lon: -90.583 };

test('rail-cameras catalog has a large verified set', () => {
  const bundled = JSON.parse(readFileSync(new URL('../config/rail-cameras.json', import.meta.url)));
  assert.ok(bundled.cameraCount >= 200, `expected 200+ cameras, got ${bundled.cameraCount}`);
  assert.ok(bundled.cameras.length >= 200);
  assert.ok(Array.isArray(bundled.sources) && bundled.sources.length >= 10);
});

test('fetchRailCameras includes STL area cams within 125mi of home', () => {
  const payload = fetchRailCameras({
    west: -90.9,
    south: 38.6,
    east: -90.2,
    north: 38.9,
    limit: 128,
    centerLat: STL.lat,
    centerLon: STL.lon,
    radiusMiles: 125,
  });
  assert.ok(payload.count >= 5);
  assert.ok(payload.cameras.some((cam) => /St Louis|La Plata|Pacific/i.test(cam.description)));
  assert.ok(payload.cameras.every((cam) => cam.liveUrl.includes('youtube-nocookie.com/embed/')));
});

test('fetchRailCameras uses radius not just tight viewport bbox', () => {
  const payload = fetchRailCameras({
    west: -90.87,
    south: 38.64,
    east: -90.29,
    north: 38.93,
    limit: 128,
    centerLat: STL.lat,
    centerLon: STL.lon,
    radiusMiles: 125,
  });
  assert.ok(payload.cameras.some((cam) => cam.state === 'MO' || cam.state === 'IL'));
});

test('fetchRailCameras empty far from any camera without center', () => {
  const payload = fetchRailCameras({
    west: -120,
    south: 45,
    east: -119,
    north: 46,
    limit: 10,
  });
  assert.equal(payload.count, 0);
});
