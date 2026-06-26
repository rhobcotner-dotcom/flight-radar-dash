import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AreaSettings,
  Flight,
  HearingToast,
  Satellite,
  Train,
  WeatherAlert,
  WeatherConditions,
} from '../types';
import { fetchOverheadSatellites } from '../lib/satelliteUtils';
import {
  activeMeteorShower,
  archShadowCountdown,
  disasterMovieScore,
  kpMoodClass,
  moonPhase,
  tRavioliIndex,
} from '../lib/fun/funCalculations';
import {
  dailyRouletteCallsign,
  matchCelebrity,
  matchRoulette,
  newPlaneOrUfoRound,
  loadQuakePoll,
  saveQuakePoll,
  type PlaneOrUfoRound,
} from '../lib/fun/funGames';
import { startWindChimes, stopWindChimes, unlockWindChimes } from '../lib/fun/windChimes';

export interface FunSettings {
  issWave: boolean;
  chemtrails: boolean;
  birdPanic: boolean;
  werewolf: boolean;
  solarMoodRing: boolean;
  disasterMovie: boolean;
  monster: boolean;
  trainHorns: boolean;
  windChimes: boolean;
  catMode: boolean;
  celebrityStalker: boolean;
  roulette: boolean;
  radarNoir: boolean;
}

export interface FunStatusPayload {
  fetchedAt: string;
  spaceWeather: { kp: number | null; mood: string; observedAt: string | null };
  birdMigration: { intensity: number; message: string; season: string };
  cardinals: { gameDayLikely: boolean; probability: number; message: string };
}

const FUN_STORAGE: Record<keyof FunSettings, string> = {
  issWave: 'iss-wave',
  chemtrails: 'chemtrails',
  birdPanic: 'bird-panic',
  werewolf: 'werewolf',
  solarMoodRing: 'solar-mood',
  disasterMovie: 'disaster-movie',
  monster: 'monster',
  trainHorns: 'train-horns',
  windChimes: 'wind-chimes',
  catMode: 'cat-mode',
  celebrityStalker: 'celebrity',
  roulette: 'roulette',
  radarNoir: 'radar-noir',
};

