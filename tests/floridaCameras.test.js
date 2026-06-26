import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDirectCameras,
  mapFl511ListRow,
  parse511ListWktPoint,
} from '../api/lib/cameraSources/directSources.js';

test('parse511ListWktPoint extracts lon/lat from POINT WKT', () => {
  const point = parse511ListWktPoint('POINT (-80.892882 26.17325)');
  assert.deepEqual(point, { lat: 26.17325, lon: -80.892882 });
});

test('mapFl511ListRow uses snapshot previews when DIVAS HLS is auth-gated', () => {
  const cameras = mapFl511ListRow({
    id: 1,
    location: '0517N_75_Alligator_Alley_M052',
    roadway: 'I-75',
    direction: 'Northbound',
    latLng: { geography: { wellKnownText: 'POINT (-80.892882 26.17325)' } },
    images: [
      {
        id: 1,
        imageUrl: '/map/Cctv/1',
        videoUrl: 'https://dis-se18.divas.cloud:8200/chan-1_h/index.m3u8',
        isVideoAuthRequired: true,
        videoDisabled: false,
        disabled: false,
        blocked: false,
      },
    ],
  });

  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].id, 'fl-1');
  assert.equal(cameras[0].state, 'FL');
  assert.equal(cameras[0].source, 'FL511');
  assert.equal(cameras[0].mediaType, 'snapshot');
  assert.match(cameras[0].previewUrl, /fl511\.com\/map\/Cctv\/1$/);
});

test('fetchDirectCameras loads FL511 pool statewide', async () => {
  const florida = { west: -87.6, south: 24.5, east: -80.0, north: 31.0 };
  const direct = await fetchDirectCameras(florida);
  const flCams = direct.cameras.filter((cam) => cam.state === 'FL');
  assert.ok(direct.sourceCounts.fl511 >= 4800, `expected fl511 pool, got ${direct.sourceCounts.fl511}`);
  assert.ok(flCams.length >= 4800, `expected dense Florida coverage, got ${flCams.length}`);
}, { timeout: 180_000 });
