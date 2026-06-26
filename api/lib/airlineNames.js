import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inferAirlineIcaoFromCallsign,
  isRegistrationCallsign,
  callsignPrefixLabel,
} from '../../lib/callsignCarrier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.resolve(__dirname, '../../config');

let airlinesCache;
let overridesCache;

function loadAirlines() {
  if (!airlinesCache) {
    airlinesCache = JSON.parse(fs.readFileSync(path.join(configDir, 'airlines-icao.json'), 'utf8'));
  }
  return airlinesCache;
}

function loadOverrides() {
  if (!overridesCache) {
    overridesCache = JSON.parse(fs.readFileSync(path.join(configDir, 'airlines-overrides.json'), 'utf8'));
  }
  return overridesCache;
}

export function airlineIcao(flight) {
  return (flight.operating_as || flight.painted_as || inferAirlineIcaoFromCallsign(flight.callsign || flight.flight) || '')
    .trim()
    .toUpperCase() || null;
}

export function airlineNameFromIcao(icao) {
  if (!icao) return null;
  return loadOverrides()[icao] || loadAirlines()[icao] || null;
}

function fallbackCarrierLabel(flight) {
  const callsign = flight.callsign || flight.flight || flight.reg || '';
  if (isRegistrationCallsign(callsign)) {
    if (flight.carrierName) return flight.carrierName;
    return `Private · ${callsign.trim().toUpperCase()}`;
  }

  const prefix = callsignPrefixLabel(callsign);
  if (prefix) {
    const name = airlineNameFromIcao(prefix);
    if (name) return `${name} (${prefix})`;
    return `${prefix} operations`;
  }

  if (flight.type) return `Aircraft · ${flight.type}`;
  return 'Private aircraft';
}

export function carrierLabel(flight) {
  if (flight.carrierLabel && flight.carrierLabel !== 'Unknown carrier') return flight.carrierLabel;
  const icao = airlineIcao(flight);
  const carrierName = flight.carrierName || airlineNameFromIcao(icao) || null;
  if (carrierName && icao) return `${carrierName} (${icao})`;
  if (carrierName) return carrierName;
  if (icao) return airlineNameFromIcao(icao) ? `${airlineNameFromIcao(icao)} (${icao})` : icao;
  return fallbackCarrierLabel(flight);
}

export function enrichFlightCarrier(flight) {
  const icao = airlineIcao(flight);
  const inferredIcao = inferAirlineIcaoFromCallsign(flight.callsign || flight.flight);
  const operatingAs = flight.operating_as || flight.painted_as || inferredIcao || undefined;
  const carrierName = airlineNameFromIcao(icao || inferredIcao) || flight.carrierName || null;

  return {
    ...flight,
    operating_as: operatingAs,
    painted_as: flight.painted_as || operatingAs,
    carrierIcao: icao || inferredIcao || null,
    carrierName: carrierName || (flight.carrierName ?? null),
    carrierLabel: carrierLabel({ ...flight, operating_as: operatingAs, carrierName: carrierName || flight.carrierName }),
  };
}

export function enrichFlightsCarriers(flights) {
  return flights.map(enrichFlightCarrier);
}
