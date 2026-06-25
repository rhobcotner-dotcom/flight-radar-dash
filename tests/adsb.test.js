import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdsbAircraft } from '../api/lib/adsbNormalize.js';
import { milesToNauticalMiles } from '../api/adsb-client.js';

test('normalizeAdsbAircraft maps readsb fields to dashboard flight shape', () => {
  const flight = normalizeAdsbAircraft({
    hex: 'abdc9b',
    flight: 'SWA140  ',
    r: 'N8632A',
    t: 'B738',
    alt_baro: 25925,
    gs: 473.6,
    track: 102.69,
    baro_rate: -2112,
    squawk: '3030',
    lat: 38.800778,
    lon: -92.357605,
  });

  assert.equal(flight?.callsign, 'SWA140');
  assert.equal(flight?.reg, 'N8632A');
  assert.equal(flight?.type, 'B738');
  assert.equal(flight?.source, 'adsb.lol');
});

test('milesToNauticalMiles converts radius for adsb.lol point queries', () => {
  assert.ok(milesToNauticalMiles(85) > 73);
  assert.ok(milesToNauticalMiles(85) < 75);
});