function readFunFlag(key: keyof FunSettings, fallback: boolean) {
  try {
    const raw = localStorage.getItem(`flight-radar-dash-fun-${FUN_STORAGE[key]}`);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

function writeFunFlag(key: keyof FunSettings, value: boolean) {
  try {
    localStorage.setItem(`flight-radar-dash-fun-${FUN_STORAGE[key]}`, String(value));
  } catch {
    /* ignore */
  }
}

const DEFAULT_SETTINGS: FunSettings = {
  issWave: true,
  chemtrails: false,
  birdPanic: true,
  werewolf: false,
  solarMoodRing: true,
  disasterMovie: true,
  monster: true,
  trainHorns: true,
  windChimes: false,
  catMode: false,
  celebrityStalker: true,
  roulette: true,
  radarNoir: false,
};

interface Options {
  area: AreaSettings;
  flights: Flight[];
  trains: Train[];
  weather: WeatherConditions | null;
  weatherAlerts: WeatherAlert[];
  metarWindMph?: number | null;
  metarWindDir?: number | null;
  layerStats?: {
    lightningCount?: number;
    earthquakeCount?: number;
    tornadoCount?: number;
  };
  enabled?: boolean;
}

export function useFunMode({
  area,
  flights,
  trains,
  weather,
  weatherAlerts,
  metarWindMph,
  metarWindDir,
  layerStats,
  enabled = true,
}: Options) {
  const [settings, setSettingsState] = useState<FunSettings>(() => ({
    issWave: readFunFlag('issWave', DEFAULT_SETTINGS.issWave),
    chemtrails: readFunFlag('chemtrails', DEFAULT_SETTINGS.chemtrails),
    birdPanic: readFunFlag('birdPanic', DEFAULT_SETTINGS.birdPanic),
    werewolf: readFunFlag('werewolf', DEFAULT_SETTINGS.werewolf),
    solarMoodRing: readFunFlag('solarMoodRing', DEFAULT_SETTINGS.solarMoodRing),
    disasterMovie: readFunFlag('disasterMovie', DEFAULT_SETTINGS.disasterMovie),
    monster: readFunFlag('monster', DEFAULT_SETTINGS.monster),
    trainHorns: readFunFlag('trainHorns', DEFAULT_SETTINGS.trainHorns),
    windChimes: readFunFlag('windChimes', DEFAULT_SETTINGS.windChimes),
    catMode: readFunFlag('catMode', DEFAULT_SETTINGS.catMode),
    celebrityStalker: readFunFlag('celebrityStalker', DEFAULT_SETTINGS.celebrityStalker),
    roulette: readFunFlag('roulette', DEFAULT_SETTINGS.roulette),
    radarNoir: readFunFlag('radarNoir', DEFAULT_SETTINGS.radarNoir),
  }));
  const [funStatus, setFunStatus] = useState<FunStatusPayload | null>(null);
  const [funToasts, setFunToasts] = useState<HearingToast[]>([]);
  const [planeOrUfo, setPlaneOrUfo] = useState<PlaneOrUfoRound | null>(null);
  const [planeOrUfoScore, setPlaneOrUfoScore] = useState({ correct: 0, total: 0 });
  const [quakePoll, setQuakePoll] = useState(() => loadQuakePoll());
  const [issSatellite, setIssSatellite] = useState<Satellite | null>(null);
  const notifiedRef = useRef(new Set<string>());

  const rouletteTarget = useMemo(() => dailyRouletteCallsign(), []);
  const moon = useMemo(() => moonPhase(), []);
  const archShadow = useMemo(
    () => archShadowCountdown(area.lat, area.lon),
    [area.lat, area.lon]
  );
  const tRavioli = useMemo(
    () => tRavioliIndex(weather?.temperatureF, weather?.relativeHumidityPct, weather?.conditionLabel),
    [weather]
  );
  const meteor = useMemo(() => activeMeteorShower(), []);
  const disasterScore = useMemo(
    () =>
      disasterMovieScore({
        weatherAlertCount: weatherAlerts.length,
        tornadoCount: layerStats?.tornadoCount ?? 0,
        lightningCount: layerStats?.lightningCount ?? 0,
        earthquakeCount: layerStats?.earthquakeCount ?? 0,
      }),
    [layerStats, weatherAlerts.length]
  );
  const disasterActive = settings.disasterMovie && disasterScore >= 45;
  const werewolfActive = settings.werewolf && moon.isFullMoon;
  const kpClass = kpMoodClass(funStatus?.spaceWeather?.kp);

  const setSetting = useCallback(<K extends keyof FunSettings>(key: K, value: FunSettings[K]) => {
    setSettingsState((prev) => ({ ...prev, [key]: value }));
    writeFunFlag(key, Boolean(value));
  }, []);

  const dismissFunToast = useCallback((toastId: string) => {
    setFunToasts((prev) => prev.filter((t) => t.id !== toastId));
  }, []);

  const pushFunToast = useCallback((title: string, body: string, entityKey = 'fun') => {
    const id = `fun-${entityKey}-${Date.now()}`;
    const toast: HearingToast = {
      id,
      flightKey: entityKey,
      title,
      body,
      variant: 'fun',
      createdAt: Date.now(),
    };
    setFunToasts((prev) => [...prev, toast].slice(-3));
    window.setTimeout(() => {
      setFunToasts((prev) => prev.filter((t) => t.id !== id));
    }, 12000);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/fun/status');
        const data = await res.json();
        if (!cancelled && res.ok) setFunStatus(data);
      } catch {
        /* optional */
      }
    }

    void load();
    const id = window.setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !settings.issWave) {
      setIssSatellite(null);
      return undefined;
    }
    let cancelled = false;

    async function loadIss() {
      try {
        const qs = new URLSearchParams({
          lat: String(area.lat),
          lon: String(area.lon),
          minElevation: '10',
          maxResults: '40',
        }).toString();
        const payload = await fetchOverheadSatellites(qs);
        const iss = payload.satellites.find((sat) => /ISS|ZARYA/i.test(sat.name));
        if (!cancelled) setIssSatellite(iss || null);
        if (iss && iss.elevationDeg >= 25) {
          const key = `iss-${Math.floor(Date.now() / 600_000)}`;
          if (!notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            pushFunToast(
              'Go outside and wave!',
              `ISS passing at ${iss.elevationDeg.toFixed(0)}° elevation · az ${iss.azimuthDeg.toFixed(0)}°`
            );
          }
        }
      } catch {
        /* ignore */
      }
    }

    void loadIss();
    const id = window.setInterval(loadIss, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [area.lat, area.lon, enabled, pushFunToast, settings.issWave]);

  useEffect(() => {
    if (!enabled || !settings.celebrityStalker) return;
    for (const flight of flights) {
      const celeb = matchCelebrity(flight);
      if (!celeb) continue;
      const key = `celeb-${flight.reg}-${Math.floor(Date.now() / 3600_000)}`;
      if (notifiedRef.current.has(key)) continue;
      notifiedRef.current.add(key);
      pushFunToast(`${celeb.label} overhead!`, `${flight.reg} · ${flight.alt ?? '?'} ft`);
    }
  }, [enabled, flights, pushFunToast, settings.celebrityStalker]);

  useEffect(() => {
    if (!enabled || !settings.roulette) return;
    for (const flight of flights) {
      if (!matchRoulette(flight, rouletteTarget)) continue;
      const key = `roulette-${rouletteTarget}-${Math.floor(Date.now() / 3600_000)}`;
      if (notifiedRef.current.has(key)) continue;
      notifiedRef.current.add(key);
      pushFunToast('Callsign roulette winner!', `Holy grail callsign ${rouletteTarget} is overhead.`);
    }
  }, [enabled, flights, pushFunToast, rouletteTarget, settings.roulette]);

  useEffect(() => {
    if (!enabled || !settings.birdPanic || !funStatus) return;
    if (funStatus.birdMigration.intensity < 75) return;
    const key = `birds-${new Date().toISOString().slice(0, 10)}`;
    if (notifiedRef.current.has(key)) return;
    notifiedRef.current.add(key);
    pushFunToast('DUCKS INCOMING', funStatus.birdMigration.message);
  }, [enabled, funStatus, pushFunToast, settings.birdPanic]);

  useEffect(() => {
    if (!enabled || !settings.windChimes) {
      stopWindChimes();
      return;
    }
    unlockWindChimes();
    const mph = metarWindMph ?? weather?.windSpeedMph;
    const dir = metarWindDir ?? weather?.windDirectionDeg;
    startWindChimes(mph, dir);
    return () => stopWindChimes();
  }, [
    enabled,
    metarWindDir,
    metarWindMph,
    settings.windChimes,
    weather?.windDirectionDeg,
    weather?.windSpeedMph,
  ]);

  const guessPlaneOrUfo = useCallback(
    (guess: PlaneOrUfoRound['answer']) => {
      if (!planeOrUfo) return;
      const correct = guess === planeOrUfo.answer;
      setPlaneOrUfoScore((s) => ({
        correct: s.correct + (correct ? 1 : 0),
        total: s.total + 1,
      }));
      setPlaneOrUfo(null);
    },
    [planeOrUfo]
  );

  const startPlaneOrUfo = useCallback(() => {
    setPlaneOrUfo(newPlaneOrUfoRound(flights));
  }, [flights]);

  const recordQuakePoll = useCallback((value: 'felt' | 'nothing' | 'dog') => {
    saveQuakePoll(value);
    setQuakePoll(value);
  }, []);

  return {
    settings,
    setSetting,
    funStatus,
    funToasts,
    dismissFunToast,
    moon,
    archShadow,
    tRavioli,
    meteor,
    disasterActive,
    werewolfActive,
    kpClass,
    rouletteTarget,
    planeOrUfo,
    planeOrUfoScore,
    guessPlaneOrUfo,
    startPlaneOrUfo,
    quakePoll,
    recordQuakePoll,
    issSatellite,
    disasterScore,
  };
}
