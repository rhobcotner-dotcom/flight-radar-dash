import typicalSeats from '../../../config/aircraft-typical-seats.json';

const REF_SEATS = 189; // B738 baseline
const MIN_SCALE = 0.42;
const MAX_SCALE = 1.42;
const SEAT_EXPONENT = 0.38;

const EXTRA_SEATS: Record<string, number> = {
  CL60: 11,
  CL35: 10,
  CL30: 9,
  GLF4: 14,
  GLF6: 19,
  GL5T: 13,
  C25A: 8,
  C25B: 8,
  C680: 10,
  C750: 9,
  C560: 10,
  FA7X: 14,
  FA8X: 14,
  E55P: 7,
  H25B: 8,
  LJ45: 8,
  PC24: 10,
};

function seatCount(type?: string | null) {
  const code = (type || '').trim().toUpperCase();
  if (!code) return null;
  return (typicalSeats as Record<string, number>)[code] ?? EXTRA_SEATS[code] ?? null;
}

function prefixScale(code: string) {
  if (/^B77|^B74|^B78|^A35|^A38|^A33|^A34/.test(code)) return 1.22;
  if (/^B7|^B38|^B39|^A32|^A20|^A21|^B73/.test(code)) return 0.98;
  if (/^E1|^E7|^CRJ|^DH8|^AT7|^SF3|^ERJ|^B71/.test(code)) return 0.72;
  if (/^GLF|^CL|^FA|^C5|^C6|^C25|^G150|^G280|^E55|^PC|^H25|^LJ/.test(code)) return 0.52;
  if (/^C1|^C2|^C4|^PA|^SR2|^BE|^DA/.test(code)) return 0.44;
  if (/^R44|^AS|^EC|^H/.test(code)) return 0.48;
  return 0.86;
}

export function aircraftIconScale(type?: string | null) {
  const seats = seatCount(type);
  if (seats) {
    const scale = (seats / REF_SEATS) ** SEAT_EXPONENT;
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  }

  const code = (type || '').trim().toUpperCase();
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, prefixScale(code)));
}
