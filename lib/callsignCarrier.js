import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.resolve(__dirname, '../config');

let prefixSetCache;

function loadKnownCallsignPrefixes() {
  if (prefixSetCache) return prefixSetCache;
  const overrides = JSON.parse(fs.readFileSync(path.join(configDir, 'airlines-overrides.json'), 'utf8'));
  const icaoIata = JSON.parse(fs.readFileSync(path.join(configDir, 'airlines-icao-iata.json'), 'utf8'));
  prefixSetCache = new Set([...Object.keys(overrides), ...Object.keys(icaoIata)]);
  return prefixSetCache;
}

export function normalizeCallsign(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isRegistrationCallsign(callsign) {
  const key = normalizeCallsign(callsign);
  return /^N[0-9A-Z]{1,6}$/.test(key);
}

export function inferAirlineIcaoFromCallsign(callsign) {
  const key = normalizeCallsign(callsign);
  if (!key || isRegistrationCallsign(key)) return null;

  const prefixes = loadKnownCallsignPrefixes();
  const match = key.match(/^([A-Z]{2,3})/);
  if (!match) return null;

  const three = key.slice(0, 3);
  if (prefixes.has(three)) return three;

  const two = key.slice(0, 2);
  if (prefixes.has(two)) return two;

  return null;
}

export function callsignPrefixLabel(callsign) {
  const key = normalizeCallsign(callsign);
  if (!key) return null;
  const prefix = key.match(/^([A-Z]{2,3})/)?.[1];
  return prefix || null;
}
