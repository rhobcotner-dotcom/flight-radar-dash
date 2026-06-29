import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptPulsePointPayload } from '../api/lib/pulsePointCrypto.js';

test('decrypts PulsePoint error payloads from the v1 webapp API', async () => {
  const res = await fetch('https://api.pulsepoint.org/v1/webapp?resource=incidents&agency_id=bad');
  const body = await res.json();
  const decoded = decryptPulsePointPayload(body);
  assert.ok(decoded.StatusCode);
  assert.ok(decoded.StatusMessage);
});
