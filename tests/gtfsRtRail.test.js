import test from 'node:test';
import assert from 'node:assert/strict';
import { extractVehiclePositions, fetchGtfsRtPayload } from '../api/lib/gtfsRtClient.js';
import { fetchRegionalRailTrains } from '../api/lib/gtfsRtRail.js';
import { matchesRailCallsign, RAIL_CALLSIGN_PATTERNS } from '../api/lib/aprsRail.js';

test('extractVehiclePositions drops zero coordinates', () => {
  const positions = extractVehiclePositions({
    entity: [
      {
        id: '1',
        vehicle: { position: { latitude: 0, longitude: 0 }, vehicle: { id: 'ghost' } },
      },
      {
        id: '2',
        vehicle: {
          position: { latitude: 39.74, longitude: -104.99, speed: 10, bearing: 90 },
          trip: { routeId: 'L' },
          vehicle: { id: '1201', label: '1201' },
        },
      },
    ],
  });

  assert.equal(positions.length, 1);
  assert.equal(positions[0].routeId, 'L');
});

test('fetchGtfsRtPayload decodes RTD Denver protobuf feed', async () => {
  const payload = await fetchGtfsRtPayload('https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.pb');
  const positions = extractVehiclePositions(payload.message);
  assert.ok(positions.length > 50, `expected RTD vehicles, got ${positions.length}`);
});

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

test('fetchRegionalRailTrains includes RTD light rail near Denver when in viewport', async () => {
  const payload = await fetchRegionalRailTrains({ lat: 39.74, lon: -104.99, radiusMiles: 40 }, 40);
  const rtd = payload.trains.filter((train) => train.sourceLabel === 'RTD');
  assert.ok(rtd.length > 5, `expected RTD trains near Denver, got ${rtd.length}`);
  assert.ok(rtd.every((train) => train.trainKind === 'light_rail'));
});

test('RAIL_CALLSIGN_PATTERNS flags known railroad callsigns', () => {
  assert.ok(RAIL_CALLSIGN_PATTERNS.length > 5);
  assert.ok(matchesRailCallsign('BNSF123'));
  assert.ok(matchesRailCallsign('CSX42'));
  assert.equal(matchesRailCallsign('K0XYZ'), false);
});
