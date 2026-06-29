import test from 'node:test';
import assert from 'node:assert/strict';
import { mapFlightRouteSubLabel } from '../lib/flightRouteLabels.js';

const stlDenver = {
  orig_city: 'St. Louis',
  orig_lat: 38.7487,
  orig_lon: -90.37,
  dest_city: 'Denver',
  dest_lat: 39.8561,
  dest_lon: -104.6737,
};

test('mapFlightRouteSubLabel is blank en route above 4000 ft', () => {
  assert.equal(
    mapFlightRouteSubLabel({
      ...stlDenver,
      lat: 39.5,
      lon: -96.2,
      alt: 32000,
      track: 270,
      vspeed: 0,
    }),
    null
  );
});

test('mapFlightRouteSubLabel stays blank near departure without low-altitude directional match', () => {
  assert.equal(
    mapFlightRouteSubLabel({
      ...stlDenver,
      lat: 38.78,
      lon: -90.42,
      alt: 4500,
      track: 280,
      vspeed: 0,
    }),
    null
  );
});

test('mapFlightRouteSubLabel stays blank near landing without low-altitude directional match', () => {
  assert.equal(
    mapFlightRouteSubLabel({
      ...stlDenver,
      lat: 39.75,
      lon: -104.8,
      alt: 6000,
      track: 90,
      vspeed: 0,
    }),
    null
  );
});

test('mapFlightRouteSubLabel infers going to when heading away from origin below 4000 ft', () => {
  const label = mapFlightRouteSubLabel({
    ...stlDenver,
    lat: 38.85,
    lon: -90.25,
    alt: 1800,
    track: 43,
    vspeed: 0,
  });
  assert.deepEqual(label, { text: 'to Denver', tone: 'to' });
});

test('mapFlightRouteSubLabel infers coming from when heading toward destination below 4000 ft', () => {
  const label = mapFlightRouteSubLabel({
    ...stlDenver,
    lat: 39.2,
    lon: -100.5,
    alt: 2200,
    track: 285,
    vspeed: 0,
  });
  assert.deepEqual(label, { text: 'from St. Louis', tone: 'from' });
});

test('mapFlightRouteSubLabel stays blank below 4000 ft without directional match', () => {
  assert.equal(
    mapFlightRouteSubLabel({
      ...stlDenver,
      lat: 39.2,
      lon: -100.5,
      alt: 2200,
      track: 90,
      vspeed: 0,
    }),
    null
  );
});

test('mapFlightRouteSubLabel stays blank on STL approach without route origin', () => {
  assert.equal(
    mapFlightRouteSubLabel({
      callsign: 'FFT7',
      lat: 38.804901,
      lon: -90.474263,
      alt: 1800,
      track: 122,
      vspeed: -960,
    }),
    null
  );
});

test('mapFlightRouteSubLabel shows origin on ORD approach when route is known', () => {
  const label = mapFlightRouteSubLabel({
    orig_city: 'Denver',
    orig_lat: 39.8561,
    orig_lon: -104.6737,
    dest_lat: 41.9786,
    dest_lon: -87.9048,
    dest_inferred: true,
    lat: 41.97,
    lon: -88.15,
    alt: 2500,
    track: 90,
    vspeed: 0,
  });
  assert.deepEqual(label, { text: 'from Denver', tone: 'from' });
});

test('mapFlightRouteSubLabel shows origin on STL approach when route is known', () => {
  const label = mapFlightRouteSubLabel({
    orig_city: 'Philadelphia',
    orig_lat: 39.87,
    orig_lon: -75.24,
    dest_lat: 38.7487,
    dest_lon: -90.37,
    dest_inferred: true,
    lat: 38.78,
    lon: -90.42,
    alt: 1800,
    track: 135,
    vspeed: 0,
  });
  assert.deepEqual(label, { text: 'from Philadelphia', tone: 'from' });
});

test('mapFlightRouteSubLabel shows origin on STL approach when adsbdb destination is wrong', () => {
  const label = mapFlightRouteSubLabel({
    orig_city: 'Minneapolis',
    orig_lat: 44.883,
    orig_lon: -93.222,
    dest_city: 'Rochester',
    dest_iata: 'RST',
    dest_lat: 43.908,
    dest_lon: -92.5,
    lat: 38.79,
    lon: -90.62,
    alt: 1250,
    track: 122,
    vspeed: -900,
  });
  assert.deepEqual(label, { text: 'from Minneapolis', tone: 'from' });
});

test('mapFlightRouteSubLabel shows destination on STL to BLV departure not from STL', () => {
  const label = mapFlightRouteSubLabel({
    orig_city: 'St. Louis',
    orig_iata: 'STL',
    orig_lat: 38.7487,
    orig_lon: -90.37,
    dest_city: 'Scott AFB',
    dest_iata: 'BLV',
    dest_lat: 38.54,
    dest_lon: -89.845,
    lat: 38.76,
    lon: -90.34,
    alt: 3700,
    track: 110,
    vspeed: 900,
  });
  assert.deepEqual(label, { text: 'to Scott AFB', tone: 'to' });
});

test('mapFlightRouteSubLabel shows destination on STL departure when route is known', () => {
  const label = mapFlightRouteSubLabel({
    dest_city: 'Denver',
    dest_lat: 39.8561,
    dest_lon: -104.6737,
    orig_lat: 38.7487,
    orig_lon: -90.37,
    orig_inferred: true,
    lat: 38.78,
    lon: -90.42,
    alt: 1800,
    track: 285,
    vspeed: 0,
  });
  assert.deepEqual(label, { text: 'to Denver', tone: 'to' });
});
