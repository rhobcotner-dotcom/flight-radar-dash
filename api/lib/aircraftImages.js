const ADSBDB_API = process.env.ADSBDB_API_BASE || 'https://api.adsbdb.com/v0';
const AIRPORT_DATA_API = 'https://airport-data.com/api/ac_thumb.json';
const PLANESPOTTERS_API = 'https://api.planespotters.net/pub/photos';

const USER_AGENT =
  process.env.AIRCRAFT_PHOTO_USER_AGENT ||
  'FlightRadarDash/1.0 (personal aircraft dashboard; https://github.com/local/flight-radar-dash)';

const photoCache = new Map();
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;

function normalizeReg(reg) {
  return (reg || '').trim().toUpperCase();
}

function normalizeHex(hex) {
  return (hex || '').trim().toLowerCase();
}

function cacheGet(key) {
  const entry = photoCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > entry.ttl) {
    photoCache.delete(key);
    return undefined;
  }
  return entry.url;
}

function cacheSet(key, url) {
  photoCache.set(key, {
    url,
    ts: Date.now(),
    ttl: url ? HIT_TTL_MS : MISS_TTL_MS,
  });
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function resolveRegFromHex(hex) {
  const normalizedHex = normalizeHex(hex);
  if (!normalizedHex) return null;

  const cacheKey = `reg:${normalizedHex}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const { ok, body } = await fetchJson(`${ADSBDB_API}/mode-s/${encodeURIComponent(normalizedHex)}`, {
    headers: { Accept: 'application/json' },
  });

  const reg = ok && typeof body?.response === 'string' ? normalizeReg(body.response) : null;
  cacheSet(cacheKey, reg);
  return reg;
}

async function resolveAdsbdPhoto(reg) {
  const normalizedReg = normalizeReg(reg);
  if (!normalizedReg) return null;

  const cacheKey = `adsbdb:${normalizedReg}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const aircraft = await fetchAdsbdAircraft(normalizedReg);
  const url = aircraft?.url_photo_thumbnail || aircraft?.url_photo || null;
  cacheSet(cacheKey, url);
  return url;
}

async function fetchAdsbdAircraft(reg) {
  const normalizedReg = normalizeReg(reg);
  if (!normalizedReg) return null;

  const cacheKey = `adsbdb-aircraft:${normalizedReg}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const { ok, body } = await fetchJson(`${ADSBDB_API}/aircraft/${encodeURIComponent(normalizedReg)}`, {
    headers: { Accept: 'application/json' },
  });

  const aircraft = ok ? body?.response?.aircraft || null : null;
  cacheSet(cacheKey, aircraft);
  return aircraft;
}

export async function lookupAircraftRegistry({ reg, hex }) {
  let normalizedReg = normalizeReg(reg);
  const normalizedHex = normalizeHex(hex);

  if (!normalizedReg && normalizedHex) {
    normalizedReg = (await resolveRegFromHex(normalizedHex)) || '';
  }

  const aircraft = normalizedReg ? await fetchAdsbdAircraft(normalizedReg) : null;
  return {
    reg: normalizedReg || null,
    hex: normalizedHex || null,
    type: aircraft?.icao_type || aircraft?.type || null,
    owner: aircraft?.registered_owner || null,
    photoUrl: aircraft?.url_photo_thumbnail || aircraft?.url_photo || null,
  };
}

function pickPlanespottersUrl(body) {
  const photo = body?.photos?.[0];
  if (!photo) return null;
  return photo?.thumbnail_large?.src || photo?.thumbnail?.src || null;
}

async function resolvePlanespottersPhoto({ hex, reg, type }) {
  const normalizedHex = normalizeHex(hex);
  const normalizedReg = normalizeReg(reg);
  const normalizedType = (type || '').trim().toUpperCase();

  const cacheKey = `ps:${normalizedHex}|${normalizedReg}|${normalizedType}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const headers = {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  };

  let url = null;

  if (normalizedHex) {
    const params = new URLSearchParams();
    if (normalizedReg) params.set('reg', normalizedReg);
    if (normalizedType) params.set('icaoType', normalizedType);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const { ok, body } = await fetchJson(
      `${PLANESPOTTERS_API}/hex/${encodeURIComponent(normalizedHex)}${suffix}`,
      { headers }
    );
    if (ok) url = pickPlanespottersUrl(body);
  }

  if (!url && normalizedReg) {
    const { ok, body } = await fetchJson(
      `${PLANESPOTTERS_API}/reg/${encodeURIComponent(normalizedReg)}`,
      { headers }
    );
    if (ok) url = pickPlanespottersUrl(body);
  }

  cacheSet(cacheKey, url);
  return url;
}

async function resolveAirportDataPhoto({ reg, hex }) {
  const normalizedReg = normalizeReg(reg);
  const normalizedHex = normalizeHex(hex);
  if (!normalizedReg && !normalizedHex) return null;

  const cacheKey = `airport-data:${normalizedHex}|${normalizedReg}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const params = new URLSearchParams();
  if (normalizedHex) params.set('m', normalizedHex);
  if (normalizedReg) params.set('r', normalizedReg);
  params.set('n', '1');

  const { ok, body } = await fetchJson(`${AIRPORT_DATA_API}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });

  const image = ok ? body?.data?.[0]?.image : null;
  const url = typeof image === 'string' && image.length > 0 ? image : null;
  cacheSet(cacheKey, url);
  return url;
}

/**
 * Resolve the best available real-aircraft photo for a tail or Mode-S hex.
 * Chain: ADSBdb (JetPhotos/airport-data) → Planespotters → airport-data thumb.
 */
export async function resolveAircraftPhotoUrl({ reg, hex, type }) {
  let normalizedReg = normalizeReg(reg);
  const normalizedHex = normalizeHex(hex);
  const normalizedType = (type || '').trim().toUpperCase();

  if (!normalizedReg && normalizedHex) {
    normalizedReg = (await resolveRegFromHex(normalizedHex)) || '';
  }

  const cacheKey = `photo:${normalizedHex}|${normalizedReg}|${normalizedType}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const attempts = [
    () => (normalizedReg ? resolveAdsbdPhoto(normalizedReg) : null),
    () => resolvePlanespottersPhoto({ hex: normalizedHex, reg: normalizedReg, type: normalizedType }),
    () => resolveAirportDataPhoto({ reg: normalizedReg, hex: normalizedHex }),
    () =>
      normalizedReg
        ? resolvePlanespottersPhoto({ hex: null, reg: normalizedReg, type: normalizedType })
        : null,
  ];

  for (const attempt of attempts) {
    const url = await attempt();
    if (url) {
      cacheSet(cacheKey, url);
      return url;
    }
  }

  cacheSet(cacheKey, null);
  return null;
}
