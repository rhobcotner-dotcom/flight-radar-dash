import test from 'node:test';
import assert from 'node:assert/strict';
import { inferenceAirportsNear } from '../lib/inferenceAirports.js';
import { inferLocalAirportEndpoints } from '../lib/localAirportInference.js';
import { mapFlightRouteSubLabel } from '../lib/flightRouteLabels.js';

test('inferenceAirportsNear finds ORD near western Chicago approach', () => {
  const nearby = inferenceAirportsNear(41.97, -88.15, 50);
  assert.ok(nearby.some((airport) => airport.iata === 'ORD'));
});

test('inferLocalAirportEndpoints infers aligned commercial airport on LAX approach', () => {
  const patch = inferLocalAirportEndpoints({
    lat: 33.75,
    lon: -119.2,
    alt: 2500,
    track: 90,
  });
  assert.equal(patch.dest_inferred, true);
  assert.ok(['LAX', 'SMO', 'HHR', 'LGB'].includes(patch.dest_iata));
});

test('inferLocalAirportEndpoints preserves route destination on hub departure climb', () => {
  const patch = inferLocalAirportEndpoints({
    orig_city: 'Los Angeles',
    orig_iata: 'LAX',
    orig_lat: 33.942501,
    orig_lon: -118.407997,
    dest_city: 'San Francisco',
    dest_iata: 'SFO',
    dest_lat: 37.6213,
    dest_lon: -122.379,
    lat: 33.98,
    lon: -118.32,
    alt: 3500,
    track: 319,
  });
  assert.deepEqual(patch, {});
});

test('inferLocalAirportEndpoints overrides stale route destination on STL approach', () => {
  const patch = inferLocalAirportEndpoints({
    orig_city: 'Minneapolis',
    dest_city: 'Rochester',
    dest_iata: 'RST',
    dest_lat: 43.908,
    dest_lon: -92.5,
    lat: 38.79,
    lon: -90.62,
    alt: 1250,
    track: 122,
  });
  assert.equal(patch.dest_inferred, true);
  assert.equal(patch.dest_lat, 38.748697);
});

test('mapFlightRouteSubLabel shows origin on nationwide LAX approach with route city', () => {
  const label = mapFlightRouteSubLabel({
    orig_city: 'Seattle',
    orig_lat: 47.45,
    orig_lon: -122.31,
    lat: 33.94,
    lon: -118.65,
    alt: 2500,
    track: 90,
  });
  assert.deepEqual(label, { text: 'from Seattle', tone: 'from' });
});
