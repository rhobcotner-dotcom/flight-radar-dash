import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachViewportToArea,
  bboxRadiusMiles,
  filterInSearchRegion,
  maxAisVesselsForBbox,
  parseViewportBBox,
  pointInSearchRegion,
} from '../api/lib/viewportQuery.js';

test('parseViewportBBox reads map bounds from query', () => {
  const bbox = parseViewportBBox({
    west: '-95',
    south: '30',
    east: '-90',
    north: '35',
  });
  assert.deepEqual(bbox, { west: -95, south: 30, east: -90, north: 35 });
  assert.equal(parseViewportBBox({ west: '1', south: '2' }), null);
});

test('attachViewportToArea adds viewport search center', () => {
  const area = attachViewportToArea(
    { lat: 38.7, lon: -90.6, radiusMiles: 85 },
    { west: -74.5, south: 40.4, east: -73.5, north: 41.2 }
  );
  assert.ok(area.viewport);
  assert.ok(area.queryLat > 40 && area.queryLat < 41);
  assert.ok(area.queryLon < -73 && area.queryLon > -75);
  assert.ok(area.queryRadiusMiles > 20);
});

test('filterInSearchRegion uses viewport bbox instead of home radius', () => {
  const area = attachViewportToArea(
    { lat: 38.7, lon: -90.6, radiusMiles: 85 },
    { west: -74.5, south: 40.4, east: -73.5, north: 41.2 }
  );
  const trains = [
    { id: 'nyc', lat: 40.75, lon: -73.99 },
    { id: 'stl', lat: 38.7, lon: -90.6 },
  ];
  const inView = filterInSearchRegion(trains, area, 120);
  assert.deepEqual(
    inView.map((train) => train.id),
    ['nyc']
  );
});

test('pointInSearchRegion falls back to radius from home', () => {
  const area = { lat: 38.7, lon: -90.6, radiusMiles: 85 };
  assert.equal(pointInSearchRegion(38.7, -90.6, area, 120), true);
  assert.equal(pointInSearchRegion(40.7, -74.0, area, 120), false);
});

test('maxAisVesselsForBbox scales with viewport area', () => {
  assert.ok(
    maxAisVesselsForBbox({ west: -125, south: 24, east: -66, north: 50 }) >
      maxAisVesselsForBbox({ west: -90, south: 38, east: -89, north: 39 })
  );
});

test('bboxRadiusMiles covers viewport corners', () => {
  const radius = bboxRadiusMiles({ west: -74.5, south: 40.4, east: -73.5, north: 41.2 });
  assert.ok(radius > 25 && radius < 200);
});
