import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNy511Camera } from '../api/lib/cameraSources/directSources.js';
import { mapPlaybackCameras } from '../api/lib/usTrafficCameras.js';
import { recordStreamProbeResult } from '../api/lib/cameraStreamValidation.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapNy511Camera emits skyvdn HLS with Url snapshot preview', () => {
  const cam = mapNy511Camera({
    ID: 42,
    Disabled: false,
    Blocked: false,
    Name: 'I-87 at Exit 15',
    Latitude: 42.65,
    Longitude: -73.75,
    VideoUrl: 'https://s7.nysdot.skyvdn.com:443/live/ny42/playlist.m3u8',
    Url: 'https://511ny.org/map/Cctv/42',
  });

  assert.ok(cam);
  assert.equal(cam.mediaType, 'hls');
  assert.match(cam.liveUrl, /skyvdn\.com/);
  assert.match(cam.previewUrl, /511ny\.org/);
  assert.equal(isAllowedHlsUrl(cam.liveUrl), true);
});

test('mapPlaybackCameras falls back to snapshot when skyvdn HLS probe fails', () => {
  const deadHls = 'https://s7.nysdot.skyvdn.com:443/live/dead/playlist.m3u8';
  const snapshot = 'https://511ny.org/map/Cctv/dead';
  recordStreamProbeResult(deadHls, false);

  const [playback] = mapPlaybackCameras([
    {
      id: 'ny-dead',
      mediaType: 'hls',
      liveUrl: deadHls,
      previewUrl: snapshot,
      lat: 42.65,
      lon: -73.75,
      state: 'NY',
    },
  ]);

  assert.equal(playback.mediaType, 'snapshot');
  assert.match(playback.liveUrl, /camera-image\?/);
  assert.equal(playback.sourceLiveUrl, deadHls);
});
