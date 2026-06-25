import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRegionalRailTrains } from '../api/lib/gtfsRtRail.js';

test('fetchRegionalRailTrains includes MBTA nationwide positions near Boston', async () => {
  const payload = await fetchRegionalRailTrains({ lat: 42.36, lon: -71.06, radiusMiles: 30 }, 30);
  assert.ok(payload.trains.length > 10, 'expected MBTA trains near Boston');
  assert.ok(payload.sources.includes('mbta'));
  assert.ok(payload.trains.every((train) => train.trainKind === 'passenger'));
});

test('fetchRegionalRailTrains filters distant MBTA trains away from St Louis', async () => {
  const payload = await fetchRegionalRailTrains({ lat: 38.6, lon: -90.2, radiusMiles: 120 }, 120);
  const mbtaNearStl = payload.trains.filter((train) => train.sourceLabel === 'MBTA');
  assert.equal(mbtaNearStl.length, 0);
});
