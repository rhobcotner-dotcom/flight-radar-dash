import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMERGENCY_CALLOUT_MAX_AGE_MS,
  applyEmergencyMapFreshness,
  filterFreshIncidents,
  isEmergencyCalloutFresh,
  parseEmergencyObservedMs,
} from '../api/lib/emergencyFreshness.js';

test('parseEmergencyObservedMs handles ISO and epoch values', () => {
  const iso = '2026-06-29T12:00:00.000Z';
  assert.equal(parseEmergencyObservedMs(iso), Date.parse(iso));
  assert.equal(parseEmergencyObservedMs(1_700_000_000_000), 1_700_000_000_000);
  assert.equal(parseEmergencyObservedMs(1_700_000_000), 1_700_000_000_000);
});

test('isEmergencyCalloutFresh rejects incidents older than four hours', () => {
  const now = Date.parse('2026-06-29T12:00:00.000Z');
  const fresh = now - 2 * 60 * 60 * 1000;
  const stale = now - EMERGENCY_CALLOUT_MAX_AGE_MS - 1_000;
  assert.equal(isEmergencyCalloutFresh(fresh, now), true);
  assert.equal(isEmergencyCalloutFresh(stale, now), false);
  assert.equal(isEmergencyCalloutFresh(null, now), false);
});

test('filterFreshIncidents drops stale EMS callouts', () => {
  const now = Date.now();
  const incidents = filterFreshIncidents([
    { id: 'a', lat: 1, lon: 1, observedAt: new Date(now - 30 * 60 * 1000).toISOString() },
    { id: 'b', lat: 2, lon: 2, observedAt: new Date(now - 6 * 60 * 60 * 1000).toISOString() },
    { id: 'c', lat: 3, lon: 3 },
  ]);
  assert.deepEqual(
    incidents.map((row) => row.id),
    ['a']
  );
});

test('applyEmergencyMapFreshness filters map payload and updates summary counts', () => {
  const now = Date.now();
  const freshAt = new Date(now - 30 * 60 * 1000).toISOString();
  const staleAt = new Date(now - 6 * 60 * 60 * 1000).toISOString();

  const payload = applyEmergencyMapFreshness({
    cityEms: {
      incidents: [
        { id: 'fresh', lat: 1, lon: 1, observedAt: freshAt },
        { id: 'stale', lat: 2, lon: 2, observedAt: staleAt },
      ],
      count: 2,
    },
    nws: {
      collection: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            id: 'nws-fresh',
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
            properties: { effective: freshAt },
          },
          {
            type: 'Feature',
            id: 'nws-stale',
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
            properties: { effective: staleAt },
          },
        ],
      },
      count: 2,
    },
    summary: { cityEms: 2, nwsAlerts: 2 },
  });

  assert.equal(payload.cityEms.count, 1);
  assert.equal(payload.cityEms.incidents[0].id, 'fresh');
  assert.equal(payload.nws.count, 1);
  assert.equal(payload.summary.cityEms, 1);
  assert.equal(payload.summary.nwsAlerts, 1);
});
