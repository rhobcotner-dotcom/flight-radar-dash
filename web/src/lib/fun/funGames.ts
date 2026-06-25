import type { Flight } from '../../types';
import { classifyHelicopter, type HeloKind } from '../helicopters';
import { flightKey, flightLabel } from '../flightUtils';
import { funConfig } from './funCalculations';

const BINGO_KEY = 'flight-radar-dash-fun-helo-bingo';
const ROULETTE_KEY = 'flight-radar-dash-fun-roulette-day';
const SQUAWK_KEY = 'flight-radar-dash-fun-squawk-bingo';
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

export interface HeloBingoState {
  date: string;
  marked: boolean[];
}

export function loadHeloBingo(): HeloBingoState {
  const size = funConfig.blackHeloBingo.length;
  try {
    const raw = localStorage.getItem(BINGO_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HeloBingoState;
      if (parsed.date === todayKey() && Array.isArray(parsed.marked)) {
        return { date: parsed.date, marked: parsed.marked.slice(0, size) };
      }
    }
  } catch {
    /* ignore */
  }
  return { date: todayKey(), marked: Array(size).fill(false) };
}

export function saveHeloBingo(state: HeloBingoState) {
  try {
    localStorage.setItem(BINGO_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function heloBingoIndex(flight: Flight): number | null {
  const kind = classifyHelicopter(flight);
  if (!kind) return null;
  if (kind === 'medevac') return 0;
  if (kind === 'news') return 1;
  if (kind === 'law') return 2;
  if (kind === 'helicopter') return 4;
  return 8;
}

export function updateHeloBingoFromFlights(flights: Flight[], state: HeloBingoState) {
  if (state.date !== todayKey()) {
    state = loadHeloBingo();
  }
  let changed = false;
  for (const flight of flights) {
    const idx = heloBingoIndex(flight);
    if (idx != null && !state.marked[idx]) {
      state.marked[idx] = true;
      changed = true;
    }
  }
  if (changed) saveHeloBingo(state);
  return state;
}

export function heloBingoWon(state: HeloBingoState) {
  const size = Math.sqrt(funConfig.blackHeloBingo.length);
  if (size !== 3) return state.marked.filter(Boolean).length >= 9;
  for (let row = 0; row < 3; row++) {
    if ([0, 1, 2].every((col) => state.marked[row * 3 + col])) return true;
    if ([0, 1, 2].every((r) => state.marked[r * 3 + row])) return true;
  }
  if ([0, 4, 8].every((i) => state.marked[i])) return true;
  if ([2, 4, 6].every((i) => state.marked[i])) return true;
  return false;
}

export interface SquawkBingoState {
  date: string;
  hit: Record<string, boolean>;
}

export function loadSquawkBingo(): SquawkBingoState {
  try {
    const raw = localStorage.getItem(SQUAWK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SquawkBingoState;
      if (parsed.date === todayKey()) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { date: todayKey(), hit: {} };
}

export function updateSquawkBingo(flights: Flight[], state: SquawkBingoState) {
  if (state.date !== todayKey()) state = loadSquawkBingo();
  let changed = false;
  for (const flight of flights) {
    const code = String(flight.squawk || '').padStart(4, '0');
    if (funConfig.squawkBingo.some((row) => row.code === code) && !state.hit[code]) {
      state.hit[code] = true;
      changed = true;
    }
  }
  if (changed) {
    try {
      localStorage.setItem(SQUAWK_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }
  return state;
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
