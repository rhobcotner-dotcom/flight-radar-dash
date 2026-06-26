import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDirectCameras,
  mapAz511ListRow,
  mapColorado511Camera,
  mapId511ListRow,
  mapNewMexicoCamera,
  mapNv511ListRow,
  mapUt511ListRow,
} from '../api/lib/cameraSources/directSources.js';
import { isAllowedHlsUrl } from '../api/lib/cameraStreamProxy.js';

test('mapAz511ListRow maps snapshot previews on az511.gov', () => {
  const cameras = mapAz511ListRow({
    id: 635,
    location: 'SR-95 NB 249.80 @SR-68 Laughlin Rd',
    latLng: { geography: { wellKnownText: 'POINT (-114.5 35.1)' } },
    images: [{ id: 682, imageUrl: '/map/Cctv/682', isVideoAuthRequired: false, disabled: false, blocked: false }],
  });
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].state, 'AZ');
  assert.equal(cameras[0].mediaType, 'snapshot');
  assert.match(cameras[0].previewUrl, /az511\.gov\/map\/Cctv\/682$/);
});

test('mapNv511ListRow prefers public its.nv.gov HLS with snapshot preview', () => {
  const cameras = mapNv511ListRow({
    id: 2,
    location: 'McCarran & Caughlin/cashill',
    latLng: { geography: { wellKnownText: 'POINT (-119.8 39.5)' } },
    images: [
      {
        id: 2,
        imageUrl: '/map/Cctv/2',
        videoUrl:
          'https://d2wse2.its.nv.gov:443/renoxcd02/fb89196b-15dc-48fb-992e-030b7a325d34_hspflirxcd02_public.stream/playlist.m3u8',
        isVideoAuthRequired: false,
        disabled: false,
        blocked: false,
      },
    ],
  });
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].mediaType, 'hls');
  assert.match(cameras[0].liveUrl, /\.m3u8$/);
  assert.equal(isAllowedHlsUrl(cameras[0].liveUrl), true);
});

test('mapUt511ListRow maps UDOT snapshot previews', () => {
  const cameras = mapUt511ListRow({
    id: 112731,
    location: 'Freedom Blvd / 200 W @ 1100 N, PVO',
    latLng: { geography: { wellKnownText: 'POINT (-111.66 40.23)' } },
    images: [{ id: 112731, imageUrl: '/map/Cctv/112731', isVideoAuthRequired: false, disabled: false, blocked: false }],
  });
  assert.equal(cameras[0].mediaType, 'snapshot');
  assert.match(cameras[0].previewUrl, /udottraffic\.utah\.gov\/map\/Cctv\/112731$/);
});

test('mapId511ListRow maps Idaho 511 snapshot previews', () => {
  const cameras = mapId511ListRow({
    id: 1,
    location: 'I-15 UT/ID State Line UT',
    latLng: { geography: { wellKnownText: 'POINT (-112.198 42.0011)' } },
    images: [{ id: 1, imageUrl: '/map/Cctv/1', isVideoAuthRequired: false, disabled: false, blocked: false }],
  });
  assert.equal(cameras[0].state, 'ID');
  assert.match(cameras[0].previewUrl, /511\.idaho\.gov\/map\/Cctv\/1$/);
});

test('mapColorado511Camera prefers cotrip.org HLS with carsprogram preview', () => {
  const cameras = mapColorado511Camera({
    id: 123,
    active: true,
    public: true,
    name: 'C-470 MP 019.55 WB at S Broadway',
    location: { latitude: 39.61, longitude: -105.02 },
    views: [
      {
        name: 'C-470 MP 019.55 WB at S Broadway',
        url: 'https://publicstreamer2.cotrip.org:443/rtplive/470W01955CAM1RHS/playlist.m3u8',
        videoPreviewUrl: 'https://cocam.carsprogram.org/Snapshots/470W01955CAM1RHS.flv.png',
      },
    ],
  });
  assert.equal(cameras.length, 1);
  assert.equal(cameras[0].mediaType, 'hls');
  assert.equal(isAllowedHlsUrl(cameras[0].liveUrl), true);
});

