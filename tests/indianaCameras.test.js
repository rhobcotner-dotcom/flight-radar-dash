import test from 'node:test';
import assert from 'node:assert/strict';
import { mapIndiana511Camera } from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapIndiana511Camera prefers free trafficwise HLS over CARS snapshot preview', () => {
  const cameras = mapIndiana511Camera({
    id: 528,
    active: true,
    public: true,
    name: 'I-94 near US421',
    location: { latitude: 41.59, longitude: -87.44 },
    views: [
      {
        name: 'E OF US421',
        url: 'https://skysfs4.trafficwise.org:443/preroll/INDOT_528_sdRf2LeZp7VYFgcF/playlist.m3u8',
        videoPreviewUrl: 'https://intg.carsprogram.org/cameras_v1/api/cameras/528/preview.jpg',
      },
    ],
  });

  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].mediaType, 'hls');
  assert.match(cameras[0].liveUrl, /trafficwise\.org/);
  assert.match(cameras[0].previewUrl, /carsprogram\.org/);
  assert.equal(isAllowedHlsUrl(cameras[0].liveUrl), true);
});
