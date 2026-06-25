import test from 'node:test';
import assert from 'node:assert/strict';
import { isAprsRailEntry, normalizeAprsRailTrain } from '../api/lib/aprsRail.js';

test('isAprsRailEntry matches expanded freight keywords', () => {
  assert.equal(isAprsRailEntry({ callsign: 'W9RR', comment: 'BNSF stack train 45mph' }), true);
  assert.equal(isAprsRailEntry({ callsign: 'K5ABC', comment: 'weather net' }), false);
});

test('normalizeAprsRailTrain extracts railroad from comment', () => {
  const train = normalizeAprsRailTrain({
    callsign: 'W9RR',
    comment: 'CSX unit train',
    lat: 38.6,
    lon: -90.2,
    course: 90,
    speed: 20,
    observedAt: '2026-06-22T12:00:00.000Z',
  });
  assert.equal(train?.railroad, 'CSX');
  assert.equal(train?.trainKind, 'freight');
});
