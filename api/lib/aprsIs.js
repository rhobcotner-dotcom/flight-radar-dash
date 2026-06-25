import net from 'node:net';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const DEFAULT_HOST = process.env.APRS_IS_HOST || 'noam.aprs2.net';
const DEFAULT_PORT = Number(process.env.APRS_IS_PORT) || 14580;
const COLLECT_MS = Number(process.env.APRS_IS_COLLECT_MS) || 6000;
const CACHE_MS = 45 * 1000;

const RAIL_HUBS = [
  { name: 'St Louis', lat: 38.63, lon: -90.2 },
  { name: 'Chicago', lat: 41.88, lon: -87.63 },
  { name: 'Kansas City', lat: 39.1, lon: -94.58 },
  { name: 'Memphis', lat: 35.15, lon: -90.05 },
  { name: 'Houston', lat: 29.76, lon: -95.36 },
  { name: 'Dallas', lat: 32.78, lon: -96.8 },
  { name: 'Omaha', lat: 41.25, lon: -95.93 },
  { name: 'Minneapolis', lat: 44.98, lon: -93.26 },
  { name: 'Atlanta', lat: 33.75, lon: -84.39 },
  { name: 'Seattle', lat: 47.6, lon: -122.33 },
  { name: 'Los Angeles', lat: 34.05, lon: -118.24 },
  { name: 'Cleveland', lat: 41.5, lon: -81.69 },
  { name: 'New Orleans', lat: 29.95, lon: -90.07 },
  { name: 'Denver', lat: 39.74, lon: -104.99 },
  { name: 'Salt Lake City', lat: 40.76, lon: -111.89 },
];

let cache = { fetchedAt: 0, stations: [] };
let loginState = { checkedAt: 0, allowed: false, message: null };

export function aprsPasscode(callsign) {
  const base = String(callsign || '')
    .split('-')[0]
    .trim()
    .toUpperCase();
  if (!base) return null;

  let hash = 0x73e2;
  for (let i = 0; i < base.length; i += 1) {
    hash ^= base.charCodeAt(i) << (8 * (i & 1));
  }
  return hash & 0x7fff;
}

export function readAprsIsCredentials() {
  const callsign = String(process.env.APRS_CALLSIGN || process.env.APRS_IS_CALLSIGN || '').trim();
  const passFromEnv = String(process.env.APRS_PASSCODE || process.env.APRS_IS_PASSCODE || '').trim();
  const passcode = passFromEnv || (callsign ? String(aprsPasscode(callsign)) : '');

  if (!callsign || !passcode) {
    return {
      configured: false,
      message:
        'APRS-IS requires a ham callsign. Set APRS_CALLSIGN in .env (passcode is computed automatically).',
    };
  }

  return {
    configured: true,
    callsign,
    passcode,
    login: `user ${callsign} pass ${passcode} vers ${USER_AGENT.replace(/[^\w.-]/g, '-')} filter `,
  };
}

function parseAprsPosition(body) {
  if (!body) return null;
  const start = body.search(/[!@=]/);
  if (start === -1) return null;
  const payload = body.slice(start);

  let match = payload.match(
    /^[!@=](\d{2})(\d{2}\.\d{2})([NS])([\/\\])(\d{3})(\d{2}\.\d{2})([EW])(.*)$/
  );
  if (match) {
    const lat = (Number(match[1]) + Number(match[2]) / 60) * (match[3] === 'S' ? -1 : 1);
    const lon = (Number(match[5]) + Number(match[6]) / 60) * (match[7] === 'W' ? -1 : 1);
    return { lat, lon, comment: String(match[8] || '').trim() };
  }

  match = payload.match(/^[!@=](\d{2})(\d{2}\.\d{2})([NS])([EW]?)(\d{3})(\d{2}\.\d{2})([EW])(.*)$/);
  if (match) {
    const lat = (Number(match[1]) + Number(match[2]) / 60) * (match[3] === 'S' ? -1 : 1);
    const lon = (Number(match[5]) + Number(match[6]) / 60) * (match[7] === 'W' ? -1 : 1);
    return { lat, lon, comment: String(match[8] || '').trim() };
  }

  return null;
}

