import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOverheadSatellites } from '../api/lib/satellites.js';

test('fetchOverheadSatellites returns sorted overhead objects', async () => {
  const payload = await fetchOverheadSatellites(
    { lat: 38.7851, lon: -90.5831, name: 'Home' },
    { minElevation: 0, maxResults: 5 }
  );

  assert.ok(payload.count >= 0);
  assert.ok(Array.isArray(payload.satellites));
  assert.equal(typeof payload.catalogSize, 'number');
  assert.ok(payload.catalogSize > 0);

  if (payload.satellites.length > 1) {
    assert.ok(payload.satellites[0].elevationDeg >= payload.satellites[1].elevationDeg);
  }

  for (const satellite of payload.satellites) {
    assert.ok(satellite.name);
    assert.ok(satellite.noradId);
    assert.ok(Number.isFinite(satellite.lat));
    assert.ok(Number.isFinite(satellite.lon));
    assert.ok(satellite.elevationDeg >= 0);
  }
});
