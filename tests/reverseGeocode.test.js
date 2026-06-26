import test from 'node:test';
import assert from 'node:assert/strict';
import { abbreviateUsState, formatPlaceLabel } from '../lib/reverseGeocode.js';

test('formatPlaceLabel prefers city and state abbreviation', () => {
  assert.equal(
    formatPlaceLabel({ city: 'Joliet', state: 'Illinois' }),
    'Joliet, IL'
  );
  assert.equal(formatPlaceLabel({ town: 'Saint Peters', state: 'Missouri' }), 'Saint Peters, MO');
  assert.equal(formatPlaceLabel({ county: 'Cook County', state: 'Illinois' }), 'Cook County, IL');
});

test('abbreviateUsState keeps two-letter codes uppercase', () => {
  assert.equal(abbreviateUsState('il'), 'IL');
  assert.equal(abbreviateUsState('Illinois'), 'IL');
});
