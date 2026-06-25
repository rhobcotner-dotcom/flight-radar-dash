/** Photo categories that should not be used as a generic fallback for unknown vessels. */
export const GENERIC_VESSEL_PHOTO_TYPES = new Set([
  'ship',
  'other',
  'cargo',
  'general',
  'general_cargo',
  'bulk',
  'bulk_carrier',
]);

const TYPE_KEYWORDS = [
  ['towboat', /\b(towboat|tow_boat|pushboat|pusher)\b/],
  ['towing', /\b(towing|tow\b)/],
  ['tugboat', /\b(tugboat|tug_boat)\b/],
  ['tug', /\btug\b/],
  ['barge', /\bbarge\b/],
  ['tanker', /\b(tanker|oil_tanker|chemical_tanker|lng)\b/],
  ['container_ship', /\b(container|container_ship)\b/],
  ['bulk_carrier', /\b(bulk|bulk_carrier|bulker)\b/],
  ['passenger', /\b(passenger|cruise)\b/],
  ['ferry', /\bferry\b/],
  ['roro', /\b(roro|roll_on)\b/],
];

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function matchTypeKeyword(value) {
  const key = normalizeKey(value);
  if (!key || key === 'other' || key === 'ship') return null;

  for (const [photoType, pattern] of TYPE_KEYWORDS) {
    if (pattern.test(key)) return photoType;
  }

  if (TYPE_KEYWORDS.some(([photoType]) => photoType === key)) return key;
  return key;
}

function aisPhotoTypeFromShipType(shipType) {
  const type = Number(shipType);
  if (!Number.isFinite(type) || type <= 0) return null;
  const category = Math.floor(type / 10);
  if (category >= 80 && category <= 89) return 'tanker';
  if (category >= 70 && category <= 79) return 'bulk_carrier';
  if (category >= 60 && category <= 69) return 'passenger';
  if (category >= 52 && category <= 59) return 'tugboat';
  if (category >= 30 && category <= 39) return 'tugboat';
  return null;
}

function decodeLikelyLengthMeters(lengthMeters) {
  const length = Number(lengthMeters);
  if (!Number.isFinite(length) || length <= 0) return null;
  if (length > 150) return length / 10;
  return length;
}

function looksLikeTowboat(vessel) {
  const raw = normalizeKey(vessel?.rawVesselType);
  if (raw && raw !== 'other') return false;

  const meters = decodeLikelyLengthMeters(vessel?.lengthMeters);
  if (meters != null && meters >= 28 && meters <= 55) return true;

  const name = String(vessel?.name || '').trim();
  if (!name) return false;
  if (/^(city of |mv |m\/v )/i.test(name)) return true;
  if (/\b(jr|sr|iii|ii|iv)\.?$/i.test(name)) return true;
  if (/^[A-Z][A-Z.'\s\d]{4,}$/i.test(name) && name.split(/\s+/).length >= 2) return true;

  return false;
}

export function inferVesselPhotoType(vessel) {
  const fromRaw = matchTypeKeyword(vessel?.rawVesselType);
  if (fromRaw) return fromRaw;

  const fromLabel = matchTypeKeyword(vessel?.typeLabel);
  if (fromLabel) return fromLabel;

  const fromShipType = aisPhotoTypeFromShipType(vessel?.shipType);
  if (fromShipType) return fromShipType;

  if (looksLikeTowboat(vessel)) return 'towboat';

  return null;
}

export function vesselPhotoTypeLabel(photoType) {
  if (!photoType) return 'Ship';
  return photoType.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function hashSeed(value) {
  const text = String(value || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function pickVariantPhotoUrl(photoType, seed, photoMap) {
  if (!photoType || !photoMap) return null;

  const entry = photoMap[photoType];
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  if (!Array.isArray(entry) || entry.length === 0) return null;

  const index = hashSeed(seed) % entry.length;
  return entry[index] || entry[0];
}
