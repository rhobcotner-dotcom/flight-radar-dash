import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDirectCameras, mapAlabamaCamera } from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapAlabamaCamera prefers HLS and ALGO snapshot preview', () => {
  const cam = mapAlabamaCamera({
    Id: 1574,
    Name: 'BHM-CAM-11TH-17TH',
    StreamUrl: 'https://cdn3.wowza.com/5/MnE5TTVsNWpjNkZS/bhm-fastly/bhm-cam-11th-17th.stream/playlist.m3u8',
    ImageUrl: 'https://api.algotraffic.com/v3/Cameras/1574/snapshot.jpg',
    Latitude: 33.5207,
    Longitude: -86.8025,
  });

  assert.ok(cam);
  assert.equal(cam.id, 'al-1574');
  assert.equal(cam.state, 'AL');
  assert.equal(cam.mediaType, 'hls');
  assert.match(cam.liveUrl, /\.m3u8$/);
  assert.match(cam.previewUrl, /api\.algotraffic\.com/);
  assert.equal(isAllowedHlsUrl(cam.liveUrl), true);
});

test('fetchDirectCameras loads ALDOT pool statewide', async () => {
  const alabama = { west: -88.5, south: 30.1, east: -84.9, north: 35.0 };
  const direct = await fetchDirectCameras(alabama);
  const alCams = direct.cameras.filter((cam) => cam.state === 'AL');
  assert.ok(direct.sourceCounts.aldot >= 500, `expected aldot pool, got ${direct.sourceCounts.aldot}`);
  assert.ok(alCams.length >= 500, `expected dense Alabama coverage, got ${alCams.length}`);
});
