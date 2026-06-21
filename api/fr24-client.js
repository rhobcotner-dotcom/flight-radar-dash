const FR24_BASE = 'https://fr24api.flightradar24.com';

const cache = new Map();

function cacheKey(path, params) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `${path}?${sorted}`;
}

function getCacheTtl() {
  return Number(process.env.CACHE_TTL_MS || 45000);
}

export function clearFr24Cache() {
  cache.clear();
}

export async function fr24Get(endpoint, params = {}) {
  const token = process.env.FR24_API_TOKEN;
  if (!token) {
    const err = new Error('FR24_API_TOKEN is not configured');
    err.status = 500;
    throw err;
  }

  const useSandbox = String(process.env.FR24_USE_SANDBOX || 'false').toLowerCase() === 'true';
  const apiPath = useSandbox
    ? endpoint.replace(/^\/api\//, '/api/sandbox/')
    : endpoint;

  const key = cacheKey(apiPath, params);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < getCacheTtl()) {
    return cached.data;
  }

  const url = new URL(`${FR24_BASE}${apiPath}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(name, String(value));
    }
  }

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Version': 'v1',
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.message || body.details || `FR24 request failed (${res.status})`);
    err.status = res.status;
    err.details = body.details;
    throw err;
  }

  cache.set(key, { ts: Date.now(), data: body });
  return body;
}

export async function getLiveFlightsFull(bounds, extraParams = {}) {
  return fr24Get('/api/live/flight-positions/full', {
    bounds,
    limit: 30000,
    ...extraParams,
  });
}

export async function getLiveFlightsCount(bounds, extraParams = {}) {
  return fr24Get('/api/live/flight-positions/count', {
    bounds,
    ...extraParams,
  });
}

export async function getAirportLight(code) {
  return fr24Get(`/api/static/airports/${encodeURIComponent(code)}/light`, {});
}
