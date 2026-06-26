import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDirectCameras,
  mapMississippiTrafficCamera,
  parseMississippiTrafficStream,
} from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('parseMississippiTrafficStream builds regional Wowza HLS URLs', () => {
  const urls = parseMississippiTrafficStream(
    'https://streamingjxn1.mdottraffic.com/thumbnail?application=rtplive&streamname=010406.stream&size=352x240&format=jpg&fitmode=stretch',
    '010406'
  );
  assert.ok(urls);
  assert.match(urls.liveUrl, /streamingjxn1\.mdottraffic\.com\/rtplive\/010406\.stream\/playlist\.m3u8$/);
  assert.match(urls.previewUrl, /thumbnail\?application=rtplive/);
  assert.equal(isAllowedHlsUrl(urls.liveUrl), true);
});

test('mapMississippiTrafficCamera maps MDOT Traffic streams', () => {
  const cam = mapMississippiTrafficCamera(
    { siteId: '1', tooltip: 'I-55 at Lakeland Dr', lat: 32.33378, lon: -90.16269 },
    {
      id: '010406',
      description: 'I-55 North — Mile 406',
      liveUrl: 'https://streamingjxn1.mdottraffic.com/rtplive/010406.stream/playlist.m3u8',
      previewUrl:
        'https://streamingjxn1.mdottraffic.com/thumbnail?application=rtplive&streamname=010406.stream&size=352x240&format=jpg',
    }
  );

  assert.ok(cam);
  assert.equal(cam.id, 'ms-010406');
  assert.equal(cam.state, 'MS');
  assert.equal(cam.source, 'MDOT Traffic');
  assert.equal(cam.mediaType, 'hls');
});

test('fetchDirectCameras loads MDOT Traffic pool statewide', async () => {
  const mississippi = { west: -91.7, south: 30.2, east: -88.1, north: 35.0 };
  const direct = await fetchDirectCameras(mississippi);
  const msCams = direct.cameras.filter((cam) => cam.state === 'MS');
  assert.ok(
    direct.sourceCounts['mississippi-traffic'] >= 800,
    `expected mississippi-traffic pool, got ${direct.sourceCounts['mississippi-traffic']}`
  );
  assert.ok(msCams.length >= 800, `expected dense Mississippi coverage, got ${msCams.length}`);
}, { timeout: 120_000 });
