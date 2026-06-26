import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDirectCameras,
  mapNc511ListRow,
  parse511ListWktPoint,
} from '../api/lib/cameraSources/directSources.js';

test('parse511ListWktPoint works for DriveNC rows', () => {
  const point = parse511ListWktPoint('POINT (-80.843126 35.227087)');
  assert.deepEqual(point, { lat: 35.227087, lon: -80.843126 });
});

test('mapNc511ListRow uses drivenc.gov snapshot previews when HLS is auth-gated', () => {
  const cameras = mapNc511ListRow({
    id: 4020,
    location: 'I-77 @ I-485 Outer',
    latLng: { geography: { wellKnownText: 'POINT (-80.843126 35.227087)' } },
    images: [
      {
        id: 4020,
        imageUrl: '/map/Cctv/4020',
        videoUrl: 'https://cfmse01.services.ncdot.gov/hls/CCTV-4020/playlist.m3u8',
        isVideoAuthRequired: true,
        videoDisabled: false,
        disabled: false,
        blocked: false,
      },
    ],
  });

  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].id, 'nc-4020');
  assert.equal(cameras[0].state, 'NC');
  assert.equal(cameras[0].mediaType, 'snapshot');
  assert.match(cameras[0].previewUrl, /drivenc\.gov\/map\/Cctv\/4020$/);
  assert.doesNotMatch(cameras[0].liveUrl || '', /\.m3u8$/);
});

test('fetchDirectCameras loads DriveNC list pool', async () => {
  const charlotte = { west: -81.0, south: 35.0, east: -80.6, north: 35.4 };
  const direct = await fetchDirectCameras(charlotte);
  const ncCams = direct.cameras.filter((cam) => cam.state === 'NC');
  assert.ok(direct.sourceCounts.nc511 >= 20, `expected nc511 pool, got ${direct.sourceCounts.nc511}`);
  assert.ok(ncCams.length >= 20, `expected NC cameras, got ${ncCams.length}`);
}, { timeout: 120_000 });
