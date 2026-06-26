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

test('mapFlightRouteSubLabel is blank en route above 2500 ft', () => {
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

test('mapFlightRouteSubLabel shows destination within 30 mi of departure', () => {
  const label = mapFlightRouteSubLabel({
    ...stlDenver,
    lat: 38.78,
    lon: -90.42,
    alt: 4500,
    track: 280,
    vspeed: 0,
  });
  assert.deepEqual(label, { text: 'to Denver', tone: 'to' });
});

test('mapFlightRouteSubLabel shows origin within 50 mi of landing', () => {
  const label = mapFlightRouteSubLabel({
    ...stlDenver,
    lat: 39.75,
    lon: -104.8,
    alt: 6000,
    track: 90,
    vspeed: 0,
  });
  assert.deepEqual(label, { text: 'from St. Louis', tone: 'from' });
});

test('mapFlightRouteSubLabel infers going to when climbing away from origin below 2500 ft', () => {
  const label = mapFlightRouteSubLabel(
    {
      ...stlDenver,
      lat: 38.85,
      lon: -90.25,
      alt: 1800,
      track: 285,
      vspeed: 1200,
    },
    { altitudeTrend: 'up' }
  );
  assert.deepEqual(label, { text: 'to Denver', tone: 'to' });
});

test('mapFlightRouteSubLabel infers coming from when descending toward destination below 2500 ft', () => {
  const label = mapFlightRouteSubLabel(
    {
      ...stlDenver,
      lat: 39.2,
      lon: -100.5,
      alt: 2200,
      track: 285,
      vspeed: -900,
    },
    { altitudeTrend: 'down' }
  );
  assert.deepEqual(label, { text: 'from St. Louis', tone: 'from' });
});

test('mapFlightRouteSubLabel stays blank below 2500 ft without directional match', () => {
  assert.equal(
    mapFlightRouteSubLabel(
      {
        ...stlDenver,
        lat: 39.2,
        lon: -100.5,
        alt: 2200,
        track: 90,
        vspeed: -900,
      },
      { altitudeTrend: 'down' }
    ),
    null
  );
});

test('mapFlightRouteSubLabel infers STL approach when route lookup is missing', () => {
  const label = mapFlightRouteSubLabel({
    callsign: 'FFT7',
    lat: 38.804901,
    lon: -90.474263,
    alt: 1800,
    track: 122,
    vspeed: -960,
  });
  assert.deepEqual(label, { text: 'to St. Louis', tone: 'to' });
});
