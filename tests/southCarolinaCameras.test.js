import test from 'node:test';
import assert from 'node:assert/strict';
import { mapIterisCameraFeature } from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapIterisCameraFeature prefers skyvdn HLS over snapshot preview', () => {
  const cam = mapIterisCameraFeature(
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-81.0, 34.0] },
      properties: {
        id: '2735',
        description: 'I-77 S @ MM 4.9',
        https_url: 'https://s18.us-east-1.skyvdn.com/rtplive/10002/playlist.m3u8',
        image_url: 'https://scdotsnap.us-east-1.skyvdn.com/thumbs/10002.flv.png',
      },
    },
    'SC',
    'SC DOT'
  );

  assert.ok(cam);
  assert.equal(cam.mediaType, 'hls');
  assert.match(cam.liveUrl, /playlist\.m3u8/);
  assert.match(cam.previewUrl, /scdotsnap/);
  assert.equal(isAllowedHlsUrl(cam.liveUrl), true);
});
