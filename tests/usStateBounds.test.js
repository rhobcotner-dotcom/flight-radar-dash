import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAgenciesByBbox, filterIncidentsToBbox, statesOverlappingBbox } from '../lib/usStateBounds.js';

test('statesOverlappingBbox includes Illinois and Indiana for Chicago viewport', () => {
  const states = statesOverlappingBbox({ west: -88.5, south: 41.4, east: -87.2, north: 42.2 });
  assert.ok(states.includes('IL'));
  assert.ok(states.includes('IN'));
});

test('filterAgenciesByBbox keeps agencies in overlapping states only', () => {
  const agencies = [
    { id: 'a', state: 'IL', city: 'Chicago' },
    { id: 'b', state: 'CA', city: 'Los Angeles' },
    { id: 'c', state: 'IN', city: 'Indianapolis' },
  ];
  const bbox = { west: -88.5, south: 41.4, east: -87.2, north: 42.2 };
  const scoped = filterAgenciesByBbox(agencies, bbox);
  assert.deepEqual(
    scoped.map((row) => row.id),
    ['a', 'c']
  );
});

test('filterIncidentsToBbox clips incidents to map bounds', () => {
  const incidents = [
    { id: 'in', lat: 41.88, lon: -87.63 },
    { id: 'out', lat: 38.6, lon: -90.2 },
  ];
  const bbox = { west: -88.5, south: 41.4, east: -87.2, north: 42.2 };
  assert.deepEqual(
    filterIncidentsToBbox(incidents, bbox).map((row) => row.id),
    ['in']
  );
});
