import airportCheckpoints from '../../config/airport-checkpoints.json' with { type: 'json' };
import { attachOccupancy } from './occupancyEnrichment.js';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 5 * 60 * 1000;

/** @deprecated MyTSA backend — redirects to tsa.gov during federal funding lapses */
const MYTSA_WAIT_URL = 'https://apps.tsa.dhs.gov/mytsa/GetConfirmedWaitTimes.ashx';
const MYTSA_CHECKPOINTS_URL = 'https://apps.tsa.dhs.gov/mytsa/GetAirportCheckpoints.ashx';

let cache = { key: '', fetchedAt: 0, payload: null };

function waitMinutesToLevel(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 0) return null;
  if (m <= 5) return 25;
  if (m <= 15) return 45;
  if (m <= 30) return 65;
  if (m <= 45) return 80;
  return 95;
}

function parseMyTsaWaitBody(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.startsWith('<!')) return { ok: false, reason: 'html-response' };
  try {
    const data = JSON.parse(trimmed);
    const rows = Array.isArray(data) ? data : data?.results || data?.WaitTimes || [];
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
}

async function fetchMyTsaWaits(airportCode) {
  const params = new URLSearchParams({ ap: airportCode, output: 'json' });
  const res = await fetch(`${MYTSA_WAIT_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    redirect: 'manual',
  });
  if (res.status >= 300 && res.status < 400) {
    return { ok: false, reason: 'redirected-offline' };
  }
  const text = await res.text();
  return parseMyTsaWaitBody(text);
}

function fallbackCheckpoints(airportCode) {
  const airport = airportCheckpoints[airportCode];
  if (!airport) return [];
  return (airport.checkpoints || []).map((cp) =>
    attachOccupancy(
      {
        id: `tsa:${airportCode}:${cp.id}`,
        airportCode,
        airportName: airport.name,
        checkpointId: cp.id,
        checkpointName: cp.name,
        lat: cp.lat,
        lon: cp.lon,
        waitMinutes: null,
        precheckWaitMinutes: null,
      },
      {
        label: 'TSA checkpoint · wait times unavailable (MyTSA offline)',
        level: null,
        source: 'tsa-gap',
        kind: 'infrastructure',
      }
    )
  );
}

/**
 * Fetch TSA checkpoint wait times when MyTSA API responds; otherwise return static checkpoint pins as gap markers.
 */
export async function fetchTsaWaitTimes(airportCode = 'STL') {
  const code = String(airportCode || 'STL').trim().toUpperCase();
  const cacheKey = code;
  if (cache.payload && cache.key === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.payload;
  }

  let apiStatus = 'offline';
  let checkpoints = [];

  try {
    const parsed = await fetchMyTsaWaits(code);
    if (parsed.ok && parsed.rows.length) {
      apiStatus = 'live';
      checkpoints = parsed.rows
        .map((row, index) => {
          const wait = Number(row.waitTime ?? row.WaitTime ?? row.wait ?? row.minutes);
          const name = String(row.checkpointName ?? row.CheckpointName ?? row.name ?? `Checkpoint ${index + 1}`).trim();
          const lat = Number(row.latitude ?? row.Latitude ?? row.lat);
          const lon = Number(row.longitude ?? row.Longitude ?? row.lon);
          const airport = airportCheckpoints[code];
          const fallback = airport?.checkpoints?.[index] || airport?.checkpoints?.[0];
          const point = {
            id: `tsa:${code}:${row.checkpointID ?? row.id ?? index}`,
            airportCode: code,
            airportName: airport?.name || `${code} Airport`,
            checkpointName: name,
            lat: Number.isFinite(lat) ? lat : fallback?.lat,
            lon: Number.isFinite(lon) ? lon : fallback?.lon,
            waitMinutes: Number.isFinite(wait) ? wait : null,
            precheckWaitMinutes: Number(row.precheckWaitTime ?? row.PreCheckWaitTime ?? row.preCheck) || null,
          };
          if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
          const level = waitMinutesToLevel(point.waitMinutes);
          return attachOccupancy(point, {
            label: level
              ? `TSA · ${point.waitMinutes} min wait · ${name}`
              : `TSA checkpoint · ${name} (wait not reported)`,
            level,
            source: level ? 'tsa-wait' : 'tsa-gap',
            kind: 'infrastructure',
          });
        })
        .filter(Boolean);
    }
  } catch (err) {
    apiStatus = err.message || 'error';
  }

  if (!checkpoints.length) {
    checkpoints = fallbackCheckpoints(code);
  }

  const payload = {
    airportCode: code,
    apiStatus,
    fetchedAt: new Date().toISOString(),
    endpoints: { waits: MYTSA_WAIT_URL, checkpoints: MYTSA_CHECKPOINTS_URL },
    checkpoints,
    count: checkpoints.length,
  };

  cache = { key: cacheKey, fetchedAt: Date.now(), payload };
  return payload;
}

export async function enrichAirportTsaOccupancy(airportHub, airportCode = 'STL') {
  const tsa = await fetchTsaWaitTimes(airportCode);
  if (!airportHub || typeof airportHub !== 'object') return airportHub;
  const maxWait = tsa.checkpoints.reduce((max, cp) => {
    const w = Number(cp.waitMinutes);
    return Number.isFinite(w) ? Math.max(max, w) : max;
  }, 0);
  const busiest = tsa.checkpoints.find((cp) => cp.occupancySource === 'tsa-wait' && cp.occupancyLevel != null);
  if (busiest) {
    attachOccupancy(airportHub, {
      label: `Airport security · up to ${maxWait} min TSA wait`,
      level: busiest.occupancyLevel,
      source: 'tsa-wait',
      kind: 'infrastructure',
    });
  } else if (tsa.checkpoints.length) {
    attachOccupancy(airportHub, {
      label: 'Airport security · TSA wait times not in public feed',
      level: null,
      source: 'tsa-gap',
      kind: 'infrastructure',
    });
  }
  airportHub.tsa = tsa;
  return airportHub;
}
