import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchCamerasNearPoint } from '../api/lib/usTrafficCameras.js';
import { isModotTrafficCamera } from '../api/lib/cameraSources/helpers.js';
import { cameraNeedsProxy, fetchProxiedCameraImage } from '../api/lib/cameraProxy.js';
import { USER_AGENT } from '../api/lib/cameraSources/helpers.js';

const PROBE_TIMEOUT_MS = 12000;
const STORM_RADIUS_MILES = 22;

async function probeStormCameraUrl(cam) {
  const url =
    cam.sourceLiveUrl?.startsWith('http')
      ? cam.sourceLiveUrl
      : cam.liveUrl?.startsWith('http')
        ? cam.liveUrl
        : null;
  if (!url) return false;

  if (cam.mediaType === 'hls') {
    const { fetchProxiedHlsManifest } = await import('../api/lib/cameraStreamProxy.js');
    try {
      await Promise.race([
        fetchProxiedHlsManifest(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), PROBE_TIMEOUT_MS)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  if (cam.mediaType === 'youtube') {
    return Boolean(url);
  }

  if (cam.mediaType === 'snapshot') {
    try {
      if (cameraNeedsProxy(url)) {
        const image = await fetchProxiedCameraImage(url);
        return image.body.length > 500;
      }
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const contentType = res.headers.get('content-type') || '';
      const body = Buffer.from(await res.arrayBuffer());
      return (
        res.ok &&
        body.length > 500 &&
        (/^image\//i.test(contentType) ||
          contentType.includes('octet-stream') ||
          contentType.includes('png'))
      );
    } catch {
      return false;
    }
  }

  return false;
}

function assertLiveOnlyStormCameras(label, cameras) {
  for (const cam of cameras) {
    assert.equal(
      isModotTrafficCamera(cam),
      false,
      `${label}: MoDOT camera leaked into storm pool: ${cam.id}`
    );
    assert.ok(cam.liveUrl, `${label}: missing liveUrl for ${cam.id}`);
    assert.ok(!/divas\.cloud/i.test(cam.liveUrl || ''), `${label}: auth-gated DIVAS HLS leaked: ${cam.id}`);
    assert.ok(
      cam.mediaType === 'hls' || cam.mediaType === 'youtube',
      `${label}: storm briefing must be live-only, got ${cam.mediaType} for ${cam.id}`
    );
  }
}

function assertNoModotStormCameras(label, cameras) {
  for (const cam of cameras) {
    assert.equal(
      isModotTrafficCamera(cam),
      false,
      `${label}: MoDOT camera leaked into storm pool: ${cam.id}`
    );
    assert.ok(cam.liveUrl, `${label}: missing liveUrl for ${cam.id}`);
    assert.ok(!/divas\.cloud/i.test(cam.liveUrl || ''), `${label}: auth-gated DIVAS HLS leaked: ${cam.id}`);
  }
}

async function assertVerifiedStormCameras(
  label,
  lat,
  lon,
  { minCount = 1, state, sourcePattern, liveOnly = true } = {}
) {
  const cameras = await fetchCamerasNearPoint(lat, lon, STORM_RADIUS_MILES, Math.max(minCount, 3), {
    liveOnly,
  });
  assert.ok(
    cameras.length >= minCount,
    `${label}: expected at least ${minCount} live storm cameras, got ${cameras.length}`
  );

  if (liveOnly) {
    assertLiveOnlyStormCameras(label, cameras);
  } else {
    assertNoModotStormCameras(label, cameras);
  }

  for (const cam of cameras) {
    if (state) assert.equal(cam.state, state, `${label}: wrong state for ${cam.id}`);
    if (sourcePattern) {
      assert.ok(sourcePattern.test(cam.source || ''), `${label}: bad source for ${cam.id}`);
    }

    const ok = await probeStormCameraUrl(cam);
    assert.equal(ok, true, `${label}: unplayable storm camera ${cam.id} (${cam.description})`);
  }

  return cameras;
}

test('Tampa storm cameras are live-only (no snapshot fallbacks)', async () => {
  const cameras = await fetchCamerasNearPoint(27.95, -82.45, STORM_RADIUS_MILES, 3);
  assertLiveOnlyStormCameras('Tampa', cameras);
}, { timeout: 180_000 });

test('Atlanta storm cameras are live-only (no snapshot fallbacks)', async () => {
  const cameras = await fetchCamerasNearPoint(33.75, -84.39, STORM_RADIUS_MILES, 3);
  assertLiveOnlyStormCameras('Atlanta', cameras);
}, { timeout: 180_000 });

test('Denver storm cameras return verified CDOT HLS feeds', async () => {
  const cameras = await assertVerifiedStormCameras('Denver', 39.74, -104.99, {
    minCount: 1,
    sourcePattern: /CDOT|CARS|cotrip/i,
  });
  assert.ok(
    cameras.every((cam) => cam.mediaType === 'hls'),
    'Denver storm briefing should use CDOT HLS streams'
  );
}, { timeout: 180_000 });

test('Tampa storm cameras allow FL511 snapshots when live-only is off', async () => {
  const cameras = await assertVerifiedStormCameras('Tampa snapshots', 27.95, -82.45, {
    minCount: 3,
    liveOnly: false,
    sourcePattern: /FL511/i,
  });
  assert.ok(
    cameras.every((cam) => cam.mediaType === 'snapshot'),
    'Tampa storm briefing with snapshots enabled should use FL511 snapshots'
  );
}, { timeout: 180_000 });

test('STL storm cameras are live-only (MoDOT HLS excluded; may be empty)', async () => {
  const cameras = await fetchCamerasNearPoint(38.67, -90.03, STORM_RADIUS_MILES, 3);
  assertLiveOnlyStormCameras('STL', cameras);
}, { timeout: 180_000 });

test('known Tampa FL511 views like Sligh at Boulevard probe successfully', async () => {
  const { DIRECT_FETCHERS } = await import('../api/lib/cameraSources/directSources.js');
  const fl511 = DIRECT_FETCHERS.find((entry) => entry.id === 'fl511');
  const bbox = { west: -82.6, south: 27.8, east: -82.3, north: 28.1 };
  const local = await fl511.fetch(bbox);
  const sligh = local.find((cam) => /Sligh at Boulevard/i.test(cam.description || ''));
  assert.ok(sligh, 'expected Sligh at Boulevard in Tampa FL511 pool');
  assert.equal(sligh.mediaType, 'snapshot');

  const url = sligh.sourceLiveUrl?.startsWith('http') ? sligh.sourceLiveUrl : sligh.liveUrl;
  assert.ok(url?.startsWith('http'), 'expected snapshot URL for FL511 view');
  try {
    if (cameraNeedsProxy(url)) {
      const image = await fetchProxiedCameraImage(url);
      assert.ok(image.body.length > 500);
    } else {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*' },
        redirect: 'follow',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const body = Buffer.from(await res.arrayBuffer());
      assert.ok(res.ok && body.length > 500);
    }
  } catch {
    assert.fail('expected Sligh at Boulevard snapshot to probe successfully');
  }
}, { timeout: 180_000 });
