const METAR_API = 'https://aviationweather.gov/api/data/metar';
const TAF_API = 'https://aviationweather.gov/api/data/taf';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 90 * 1000;

const DEFAULT_SITES = ['KSTL', 'KSUS', 'KBLV', 'KUIN', 'KCPS'];
const SITE_COORDS = {
  KSTL: { lat: 38.7525, lon: -90.3734, name: 'St Louis Lambert' },
  KSUS: { lat: 38.662, lon: -90.652, name: 'Spirit of St Louis' },
  KBLV: { lat: 38.54, lon: -89.845, name: 'Scott AFB' },
  KUIN: { lat: 39.942, lon: -91.194, name: 'Quincy' },
  KCPS: { lat: 38.5707, lon: -90.1562, name: 'Cahokia/St Louis Downtown' },
};

let cache = { fetchedAt: 0, data: null };

function cToF(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round((value * 9) / 5 + 32);
}

function knotsToMph(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 1.15078);
}

function normalizeMetar(row) {
  const icaoId = String(row?.icaoId || '').trim().toUpperCase();
  if (!icaoId) return null;

  const coords = SITE_COORDS[icaoId] || {};
  const lat = Number(row.lat ?? coords.lat);
  const lon = Number(row.lon ?? coords.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    icaoId,
    name: row.name || coords.name || icaoId,
    lat,
    lon,
    observedAt: row.reportTime || row.receiptTime || null,
    rawOb: row.rawOb || '',
    flightCategory: row.fltCat || 'UNK',
    temperatureC: row.temp ?? null,
    temperatureF: cToF(row.temp),
    dewpointC: row.dewp ?? null,
    windDirectionDeg: row.wdir ?? null,
    windSpeedMph: knotsToMph(row.wspd),
    visibility: row.visib || null,
    altimeterInHg: row.altim ? Math.round((row.altim * 0.02953 + Number.EPSILON) * 100) / 100 : null,
    wxString: row.wxString || '',
    clouds: Array.isArray(row.clouds) ? row.clouds : [],
  };
}

function normalizeTaf(rawTaf) {
  const icaoId = String(rawTaf?.icaoId || '').trim().toUpperCase();
  if (!icaoId) return null;

  return {
    icaoId,
    issuedAt: rawTaf.issueTime || rawTaf.validTimeFrom || null,
    validFrom: rawTaf.validTimeFrom || null,
    validTo: rawTaf.validTimeTo || null,
    rawTaf: rawTaf.rawTAF || rawTaf.rawTaf || '',
  };
}

export async function fetchMetarStations(siteIds = DEFAULT_SITES) {
  const ids = [...new Set(siteIds.map((id) => String(id).trim().toUpperCase()).filter(Boolean))];
  const cacheKey = ids.join(',');
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const [metarRes, tafRes] = await Promise.all([
    fetch(`${METAR_API}?ids=${encodeURIComponent(ids.join(','))}&format=json`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    }),
    fetch(`${TAF_API}?ids=${encodeURIComponent(ids.join(','))}&format=json`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    }),
  ]);

  if (!metarRes.ok) {
    throw new Error(`METAR unavailable (${metarRes.status})`);
  }

  const metarBody = await metarRes.json();
  const tafBody = tafRes.ok ? await tafRes.json() : [];
  const tafById = new Map(
    (Array.isArray(tafBody) ? tafBody : [])
      .map(normalizeTaf)
      .filter(Boolean)
      .map((row) => [row.icaoId, row])
  );

  const stations = (Array.isArray(metarBody) ? metarBody : [])
    .map(normalizeMetar)
    .filter(Boolean)
    .map((station) => ({
      ...station,
      taf: tafById.get(station.icaoId) || null,
    }))
    .sort((a, b) => a.icaoId.localeCompare(b.icaoId));

  const payload = {
    source: 'aviationweather.gov',
    fetchedAt: new Date().toISOString(),
    count: stations.length,
    stations,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
