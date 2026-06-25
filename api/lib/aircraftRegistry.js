import { lookupAircraftRegistry } from './aircraftImages.js';
import { inferAirlineIcaoFromCallsign } from '../../lib/callsignCarrier.js';
import { airlineNameFromIcao } from './airlineNames.js';

const REGISTRY_LOOKUP_LIMIT = Number(process.env.REGISTRY_LOOKUP_LIMIT || 120);

function needsRegistryLookup(flight) {
  return (
    !flight.reg ||
    !flight.type ||
    (!flight.carrierName && !flight.operating_as && !flight.painted_as)
  );
}

function applyRegistryFields(flight, registry) {
  if (registry.reg && !flight.reg) flight.reg = registry.reg;
  if (registry.type && !flight.type) flight.type = registry.type;

  if (!flight.operating_as && !flight.painted_as) {
    const inferred = inferAirlineIcaoFromCallsign(flight.callsign || flight.flight);
    if (inferred) {
      flight.operating_as = inferred;
      flight.painted_as = inferred;
    }
  }

  if (!flight.carrierName) {
    if (registry.owner) {
      flight.carrierName = registry.owner;
    } else {
      const icao = flight.operating_as || flight.painted_as || inferAirlineIcaoFromCallsign(flight.callsign || flight.flight);
      if (icao) flight.carrierName = airlineNameFromIcao(icao);
    }
  }
}

export async function enrichFlightsWithRegistry(flights) {
  const targets = flights
    .filter((flight) => flight.hex && needsRegistryLookup(flight))
    .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity))
    .slice(0, REGISTRY_LOOKUP_LIMIT);

  if (targets.length === 0) return flights;

  await Promise.all(
    targets.map(async (flight) => {
      try {
        const registry = await lookupAircraftRegistry({ hex: flight.hex, reg: flight.reg });
        applyRegistryFields(flight, registry);
      } catch {
        /* ignore per-flight registry misses */
      }
    })
  );

  return flights;
}
