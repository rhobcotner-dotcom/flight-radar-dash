import { boundingBox, distanceMiles, pointInBoundingBox } from '../../lib/geo.js';
import {
  aisShipTypeLabel,
  aisVesselLengthMeters,
  isSignificantVessel,
} from '../../lib/aisVesselFilter.js';
import { fetchAxiomVessels } from './axiomVessels.js';
import { bboxCenter, maxAisVesselsForBbox } from './viewportQuery.js';

const AISHUB_URL = 'http://data.aishub.net/ws.php';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 60 * 1000;

let aishubCache = { fetchedAt: 0, data: null };

function readNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeAishubRow(row) {
  if (!row || typeof row !== 'object') return null;

  if (!Array.isArray(row)) {
    const lat = readNumber(row.LATITUDE ?? row.latitude ?? row.lat);
    const lon = readNumber(row.LONGITUDE ?? row.longitude ?? row.lon);
    const mmsi = String(row.MMSI ?? row.mmsi ?? '').trim();
    if (!mmsi || lat == null || lon == null) return null;

    const dimensionA = readNumber(row.A ?? row.a);
    const dimensionB = readNumber(row.B ?? row.b);
    const draughtRaw = readNumber(row.DRAUGHT ?? row.draught);
    const draughtMeters =
      draughtRaw != null && draughtRaw > 20 ? draughtRaw / 10 : draughtRaw;

    const vessel = {
      mmsi,
      name: String(row.NAME ?? row.name ?? mmsi).trim(),
      lat,
      lon,
      course: readNumber(row.COG ?? row.cog ?? row.HEADING ?? row.heading),
      speedKnots: readNumber(row.SOG ?? row.sog),
      shipType: readNumber(row.TYPE ?? row.type),
      destination: String(row.DEST ?? row.dest ?? row.destination ?? '').trim() || null,
      dimensionA,
      dimensionB,
      draughtMeters,
      sourceLabel: 'AISHub',
    };

    vessel.lengthMeters = aisVesselLengthMeters(vessel);
    vessel.typeLabel = aisShipTypeLabel(vessel.shipType);
    return vessel;
  }

  if (row.length < 6) return null;

  const mmsi = String(row[0] || '').trim();
  const lon = readNumber(row[2]);
  const lat = readNumber(row[3]);
  if (!mmsi || lat == null || lon == null) return null;

  const dimensionA = readNumber(row[12]);
  const dimensionB = readNumber(row[13]);
  const draughtRaw = readNumber(row[16]);
  const draughtMeters =
    draughtRaw != null && draughtRaw > 20 ? draughtRaw / 10 : draughtRaw;

  const vessel = {
    mmsi,
    name: String(row[9] || row[8] || mmsi).trim(),
    lat,
    lon,
    course: readNumber(row[4]),
    speedKnots: readNumber(row[5]),
    shipType: readNumber(row[11]),
    destination: String(row[17] || '').trim() || null,
    dimensionA,
    dimensionB,
    draughtMeters,
    sourceLabel: 'AISHub',
  };

  vessel.lengthMeters = aisVesselLengthMeters(vessel);
  vessel.typeLabel = aisShipTypeLabel(vessel.shipType);
  return vessel;
}

function flattenAisBody(body) {
  if (!Array.isArray(body)) return [];

  const rows = [];
  for (const entry of body) {
    if (Array.isArray(entry)) {
      if (entry.length >= 6 && typeof entry[0] !== 'object') {
        rows.push(entry);
      } else {
        for (const nested of entry) {
          if (nested && typeof nested === 'object') rows.push(nested);
        }
      }
      continue;
    }

    if (entry && typeof entry === 'object') {
      if (entry.ERROR) continue;
      if (entry.MMSI != null || entry.mmsi != null || entry.LATITUDE != null || entry.latitude != null) {
        rows.push(entry);
      }
    }
  }

  return rows;
}

