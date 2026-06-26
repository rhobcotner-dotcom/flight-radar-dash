import type { Flight } from '../types';
import { knotsToMph } from './flightUtils';

/** Parked, taxiing, or ADSB-reported ground — not takeoff/landing roll. */
export function isGroundLevelFlight(flight: Pick<Flight, 'alt' | 'gspeed'>) {
  const alt = Number(flight.alt);
  const speed = Number(flight.gspeed);

  if (!Number.isFinite(alt)) return false;

  if (alt <= 100) {
    if (Number.isFinite(speed) && speed >= 80) return false;
    return true;
  }

  if (alt < 500 && Number.isFinite(speed) && speed < 80) return true;

  return false;
}

/** Motion hint for map smoothing — airborne targets always get a drift vector. */
export function aircraftMotionHint(flight: Pick<Flight, 'alt' | 'gspeed' | 'track'>) {
  const headingDeg = flight.track ?? null;
  const reportedMph = knotsToMph(flight.gspeed);
  const ground = isGroundLevelFlight(flight);

  if (ground) {
    return {
      speedMph: reportedMph ?? 0,
      headingDeg,
    };
  }

  const minAirborneMph = 120;
  const speedMph =
    reportedMph != null && reportedMph > 15
      ? reportedMph
      : headingDeg != null
        ? minAirborneMph
        : reportedMph;

  return { speedMph, headingDeg };
}
