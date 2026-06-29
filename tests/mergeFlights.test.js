import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeFlightList } from '../web/src/lib/mergeFlights.ts';

test('mergeFlightList preserves route fields on fast refresh without enrich', () => {
  const prev = [
    {
      hex: 'abc123',
      lat: 38.7,
      lon: -90.5,
      alt: 2500,
      track: 118,
      orig_city: 'Los Angeles',
      orig_lat: 33.9425,
      orig_lon: -118.408,
      dest_city: 'St. Louis',
      dest_lat: 38.7487,
      dest_lon: -90.37,
      carrierName: 'Southwest Airlines',
    },
  ];
  const incoming = [
    {
      hex: 'abc123',
      lat: 38.71,
      lon: -90.49,
      alt: 2620,
      track: 120,
      carrierName: 'Southwest Airlines',
    },
  ];

  const merged = mergeFlightList(prev, incoming);
  assert.equal(merged[0].orig_city, 'Los Angeles');
  assert.equal(merged[0].dest_city, 'St. Louis');
  assert.equal(merged[0].alt, 2620);
  assert.equal(merged[0].track, 120);
});

test('mergeFlightList applies enriched route updates from background refresh', () => {
  const prev = [
    {
      hex: 'abc123',
      lat: 38.7,
      lon: -90.5,
      alt: 2500,
      carrierName: 'Southwest Airlines',
    },
  ];
  const incoming = [
    {
      hex: 'abc123',
      lat: 38.7,
      lon: -90.5,
      alt: 2500,
      orig_city: 'Los Angeles',
      orig_lat: 33.9425,
      orig_lon: -118.408,
      dest_city: 'St. Louis',
      dest_lat: 38.7487,
      dest_lon: -90.37,
      carrierName: 'Southwest Airlines',
    },
  ];

  const merged = mergeFlightList(prev, incoming);
  assert.equal(merged[0].orig_city, 'Los Angeles');
  assert.equal(merged[0].dest_city, 'St. Louis');
});
