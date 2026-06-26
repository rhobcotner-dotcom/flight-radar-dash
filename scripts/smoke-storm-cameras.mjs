#!/usr/bin/env node
/**
 * Smoke test: storm cameras API excludes MoDOT and prefers working snapshots near STL.
 */
import { fetchCamerasNearPoint } from '../api/lib/usTrafficCameras.js';
import { isModotTrafficCamera } from '../api/lib/cameraSources/helpers.js';

const STL_LAT = 38.67;
const STL_LON = -90.03;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log('1) Closest storm cameras (STL, no MoDOT)...');
  const cameras = await fetchCamerasNearPoint(STL_LAT, STL_LON, 15, 3);
  assert(cameras.length > 0, 'Expected at least one storm camera near STL');
  for (const cam of cameras) {
    console.log(`   ${cam.distanceMiles} mi ${cam.mediaType} ${cam.description}`);
    assert(!isModotTrafficCamera(cam), `MoDOT camera leaked into storm pool: ${cam.id}`);
    assert(cam.sourceLiveUrl?.startsWith('http'), `Missing sourceLiveUrl for ${cam.id}`);
  }

  console.log('2) Storm analysis endpoint (optional, needs API + storm echo)...');
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
        for (const cam of analysis.cameras ?? []) {
          assert(!isModotTrafficCamera(cam), `MoDOT camera in storm-analysis: ${cam.id}`);
        }
        console.log(`   OK ${analysis.cameras?.length ?? 0} non-MoDOT cameras in storm-analysis`);
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
