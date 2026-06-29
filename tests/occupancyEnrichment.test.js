import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enrichFlightOccupancy,
  enrichCrossingOccupancy,
  enrichFreightOccupancy,
  enrichVesselOccupancy,
  enrichAirQualityOccupancy,
  occupancyLevelFromLabel,
  isRealOccupancySource,
} from '../api/lib/occupancyEnrichment.js';

test('enrichFlightOccupancy uses aircraft type and phase', () => {
  const cruise = enrichFlightOccupancy({ type: 'B738', alt: 35000, gspeed: 440, lat: 38.5, lon: -90.2 });
  assert.match(cruise.occupancyLabel, /En route · ~189 seats/);
  assert.equal(cruise.alt, 35000);
  assert.equal(cruise.lat, 38.5);

  const ground = enrichFlightOccupancy({ type: 'A320', alt: 0, gspeed: 0, lat: 40.6, lon: -73.8 });
  assert.match(ground.occupancyLabel, /On ground/);
  assert.equal(ground.lat, 40.6);
});

test('enrichCrossingOccupancy marks blocked crossings as occupied', () => {
  const row = enrichCrossingOccupancy({
    trainKind: 'crossing',
    crossingStatus: 'blocked',
  });
  assert.match(row.occupancyLabel, /Crossing occupied/);
  assert.equal(row.occupancyLevel, 100);
});

test('enrichFreightOccupancy parses RailState loaded flag', () => {
  const loaded = enrichFreightOccupancy({ trainKind: 'freight', trainState: 'true' });
  assert.equal(loaded.occupancyLabel, 'Freight · loaded');

  const empty = enrichFreightOccupancy({ trainKind: 'freight', trainState: 'empty' });
  assert.equal(empty.occupancyLabel, 'Freight · empty');
});

test('enrichVesselOccupancy infers cargo from draft ratio vs type max', () => {
  const heavy = enrichVesselOccupancy({
    typeLabel: 'Cargo',
    draughtMeters: 8,
    lengthMeters: 50,
  });
  assert.match(heavy.occupancyLabel, /Deep draft|type max/);
  assert.equal(heavy.occupancySource, 'ais-draft-ratio');
});

test('enrichAirQualityOccupancy maps AQI to load labels', () => {
  const row = enrichAirQualityOccupancy({ usAqi: 165 });
  assert.match(row.occupancyLabel, /Unhealthy/);
});

test('occupancyLevelFromLabel maps GTFS crowding text', () => {
  assert.equal(occupancyLevelFromLabel('Few seats available · 40% full'), 40);
  assert.equal(occupancyLevelFromLabel('Standing room only'), 75);
});

test('isRealOccupancySource distinguishes measured vs inferred', () => {
  assert.equal(isRealOccupancySource('gtfs-rt'), true);
  assert.equal(isRealOccupancySource('adsb-phase'), false);
});
