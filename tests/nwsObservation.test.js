import test from 'node:test';
import assert from 'node:assert/strict';
import { nwsTextToCondition } from '../api/lib/nwsObservation.js';

test('nwsTextToCondition returns two-word labels', () => {
  assert.equal(nwsTextToCondition('Mostly Clear'), 'mostly clear');
  assert.equal(nwsTextToCondition('Light Rain'), 'light rain');
  assert.equal(nwsTextToCondition('Thunderstorm in Vicinity'), 'nearby thunderstorm');
  assert.equal(
    nwsTextToCondition('', 'https://api.weather.gov/icons/land/day/tsra?size=medium'),
    'active thunderstorm'
  );
});
