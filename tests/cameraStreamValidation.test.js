import test from 'node:test';
import assert from 'node:assert/strict';
import { isKnownDeadStream, isKnownGoodStream } from '../api/lib/cameraStreamValidation.js';

test('regional camera pool excludes unprobed HLS streams', () => {
  const unknownHls = 'https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_999/playlist.m3u8';
  assert.equal(isKnownGoodStream(unknownHls), false);
  assert.equal(isKnownDeadStream(unknownHls), false);
});

test('known dead streams stay filtered out', () => {
  const url = 'https://example.dot.gov/cam/dead/playlist.m3u8';
  assert.equal(isKnownDeadStream(url), false);
});
