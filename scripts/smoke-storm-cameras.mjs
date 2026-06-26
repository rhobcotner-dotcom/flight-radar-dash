#!/usr/bin/env node
/**
 * Smoke test: storm cameras API is live-only (HLS/YouTube), excludes MoDOT, validates feeds.
 */
import { fetchCamerasNearPoint } from '../api/lib/usTrafficCameras.js';
import { isModotTrafficCamera } from '../api/lib/cameraSources/helpers.js';

const STL_LAT = 38.67;
const STL_LON = -90.03;
const DENVER_LAT = 39.74;
const DENVER_LON = -104.99;
const TAMPA_LAT = 27.95;
const TAMPA_LON = -82.45;
const STORM_RADIUS_MILES = 22;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertLiveOnly(label, cameras) {
  for (const cam of cameras) {
    console.log(`   ${label} ${cam.distanceMiles} mi ${cam.mediaType} ${cam.description}`);
    assert(!isModotTrafficCamera(cam), `${label}: MoDOT camera leaked: ${cam.id}`);
    assert(
      cam.mediaType === 'hls' || cam.mediaType === 'youtube',
      `${label}: storm briefing must be live-only, got ${cam.mediaType} for ${cam.id}`
    );
    assert(
      cam.liveUrl?.startsWith('http') || cam.liveUrl?.startsWith('/api/live/'),
      `${label}: missing playable URL for ${cam.id}`
    );
    assert(!/divas\.cloud/i.test(cam.liveUrl || ''), `${label}: auth-gated DIVAS HLS: ${cam.id}`);
  }
}

async function checkStormCameras(label, lat, lon, { minCount = 1 } = {}) {
  const cameras = await fetchCamerasNearPoint(lat, lon, STORM_RADIUS_MILES, 3);
  assert(cameras.length >= minCount, `${label}: expected at least ${minCount} live storm camera(s)`);
  assertLiveOnly(label, cameras);
}

async function main() {
  console.log('1) Closest storm cameras (STL, live-only — may be empty)...');
  const stl = await fetchCamerasNearPoint(STL_LAT, STL_LON, STORM_RADIUS_MILES, 3);
  assertLiveOnly('STL', stl);
  if (!stl.length) {
    console.log('   OK — no live cameras in range (MoDOT excluded; snapshots not used for weather)');
  }

  console.log('2) Closest storm cameras (Denver, CDOT HLS)...');
  await checkStormCameras('Denver', DENVER_LAT, DENVER_LON);

  console.log('3) Tampa storm cameras (live-only — may be empty)...');
  const tampa = await fetchCamerasNearPoint(TAMPA_LAT, TAMPA_LON, STORM_RADIUS_MILES, 3);
  assertLiveOnly('Tampa', tampa);
  if (!tampa.length) {
    console.log('   OK — no live cameras in range (snapshot-only region)');
  }

  console.log('4) Storm analysis endpoint (optional, needs API + storm echo)...');
  try {
    const analysisRes = await fetch(
      `http://localhost:3010/api/weather/storm-analysis?lat=${STL_LAT}&lon=${STL_LON}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!analysisRes.ok) {
      console.log(`   skipped — storm-analysis HTTP ${analysisRes.status}`);
    } else {
      const analysis = await analysisRes.json();
      if (!analysis.hasStorm) {
        console.log('   skipped — no storm echo at probe coordinates');
      } else {
        for (const cam of [...(analysis.cameras ?? []), ...(analysis.cameraPool ?? [])]) {
          assert(!isModotTrafficCamera(cam), `MoDOT camera in storm-analysis: ${cam.id}`);
          assert(
            cam.mediaType === 'hls' || cam.mediaType === 'youtube',
            `storm-analysis must be live-only, got ${cam.mediaType} for ${cam.id}`
          );
        }
        console.log(`   OK ${analysis.cameras?.length ?? 0} live cameras in storm-analysis`);
      }
    }
  } catch {
    console.log('   skipped — API not reachable on :3010');
  }

  console.log('\nAll smoke checks passed.');
}

main().catch((err) => {
  console.error('\nSMOKE TEST FAILED:', err.message);
  process.exit(1);
});
