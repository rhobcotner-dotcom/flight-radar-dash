import { distanceMiles } from '../../lib/geo.js';

const USGS_IV = 'https://waterservices.usgs.gov/nwis/iv/';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 5 * 60 * 1000;

const STL_GAUGES = [
  { site: '06934500', name: 'Missouri River at Hermann' },
  { site: '07010000', name: 'Missouri River at St Charles' },
  { site: '07019000', name: 'Mississippi River at St Louis' },
  { site: '05587400', name: 'Mississippi River at Grafton' },
  { site: '07022000', name: 'Meramec River at Valley Park' },
];

let cache = { fetchedAt: 0, data: null };

function latestValue(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const row = values[values.length - 1];
  const value = Number(row?.value);
  return Number.isFinite(value) ? value : null;
}

function parameterCode(series) {
  return String(series?.variable?.variableCode?.[0]?.value || series?.name || '');
}

export async function fetchRiverGauges(lat, lon, radiusMiles = 85) {
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const siteIds = STL_GAUGES.map((row) => row.site).join(',');
  const url = `${USGS_IV}?format=json&sites=${siteIds}&parameterCd=00065,00060&siteStatus=all`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`USGS river gauges unavailable (${res.status})`);
  }

  const body = await res.json();
  const metaBySite = new Map(STL_GAUGES.map((row) => [row.site, row]));
  const gaugeMap = new Map();

  for (const series of body?.value?.timeSeries || []) {
    const siteCode = series?.sourceInfo?.siteCode?.[0]?.value;
    if (!siteCode) continue;

    const latValue = Number(series?.sourceInfo?.geoLocation?.geogLocation?.latitude);
    const lonValue = Number(series?.sourceInfo?.geoLocation?.geogLocation?.longitude);
    if (!Number.isFinite(latValue) || !Number.isFinite(lonValue)) continue;

    const existing = gaugeMap.get(siteCode) || {
      siteId: siteCode,
      name: series?.sourceInfo?.siteName || metaBySite.get(siteCode)?.name || siteCode,
      lat: latValue,
      lon: lonValue,
      stageFt: null,
      flowCfs: null,
      observedAt: null,
    };

    const code = parameterCode(series);
    const latest = latestValue(series?.values?.[0]?.value);
    const observedAt = series?.values?.[0]?.value?.[series.values[0].value.length - 1]?.dateTime || null;

    if (code.includes('00065')) {
      existing.stageFt = latest != null ? Math.round(latest * 100) / 100 : existing.stageFt;
    }
    if (code.includes('00060')) {
      existing.flowCfs = latest != null ? Math.round(latest) : existing.flowCfs;
    }
    if (observedAt && (!existing.observedAt || observedAt > existing.observedAt)) {
      existing.observedAt = observedAt;
    }

    gaugeMap.set(siteCode, existing);
  }

  const rows = [...gaugeMap.values()]
    .map((gauge) => ({
      ...gauge,
      distanceMiles: Math.round(distanceMiles(lat, lon, gauge.lat, gauge.lon) * 10) / 10,
    }))
    .filter((gauge) => gauge.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  const payload = {
    source: 'waterservices.usgs.gov',
    fetchedAt: new Date().toISOString(),
    count: rows.length,
    radiusMiles,
    gauges: rows,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
