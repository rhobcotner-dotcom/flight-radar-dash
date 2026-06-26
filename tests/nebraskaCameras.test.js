import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNebraska511Camera } from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapNebraska511Camera prefers HLS when both preview and stream exist', () => {
  const cameras = mapNebraska511Camera({
    id: 99,
    active: true,
    public: true,
    name: 'I-80 near Lincoln',
    location: { latitude: 40.81, longitude: -96.68 },
    views: [
      {
        name: 'Eastbound',
        url: 'https://example.skyvdn.com:443/live/ne99/playlist.m3u8',
        videoPreviewUrl: 'https://netg.carsprogram.org/cameras_v1/api/cameras/99/preview.jpg',
      },
    ],
  });

  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].mediaType, 'hls');
  assert.match(cameras[0].liveUrl, /playlist\.m3u8/);
  assert.match(cameras[0].previewUrl, /carsprogram\.org/);
  assert.equal(isAllowedHlsUrl(cameras[0].liveUrl), true);
});

test('mapNebraska511Camera maps STILL_IMAGE dot511.nebraska.gov snapshots', () => {
  const cameras = mapNebraska511Camera({
    id: 1,
    public: true,
    name: 'Scale E of Lincoln',
    location: { latitude: 40.93, longitude: -96.45 },
    views: [
      {
        name: 'Various Views',
        type: 'STILL_IMAGE',
        url: 'https://dot511.nebraska.gov/images/vid-001080416-00.jpg',
      },
    ],
  });

  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].mediaType, 'snapshot');
  assert.match(cameras[0].streamUrl, /dot511\.nebraska\.gov/);
});

test('mapNebraska511Camera maps snapshot-only views', () => {
  const cameras = mapNebraska511Camera({
    id: 100,
    active: true,
    public: true,
    name: 'US-75',
    location: { latitude: 41.25, longitude: -96.0 },
    views: [
      {
        name: 'North',
        url: 'https://netg.carsprogram.org/cameras_v1/api/cameras/100/preview.jpg',
        videoPreviewUrl: 'https://netg.carsprogram.org/cameras_v1/api/cameras/100/preview.jpg',
      },
    ],
  });

  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].mediaType, 'snapshot');
});
