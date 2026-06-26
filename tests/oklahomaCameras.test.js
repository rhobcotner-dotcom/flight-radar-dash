import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDirectCameras, mapOkTrafficMapCamera } from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapOkTrafficMapCamera maps live HLS from streamDictionary', () => {
  const cam = mapOkTrafficMapCamera({
    id: 1103130967,
    latitude: '35.39637',
    longitude: '-97.57406',
    location: 'I-44 & I-240 N',
    type: 'Web',
    status: 'Free',
    blockAtis: '0',
    streamDictionary: {
      streamName: 'I-44 & I-240 N',
      streamSrc: 'https://stream.oktraffic.org/delay-stream/01ced8fdaab10149.stream/playlist.m3u8',
    },
  });

  assert.ok(cam);
  assert.equal(cam.id, 'ok-1103130967');
  assert.equal(cam.mediaType, 'hls');
  assert.equal(cam.state, 'OK');
  assert.match(cam.liveUrl, /stream\.oktraffic\.org.*\.m3u8$/);
  assert.equal(isAllowedHlsUrl(cam.liveUrl), true);
});

test('mapOkTrafficMapCamera skips out-of-service views', () => {
  const cam = mapOkTrafficMapCamera({
    id: 1103131149,
    latitude: '35.39637',
    longitude: '-97.57406',
    location: 'I-44 & I-240 E',
    type: 'Web',
    status: 'Out Of Service',
    blockAtis: '0',
    streamDictionary: {
      streamSrc: 'https://stream.oktraffic.org/delay-stream/example.stream/playlist.m3u8',
    },
  });
  assert.equal(cam, null);
});

test('fetchDirectCameras loads OKTraffic statewide HLS pool', async () => {
  const oklahoma = { west: -103.0, south: 33.6, east: -94.4, north: 37.0 };
  const direct = await fetchDirectCameras(oklahoma);
  const okCams = direct.cameras.filter((cam) => cam.state === 'OK');
  assert.ok(direct.sourceCounts.oktraffic >= 350, `expected oktraffic pool, got ${direct.sourceCounts.oktraffic}`);
  assert.ok(okCams.length >= 350, `expected dense Oklahoma coverage, got ${okCams.length}`);
  assert.ok(okCams.every((cam) => cam.mediaType === 'hls'));
});
