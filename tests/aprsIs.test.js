import test from 'node:test';
import assert from 'node:assert/strict';
import { aprsPasscode, parseAprsPacket, parseAprsPosition, readAprsIsCredentials } from '../api/lib/aprsIs.js';

test('aprsPasscode matches standard APRS-IS algorithm', () => {
  assert.equal(aprsPasscode('N0CALL'), 20131);
});

test('readAprsIsCredentials requires callsign', () => {
  const prev = process.env.APRS_CALLSIGN;
  delete process.env.APRS_CALLSIGN;
  const creds = readAprsIsCredentials();
  assert.equal(creds.configured, false);
  if (prev) process.env.APRS_CALLSIGN = prev;
});

test('parseAprsPosition handles slashless APRS coordinates', () => {
  const parsed = parseAprsPosition('!3820.53NW09130.33WiRNG0001/A=000010 70cm Voice');
  assert.ok(parsed);
  assert.ok(Math.abs(parsed.lat - 38.342) < 0.01);
  assert.ok(Math.abs(parsed.lon + 91.5055) < 0.01);
});

test('parseAprsPacket extracts callsign and comment', () => {
  const line =
    'W9BNSF-7>APRS,TCPIP*,qAC,T2STL:!3820.53NW09130.33W/BNSF manifest 45mph';
  const station = parseAprsPacket(line);
  assert.equal(station?.callsign, 'W9BNSF-7');
  assert.match(station?.comment || '', /BNSF/i);
});
