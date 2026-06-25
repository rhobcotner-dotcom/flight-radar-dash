const OPENSKY_BASE = 'https://opensky-network.org/api';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 20000;
const CACHE_TTL_MS = Number(process.env.OPENSKY_CACHE_TTL_MS || 30_000);
const STALE_MAX_MS = Number(process.env.OPENSKY_STALE_MAX_MS || 5 * 60_000);
const COOLDOWN_MS = Number(process.env.OPENSKY_COOLDOWN_MS || 90_000);
const MIN_INTERVAL_MS = Number(process.env.OPENSKY_MIN_INTERVAL_MS || 12_000);

const cache = new Map();
const inFlight = new Map();
let lastNetworkAt = 0;
let cooldownUntil = 0;

function bboxKey(bbox) {
  return [bbox.south, bbox.west, bbox.north, bbox.east].map((v) => v.toFixed(2)).join(':');
}

export function isOpenSkyConfigured() {
  const username = String(process.env.OPENSKY_USERNAME || '').trim();
  const password = String(process.env.OPENSKY_PASSWORD || '').trim();
  return Boolean(username && password);
}

export function isOpenSkyAvailable() {
  if (!isOpenSkyConfigured()) return false;
  return Date.now() >= cooldownUntil;
}

function getFreshCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.payload;
  }
  return null;
}

function getStaleCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < STALE_MAX_MS) {
    return cached.payload;
  }
  return null;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function basicAuthHeader() {
  const username = String(process.env.OPENSKY_USERNAME || '').trim();
  const password = String(process.env.OPENSKY_PASSWORD || '').trim();
  if (!username || !password) return null;
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestStates(bbox) {
  if (!isOpenSkyAvailable()) {
    const stale = getStaleCache(bboxKey(bbox));
    if (stale) return stale;
    const err = new Error('OpenSky temporarily unavailable (rate limited)');
    err.status = 429;
    throw err;
  }

  const waitMs = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastNetworkAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  const params = new URLSearchParams({
    lamin: String(bbox.south),
    lomin: String(bbox.west),
    lamax: String(bbox.north),
    lomax: String(bbox.east),
  });

  const headers = {};
  const auth = basicAuthHeader();
  if (auth) headers.Authorization = auth;

  lastNetworkAt = Date.now();
  const res = await fetchWithTimeout(`${OPENSKY_BASE}/states/all?${params.toString()}`, { headers });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 429 || res.status === 503) {
      cooldownUntil = Date.now() + COOLDOWN_MS;
    }
    const stale = getStaleCache(bboxKey(bbox));
    if (stale) return stale;

    const err = new Error(body?.message || `OpenSky request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return {
    time: body.time,
    states: Array.isArray(body.states) ? body.states : [],
  };
}

export async function getStatesInBounds(bbox) {
  const key = bboxKey(bbox);
  const fresh = getFreshCache(key);
  if (fresh) return fresh;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = requestStates(bbox)
    .then((payload) => {
      cache.set(key, { fetchedAt: Date.now(), payload });
      return payload;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}
