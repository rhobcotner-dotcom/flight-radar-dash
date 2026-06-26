import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchDirectCameras,
  mapIterisCameraFeature,
} from '../api/lib/cameraSources/directSources.js';

test('mapIterisCameraFeature maps snapshot icon URLs', () => {
  const cam = mapIterisCameraFeature(
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-81.0, 34.0] },
      properties: {
        id: 'cam-1',
        description: 'I-26 @ MM 10',
        image_url: 'https://sc.cdn.iteris-atis.com/icons/cameras/1.jpg',
      },
    },
    'SC',
    'SC DOT'
  );
  assert.ok(cam);
  assert.equal(cam.state, 'SC');
  assert.equal(cam.source, 'SC DOT');
  assert.equal(cam.mediaType, 'snapshot');
});

test('fetchDirectCameras loads Caltrans pool in California', async () => {
  const california = { west: -122.5, south: 37.0, east: -121.5, north: 38.0 };
  const direct = await fetchDirectCameras(california);
  const caCams = direct.cameras.filter((cam) => cam.state === 'CA');
  assert.ok(direct.sourceCounts.caltrans >= 20, `expected caltrans pool, got ${direct.sourceCounts.caltrans}`);
  assert.ok(caCams.length >= 20, `expected CA cameras, got ${caCams.length}`);
}, { timeout: 120_000 });

test('fetchDirectCameras loads WSDOT pool in Washington', async () => {
  const seattle = { west: -122.5, south: 47.4, east: -122.1, north: 47.8 };
  const direct = await fetchDirectCameras(seattle);
  const waCams = direct.cameras.filter((cam) => cam.state === 'WA');
  assert.ok(direct.sourceCounts.wsdot >= 20, `expected wsdot pool, got ${direct.sourceCounts.wsdot}`);
  assert.ok(waCams.length >= 10, `expected WA cameras, got ${waCams.length}`);
}, { timeout: 120_000 });

test('fetchDirectCameras loads 511PA pool statewide', async () => {
  const pennsylvania = { west: -80.5, south: 39.7, east: -74.7, north: 42.3 };
  const direct = await fetchDirectCameras(pennsylvania);
  const paCams = direct.cameras.filter((cam) => cam.state === 'PA');
  assert.ok(direct.sourceCounts.pa511 >= 100, `expected pa511 pool, got ${direct.sourceCounts.pa511}`);
  assert.ok(paCams.length >= 100, `expected PA cameras, got ${paCams.length}`);
}, { timeout: 180_000 });

test('fetchDirectCameras loads SC DOT Iteris pool', async () => {
  const southCarolina = { west: -83.4, south: 32.0, east: -78.5, north: 35.2 };
  const direct = await fetchDirectCameras(southCarolina);
  const scCams = direct.cameras.filter((cam) => cam.state === 'SC');
  assert.ok(direct.sourceCounts.scdot >= 50, `expected scdot pool, got ${direct.sourceCounts.scdot}`);
  assert.ok(scCams.length >= 50, `expected SC cameras, got ${scCams.length}`);
}, { timeout: 120_000 });

test('fetchDirectCameras loads SD DOT Iteris pool', async () => {
  const southDakota = { west: -104.1, south: 42.5, east: -96.4, north: 46.0 };
  const direct = await fetchDirectCameras(southDakota);
  const sdCams = direct.cameras.filter((cam) => cam.state === 'SD');
  assert.ok(direct.sourceCounts.sddot >= 40, `expected sddot pool, got ${direct.sourceCounts.sddot}`);
  assert.ok(sdCams.length >= 40, `expected SD cameras, got ${sdCams.length}`);
}, { timeout: 120_000 });

test('fetchDirectCameras loads wired Hawaii and Virginia fetchers', async () => {
  const hawaii = { west: -158.1, south: 21.2, east: -157.6, north: 21.5 };
  const virginia = { west: -77.6, south: 38.7, east: -77.0, north: 39.0 };
  const [hiDirect, vaDirect] = await Promise.all([
    fetchDirectCameras(hawaii),
    fetchDirectCameras(virginia),
  ]);
  assert.ok(hiDirect.sourceCounts.hdot >= 5, `expected hdot pool, got ${hiDirect.sourceCounts.hdot}`);
  assert.ok(vaDirect.sourceCounts.vdot >= 5, `expected vdot pool, got ${vaDirect.sourceCounts.vdot}`);
}, { timeout: 120_000 });
