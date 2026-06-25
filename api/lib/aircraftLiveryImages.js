import overrides from '../../config/airlines-overrides.json' with { type: 'json' };
import curatedPhotos from '../../config/airline-livery-photos.json' with { type: 'json' };
import { aircraftTypeName } from './aircraftTypeImages.js';
import { resolveWikipediaPhotoQueries, wikipediaSummaryThumbnail } from './wikipediaImages.js';
import { normalizeAircraftType, resolveAircraftTypeCandidates } from '../../lib/aircraftTypeFallback.js';

const AIRLINE_DEFAULT_TYPES = {
  SWA: 'B738',
  UAL: 'B738',
  AAL: 'B738',
  DAL: 'B738',
  ASA: 'B738',
  NKS: 'A320',
  FFT: 'A320',
  JBU: 'A320',
  MXY: 'B738',
  AAY: 'A320',
  RPA: 'E175',
  ENY: 'E175',
  SKW: 'CRJ9',
  EDV: 'CRJ9',
  GJS: 'CRJ9',
  JIA: 'CRJ9',
  QXE: 'DH8D',
  ASH: 'B738',
  FDX: 'B763',
  UPS: 'B763',
  GTI: 'B744',
  ATN: 'B763',
};

const liveryCache = new Map();
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;

function airlineName(icao) {
  const code = (icao || '').trim().toUpperCase();
  if (!code) return null;
  return overrides[code] || null;
}

function upscaleWikiThumb(url) {
  if (!url || url.includes('.svg')) return null;
  return url.replace(/\/(\d+)px-/, '/960px-');
}

function cacheGet(key) {
  const entry = liveryCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > entry.ttl) {
    liveryCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  liveryCache.set(key, {
    value,
    ts: Date.now(),
    ttl: value ? HIT_TTL_MS : MISS_TTL_MS,
  });
}

function buildTypeQueries(airlineLabel, typeCode) {
  const typeName = aircraftTypeName(typeCode) || typeCode;
  return [
    `${airlineLabel} ${typeName}`,
    `${airlineLabel} ${typeName} aircraft`,
    `${airlineLabel} ${typeCode}`,
  ];
}

/**
 * Representative airline aircraft photo when the exact tail has no spotter shot.
 * Prefers the airline's Wikipedia page thumbnail (reliable fleet/livery photo).
 */
export async function resolveAirlineLiveryPhotoUrl({ airline, type }) {
  const airlineIcao = (airline || '').trim().toUpperCase();
  if (!airlineIcao) return null;

  const typeCode = normalizeAircraftType(type) || AIRLINE_DEFAULT_TYPES[airlineIcao] || 'B738';
  const cacheKey = `${airlineIcao}|${typeCode}|summary-v2`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const airlineLabel = airlineName(airlineIcao) || airlineIcao;

  const curated = curatedPhotos[airlineIcao];
  if (curated) {
    const hit = { url: curated, title: airlineLabel, query: 'curated' };
    cacheSet(cacheKey, hit);
    return hit;
  }

  const summary = await wikipediaSummaryThumbnail(airlineLabel);
  const summaryUrl = upscaleWikiThumb(summary?.url);
  if (summaryUrl) {
    const hit = { url: summaryUrl, title: summary.title || airlineLabel, query: `${airlineLabel} summary` };
    cacheSet(cacheKey, hit);
    return hit;
  }

  for (const candidateType of resolveAircraftTypeCandidates(typeCode)) {
    const queries = buildTypeQueries(airlineLabel, candidateType);
    const match = await resolveWikipediaPhotoQueries(queries, airlineLabel);
    const url = upscaleWikiThumb(match?.url);
    if (url) {
      const hit = { ...match, url, query: queries[0] };
      cacheSet(cacheKey, hit);
      return hit;
    }
  }

  cacheSet(cacheKey, null);
  return null;
}

export function defaultTypeForAirline(airline) {
  const code = (airline || '').trim().toUpperCase();
  return code ? AIRLINE_DEFAULT_TYPES[code] || 'B738' : 'B738';
}
