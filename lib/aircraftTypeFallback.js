/** Shared ICAO type → spritesheet / image lookup fallbacks (map + panel visuals). */
export const TYPE_FALLBACKS = {
  B38M: 'B738',
  B39M: 'B738',
  B737: 'B738',
  B739: 'B738',
  B73H: 'B738',
  B744: 'B772',
  B763: 'B772',
  B764: 'B772',
  B777: 'B772',
  B77L: 'B772',
  B788: 'B789',
  B789: 'B789',
  A319: 'A320',
  A20N: 'A320',
  A21N: 'A321',
  A333: 'A332',
  A339: 'A332',
  A359: 'A332',
  A35K: 'A332',
  A388: 'A332',
  C25A: 'C560',
  C25B: 'C560',
  C680: 'C560',
  C750: 'C560',
  GLF4: 'C560',
  GLF5: 'C560',
  GLF6: 'C560',
  E170: 'B738',
  E175: 'B738',
  E190: 'B738',
  E195: 'B738',
  CRJ2: 'B738',
  CRJ7: 'B738',
  CRJ9: 'B738',
  CRJX: 'B738',
  DH8D: 'AT75',
  SF34: 'SF34',
  PA28: 'C172',
  PA32: 'C182',
  PA46: 'SR22',
  PA34: 'PA44',
  PA30: 'PA44',
  BE33: 'BE36',
  BE35: 'BE36',
  BE58: 'BE36',
  BE40: 'BE36',
  TBM7: 'SR22',
  TBM8: 'SR22',
  TBM9: 'SR22',
  E50P: 'C560',
  E55P: 'C560',
  PC12: 'C560',
  PC24: 'C560',
};

export function familyFallback(code) {
  if (code.startsWith('B7') || code.startsWith('B8')) return 'B738';
  if (code.startsWith('A3') || code.startsWith('A2')) return 'A320';
  if (code.startsWith('A32')) return 'A320';
  if (code.startsWith('C1') || code.startsWith('C2') || code.startsWith('C4') || code.startsWith('C5')) {
    return 'C172';
  }
  if (code.startsWith('PA')) return 'C172';
  if (code.startsWith('BE')) return 'BE36';
  if (code.startsWith('SR')) return 'SR22';
  if (code.startsWith('TBM')) return 'SR22';
  if (code.startsWith('H') || code.startsWith('EC') || code.startsWith('AS') || code.startsWith('R44')) {
    return 'R44';
  }
  return 'B738';
}

export function normalizeAircraftType(type) {
  return (type || '').trim().toUpperCase();
}

/** Ordered ICAO codes to try for sprites, type photos, and livery hints. */
export function resolveAircraftTypeCandidates(type) {
  const code = normalizeAircraftType(type);
  if (!code) return ['B738'];

  const candidates = [
    code,
    TYPE_FALLBACKS[code],
    code.slice(0, 4),
    code.slice(0, 3),
    familyFallback(code),
    'B738',
  ].filter(Boolean);

  return [...new Set(candidates)];
}

export function resolveSpriteTypeCode(type) {
  return resolveAircraftTypeCandidates(type)[0] || 'B738';
}
