import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapWi511ListRow,
  parseWi511WktPoint,
} from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('parseWi511WktPoint extracts lon/lat from POINT WKT', () => {
  const point = parseWi511WktPoint('POINT (-89.518702 44.454149)');
  assert.deepEqual(point, { lat: 44.454149, lon: -89.518702 });
  assert.equal(parseWi511WktPoint(''), null);
});

test('mapWi511ListRow prefers live HLS and view snapshot URLs', () => {
  const cameras = mapWi511ListRow({
    id: 1,
    location: 'I-39/US 51 at County B',
    roadway: 'I-39/US 51 ',
    direction: 'Unknown',
    latLng: { geography: { wellKnownText: 'POINT (-89.518702 44.454149)' } },
    images: [
      {
        id: 937,
        cameraSiteId: 1,
        imageUrl: '/map/Cctv/937',
        videoUrl: 'https://cctv1.dot.wi.gov:443/rtplive/CCTV-49-0011/playlist.m3u8',
        videoDisabled: false,
        disabled: false,
        blocked: false,
      },
    ],
  });

  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].id, 'wi-937');
  assert.equal(cameras[0].mediaType, 'hls');
  assert.equal(cameras[0].state, 'WI');
  assert.match(cameras[0].liveUrl, /\.m3u8$/);
  assert.match(cameras[0].previewUrl, /511wi\.gov\/map\/Cctv\/937$/);
  assert.equal(isAllowedHlsUrl(cameras[0].liveUrl), true);
});

test('mapWi511ListRow skips disabled views', () => {
  const cameras = mapWi511ListRow({
    id: 2,
    location: 'Disabled cam',
    latLng: { geography: { wellKnownText: 'POINT (-88 44)' } },
    images: [{ id: 1, disabled: true, imageUrl: '/map/Cctv/1' }],
  });
  assert.equal(cameras.length, 0);
});
