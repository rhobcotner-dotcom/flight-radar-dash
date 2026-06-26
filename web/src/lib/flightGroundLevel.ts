import type { Flight } from '../types';

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
