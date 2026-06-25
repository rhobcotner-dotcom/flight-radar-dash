import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbToDbz } from '../api/lib/radarReflectivity.js';
import { compassLabel } from '../lib/geo.js';

test('rgbToDbz maps NEXRAD yellows to moderate reflectivity', () => {
  assert.equal(rgbToDbz(255, 255, 0), 35);
  assert.equal(rgbToDbz(255, 0, 0), 50);
});

test('rgbToDbz ignores transparent pixels', () => {
  assert.equal(rgbToDbz(0, 0, 0, 0), null);
});

test('compassLabel resolves cardinal directions', () => {
  assert.equal(compassLabel(0), 'N');
  assert.equal(compassLabel(90), 'E');
  assert.equal(compassLabel(225), 'SW');
});
