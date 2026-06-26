import type { Flight } from '../../types';
import { flightKey, flightLabel } from '../flightUtils';
import { funConfig } from './funCalculations';

const ROULETTE_KEY = 'flight-radar-dash-fun-roulette-day';
const QUAKE_POLL_KEY = 'flight-radar-dash-fun-quake-poll';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function dailyRouletteCallsign(date = new Date()) {
  const key = `${ROULETTE_KEY}-${date.toISOString().slice(0, 10)}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved) return saved;
  } catch {
    /* ignore */
  }
  const list = funConfig.rouletteCallsigns;
  const pick = list[Math.floor(Math.random() * list.length)] || 'POOBAH';
  try {
    localStorage.setItem(key, pick);
  } catch {
    /* ignore */
  }
  return pick;
}

export function matchCelebrity(flight: Flight) {
  const reg = String(flight.reg || '').toUpperCase();
  const call = String(flight.callsign || flight.flight || '').toUpperCase();
  return funConfig.celebrityAircraft.find((celeb) => {
    if (celeb.reg && reg === celeb.reg.toUpperCase()) return true;
    const cs = 'callsign' in celeb ? String((celeb as { callsign?: string }).callsign || '') : '';
    return cs ? call.includes(cs.toUpperCase()) : false;
  });
}

export function matchRoulette(flight: Flight, target: string) {
  const call = String(flight.callsign || flight.flight || '').toUpperCase();
  return call.includes(target.toUpperCase());
}

export interface PlaneOrUfoRound {
  flight: Flight;
  answer: 'plane' | 'balloon' | 'aliens';
}

export function newPlaneOrUfoRound(flights: Flight[]): PlaneOrUfoRound | null {
  const candidates = flights.filter((f) => f.lat && f.lon);
  if (!candidates.length) return null;
  const flight = candidates[Math.floor(Math.random() * candidates.length)];
  const alt = flight.alt ?? 0;
  const hasCall = Boolean(flight.callsign || flight.flight);
  let answer: PlaneOrUfoRound['answer'] = 'plane';
  if (!hasCall && alt < 8000) answer = 'balloon';
  else if (!hasCall && alt > 40000) answer = 'aliens';
  return { flight, answer };
}

export function loadQuakePoll() {
  try {
    return localStorage.getItem(QUAKE_POLL_KEY) as 'felt' | 'nothing' | 'dog' | null;
  } catch {
    return null;
  }
}

export function saveQuakePoll(value: 'felt' | 'nothing' | 'dog') {
  try {
    localStorage.setItem(QUAKE_POLL_KEY, value);
  } catch {
    /* ignore */
  }
}

export function describePlaneOrUfo(flight: Flight) {
  return `${flightLabel(flight)} · ${flight.alt ?? '?'} ft · ${flight.type || 'unknown type'} · squawk ${flight.squawk ?? '—'}`;
}

export { flightKey };
