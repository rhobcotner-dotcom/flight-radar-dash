import assert from 'node:assert/strict';
import test from 'node:test';
import { alertWestImageUrl } from '../api/lib/cameraSources/weatherCamSources.js';

test('alertWestImageUrl builds CDN path from camera id and snapshot filename', () => {
  const url = alertWestImageUrl(12345, 'cam12345_1719345678_001.jpg');
  assert.equal(url, 'https://img.cdn.prod.alertwest.com/data/img/12345/2024/06/25/cam12345_1719345678_001.jpg');
});

test('alertWestImageUrl falls back to current date when filename has no epoch', () => {
  const url = alertWestImageUrl(99, 'snapshot.jpg');
  assert.match(url, /^https:\/\/img\.cdn\.prod\.alertwest\.com\/data\/img\/99\/\d{4}\/\d{2}\/\d{2}\/snapshot\.jpg$/);
});
