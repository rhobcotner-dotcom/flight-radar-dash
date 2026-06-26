import airlines from '../../../config/airlines-icao.json';
import overrides from '../../../config/airlines-overrides.json';
import icaoIata from '../../../config/airlines-icao-iata.json';
import type { Flight } from '../types';

const KNOWN_PREFIXES = new Set([...Object.keys(overrides), ...Object.keys(icaoIata as Record<string, string>)]);

export function normalizeCallsign(value?: string | null) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isRegistrationCallsign(callsign?: string | null) {
  const key = normalizeCallsign(callsign);
  return /^N[0-9A-Z]{1,6}$/.test(key);
}

export function inferAirlineIcaoFromCallsign(callsign?: string | null) {
  const key = normalizeCallsign(callsign);
  if (!key || isRegistrationCallsign(key)) return null;

  const three = key.slice(0, 3);
  if (KNOWN_PREFIXES.has(three)) return three;

  const two = key.slice(0, 2);
  if (KNOWN_PREFIXES.has(two)) return two;

  return null;
}

export function airlineIcao(flight: Flight) {
  return (
    flight.operating_as ||
    flight.painted_as ||
    inferAirlineIcaoFromCallsign(flight.callsign || flight.flight) ||
    ''
  )
    .trim()
    .toUpperCase() || null;
}

export function airlineNameFromIcao(icao?: string | null) {
  if (!icao) return null;
  return (overrides as Record<string, string>)[icao] || (airlines as Record<string, string>)[icao] || null;
}

function fallbackCarrierLabel(flight: Flight) {
  const callsign = flight.callsign || flight.flight || flight.reg || '';
  if (isRegistrationCallsign(callsign)) {
    if (flight.carrierName) return flight.carrierName;
    return `Private · ${callsign.trim().toUpperCase()}`;
  }

  const prefix = normalizeCallsign(callsign).match(/^([A-Z]{2,3})/)?.[1];
  if (prefix) {
    const name = airlineNameFromIcao(prefix);
    if (name) return `${name} (${prefix})`;
    return `${prefix} operations`;
  }

  if (flight.type) return `Aircraft · ${flight.type}`;
  return 'Private aircraft';
}

export function carrierLabel(flight: Flight) {
  if (flight.carrierLabel && flight.carrierLabel !== 'Unknown carrier') return flight.carrierLabel;
  const icao = airlineIcao(flight);
  const name = flight.carrierName || airlineNameFromIcao(icao) || null;
  if (name && icao) return `${name} (${icao})`;
  if (name) return name;
  if (icao) {
    const resolved = airlineNameFromIcao(icao);
    return resolved ? `${resolved} (${icao})` : icao;
  }
  return fallbackCarrierLabel(flight);
}

export function carrierName(flight: Flight) {
  const icao = airlineIcao(flight);
  const resolved = airlineNameFromIcao(icao);
  if (resolved) return resolved;
  if (flight.carrierName) return flight.carrierName;
  if (icao) return icao;
  return fallbackCarrierLabel(flight);
}
