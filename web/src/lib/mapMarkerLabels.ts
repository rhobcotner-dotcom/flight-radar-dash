import type { Flight } from '../types';
import { airlineIcao, airlineNameFromIcao } from './airlineNames';
import type { FlightAltitudeTrend } from './flightAltitudeTrend';
import { flightDepartureLabel, flightDestinationLabel, flightLabel, isNearTakeoffLocation } from './flightUtils';

export const FLIGHT_LABEL_ZOOM_CALLSIGN = 10;
export const FLIGHT_LABEL_ZOOM_CARRIER = 13;

type MarkerSubLabel = {
  text: string;
  tone: 'from' | 'to';
};

function mapFlightCarrierLabel(flight: Flight) {
  if (flight.carrierName) return flight.carrierName;
  const icao = airlineIcao(flight);
  if (!icao) return null;
  return airlineNameFromIcao(icao);
}

function mapFlightMarkerLabelsFull(flight: Flight, trend: FlightAltitudeTrend) {
  const bottomLabel = mapFlightCarrierLabel(flight);
  let bottomSubLabel: MarkerSubLabel | null = null;

  if (isNearTakeoffLocation(flight)) {
    const destination = flightDestinationLabel(flight);
    if (destination) bottomSubLabel = { text: `to ${destination}`, tone: 'to' };
  } else if (trend === 'down') {
    const departure = flightDepartureLabel(flight);
    if (departure) bottomSubLabel = { text: `from ${departure}`, tone: 'from' };
  }

  return { bottomLabel, bottomSubLabel };
}

export function flightMarkerLabelZoomTier(mapZoom: number) {
  if (mapZoom < FLIGHT_LABEL_ZOOM_CALLSIGN) return 0;
  if (mapZoom < FLIGHT_LABEL_ZOOM_CARRIER) return 1;
  return 2;
}

export function flightMarkerLabelMode(mapZoom: number, highlighted: boolean) {
  if (highlighted || mapZoom >= FLIGHT_LABEL_ZOOM_CARRIER) return 'carrier';
  if (mapZoom >= FLIGHT_LABEL_ZOOM_CALLSIGN) return 'callsign';
  return 'none';
}

export function mapFlightMarkerLabels(
  flight: Flight,
  trend: FlightAltitudeTrend,
  mapZoom = 12,
  highlighted = false
) {
  if (highlighted || mapZoom >= FLIGHT_LABEL_ZOOM_CARRIER) {
    return mapFlightMarkerLabelsFull(flight, trend);
  }
  if (mapZoom >= FLIGHT_LABEL_ZOOM_CALLSIGN) {
    return { bottomLabel: flightLabel(flight), bottomSubLabel: null };
  }
  return { bottomLabel: null, bottomSubLabel: null };
}
