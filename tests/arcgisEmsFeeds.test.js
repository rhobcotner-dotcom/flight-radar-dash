import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchArcgisEmsIncidents } from '../api/lib/arcgisEmsFeeds.js';
import { fetchEmsIncidents } from '../api/lib/emsIncidentFeeds.js';

test('fetchArcgisEmsIncidents returns San Diego CAD incidents in bbox', async () => {
  const bbox = { west: -117.5, south: 32.5, east: -116.9, north: 33.2 };
  const result = await fetchArcgisEmsIncidents(bbox);
  assert.ok(result.count > 0, 'expected San Diego live CAD incidents');
  assert.ok(result.incidents.every((i) => Number.isFinite(i.lat) && Number.isFinite(i.lon)));
  assert.equal(result.incidents[0].source, 'san-diego-sdfd-cad');
});

test('fetchEmsIncidents merges Socrata and ArcGIS sources', async () => {
  const bbox = { west: -122.5, south: 47.5, east: -122.2, north: 47.7 };
  const result = await fetchEmsIncidents(bbox);
  assert.ok(result.count > 0);
  assert.ok(result.sources.socrata?.count > 0 || result.sources.arcgis?.count > 0);
  assert.ok(Array.isArray(result.feeds));
});
