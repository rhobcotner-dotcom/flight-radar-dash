import fs from 'node:fs/promises';
import path from 'node:path';
import { distanceMiles } from '../../lib/geo.js';

const USER_AGENT = 'flight-radar-dash/1.0 (+https://github.com; aprs.fi map feed)';
const SESSION_PATH = path.join(process.cwd(), 'data', 'aprsfi.session.json');
const CACHE_MS = 45 * 1000;

let cache = { fetchedAt: 0, data: null };

function bboxForArea(lat, lon, radiusMiles) {
  const latDelta = radiusMiles / 69;
  const lonDelta = radiusMiles / (69 * Math.max(Math.cos((lat * Math.PI) / 180), 0.2));
  return {
    south: lat - latDelta,
    west: lon - lonDelta,
    north: lat + latDelta,
    east: lon + lonDelta,
  };
}

function parsePntLine(line) {
  const match = String(line).match(/^pnt\((.*)\)$/);
  if (!match) return null;

  const parts = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < match[1].length; i += 1) {
    const ch = match[1][i];
    if (quote) {
      current += ch;
      if (ch === quote && match[1][i - 1] !== '\\') {
        parts.push(current.slice(1, -1));
        current = '';
        quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current = ch;
      continue;
    }
    if (ch === ',') {
      const trimmed = current.trim();
      if (trimmed !== '') parts.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail !== '') parts.push(tail);

  if (parts.length < 8) return null;

  const lat = Number(parts[3]);
  const lon = Number(parts[4]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const course = Number(parts[6]);
  const speedKph = Number(parts[7]);
  const callsign = String(parts[8] || '').trim();
  const comment = String(parts[10] || '').trim();
  const observedAt = parts[2] ? new Date(Number(parts[2]) * 1000).toISOString() : null;

  return {
    callsign: callsign || 'APRS',
    lat,
    lon,
    comment,
    course: Number.isFinite(course) && course >= 0 ? course : null,
    speed: Number.isFinite(speedKph) ? speedKph : null,
    observedAt,
  };
}

async function readSession() {
  try {
    const raw = await fs.readFile(SESSION_PATH, 'utf8');
    const session = JSON.parse(raw);
    if (!session?.winid || !Array.isArray(session?.cookies)) return null;
    return session;
  } catch {
    return null;
  }
}

function cookieHeader(cookies) {
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

export async function fetchAprsFiMapStations(lat, lon, radiusMiles = 50, options = {}) {
  const maxStations = Number(options.maxStations) || 120;
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}:${maxStations}`;

  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const session = await readSession();
  if (!session) {
    return {
      enabled: false,
      source: 'aprs.fi/xml2',
      message: 'Run npm run aprsfi:bootstrap to enable the aprs.fi map feed (no API key).',
      fetchedAt: new Date().toISOString(),
      count: 0,
      radiusMiles,
      stations: [],
    };
  }

  const box = bboxForArea(lat, lon, radiusMiles);
  const boxParam = `${box.south.toFixed(5)},${box.west.toFixed(5)},${box.north.toFixed(5)},${box.east.toFixed(5)}`;
  const rid = `${Math.floor(Math.random() * 99999)}-${Math.floor(Math.random() * 9999)}`;
  const params = new URLSearchParams({
    n: '',
    box: boxParam,
    rid,
    v: '2',
    winid: session.winid,
    timerange: String(options.timerangeSec || 3600),
    tail: String(options.tailSec || 3600),
    lastupd: '0',
    oth: '1',
    area_wx: '1',
  });

  const res = await fetch(`https://aprs.fi/xml2?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: '*/*',
      Cookie: cookieHeader(session.cookies),
    },
  });

  if (!res.ok) throw new Error(`aprs.fi map feed unavailable (${res.status})`);

  const body = await res.text();
  if (/stopped\s*=\s*1/.test(body)) {
    return {
      enabled: false,
      source: 'aprs.fi/xml2',
      message: 'aprs.fi session expired — run npm run aprsfi:bootstrap',
      fetchedAt: new Date().toISOString(),
      count: 0,
      radiusMiles,
      stations: [],
    };
  }

  const stations = [];
  for (const line of body.match(/pnt\([^)]+\)/g) || []) {
    const station = parsePntLine(line);
    if (!station) continue;
    const dist = distanceMiles(lat, lon, station.lat, station.lon);
    if (dist > radiusMiles) continue;
    stations.push({
      ...station,
      distanceMiles: Math.round(dist * 10) / 10,
    });
  }

  stations.sort((a, b) => a.distanceMiles - b.distanceMiles);
  const limited = stations.slice(0, maxStations);

  const payload = {
    enabled: true,
    source: 'aprs.fi/xml2',
    fetchedAt: new Date().toISOString(),
    count: limited.length,
    radiusMiles,
    stations: limited,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
