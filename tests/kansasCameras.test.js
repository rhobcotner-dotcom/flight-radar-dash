import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDirectCameras,
  mapKansasCarsCamera,
} from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapKansasCarsCamera maps skyvdn HLS and kscam snapshot views', () => {
  const hlsCameras = mapKansasCarsCamera({
    id: 505,
    active: true,
    public: true,
    name: 'I-70 at Goodland Exit 17',
    location: { latitude: 39.364, longitude: -101.711 },
    views: [
      {
        name: 'I-70 at Goodland Exit 17',
        url: 'https://kdot-sfs3.us-east-1.skyvdn.com/rtplive/5-015-0677-2/playlist.m3u8?token=abc',
      },
    ],
  });
  assert.equal(hlsCameras.length, 1);
  assert.equal(hlsCameras[0].mediaType, 'hls');
  assert.equal(isAllowedHlsUrl(hlsCameras[0].liveUrl), true);

  const snapCameras = mapKansasCarsCamera({
    id: 1,
    active: true,
    public: true,
    name: 'K-39 at Neosho River, Chanute MP 27',
    location: { latitude: 37.68, longitude: -95.45 },
    views: [
      {
        name: 'K-39 at Neosho River, Chanute MP 27',
        type: 'STILL_IMAGE',
        url: 'https://kscam.carsprogram.org/KDOT_573004_IMAGE001.JPG',
      },
    ],
  });
  assert.equal(snapCameras.length, 1);
  assert.equal(snapCameras[0].mediaType, 'snapshot');
  assert.match(snapCameras[0].previewUrl, /kscam\.carsprogram\.org/);
});

test('fetchDirectCameras loads KanDrive CARS pool', async () => {
  const wichita = { west: -97.5, south: 37.5, east: -97.0, north: 38.0 };
  const direct = await fetchDirectCameras(wichita);
  const ksCams = direct.cameras.filter((cam) => cam.state === 'KS');
  assert.ok(direct.sourceCounts['kansas-cars'] >= 10, `expected kansas-cars pool, got ${direct.sourceCounts['kansas-cars']}`);
  assert.ok(ksCams.length >= 10, `expected KS cameras, got ${ksCams.length}`);
}, { timeout: 120_000 });
