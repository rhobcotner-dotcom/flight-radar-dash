import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMetroVehicleLabel,
  formatDirectionLabel,
  vehicleStatusLabel,
  buildTripUpdateIndex,
  enrichVehicleRow,
  occupancyStatusLabel,
  formatOccupancyPercentage,
  resolveOccupancyLabel,
} from '../api/lib/gtfsTransitDetails.js';

test('parseMetroVehicleLabel splits MetroLink style labels', () => {
  assert.deepEqual(parseMetroVehicleLabel('49 Lindbergh - WEST'), {
    routeLabel: '49 Lindbergh',
    lineCode: '49',
    headsign: 'Lindbergh',
    lineName: null,
    direction: 'Westbound',
  });
  assert.deepEqual(parseMetroVehicleLabel('2 Red - NORTH'), {
    routeLabel: '2 Red',
    lineCode: '2',
    headsign: 'Red Line',
    lineName: 'Red Line',
    direction: 'Northbound',
  });
  assert.deepEqual(parseMetroVehicleLabel('34 Earth City - COUNTERCLOCKWISE').direction, 'Counter-clockwise');
});

test('formatDirectionLabel normalizes compass and loop directions', () => {
  assert.equal(formatDirectionLabel('EAST'), 'Eastbound');
  assert.equal(formatDirectionLabel('CLOCKWISE'), 'Clockwise');
});

test('vehicleStatusLabel maps GTFS current status codes', () => {
  assert.equal(vehicleStatusLabel(1), 'Stopped at station');
  assert.equal(vehicleStatusLabel(2), 'In service');
});

test('buildTripUpdateIndex and enrichVehicleRow attach stop context', () => {
  const index = buildTripUpdateIndex({
    entity: [
      {
        tripUpdate: {
          trip: { tripId: '123', routeId: '19688', startTime: '17:58:00', startDate: '20260628' },
          stopTimeUpdate: [
            { stopId: '100', departure: { time: '1000', delay: 120 } },
            { stopId: '200', departure: { time: `${Math.floor(Date.now() / 1000) + 300}`, delay: 120 } },
            { stopId: '300', departure: { time: '5000', delay: 0 } },
          ],
        },
      },
    ],
  });

  const enriched = enrichVehicleRow(
    {
      vehicleId: '3831',
      label: '49 Lindbergh - WEST',
      tripId: '123',
      routeId: '19688',
      lat: 38.6,
      lon: -90.2,
      timestampSec: Math.floor(Date.now() / 1000),
      currentStatus: 2,
    },
    {
      tripIndex: index,
      stopNameLookup: (id) => (id === '100' ? 'Forest Park' : id === '300' ? 'Shiloh-Scott' : null),
    }
  );

  assert.equal(enriched.headsign, 'Lindbergh');
  assert.equal(enriched.direction, 'Westbound');
  assert.equal(enriched.tripStartTime, '5:58 PM · 06/28/2026');
  assert.equal(enriched.originStop?.name, 'Forest Park');
  assert.equal(enriched.destStop?.name, 'Shiloh-Scott');
  assert.ok(enriched.nextStop?.name);
  assert.equal(enriched.delayMinutes, 2);
  assert.equal(enriched.previousStop?.name, 'Forest Park');
  assert.equal(enriched.stopsRemaining, 2);
});

test('occupancyStatusLabel handles enum strings and ignores unset defaults', () => {
  assert.equal(occupancyStatusLabel('MANY_SEATS_AVAILABLE'), 'Many seats available');
  assert.equal(occupancyStatusLabel('NO_DATA_AVAILABLE'), null);
  assert.equal(occupancyStatusLabel(0, { present: false }), null);
  assert.equal(occupancyStatusLabel(0, { present: true }), 'Empty');
  assert.equal(formatOccupancyPercentage(40, true), '40% full');
  assert.equal(formatOccupancyPercentage(0, false), null);
});

test('resolveOccupancyLabel prefers vehicle status and percentage', () => {
  assert.equal(
    resolveOccupancyLabel({
      occupancyStatus: 'FEW_SEATS_AVAILABLE',
      occupancyStatusPresent: true,
      occupancyPercentage: 40,
      occupancyPercentagePresent: true,
    }),
    'Few seats available · 40% full'
  );
  assert.equal(
    resolveOccupancyLabel(
      { occupancyStatusPresent: false },
      { code: 'STANDING_ROOM_ONLY', present: true }
    ),
    'Standing room only'
  );
});
