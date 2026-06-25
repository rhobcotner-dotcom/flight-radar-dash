import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAircraftPhotoUrl } from '../api/lib/aircraftImages.js';
import { resolveAirlineLiveryPhotoUrl } from '../api/lib/aircraftLiveryImages.js';
import { resolveAircraftTypeImageUrl } from '../api/lib/aircraftTypeImages.js';
import { resolveAircraftTypeCandidates } from '../lib/aircraftTypeFallback.js';

test('resolveAircraftTypeCandidates walks exact and family fallbacks', () => {
  const candidates = resolveAircraftTypeCandidates('B38M');
  assert.equal(candidates[0], 'B38M');
  assert.ok(candidates.includes('B738'));
  assert.ok(resolveAircraftTypeCandidates('C25A').includes('C560'));
});

test('resolveAircraftPhotoUrl finds known registration photos', async () => {
  const url = await resolveAircraftPhotoUrl({ reg: 'N628TS', hex: 'a835af', type: 'G650' });
  assert.ok(url);
  assert.match(url, /plnspttrs|airport-data|jetphotos|images/i);
});

test('resolveAircraftPhotoUrl resolves hex-only via registry lookup', async () => {
  const url = await resolveAircraftPhotoUrl({ hex: 'a835af', type: 'G650' });
  assert.ok(url);
});

test('resolveAircraftTypeImageUrl finds Boeing 737 family photo', async () => {
  const match = await resolveAircraftTypeImageUrl('B38M');
  assert.ok(match?.url);
});

test('resolveAirlineLiveryPhotoUrl finds representative airline livery art', async () => {
  const match = await resolveAirlineLiveryPhotoUrl({ airline: 'SWA', type: 'B738' });
  assert.ok(match?.url);
  assert.match(match.url, /Southwest|southwest/i);
});
