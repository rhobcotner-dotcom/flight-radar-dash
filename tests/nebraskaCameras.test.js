import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDirectCameras, mapNebraska511Camera } from '../api/lib/cameraSources/directSources.js';

test('mapNebraska511Camera maps STILL_IMAGE snapshot URLs', () => {
  const cameras = mapNebraska511Camera({
    id: 1,
    public: true,
    name: 'Scale E of Lincoln',
    location: { latitude: 40.928, longitude: -96.449, fips: 31 },
    views: [
      {
        name: 'Various Views',
        type: 'STILL_IMAGE',
        url: 'https://dot511.nebraska.gov/images/vid-001080416-00.jpg',
      },
    ],
  });

  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].id, 'ne511-1');
  assert.equal(cameras[0].mediaType, 'snapshot');
  assert.equal(cameras[0].state, 'NE');
  assert.match(cameras[0].liveUrl, /dot511\.nebraska\.gov\/images\//);
});

test('mapNebraska511Camera expands multi-view sites', () => {
  const cameras = mapNebraska511Camera({
    id: 42,
    public: true,
    name: 'I-80 at Omaha',
    location: { latitude: 41.25, longitude: -96.05, fips: 31 },
    views: [
      { name: 'West', type: 'STILL_IMAGE', url: 'https://dot511.nebraska.gov/images/vid-a.jpg' },
      { name: 'East', type: 'STILL_IMAGE', url: 'https://dot511.nebraska.gov/images/vid-b.jpg' },
    ],
  });

  assert.equal(cameras.length, 2);
  assert.equal(cameras[0].id, 'ne511-42-view-1');
  assert.equal(cameras[1].id, 'ne511-42-view-2');
});

test('fetchDirectCameras loads Nebraska 511 CARS pool statewide', async () => {
  const nebraska = { west: -104.1, south: 40.0, east: -95.3, north: 43.0 };
  const direct = await fetchDirectCameras(nebraska);
  const neCams = direct.cameras.filter((cam) => cam.state === 'NE');
  assert.ok(direct.sourceCounts['nebraska-511'] >= 900, `expected nebraska-511 pool, got ${direct.sourceCounts['nebraska-511']}`);
  assert.ok(neCams.length >= 900, `expected dense Nebraska coverage, got ${neCams.length}`);
  assert.ok(neCams.every((cam) => cam.mediaType === 'snapshot'));
});
