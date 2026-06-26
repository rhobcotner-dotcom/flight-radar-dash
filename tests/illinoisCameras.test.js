import test from 'node:test';
import assert from 'node:assert/strict';
import { mapTravelMidwestFeature } from '../api/lib/cameraSources/directSources.js';
import { dedupeCameras, thinCameras } from '../api/lib/cameraSources/helpers.js';
import {
  fetchUsTrafficCameras,
  warmNationwideCameraPool,
  getCameraPoolStatus,
} from '../api/lib/usTrafficCameras.js';

test('mapTravelMidwestFeature keeps each directional view as its own camera', () => {
  const base = {
    OBJECTID: 101,
    CameraLocation: 'I-55 at I-294 (#1234)',
    x: -87.95,
    y: 41.85,
    SnapShot: 'https://cctv.travelmidwest.com/snapshots/test-east.jpg',
    TooOld: 'false',
  };

  const east = mapTravelMidwestFeature({ ...base, OBJECTID: 101, CameraDirection: 'E' });
  const west = mapTravelMidwestFeature({ ...base, OBJECTID: 102, CameraDirection: 'W' });

  assert.equal(east?.id, 'tm-101');
  assert.equal(west?.id, 'tm-102');
  assert.match(east?.description || '', /\(E\)$/);
  assert.equal(east?.state, 'IL');
  assert.equal(east?.mediaType, 'snapshot');
});

test('dedupeCameras preserves distinct Travel Midwest view ids at same coordinates', () => {
  const cams = dedupeCameras([
    {
      id: 'tm-101',
      lat: 41.85,
      lon: -87.95,
      liveUrl: 'https://example.com/a.jpg',
      mediaType: 'snapshot',
    },
    {
      id: 'tm-102',
      lat: 41.85,
      lon: -87.95,
      liveUrl: 'https://example.com/b.jpg',
      mediaType: 'snapshot',
    },
  ]);
  assert.equal(cams.length, 2);
});

test('thinCameras keeps multi-direction views at the same intersection', () => {
  const bbox = { west: -88.2, south: 41.6, east: -87.4, north: 42.1 };
  const cams = [
    {
      id: 'tm-101',
      lat: 41.85,
      lon: -87.95,
      liveUrl: 'https://example.com/a.jpg',
      mediaType: 'snapshot',
    },
    {
      id: 'tm-102',
      lat: 41.85,
      lon: -87.95,
      liveUrl: 'https://example.com/b.jpg',
      mediaType: 'snapshot',
    },
    {
      id: 'tm-103',
      lat: 41.86,
      lon: -87.94,
      liveUrl: 'https://example.com/c.jpg',
      mediaType: 'snapshot',
    },
  ];

  const thinned = thinCameras(cams, bbox, 2, 41.85, -87.95);
  assert.equal(thinned.length, 2);
  assert.deepEqual(
    thinned.map((cam) => cam.id).sort(),
    ['tm-101', 'tm-102']
  );
});

test('fetchUsTrafficCameras prioritizes IL snapshots for statewide Illinois views', async () => {
  await warmNationwideCameraPool({ lat: 41.5, lon: -89.5 });
  for (let i = 0; i < 90; i++) {
    if (!getCameraPoolStatus().warming) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  const ilBbox = { west: -91.5, south: 37.0, east: -87.5, north: 42.5 };
  const payload = await fetchUsTrafficCameras({
    ...ilBbox,
    limit: 288,
    centerLat: 41.5,
    centerLon: -89.5,
  });
  const ilCams = payload.cameras.filter((cam) => cam.state === 'IL');
  assert.ok(
    ilCams.length >= 250,
    `expected IL to dominate statewide view, got ${ilCams.length}/${payload.count}`
  );
  assert.ok(
    payload.cameras.every((cam) => cam.mediaType === 'snapshot' || cam.state === 'IL'),
    'non-IL live streams should not displace IL snapshot coverage'
  );
});
