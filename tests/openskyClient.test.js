import test from 'node:test';
import assert from 'node:assert/strict';
import { isOpenSkyAvailable, isOpenSkyConfigured } from '../api/lib/openskyClient.js';

test('isOpenSkyConfigured is false without credentials', () => {
  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;
  delete process.env.OPENSKY_USERNAME;
  delete process.env.OPENSKY_PASSWORD;

  assert.equal(isOpenSkyConfigured(), false);
  assert.equal(isOpenSkyAvailable(), false);

  if (username) process.env.OPENSKY_USERNAME = username;
  if (password) process.env.OPENSKY_PASSWORD = password;
});

test('isOpenSkyConfigured is true when username and password are set', () => {
  const username = process.env.OPENSKY_USERNAME;
  const password = process.env.OPENSKY_PASSWORD;
  process.env.OPENSKY_USERNAME = 'demo-user';
  process.env.OPENSKY_PASSWORD = 'demo-pass';

  assert.equal(isOpenSkyConfigured(), true);
  assert.equal(isOpenSkyAvailable(), true);

  if (username) process.env.OPENSKY_USERNAME = username;
  else delete process.env.OPENSKY_USERNAME;
  if (password) process.env.OPENSKY_PASSWORD = password;
  else delete process.env.OPENSKY_PASSWORD;
});
