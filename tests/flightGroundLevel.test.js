import test from 'node:test';
import assert from 'node:assert/strict';
import { isGroundLevelFlight } from '../web/src/lib/flightGroundLevel.ts';

test('isGroundLevelFlight detects parked and taxiing aircraft', () => {
  assert.equal(isGroundLevelFlight({ alt: 0, gspeed: 0 }), true);
  assert.equal(isGroundLevelFlight({ alt: 50, gspeed: 25 }), true);
  assert.equal(isGroundLevelFlight({ alt: 300, gspeed: 20 }), true);
});

test('isGroundLevelFlight excludes takeoff and landing roll', () => {
  assert.equal(isGroundLevelFlight({ alt: 50, gspeed: 120 }), false);
  assert.equal(isGroundLevelFlight({ alt: 1500, gspeed: 140 }), false);
});

test('isGroundLevelFlight ignores missing altitude', () => {
  assert.equal(isGroundLevelFlight({ gspeed: 0 }), false);
});
