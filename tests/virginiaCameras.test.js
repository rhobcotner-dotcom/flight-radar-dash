import test from 'node:test';
import assert from 'node:assert/strict';
import { mapVirginia511Camera } from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapVirginia511Camera maps vdotcameras HLS and snapshot additively', () => {
  const cam = mapVirginia511Camera({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-77.3055, 38.84519] },
    properties: {
      id: '3958',
      active: true,
      description: 'University Drive and Sager Avenue',
      https_url:
        'https://media-sfs7.vdotcameras.com/rtplive/0i6a7bfbs60yq2lbgivq0b8xk3scij3c/playlist.m3u8',
      image_url: 'https://snapshot.vdotcameras.com/thumbs/0i6a7bfbs60yq2lbgivq0b8xk3scij3c.flv.png',
    },
  });

  assert.ok(cam);
  assert.equal(cam.mediaType, 'hls');
  assert.match(cam.liveUrl, /vdotcameras\.com/);
  assert.match(cam.previewUrl, /snapshot\.vdotcameras\.com/);
  assert.equal(isAllowedHlsUrl(cam.liveUrl), true);
});

test('mapVirginia511Camera skips inactive cameras', () => {
  const cam = mapVirginia511Camera({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-77.3, 38.8] },
    properties: {
      id: '1',
      active: false,
      https_url: 'https://media-sfs1.vdotcameras.com/rtplive/test/playlist.m3u8',
    },
  });
  assert.equal(cam, null);
});
