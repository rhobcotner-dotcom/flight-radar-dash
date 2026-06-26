import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDirectCameras,
  mapGa511ListRow,
} from '../api/lib/cameraSources/directSources.js';

test('mapGa511ListRow uses snapshot previews when SKYLINE HLS is auth-gated', () => {
  const cameras = mapGa511ListRow({
    id: 11139,
    location: 'BARR-0003: SR 211 at Horton St (Barrow)',
    roadway: 'SR 211',
    direction: 'Eastbound',
    latLng: { geography: { wellKnownText: 'POINT (-83.733475 33.995518)' } },
    images: [
      {
        id: 18549,
        imageUrl: '/map/Cctv/18549',
        videoUrl:
          'https://sfs-msc-pub-lq-01.navigator.dot.ga.gov:443/rtplive/BARR-CCTV-0003/playlist.m3u8',
        isVideoAuthRequired: true,
        videoDisabled: false,
        disabled: false,
        blocked: false,
      },
    ],
  });

  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].id, 'ga-18549');
  assert.equal(cameras[0].state, 'GA');
  assert.equal(cameras[0].source, '511GA');
  assert.equal(cameras[0].mediaType, 'snapshot');
  assert.match(cameras[0].previewUrl, /511ga\.org\/map\/Cctv\/18549$/);
});

test('fetchDirectCameras loads 511GA pool statewide', async () => {
  const georgia = { west: -85.6, south: 30.4, east: -80.8, north: 35.0 };
  const direct = await fetchDirectCameras(georgia);
  const gaCams = direct.cameras.filter((cam) => cam.state === 'GA');
  assert.ok(direct.sourceCounts.ga511 >= 4000, `expected ga511 pool, got ${direct.sourceCounts.ga511}`);
  assert.ok(gaCams.length >= 4000, `expected dense Georgia coverage, got ${gaCams.length}`);
}, { timeout: 180_000 });
