import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nearestPointOnPolyline,
  simplifyLineCoordinates,
} from '../api/lib/overpassQuery.js';
import {
  bboxesOverlap,
  clearRailNetworkCacheForTests,
  getRailNetworkForBbox,
  normalizeRailOperator,
  primeRailNetworkRegion,
  segmentsToGeoJson,
} from '../api/lib/railNetwork.js';
import { snapToNearestTrack } from '../api/lib/aprsRail.js';

test('normalizeRailOperator maps common OSM operator strings', () => {
  assert.equal(normalizeRailOperator('BNSF Railway'), 'BNSF');
  assert.equal(normalizeRailOperator('Union Pacific Railroad'), 'UP');
  assert.equal(normalizeRailOperator('Norfolk Southern Railway'), 'NS');
  assert.equal(normalizeRailOperator('Canadian Pacific / CPKC'), 'CPKC');
  assert.equal(normalizeRailOperator('Amtrak'), 'AMTK');
  assert.equal(normalizeRailOperator('MetroLink'), 'MetroLink');
});

test('simplifyLineCoordinates reduces dense polylines', () => {
  const dense = Array.from({ length: 20 }, (_, i) => [-90.6 + i * 0.0001, 38.6]);
  const simplified = simplifyLineCoordinates(dense, 50);
  assert.ok(simplified.length < dense.length);
  assert.equal(simplified[0][0], dense[0][0]);
  assert.equal(simplified.at(-1)?.[0], dense.at(-1)?.[0]);
});

test('nearestPointOnPolyline finds closest point on segment', () => {
  const line = [
    [-90.63, 38.79],
    [-90.62, 38.79],
  ];
  const hit = nearestPointOnPolyline(38.7901, -90.625, line);
  assert.ok(hit);
  assert.ok(hit.distanceMiles < 0.05);
});

test('snapToNearestTrack snaps within 0.5 miles and infers railroad', () => {
  const network = [
    {
      id: '1',
      railwayType: 'rail',
      operator: 'BNSF Railway',
      name: 'Main',
      coordinates: [
        [-90.63, 38.79],
        [-90.62, 38.79],
      ],
    },
  ];
  const snap = snapToNearestTrack(38.7901, -90.625, network);
  assert.ok(snap.snappedLat);
  assert.ok(snap.snappedLon);
  assert.equal(snap.inferredRailroad, 'BNSF');
  assert.equal(snap.lat, 38.7901);
});

test('snapToNearestTrack leaves distant positions unchanged', () => {
  const network = [
    {
      id: '1',
      railwayType: 'rail',
      operator: 'BNSF Railway',
      name: 'Main',
      coordinates: [
        [-90.63, 38.79],
        [-90.62, 38.79],
      ],
    },
  ];
  const snap = snapToNearestTrack(38.5, -90.2, network);
  assert.equal(snap.snappedLat, null);
  assert.equal(snap.snappedLon, null);
});

test('getRailNetworkForBbox returns warmed STL segments', async () => {
  clearRailNetworkCacheForTests();
  await primeRailNetworkRegion('stl');
  const { segments, warming } = getRailNetworkForBbox({
    south: 38.6,
    west: -90.7,
    north: 38.9,
    east: -90.3,
  });
  assert.ok(segments.length > 100);
  assert.equal(warming, false);
  const geojson = segmentsToGeoJson(segments.slice(0, 1));
  assert.equal(geojson.type, 'FeatureCollection');
  assert.equal(geojson.features[0].geometry.type, 'LineString');
});

test('bboxesOverlap detects intersection', () => {
  assert.equal(
    bboxesOverlap(
      { south: 38.4, west: -91, north: 39.1, east: -90 },
      { south: 38.6, west: -90.7, north: 38.9, east: -90.3 }
    ),
    true
  );
  assert.equal(
    bboxesOverlap(
      { south: 38.4, west: -91, north: 39.1, east: -90 },
      { south: 40, west: -88, north: 41, east: -87 }
    ),
    false
  );
});
