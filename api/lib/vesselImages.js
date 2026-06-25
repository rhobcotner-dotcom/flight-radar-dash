import vesselTypePhotos from '../../config/vessel-type-photos.json' with { type: 'json' };
import {
  GENERIC_VESSEL_PHOTO_TYPES,
  inferVesselPhotoType,
  pickVariantPhotoUrl,
  vesselPhotoTypeLabel,
} from '../../lib/vesselPhotoType.js';
import { resolveWikipediaPhotoQueries } from './wikipediaImages.js';

const TYPE_PHOTOS = vesselTypePhotos;
const imageCache = new Map();
const HIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 6 * 60 * 60 * 1000;

const SHIP_TITLE = /\b(ship|vessel|towboat|tugboat|tug|barge|tanker|ferry|carrier|boat|marine|maritime)\b/i;

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function cacheGet(key) {
  const entry = imageCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > entry.ttl) {
    imageCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  imageCache.set(key, {
    value,
    ts: Date.now(),
    ttl: value ? HIT_TTL_MS : MISS_TTL_MS,
  });
}

function resolvePhotoType({ photoType, type, rawType, name, lengthMeters, shipType }) {
  return (
    photoType ||
    inferVesselPhotoType({
      rawVesselType: rawType,
      typeLabel: type,
      name,
      lengthMeters: lengthMeters != null ? Number(lengthMeters) : null,
      shipType: shipType != null ? Number(shipType) : null,
    })
  );
}

export function curatedVesselTypePhotoUrl(photoType, seed) {
  if (!photoType || GENERIC_VESSEL_PHOTO_TYPES.has(photoType)) return null;
  const url = pickVariantPhotoUrl(photoType, seed, TYPE_PHOTOS);
  return url ? { url, key: photoType } : null;
}

function typeSearchQueries(photoType, rawType, typeLabel) {
  const queries = [];
  if (photoType && !GENERIC_VESSEL_PHOTO_TYPES.has(photoType)) {
    queries.push(vesselPhotoTypeLabel(photoType));
    queries.push(`${vesselPhotoTypeLabel(photoType)} ship`);
  }

  const raw = String(rawType || '').trim().replace(/_/g, ' ');
  const label = String(typeLabel || '').trim();
  if (label && label !== 'Ship') queries.push(label);
  if (raw && raw.toLowerCase() !== 'other') queries.push(raw);

  return [...new Set(queries.filter(Boolean))];
}

function acceptVesselTitle(title, { photoType, vesselName }) {
  if (!title) return false;
  if (SHIP_TITLE.test(title)) return true;
  if (!photoType || photoType === 'towboat') return false;
  return title.toLowerCase().includes(vesselName.toLowerCase());
}

export async function resolveVesselPhotoUrl({ name, type, rawType, photoType, lengthMeters, shipType }) {
  const vesselName = String(name || '').trim();
  if (!vesselName || /^unknown/i.test(vesselName) || /^\d+$/.test(vesselName)) {
    return null;
  }

  const resolvedPhotoType = resolvePhotoType({ photoType, type, rawType, name: vesselName, lengthMeters, shipType });
  if (resolvedPhotoType === 'towboat') return null;

  const cacheKey = `name:${vesselName.toLowerCase()}:${resolvedPhotoType || 'any'}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const queries = [vesselName, `${vesselName} (ship)`, `${vesselName} ship`];
  if (resolvedPhotoType) {
    queries.unshift(`${vesselName} ${vesselPhotoTypeLabel(resolvedPhotoType).toLowerCase()}`);
  }

  let match = null;
  for (const query of [...new Set(queries)]) {
    const candidate = await resolveWikipediaPhotoQueries([query], vesselName);
    if (candidate?.url && acceptVesselTitle(candidate.title, { photoType: resolvedPhotoType, vesselName })) {
      match = candidate;
      break;
    }
  }

  cacheSet(cacheKey, match);
  return match;
}

export async function resolveVesselTypeImageUrl(type, rawType, photoType, seed) {
  const resolvedPhotoType = resolvePhotoType({ photoType, type, rawType });
  const cacheKey = `type:${resolvedPhotoType || normalizeKey(rawType)}:${normalizeKey(type)}:${seed || ''}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const curated = curatedVesselTypePhotoUrl(resolvedPhotoType, seed || `${rawType}:${type}`);
  if (curated?.url) {
    const result = {
      url: curated.url,
      title: vesselPhotoTypeLabel(resolvedPhotoType) || type || rawType || 'Ship',
      query: curated.key,
    };
    cacheSet(cacheKey, result);
    return result;
  }

  const matchText = `${type || ''} ${rawType || ''}`.trim();
  const result = await resolveWikipediaPhotoQueries(
    typeSearchQueries(resolvedPhotoType, rawType, type),
    matchText,
  );
  cacheSet(cacheKey, result);
  return result;
}
