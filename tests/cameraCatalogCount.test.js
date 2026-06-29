import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNationwideCameraCatalogCount } from '../api/lib/usTrafficCameras.js';

test('resolveNationwideCameraCatalogCount uses full pool when not partial', () => {
  assert.equal(
    resolveNationwideCameraCatalogCount({ partial: false, cameras: new Array(41457) }, 879),
    41457
  );
});

test('resolveNationwideCameraCatalogCount keeps nationwide total when pool is regional partial', () => {
  assert.equal(
    resolveNationwideCameraCatalogCount({ partial: true, cameras: new Array(879) }, 41457),
    41457
  );
});

test('resolveNationwideCameraCatalogCount uses baseline before first full fetch', () => {
  assert.equal(
    resolveNationwideCameraCatalogCount({ partial: true, cameras: new Array(879) }, 0),
    41_000
  );
});

test('resolveNationwideCameraCatalogCount rises above baseline when inventory grows', () => {
  assert.equal(
    resolveNationwideCameraCatalogCount({ partial: false, cameras: new Array(42_500) }, 0),
    42_500
  );
});
