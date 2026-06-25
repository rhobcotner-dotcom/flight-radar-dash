import symbolCodes from '../../config/train-symbol-codes.json' with { type: 'json' };
import { cargoFromSymbolType, catalogEntry } from './freightCargoCatalog.js';

const STATION_HINTS = symbolCodes.stationHints;

const SYMBOL_PATTERNS = [
  /\b(?:BNSF|UP|CSX|NS|CN|CP|KCS|CPKC)[\s-]*([A-Z])[\s-]?([A-Z]{3})[\s-]?([A-Z]{3})\d?\b/i,
  /\b([A-Z])[\s-]([A-Z]{3})[\s-]([A-Z]{3})\b/,
  /\b([A-Z])([A-Z]{3})([A-Z]{3})\d?\b/,
  /\b(?:train|symbol|trn)[\s:#-]*([A-Z0-9-]{5,12})\b/i,
];

export function parseTrainSymbol(text, railroad = null) {
  const haystack = String(text || '').toUpperCase();
  if (!haystack.trim()) return null;

  for (const pattern of SYMBOL_PATTERNS) {
    const match = haystack.match(pattern);
    if (!match) continue;

    let typeLetter = match[1]?.[0];
    let origin = match[2]?.slice(0, 3);
    let dest = match[3]?.slice(0, 3);

    if (match[0].length >= 7 && !match[2]) {
      const compact = match[1]?.replace(/[^A-Z0-9]/g, '') || match[0].replace(/[^A-Z0-9]/g, '');
      if (compact.length >= 7) {
        typeLetter = compact[0];
        origin = compact.slice(1, 4);
        dest = compact.slice(4, 7);
      }
    }

    if (!typeLetter || !origin || !dest) continue;

    const rr = String(railroad || haystack.match(/\b(BNSF|UP|CSX|NS|CN|CP|KCS)\b/)?.[1] || 'BNSF').toUpperCase();
    const mapped = cargoFromSymbolType(typeLetter);
    if (!mapped) continue;

    return {
      raw: match[0].trim(),
      railroad: rr,
      typeLetter,
      origin,
      dest,
      cargo: mapped.cargo,
      detail: mapped.detail,
      weight: mapped.weight,
      cargoId: mapped.id,
      originHint: STATION_HINTS[origin] || null,
      destHint: STATION_HINTS[dest] || null,
      source: 'train-symbol',
    };
  }

  return null;
}

export function stationCommodityHint(code) {
  const hint = STATION_HINTS[String(code || '').toUpperCase()];
  if (!hint) return null;
  if (/petro/i.test(hint)) {
    const entry = catalogEntry('chemicals');
    return { cargo: entry.label, detail: entry.detail, weight: 0.58, reason: hint };
  }
  if (/grain/i.test(hint)) {
    const entry = catalogEntry('grain');
    return { cargo: entry.label, detail: entry.detail, weight: 0.58, reason: hint };
  }
  return null;
}
