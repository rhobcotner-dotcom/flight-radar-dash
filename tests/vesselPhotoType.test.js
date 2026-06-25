import test from 'node:test';
import assert from 'node:assert/strict';
import { inferVesselPhotoType, pickVariantPhotoUrl } from '../lib/vesselPhotoType.js';

test('inferVesselPhotoType detects inland towboats from Axiom other type', () => {
  const photoType = inferVesselPhotoType({
    rawVesselType: 'other',
    typeLabel: 'Ship',
    name: 'AARON F BARRETT',
    lengthMeters: 358,
  });
  assert.equal(photoType, 'towboat');
});

test('pickVariantPhotoUrl returns stable but varied photos per vessel', () => {
  const photos = {
    towboat: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'],
  };
  const a = pickVariantPhotoUrl('towboat', 'AARON F BARRETT', photos);
  const b = pickVariantPhotoUrl('towboat', 'MAE ETTA HINES', photos);
  const c = pickVariantPhotoUrl('towboat', 'AARON F BARRETT', photos);
  assert.notEqual(a, b);
  assert.equal(a, c);
});
