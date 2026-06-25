import { distanceMiles } from '../../lib/geo.js';

const NWPS_GAUGES = 'https://api.water.noaa.gov/nwps/v1/gauges';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 10 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

async function fetchStageflow(lid) {
  const res = await fetch(`https://api.water.noaa.gov/nwps/v1/gauges/${encodeURIComponent(lid)}/stageflow`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

function floodCategoryLabel(category) {
  const map = {
    no_flooding: 'Normal',
    action: 'Action',
    minor: 'Minor flood',
    moderate: 'Moderate flood',
    major: 'Major flood',
    record: 'Record flood',
  };
  return map[String(category || '').toLowerCase()] || category || 'Unknown';
}

export async function fetchNwpsRiverForecast(lat, lon, radiusMiles = 85) {
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}`;
  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const pad = radiusMiles / 69;
  const params = new URLSearchParams({
    'bbox.xmin': String(lon - pad * 1.2),
    'bbox.ymin': String(lat - pad),
    'bbox.xmax': String(lon + pad * 1.2),
    'bbox.ymax': String(lat + pad),
    srid: 'EPSG_4326',
  });

  const res = await fetch(`${NWPS_GAUGES}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`NWPS river forecast unavailable (${res.status})`);

  const body = await res.json();
  const gauges = (Array.isArray(body?.gauges) ? body.gauges : [])
    .map((gauge) => {
      const gLat = Number(gauge.latitude);
      const gLon = Number(gauge.longitude);
      if (!Number.isFinite(gLat) || !Number.isFinite(gLon)) return null;
      const status = gauge.status || {};
      const observed = status.observed?.primary || status.observed?.secondary || {};
      const forecast = status.forecast?.primary || status.forecast?.secondary || {};
      return {
        lid: gauge.lid,
        name: gauge.name,
        lat: gLat,
        lon: gLon,
        observedStageFt: observed.stage?.value ?? null,
        observedFlowKcfs: observed.flow?.value ?? null,
        forecastStageFt: forecast.stage?.value ?? null,
        forecastTime: forecast.stage?.validTime || null,
        floodCategory: floodCategoryLabel(status.floodCategory?.observed),
        floodCategoryForecast: floodCategoryLabel(status.floodCategory?.forecast),
        distanceMiles:
          Math.round(distanceMiles(lat, lon, gLat, gLon) * 10) / 10,
      };
    })
    .filter(Boolean)
    .filter((g) => g.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 25);

  const top = gauges.slice(0, 6);
  await Promise.all(
    top.map(async (gauge) => {
      const flow = await fetchStageflow(gauge.lid);
      const forecastData = flow?.forecast?.data;
      if (Array.isArray(forecastData) && forecastData.length) {
        const peak = forecastData.reduce(
          (best, row) => (row.stage > (best?.stage ?? -Infinity) ? row : best),
          null
        );
        if (peak) {
          gauge.forecastPeakStageFt = peak.stage;
          gauge.forecastPeakTime = peak.validTime || null;
        }
      }
    })
  );

  const payload = {
    source: 'api.water.noaa.gov/nwps',
    fetchedAt: new Date().toISOString(),
    count: gauges.length,
    radiusMiles,
    gauges,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
