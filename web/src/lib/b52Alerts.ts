import type { Flight } from '../types';
import { flightLabel, formatFlightSpeedMph, knotsToMph } from './flightUtils';

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compassDirection(track?: number | null) {
  if (track == null || !Number.isFinite(track)) return null;
  return COMPASS[Math.round(track / 22.5) % 16];
}

export function formatCoordinate(value: number, axis: 'lat' | 'lon') {
  const abs = Math.abs(value);
  const suffix = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${abs.toFixed(2)}°${suffix}`;
}

export function formatLocation(flight: Flight) {
  if (flight.lat == null || flight.lon == null) return 'Position unavailable';
  return `${formatCoordinate(flight.lat, 'lat')}, ${formatCoordinate(flight.lon, 'lon')}`;
}

export function projectLatLon(
  lat: number,
  lon: number,
  trackDeg: number,
  speedKnots: number,
  minutes: number
) {
  const distanceMiles = (speedKnots * minutes * 1.15078) / 60;
  const bearing = (trackDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const angular = distanceMiles / 3958.8;
  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angular) + Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing)
  );
  const newLonRad =
    lonRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
      Math.cos(angular) - Math.sin(latRad) * Math.sin(newLatRad)
    );

  return {
    lat: (newLatRad * 180) / Math.PI,
    lon: (newLonRad * 180) / Math.PI,
  };
}

export function b52TrajectorySummary(flight: Flight, minutes = 30) {
  const track = flight.track;
  const speedKnots = flight.gspeed;
  if (
    track == null ||
    speedKnots == null ||
    flight.lat == null ||
    flight.lon == null ||
    !Number.isFinite(track) ||
    !Number.isFinite(speedKnots) ||
    speedKnots <= 0
  ) {
    return null;
  }

  const projected = projectLatLon(flight.lat, flight.lon, track, speedKnots, minutes);
  const direction = compassDirection(track);
  return `Likely track ${Math.round(track)}°${direction ? ` ${direction}` : ''} · ~${minutes} min ${formatCoordinate(projected.lat, 'lat')}, ${formatCoordinate(projected.lon, 'lon')}`;
}

export function b52AlertTitle(flight: Flight) {
  return `B-52 airborne · ${flightLabel(flight)}`;
}

export function b52AlertBody(flight: Flight) {
  return formatLocation(flight);
}

export function b52AlertStats(flight: Flight) {
  const parts = [
    flight.alt != null ? `${flight.alt.toLocaleString()} ft` : null,
    formatFlightSpeedMph(flight.gspeed),
    flight.track != null ? `Heading ${Math.round(flight.track)}°${compassDirection(flight.track) ? ` ${compassDirection(flight.track)}` : ''}` : null,
    flight.reg ? `Tail ${flight.reg}` : null,
    b52TrajectorySummary(flight),
  ].filter(Boolean);

  return parts.join(' · ');
}

export function b52AlertSpeedKnots(flight: Flight) {
  if (flight.gspeed == null || !Number.isFinite(flight.gspeed)) return null;
  return `${Math.round(flight.gspeed)} kt (${knotsToMph(flight.gspeed)} mph)`;
}
