import test from 'node:test';
import assert from 'node:assert/strict';
import { isHlsUrl, isBrokenModotRtplexCamera, isMapVisibleCamera, isModotTrafficCamera, isStormEligibleCamera, isModotRtplexStreamUrl, isModotTisvcStreamUrl, modotRtplexHostVariants, normalizeHlsUrl } from '../api/lib/cameraSources/helpers.js';
import { cameraHlsPlaybackUrl, isAllowedHlsUrl, fetchProxiedHlsManifest } from '../api/lib/cameraStreamProxy.js';

const TISVC = 'https://traveler.modot.org/tisvc/api/Tms/CameraStream/M029NBC-07-LQ';
const RTPLIVE = 'https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_128/playlist.m3u8';

test('MoDOT tisvc CameraStream URLs are treated as HLS', () => {
  assert.equal(isModotTisvcStreamUrl(TISVC), true);
  assert.equal(isHlsUrl(TISVC), true);
  assert.equal(normalizeHlsUrl(TISVC), TISVC);
  assert.equal(isAllowedHlsUrl(TISVC), true);
});

test('classic MoDOT rtplive URLs stay HLS', () => {
  assert.equal(isModotRtplexStreamUrl(RTPLIVE), true);
  assert.equal(isHlsUrl(RTPLIVE), true);
  assert.equal(normalizeHlsUrl(RTPLIVE), RTPLIVE);
  assert.equal(isAllowedHlsUrl(RTPLIVE), true);
  assert.match(cameraHlsPlaybackUrl(RTPLIVE), /\/api\/live\/camera-hls\?url=/);
});

test('MoDOT tisvc playback still uses the app proxy', () => {
  assert.match(cameraHlsPlaybackUrl(TISVC), /\/api\/live\/camera-hls\?url=/);
});

test('MoDOT rtplive host variants keep feed host first', () => {
  const variants = modotRtplexHostVariants(RTPLIVE);
  assert.equal(variants.length, 3);
  assert.equal(variants[0], RTPLIVE);
});

test('isMapVisibleCamera hides MoDOT rtplive but keeps snapshots', () => {
  const rtpliveCam = {
    id: 'modot-1',
    liveUrl: RTPLIVE,
    mediaType: 'hls',
    lat: 38.6,
    lon: -90.1,
  };
  const westRtplexCam = {
    id: 'modot-west-1',
    liveUrl: RTPLIVE,
    mediaType: 'hls',
    lat: 38.76,
    lon: -90.59,
  };
  const snapshotCam = {
    id: 'tm-1',
    liveUrl: 'https://cctv.travelmidwest.com/snapshots/test.jpg',
    mediaType: 'snapshot',
    lat: 38.6,
    lon: -90.1,
  };
  const modotSnapshotCam = {
    id: 'modot-snap-1',
    liveUrl: 'https://traveler.modot.org/traffic_camera_snapshots/test.jpg',
    mediaType: 'snapshot',
    source: 'MoDOT snapshots',
    lat: 38.6,
    lon: -90.15,
  };
  assert.equal(isBrokenModotRtplexCamera(rtpliveCam), true);
  assert.equal(isMapVisibleCamera(rtpliveCam), false);
  assert.equal(isBrokenModotRtplexCamera(westRtplexCam), false);
  assert.equal(isMapVisibleCamera(westRtplexCam), true);
  assert.equal(isModotTrafficCamera(westRtplexCam), false);
  assert.equal(isMapVisibleCamera(snapshotCam), true);
  assert.equal(isModotTrafficCamera(modotSnapshotCam), true);
  assert.equal(isStormEligibleCamera(modotSnapshotCam), false);
  assert.equal(isStormEligibleCamera(snapshotCam), true);
});

test('streamlock media segments are not treated as HLS manifests', () => {
  const segment =
    'https://5fca316e7c40f.streamlock.net/live-secure/customInstance/M029NBC-07-LQ.stream/media_w1_1.ts';
  assert.equal(isHlsUrl(segment), false);
});

test('proxied nested playlists route ts segments through segment proxy', async () => {
  const master = await fetchProxiedHlsManifest(TISVC);
  const chunkProxy = master.body.split('\n').find((line) => line.includes('chunklist_'));
  assert.ok(chunkProxy?.includes('camera-hls?url='));
  const chunkUrl = decodeURIComponent(chunkProxy.split('url=')[1]);
  const chunk = await fetchProxiedHlsManifest(chunkUrl);
  const segLine = chunk.body.split('\n').find((line) => line.includes('.ts'));
  assert.ok(segLine, 'expected ts segment line');
  assert.match(segLine, /camera-hls-segment/);
});
