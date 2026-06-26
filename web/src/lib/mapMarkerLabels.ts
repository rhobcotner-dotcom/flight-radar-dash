import type { Flight } from '../types';
import { carrierName } from './airlineNames';
import type { FlightAltitudeTrend } from './flightAltitudeTrend';
import { mapFlightRouteSubLabel } from './flightUtils';

export const FLIGHT_LABEL_ZOOM_CALLSIGN = 10;
export const FLIGHT_LABEL_ZOOM_CARRIER = 10;

type MarkerSubLabel = {
  text: string;
  tone: 'from' | 'to';
};

function mapFlightCarrierLabel(flight: Flight) {
  return carrierName(flight);
}

export function mapFlightMarkerRouteSubLabel(
  flight: Flight,
  trend: FlightAltitudeTrend
): MarkerSubLabel | null {
  return mapFlightRouteSubLabel(flight, { altitudeTrend: trend });
}

function mapFlightMarkerLabelsFull(flight: Flight, trend: FlightAltitudeTrend) {
  return {
    bottomLabel: mapFlightCarrierLabel(flight),
    bottomSubLabel: mapFlightMarkerRouteSubLabel(flight, trend),
  };
}

export function flightMarkerLabelZoomTier(mapZoom: number) {
  if (mapZoom < FLIGHT_LABEL_ZOOM_CALLSIGN) return 0;
  if (mapZoom < FLIGHT_LABEL_ZOOM_CARRIER) return 1;
  return 2;
}

export function flightMarkerLabelMode(mapZoom: number, highlighted: boolean) {
  if (highlighted || mapZoom >= FLIGHT_LABEL_ZOOM_CALLSIGN) return 'carrier';
  return 'none';
}

export function mapFlightMarkerLabels(
  flight: Flight,
  trend: FlightAltitudeTrend,
  mapZoom = 12,
  highlighted = false
) {
  if (highlighted || mapZoom >= FLIGHT_LABEL_ZOOM_CALLSIGN) {
    return mapFlightMarkerLabelsFull(flight, trend);
  }
  return { bottomLabel: null, bottomSubLabel: null };
}