function parseAprsPacket(line) {
  const sep = line.indexOf(':');
  if (sep <= 0) return null;

  const header = line.slice(0, sep);
  const body = line.slice(sep + 1);
  const callsign = header.split('>')[0]?.split(',')[0]?.trim();
  if (!callsign) return null;

  const position = parseAprsPosition(body);
  if (!position) return null;

  let course = null;
  let speed = null;
  const courseMatch = body.match(/\/(\d{3})\/(\d{3})/);
  if (courseMatch) {
    course = Number(courseMatch[1]);
    speed = Number(courseMatch[2]);
  }

  const comment = position.comment.replace(/^[^a-zA-Z0-9]+/, '').trim();
  return {
    callsign,
    lat: position.lat,
    lon: position.lon,
    comment,
    course: Number.isFinite(course) ? course : null,
    speed: Number.isFinite(speed) ? speed : null,
    observedAt: new Date().toISOString(),
  };
}

async function probeAprsIsLogin(credentials) {
  if (Date.now() - loginState.checkedAt < 5 * 60 * 1000) {
    return loginState;
  }

  const login = `${credentials.login}r/38.63/-90.2/50\n`;
  const lines = await new Promise((resolve, reject) => {
    const collected = [];
    const socket = net.createConnection(DEFAULT_PORT, DEFAULT_HOST, () => {
      socket.write(login);
    });

    const finish = () => {
      if (!socket.destroyed) socket.end();
      resolve(collected);
    };

    socket.setTimeout(4000);
    socket.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) collected.push(line.trim());
      }
    });
    socket.on('error', reject);
    socket.on('timeout', finish);
    socket.on('close', finish);
    setTimeout(finish, 3500);
  });

  const denied = lines.some((line) => /login by user not allowed|invalid pass/i.test(line));
  loginState = {
    checkedAt: Date.now(),
    allowed: !denied,
    message: denied
      ? 'APRS-IS rejected login (need valid ham callsign + passcode)'
      : null,
  };
  return loginState;
}

function collectAprsIsPackets(lat, lon, radiusKm, collectMs = COLLECT_MS) {
  const credentials = readAprsIsCredentials();
  if (!credentials.configured) {
    return Promise.resolve([]);
  }

  return new Promise((resolve, reject) => {
    const login = `${credentials.login}r/${lat}/${lon}/${radiusKm}\n`;
    const lines = [];
    const socket = net.createConnection(DEFAULT_PORT, DEFAULT_HOST, () => {
      socket.write(login);
    });

    const finish = () => {
      if (!socket.destroyed) socket.end();
      resolve(lines);
    };

    socket.setTimeout(collectMs + 3000);
    socket.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.trim()) lines.push(line.trim());
      }
    });
    socket.on('error', reject);
    socket.on('timeout', finish);
    socket.on('close', finish);
    setTimeout(finish, collectMs);
  });
}

async function collectHub(hub, radiusKm) {
  try {
    const lines = await collectAprsIsPackets(hub.lat, hub.lon, radiusKm);
    const stations = [];
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const station = parseAprsPacket(line);
      if (station) stations.push({ ...station, hub: hub.name });
    }
    return stations;
  } catch {
    return [];
  }
}

async function refreshNationalCache() {
  const credentials = readAprsIsCredentials();
  if (!credentials.configured) {
    cache = { fetchedAt: Date.now(), stations: [] };
    return cache.stations;
  }

  const login = await probeAprsIsLogin(credentials);
  if (!login.allowed) {
    cache = { fetchedAt: Date.now(), stations: [] };
    return cache.stations;
  }

  const radiusKm = Number(process.env.APRS_IS_HUB_RADIUS_KM) || 180;
  const batches = [];
  const batchSize = 4;
  for (let i = 0; i < RAIL_HUBS.length; i += batchSize) {
    batches.push(RAIL_HUBS.slice(i, i + batchSize));
  }

  const seen = new Map();
  for (const batch of batches) {
    const results = await Promise.all(batch.map((hub) => collectHub(hub, radiusKm)));
    for (const stations of results) {
      for (const station of stations) {
        seen.set(station.callsign.toLowerCase(), station);
      }
    }
  }

  cache = { fetchedAt: Date.now(), stations: [...seen.values()] };
  return cache.stations;
}

export async function fetchAprsIsStations() {
  if (!cache.stations.length || Date.now() - cache.fetchedAt > CACHE_MS) {
    await refreshNationalCache();
  }
  return cache.stations;
}

export function getAprsIsStatus() {
  const credentials = readAprsIsCredentials();
  return {
    configured: credentials.configured,
    message: credentials.message || loginState.message,
    stationCount: cache.stations.length,
  };
}

export { parseAprsPacket, parseAprsPosition, RAIL_HUBS };