test('mapNewMexicoCamera maps NMRoads snapshot URLs', () => {
  const cam = mapNewMexicoCamera({ name: 'I-40@Coors', title: 'I-40 at Coors', lat: 35.08, lon: -106.72 });
  assert.equal(cam.mediaType, 'snapshot');
  assert.match(cam.liveUrl, /nmroads\.com\/RealMapWAR\/GetCameraImage/);
});

test('fetchDirectCameras loads AZ511 pool statewide', async () => {
  const arizona = { west: -114.8, south: 31.3, east: -109.0, north: 37.0 };
  const direct = await fetchDirectCameras(arizona);
  const az = direct.cameras.filter((cam) => cam.state === 'AZ');
  assert.ok(direct.sourceCounts.az511 >= 600, `expected az511 pool, got ${direct.sourceCounts.az511}`);
  assert.ok(az.length >= 600, `expected dense Arizona coverage, got ${az.length}`);
}, { timeout: 120_000 });

test('fetchDirectCameras loads NVRoads pool statewide', async () => {
  const nevada = { west: -120.0, south: 35.0, east: -114.0, north: 42.0 };
  const direct = await fetchDirectCameras(nevada);
  const nv = direct.cameras.filter((cam) => cam.state === 'NV');
  assert.ok(direct.sourceCounts.nv511 >= 600, `expected nv511 pool, got ${direct.sourceCounts.nv511}`);
  assert.ok(nv.length >= 600, `expected dense Nevada coverage, got ${nv.length}`);
}, { timeout: 120_000 });

test('fetchDirectCameras loads UDOT 511 pool statewide', async () => {
  const utah = { west: -114.1, south: 37.0, east: -109.0, north: 42.0 };
  const direct = await fetchDirectCameras(utah);
  const ut = direct.cameras.filter((cam) => cam.state === 'UT');
  assert.ok(direct.sourceCounts.ut511 >= 2000, `expected ut511 pool, got ${direct.sourceCounts.ut511}`);
  assert.ok(ut.length >= 2000, `expected dense Utah coverage, got ${ut.length}`);
}, { timeout: 180_000 });

test('fetchDirectCameras loads CDOT pool statewide', async () => {
  const colorado = { west: -109.1, south: 37.0, east: -102.0, north: 41.0 };
  const direct = await fetchDirectCameras(colorado);
  const co = direct.cameras.filter((cam) => cam.state === 'CO');
  assert.ok(direct.sourceCounts.cotrip >= 800, `expected cotrip pool, got ${direct.sourceCounts.cotrip}`);
  assert.ok(co.length >= 800, `expected dense Colorado coverage, got ${co.length}`);
}, { timeout: 120_000 });

test('fetchDirectCameras loads Idaho 511 pool statewide', async () => {
  const idaho = { west: -117.2, south: 42.0, east: -111.0, north: 49.0 };
  const direct = await fetchDirectCameras(idaho);
  const idCams = direct.cameras.filter((cam) => cam.state === 'ID');
  assert.ok(direct.sourceCounts.idaho >= 450, `expected idaho pool, got ${direct.sourceCounts.idaho}`);
  assert.ok(idCams.length >= 450, `expected dense Idaho coverage, got ${idCams.length}`);
}, { timeout: 120_000 });

test('fetchDirectCameras loads NMRoads pool statewide', async () => {
  const newMexico = { west: -109.1, south: 31.3, east: -103.0, north: 37.0 };
  const direct = await fetchDirectCameras(newMexico);
  const nm = direct.cameras.filter((cam) => cam.state === 'NM');
  assert.ok(direct.sourceCounts.nmroads >= 170, `expected nmroads pool, got ${direct.sourceCounts.nmroads}`);
  assert.ok(nm.length >= 170, `expected dense New Mexico coverage, got ${nm.length}`);
}, { timeout: 120_000 });
