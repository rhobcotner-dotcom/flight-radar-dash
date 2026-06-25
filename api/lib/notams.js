import { distanceMiles } from '../../lib/geo.js';

const NMS_AUTH = 'https://api-nms.aim.faa.gov/v1/auth/token';
const NMS_API = 'https://api-nms.aim.faa.gov/nmsapi/v1/notams';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 5 * 60 * 1000;
const STL_AIRPORTS = ['KSTL', 'KSUS', 'KCPS', 'KBLV', 'KUIN'];

let cache = { fetchedAt: 0, data: null };
let tokenCache = { token: null, expiresAt: 0 };

async function getNmsToken(clientId, clientSecret) {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 30_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(NMS_AUTH, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`FAA NOTAM auth failed (${res.status})`);
  }

  const json = await res.json();
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + Number(json.expires_in || 3600) * 1000,
  };
  return tokenCache.token;
}

function normalizeNotamFeature(item, airport) {
  const geometry = item?.geometry || item?.geoJson?.geometry;
  const props = item?.properties || item || {};
  const lat = Number(props.latitude ?? props.lat ?? geometry?.coordinates?.[1]);
  const lon = Number(props.longitude ?? props.lon ?? geometry?.coordinates?.[0]);

  if (!geometry && Number.isFinite(lat) && Number.isFinite(lon)) {
    return {
      type: 'Feature',
      id: props.nmsId || props.id || `${airport}-${props.notamNumber || Math.random()}`,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        id: String(props.nmsId || props.id || props.notamNumber || ''),
        airport,
        notamNumber: props.notamNumber || props.number || '',
        feature: props.feature || props.icaoLocation || '',
        text: props.icaoMessage || props.text || props.notamText || props.description || '',
        effectiveStart: props.effectiveStart || props.startDate || null,
        effectiveEnd: props.effectiveEnd || props.endDate || null,
        lat,
        lon,
      },
    };
  }

  if (!geometry) return null;

  return {
    type: 'Feature',
    id: props.nmsId || props.id || `${airport}-${props.notamNumber || Math.random()}`,
    geometry,
    properties: {
      id: String(props.nmsId || props.id || props.notamNumber || ''),
      airport,
      notamNumber: props.notamNumber || props.number || '',
      feature: props.feature || props.icaoLocation || '',
      text: props.icaoMessage || props.text || props.notamText || props.description || '',
      effectiveStart: props.effectiveStart || props.startDate || null,
      effectiveEnd: props.effectiveEnd || props.endDate || null,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
    },
  };
}

async function fetchAirportNotams(token, airport) {
  const params = new URLSearchParams({
    responseFormat: 'GEOJSON',
    location: airport,
  });

  const res = await fetch(`${NMS_API}?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`FAA NOTAM unavailable for ${airport} (${res.status})`);
  }

  const body = await res.json();
  const rows = Array.isArray(body?.data?.geojson)
    ? body.data.geojson
    : Array.isArray(body?.features)
      ? body.features
      : Array.isArray(body?.data)
        ? body.data
        : [];

  return rows.map((row) => normalizeNotamFeature(row, airport)).filter(Boolean);
}

export async function fetchAreaNotams(lat, lon, radiusMiles = 120) {
  const clientId = String(process.env.FAA_NMS_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.FAA_NMS_CLIENT_SECRET || '').trim();
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}:${clientId ? 'on' : 'off'}`;

  if (!clientId || !clientSecret) {
    return {
      enabled: false,
      source: 'api-nms.aim.faa.gov',
      message:
        'Set FAA_NMS_CLIENT_ID and FAA_NMS_CLIENT_SECRET in .env (request access from NOTAMS@faa.gov) for airport NOTAMs.',
      fetchedAt: new Date().toISOString(),
      count: 0,
      radiusMiles,
      airports: STL_AIRPORTS,
      type: 'FeatureCollection',
      features: [],
    };
  }

  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const token = await getNmsToken(clientId, clientSecret);
  const featureMap = new Map();

  for (const airport of STL_AIRPORTS) {
    try {
      const features = await fetchAirportNotams(token, airport);
      for (const feature of features) {
        featureMap.set(feature.id, feature);
      }
    } catch {
      /* skip airport on failure */
    }
  }

  const features = [...featureMap.values()]
    .map((feature) => {
      if (Number.isFinite(feature.properties.lat) && Number.isFinite(feature.properties.lon)) {
        return {
          ...feature,
          properties: {
            ...feature.properties,
            distanceMiles:
              Math.round(
                distanceMiles(lat, lon, feature.properties.lat, feature.properties.lon) * 10
              ) / 10,
          },
        };
      }
      return {
        ...feature,
        properties: { ...feature.properties, distanceMiles: null },
      };
    })
    .filter((feature) => {
      if (feature.properties.distanceMiles == null) return true;
      return feature.properties.distanceMiles <= radiusMiles;
    });

  const payload = {
    enabled: true,
    source: 'api-nms.aim.faa.gov',
    fetchedAt: new Date().toISOString(),
    count: features.length,
    radiusMiles,
    airports: STL_AIRPORTS,
    type: 'FeatureCollection',
    features,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
