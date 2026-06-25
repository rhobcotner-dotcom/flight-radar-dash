import { pointInBoundingBox } from '../../lib/geo.js';

const MS_TO_KNOTS = 1.94384;
const METERS_TO_FEET = 3.28084;

function metersToFeet(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * METERS_TO_FEET) : undefined;
}

function msToKnots(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * MS_TO_KNOTS) : undefined;
}

export function normalizeOpenSkyState(state, bbox) {
  if (!Array.isArray(state) || state.length < 8) return null;

  const icao24 = String(state[0] || '').trim().toLowerCase();
  const callsign = String(state[1] || '').trim();
  const lat = Number(state[6]);
  const lon = Number(state[5]);
  if (!icao24 || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (bbox && !pointInBoundingBox(lat, lon, bbox)) return null;

  const onGround = state[8] === true;
  const baroAlt = state[7];
  const geoAlt = state[13];

  return {
    fr24_id: icao24,
    hex: icao24,
    flight: callsign || undefined,
    callsign: callsign || undefined,
    lat,
    lon,
    track: state[10] != null ? Math.round(Number(state[10])) : undefined,
    alt: onGround ? 0 : metersToFeet(baroAlt ?? geoAlt),
    gspeed: msToKnots(state[9]),
    vspeed: state[11] != null ? Math.round(Number(state[11]) * METERS_TO_FEET) : undefined,
    squawk: state[14] != null ? String(state[14]) : undefined,
    timestamp: state[4] != null ? new Date(Number(state[4]) * 1000).toISOString() : undefined,
    source: 'opensky',
    orig_country: state[2] || undefined,
  };
}

export function normalizeOpenSkyStates(states, bbox) {
  return (states || [])
    .map((state) => normalizeOpenSkyState(state, bbox))
    .filter(Boolean);
}
