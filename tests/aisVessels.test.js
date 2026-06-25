import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aisVesselLengthMeters,
  isSignificantVessel,
} from '../lib/aisVesselFilter.js';

test('isSignificantVessel keeps cargo and tanker types', () => {
  assert.equal(isSignificantVessel({ shipType: 70, dimensionA: 80, dimensionB: 20 }), true);
  assert.equal(isSignificantVessel({ shipType: 80, dimensionA: 120, dimensionB: 30 }), true);
});

test('isSignificantVessel drops small pleasure and fishing craft', () => {
  assert.equal(isSignificantVessel({ shipType: 37, dimensionA: 8, dimensionB: 4 }), false);
  assert.equal(isSignificantVessel({ shipType: 30, dimensionA: 12, dimensionB: 3 }), false);
});

test('isSignificantVessel keeps large tugs by dimensions', () => {
  assert.equal(
    isSignificantVessel({ shipType: 52, dimensionA: 30, dimensionB: 20, draughtMeters: 5 }),
    true
  );
});

test('aisVesselLengthMeters sums bow and stern dimensions', () => {
  assert.equal(aisVesselLengthMeters({ dimensionA: 90, dimensionB: 25 }), 115);
});
