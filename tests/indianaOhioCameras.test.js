import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDirectCameras } from '../api/lib/cameraSources/directSources.js';
import { dedupeCameras } from '../api/lib/cameraSources/helpers.js';
import {
  fetchUsTrafficCameras,
  warmNationwideCameraPool,
  getCameraPoolStatus,
} from '../api/lib/usTrafficCameras.js';

test('fetchDirectCameras loads Indiana 511 CARS pool by coordinates', async () => {
  const indiana = { west: -88.1, south: 37.8, east: -84.8, north: 41.8 };
  const direct = await fetchDirectCameras(indiana);
  const inCams = direct.cameras.filter((cam) => cam.state === 'IN');
  assert.ok(direct.sourceCounts['indiana-511'] >= 700, `expected indiana-511 pool, got ${direct.sourceCounts['indiana-511']}`);
  assert.ok(inCams.length >= 700, `expected dense Indiana coverage, got ${inCams.length}`);
  assert.ok(inCams.every((cam) => cam.mediaType === 'snapshot'));
});

test('fetchDirectCameras expands Ohio OHGO to all directional views', async () => {
  const ohio = { west: -84.8, south: 38.4, east: -80.5, north: 42.0 };
  const direct = await fetchDirectCameras(ohio);
  const ohCams = direct.cameras.filter((cam) => cam.state === 'OH');
  assert.ok(direct.sourceCounts.ohgo >= 1100, `expected full OHGO pool, got ${direct.sourceCounts.ohgo}`);
  assert.ok(ohCams.length >= 1100, `expected statewide OH inventory, got ${ohCams.length}`);
});

test('dedupeCameras preserves distinct OHGO view ids at same site', () => {
  const cams = dedupeCameras([
    {
      id: 'ohgo-123-view-2',
      lat: 39.99,
      lon: -82.85,
      liveUrl: 'https://example.com/a.jpg',
      mediaType: 'snapshot',
    },
    {
      id: 'ohgo-123-view-3',
      lat: 39.99,
      lon: -82.85,
      liveUrl: 'https://example.com/b.jpg',
      mediaType: 'snapshot',
    },
  ]);
  assert.equal(cams.length, 2);
});

test('fetchUsTrafficCameras prioritizes IN/OH snapshots for statewide views', async () => {
  await warmNationwideCameraPool({ lat: 39.8, lon: -86.1 });
  for (let i = 0; i < 90; i++) {
    if (!getCameraPoolStatus().warming) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const inBbox = { west: -88.1, south: 37.8, east: -84.8, north: 41.8 };
  const ohBbox = { west: -84.8, south: 38.4, east: -80.5, north: 42.0 };

  const indiana = await fetchUsTrafficCameras({
    ...inBbox,
    limit: 288,
    centerLat: 39.8,
    centerLon: -86.1,
  });
  const ohio = await fetchUsTrafficCameras({
    ...ohBbox,
    limit: 288,
    centerLat: 40.4,
    centerLon: -82.7,
  });

  const inCount = indiana.cameras.filter((cam) => cam.state === 'IN').length;
  const ohCount = ohio.cameras.filter((cam) => cam.state === 'OH').length;
  assert.ok(inCount >= 250, `expected IN to dominate Indiana view, got ${inCount}/${indiana.count}`);
  assert.ok(ohCount >= 250, `expected OH to dominate Ohio view, got ${ohCount}/${ohio.count}`);
});
