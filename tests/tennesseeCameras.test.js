import test from 'node:test';
import assert from 'node:assert/strict';
import { mapTennesseeCamera } from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapTennesseeCamera maps skyvdn HLS and thumbnailUrl additively', () => {
  const cam = mapTennesseeCamera({
    id: 'R3-001',
    active: true,
    title: 'I-40 EB e/o Elm Hill Pike',
    location__coordinates__lat: 36.12,
    location__coordinates__lng: -86.75,
    httpsVideoUrl:
      'https://mcleansfs1.us-east-1.skyvdn.com:443/rtplive/R3-001/playlist.m3u8',
    thumbnailUrl: 'https://example.tdot.tn.gov/thumbs/R3-001.jpg',
  });

  assert.ok(cam);
  assert.equal(cam.mediaType, 'hls');
  assert.match(cam.liveUrl, /skyvdn\.com/);
  assert.match(cam.previewUrl, /tdot\.tn\.gov/);
  assert.equal(isAllowedHlsUrl(cam.liveUrl), true);
});
