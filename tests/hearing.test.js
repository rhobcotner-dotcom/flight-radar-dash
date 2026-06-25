import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyFlightPhase,
  estimateGroundLevelDb,
  predictAudibleFlights,
  resolveNoiseCategory,
} from '../api/lib/hearingPredictor.js';

const observer = { lat: 38.787, lon: -90.629 };

test('resolveNoiseCategory maps common STL traffic types', () => {
  assert.equal(resolveNoiseCategory('B738'), 'narrowbody');
  assert.equal(resolveNoiseCategory('E75L'), 'regional_jet');
  assert.equal(resolveNoiseCategory('C172'), 'light_ga');
  assert.equal(resolveNoiseCategory(''), 'unknown_jet');
});

test('classifyFlightPhase uses altitude and vertical speed', () => {
  assert.equal(classifyFlightPhase({ alt: 50, vspeed: 0 }), 'ground');
  assert.equal(classifyFlightPhase({ alt: 2200, vspeed: -900 }), 'approach_low');
  assert.equal(classifyFlightPhase({ alt: 12000, vspeed: 1200 }), 'takeoff_climb');
  assert.equal(classifyFlightPhase({ alt: 32000, vspeed: 0 }), 'cruise_overhead');
});

test('estimateGroundLevelDb is louder for low heavy jets than high cruise', () => {
  const lowApproach = estimateGroundLevelDb(
    {
      lat: 38.79,
      lon: -90.63,
      alt: 2500,
      vspeed: -1200,
      track: 270,
      gspeed: 260,
      type: 'B772',
    },
    observer
  );

  const highCruise = estimateGroundLevelDb(
    {
      lat: 38.79,
      lon: -90.63,
      alt: 34000,
      vspeed: 0,
      track: 270,
      gspeed: 450,
      type: 'B772',
    },
    observer
  );

  assert.ok(lowApproach.estimatedDb > highCruise.estimatedDb);
  assert.equal(lowApproach.categoryKey, 'widebody');
});

test('distant high-altitude traffic over the city is not indoor-audible', () => {
  const overStLouis = estimateGroundLevelDb(
    {
      lat: 38.63,
      lon: -90.21,
      alt: 9325,
      vspeed: -900,
      track: 270,
      gspeed: 280,
      type: 'B738',
    },
    observer
  );

  const farWidebody = estimateGroundLevelDb(
    {
      lat: 38.55,
      lon: -90.15,
      alt: 10525,
      vspeed: -700,
      track: 250,
      gspeed: 300,
      type: 'B744',
    },
    observer
  );

  assert.ok(overStLouis.horizontalMiles > 15);
  assert.ok(overStLouis.estimatedDb < 48);
  assert.ok(farWidebody.estimatedDb < 48);
});

test('medium-high approach several miles away is not indoor-audible', () => {
  const stlApproach = estimateGroundLevelDb(
    {
      lat: 38.74,
      lon: -90.58,
      alt: 7775,
      vspeed: -900,
      track: 270,
      gspeed: 196,
      type: 'A319',
    },
    observer
  );

  assert.ok(stlApproach.horizontalMiles > 4);
  assert.ok(stlApproach.estimatedDb < 52);
});

test('nearby low approach traffic can be indoor-audible', () => {
  const nearbyApproach = estimateGroundLevelDb(
    {
      lat: 38.79,
      lon: -90.63,
      alt: 2800,
      vspeed: -1200,
      track: 90,
      gspeed: 240,
      type: 'B738',
    },
    observer
  );

  assert.ok(nearbyApproach.horizontalMiles < 2);
  assert.ok(nearbyApproach.estimatedDb >= 52);
});

test('predictAudibleFlights surfaces nearby descending jets but not distant cruise', () => {
  const predictions = predictAudibleFlights(
    [
      {
        hex: 'abc123',
        callsign: 'SWA140',
        lat: 38.79,
        lon: -90.63,
        alt: 2800,
        vspeed: -1400,
        track: 90,
        gspeed: 280,
        type: 'B738',
      },
      {
        hex: 'mid123',
        callsign: 'AAL2714',
        lat: 38.74,
        lon: -90.58,
        alt: 7775,
        vspeed: -900,
        track: 270,
        gspeed: 196,
        type: 'A319',
      },
      {
        hex: 'def456',
        callsign: 'UAL999',
        lat: 38.55,
        lon: -90.15,
        alt: 36000,
        vspeed: 0,
        track: 180,
        gspeed: 460,
        type: 'B772',
      },
    ],
    observer
  );

  assert.ok(predictions.length >= 1);
  assert.equal(predictions[0].flight.callsign, 'SWA140');
  assert.ok(!predictions.some((prediction) => prediction.flight.callsign === 'UAL999'));
  assert.ok(!predictions.some((prediction) => prediction.flight.callsign === 'AAL2714'));
});
