import test from 'node:test';
import assert from 'node:assert/strict';
import { isB52, isLikelyMilGov, resolveMilPhotoType } from '../lib/military.js';
import { mergeB52Flights } from '../api/lib/b52Watch.js';

test('resolveMilPhotoType maps bomber and tanker families', () => {
  assert.equal(resolveMilPhotoType('B52H'), 'B52');
  assert.equal(resolveMilPhotoType('B1B'), 'B1B');
  assert.equal(resolveMilPhotoType('KC135R'), 'KC135');
  assert.equal(resolveMilPhotoType('C30J'), 'C130');
  assert.equal(resolveMilPhotoType('F35A'), 'F35');
});

test('isB52 detects stratofortress types only', () => {
  assert.equal(isB52({ type: 'B52H' }), true);
  assert.equal(isB52({ type: 'B52' }), true);
  assert.equal(isB52({ type: 'B1B' }), false);
});

test('isLikelyMilGov still flags military callsigns and regs', () => {
  assert.equal(isLikelyMilGov({ callsign: 'RCH123' }), true);
  assert.equal(isLikelyMilGov({ reg: 'AF12345' }), true);
  assert.equal(isLikelyMilGov({ type: 'C17' }), true);
});

test('mergeB52Flights deduplicates by hex and keeps enriched fields', () => {
  const merged = mergeB52Flights(
    [{ hex: 'abc123', type: 'B52', lat: 1, lon: 2 }],
    [{ hex: 'abc123', type: 'B52H', lat: 1, lon: 2, reg: '61-0001' }]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].reg, '61-0001');
  assert.equal(merged[0].type, 'B52H');
});
