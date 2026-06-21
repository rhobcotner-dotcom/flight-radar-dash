import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsFromCenter } from '../api/lib/bounds.js';

test('boundsFromCenter computes north,south,west,east string', () => {
  const result = boundsFromCenter(38.787, -90.629, 75);
  assert.ok(result.north > 38.787);
  assert.ok(result.south < 38.787);
  assert.ok(result.west < -90.629);
  assert.ok(result.east > -90.629);
  assert.equal(result.bounds, `${result.north},${result.south},${result.west},${result.east}`);
});

test('boundsFromCenter rejects invalid input', () => {
  assert.throws(() => boundsFromCenter('bad', -90, 75));
  assert.throws(() => boundsFromCenter(38, -90, 0));
});