async function fetchAishubVessels(lat, lon, radiusMiles, viewport = null) {
  const username = String(process.env.AISHUB_USERNAME || '').trim();
  if (!username) return { vessels: [], configured: false };

  const box = viewport || boundingBox(lat, lon, radiusMiles);
  const center = viewport ? bboxCenter(viewport) : { lat, lon };
  const cacheKey = `${box.west.toFixed(2)}:${box.south.toFixed(2)}:${box.east.toFixed(2)}:${box.north.toFixed(2)}`;
  if (aishubCache.data?.cacheKey === cacheKey && Date.now() - aishubCache.fetchedAt < CACHE_MS) {
    return { vessels: aishubCache.data.payload, configured: true };
  }
  const params = new URLSearchParams({
    username,
    format: '1',
    output: 'json',
    latmin: String(box.south),
    latmax: String(box.north),
    lonmin: String(box.west),
    lonmax: String(box.east),
  });

  const res = await fetch(`${AISHUB_URL}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`AISHub feed unavailable (${res.status})`);
  }

  const body = await res.json();
  if (!Array.isArray(body)) {
    throw new Error(typeof body === 'string' ? body : 'AISHub feed returned unexpected data');
  }

  if (body.length === 1 && typeof body[0] === 'string' && body[0].startsWith('ERROR')) {
    throw new Error(body[0]);
  }

  const vessels = flattenAisBody(body)
    .map(normalizeAishubRow)
    .filter(Boolean)
    .filter(isSignificantVessel)
    .filter((vessel) =>
      viewport
        ? pointInBoundingBox(vessel.lat, vessel.lon, viewport)
        : distanceMiles(center.lat, center.lon, vessel.lat, vessel.lon) <= radiusMiles
    )
    .map((vessel) => ({
      ...vessel,
      distanceMiles: Math.round(distanceMiles(center.lat, center.lon, vessel.lat, vessel.lon) * 10) / 10,
    }));

  aishubCache = { fetchedAt: Date.now(), data: { cacheKey, payload: vessels } };
  return { vessels, configured: true };
}

function mergeVessels(...groups) {
  const map = new Map();
  for (const group of groups) {
    for (const vessel of group) {
      const key = `${vessel.mmsi}:${vessel.name}`.toLowerCase();
      map.set(key, { ...map.get(key), ...vessel });
    }
  }
  return [...map.values()];
}

export async function fetchAisVessels(lat, lon, radiusMiles = 85, viewport = null) {
  const queryBox = viewport || boundingBox(lat, lon, radiusMiles);
  const maxVessels = maxAisVesselsForBbox(queryBox);

  const [axiomResult, aishubResult] = await Promise.allSettled([
    fetchAxiomVessels(lat, lon, radiusMiles, viewport),
    fetchAishubVessels(lat, lon, radiusMiles, viewport),
  ]);

  const sources = [];
  const errors = [];
  let vessels = [];

  if (axiomResult.status === 'fulfilled') {
    sources.push('axiomoverwatch.io');
    vessels.push(...axiomResult.value.vessels);
  } else {
    errors.push(axiomResult.reason?.message || 'Axiom vessel feed failed');
  }

  if (aishubResult.status === 'fulfilled' && aishubResult.value.configured) {
    sources.push('data.aishub.net');
    vessels = mergeVessels(vessels, aishubResult.value.vessels);
  } else if (aishubResult.status === 'rejected' && process.env.AISHUB_USERNAME) {
    errors.push(aishubResult.reason?.message || 'AISHub feed failed');
  }

  vessels = vessels
    .sort((a, b) => {
      const sizeDelta = (b.lengthMeters ?? 0) - (a.lengthMeters ?? 0);
      if (sizeDelta !== 0) return sizeDelta;
      return a.distanceMiles - b.distanceMiles;
    })
    .slice(0, maxVessels);

  if (vessels.length === 0 && sources.length === 0) {
    return {
      enabled: false,
      source: 'none',
      message: errors[0] || 'Large-ship AIS feed unavailable',
      fetchedAt: new Date().toISOString(),
      count: 0,
      radiusMiles: viewport ? null : radiusMiles,
      viewport: viewport || null,
      limit: maxVessels,
      vessels: [],
    };
  }

  return {
    enabled: true,
    source: sources.join(' + '),
    fetchedAt: new Date().toISOString(),
    count: vessels.length,
    radiusMiles: viewport ? null : radiusMiles,
    viewport: viewport || null,
    limit: maxVessels,
    filter: 'significant-only',
    vessels,
    errors: errors.length ? errors : undefined,
  };
}
