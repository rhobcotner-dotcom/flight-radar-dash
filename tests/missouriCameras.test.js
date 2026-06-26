import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isModotHostedStreamUrl,
  mapMissouriTrafficCamera,
} from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('isModotHostedStreamUrl rejects MoDOT CDN hosts', () => {
  assert.equal(
    isModotHostedStreamUrl('https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_128/playlist.m3u8'),
    true
  );
  assert.equal(
    isModotHostedStreamUrl('https://traveler.modot.org/tisvc/api/Tms/CameraStream/test'),
    true
  );
  assert.equal(
    isModotHostedStreamUrl('https://s2.ozarkstrafficoneview.com/rtplive/CAM01/playlist.m3u8'),
    false
  );
});

test('mapMissouriTrafficCamera maps MoDOT CDN streams as Missouri DOT', () => {
  const cam = mapMissouriTrafficCamera(
    {
      CAM_ID: 200,
      DESCRIPTION: 'I-64 at Mason',
      URL2: 'https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_128/playlist.m3u8',
    },
    { y: 38.6, x: -90.2 }
  );
  assert.ok(cam);
  assert.equal(cam.id, 'mo-dot-200');
  assert.equal(cam.source, 'Missouri DOT');
  assert.equal(cam.mediaType, 'hls');
});

test('mapMissouriTrafficCamera keeps third-party Ozarks HLS', () => {
  const cam = mapMissouriTrafficCamera(
    {
      CAM_ID: 1000,
      DESCRIPTION: 'MO 13 and Norton',
      URL2: 'https://s2.ozarkstrafficoneview.com/rtplive/CAM01/playlist.m3u8',
    },
    { y: 37.255655, x: -93.310842 }
  );

  assert.ok(cam);
  assert.equal(cam.id, 'mo-1000');
  assert.equal(cam.state, 'MO');
  assert.equal(cam.mediaType, 'hls');
  assert.equal(cam.source, 'Missouri Traffic');
  assert.match(cam.liveUrl, /ozarkstrafficoneview\.com/);
  assert.equal(isAllowedHlsUrl(cam.liveUrl), true);
});

test('mapMissouriTrafficCamera skips empty rows', () => {
  assert.equal(mapMissouriTrafficCamera({ CAM_ID: 1, URL2: null }, { y: 38, x: -90 }), null);
  assert.equal(mapMissouriTrafficCamera({ CAM_ID: 2, STREAM_ERROR: 'Y', URL2: 'http://x' }, { y: 38, x: -90 }), null);
});