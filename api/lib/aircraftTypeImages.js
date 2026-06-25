import typeNames from '../../config/aircraft-type-names.json' with { type: 'json' };
import { resolveAircraftTypeCandidates } from '../../lib/aircraftTypeFallback.js';
import { resolveWikipediaPhotoQueries } from './wikipediaImages.js';

const TYPE_NAMES = typeNames;
const imageCache = new Map();
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;

function normalizeType(type) {
  return (type || '').trim().toUpperCase();
}

function typeEntry(type) {
  const code = normalizeType(type);
  if (!code) return null;
  const raw = TYPE_NAMES[code];
  if (!raw) return null;
  if (typeof raw === 'string') {
    return { name: raw, wiki: raw };
  }
  return {
    name: raw.name || raw.wiki || code,
    wiki: raw.wiki || raw.name || code,
  };
}

export function aircraftTypeName(type) {
  return typeEntry(type)?.name || null;
}

function cleanModelName(name) {
  return name
    .replace(/\s*\/\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function searchQueries(type) {
  const code = normalizeType(type);
  const entry = typeEntry(code);
  const queries = [];

  if (entry?.wiki) {
    queries.push(entry.wiki);
    queries.push(cleanModelName(entry.wiki.split('#')[0]));
  }

  if (entry?.name && entry.name !== entry.wiki) {
    queries.push(cleanModelName(entry.name));
  }

  queries.push(`${code} aircraft`);
  return [...new Set(queries.filter(Boolean))];
}

function cacheGet(code) {
  const entry = imageCache.get(code);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > entry.ttl) {
    imageCache.delete(code);
    return undefined;
  }
  return entry.value;
}

function cacheSet(code, value) {
  imageCache.set(code, {
    value,
    ts: Date.now(),
    ttl: value ? HIT_TTL_MS : MISS_TTL_MS,
  });
}

async function resolveTypePhotoForCode(type) {
  const code = normalizeType(type);
  if (!code) return null;

  const cached = cacheGet(code);
  if (cached !== undefined) return cached;

  const entry = typeEntry(code);
  const matchText = entry ? `${entry.wiki || ''} ${entry.name || ''}`.trim() : code;
  const result = await resolveWikipediaPhotoQueries(searchQueries(code), matchText);
  cacheSet(code, result);
  return result;
}

export async function resolveAircraftTypeImageUrl(type) {
  const code = normalizeType(type);
  if (!code) return null;

  for (const candidate of resolveAircraftTypeCandidates(code)) {
    const match = await resolveTypePhotoForCode(candidate);
    if (match?.url) {
      return { ...match, type: candidate, requestedType: code };
    }
  }

  return null;
}
