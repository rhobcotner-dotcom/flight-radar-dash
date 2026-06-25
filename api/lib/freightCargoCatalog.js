/** Canonical freight commodities — user-facing labels only, no jargon. */
export const FREIGHT_CARGO_CATALOG = {
  coal: {
    label: 'Coal',
    detail: 'Unit train · loaded hoppers',
    keywords: /\b(coal|black diamonds|unit coal|cola? train)\b/i,
    weight: 0.92,
  },
  grain: {
    label: 'Grain',
    detail: 'Corn, soybeans, or wheat',
    keywords: /\b(grain|corn|soy|soybean|wheat|shuttle train|shuttle)\b/i,
    weight: 0.9,
  },
  emptyGrain: {
    label: 'Empty grain hoppers',
    detail: 'Repositioning · no load',
    keywords: /\b(empty grain|mty hopper|mt hopper)\b/i,
    weight: 0.88,
  },
  crudeOil: {
    label: 'Crude oil',
    detail: 'Tank train',
    keywords: /\b(crude|oil train|petroleum crude|bakk(en)?)\b/i,
    weight: 0.9,
  },
  gas: {
    label: 'Natural gas & LPG',
    detail: 'Propane, butane, or LNG tank cars',
    keywords: /\b(lpg|lng|propane|butane|natural gas|ng train|gas train|gasoline)\b/i,
    weight: 0.9,
  },
  chemicals: {
    label: 'Chemicals',
    detail: 'Industrial tanks · acids, plastics feedstock',
    keywords: /\b(chemical|caustic|acid tank|ethanol|chlorine|ammonia|petroche(m|mical))\b/i,
    weight: 0.88,
  },
  autos: {
    label: 'Automobiles',
    detail: 'Autorack / vehicle train',
    keywords: /\b(autorack|auto rack|vehicle train|automotive|multilevel|car train)\b/i,
    weight: 0.92,
  },
  consumerGoods: {
    label: 'Consumer goods',
    detail: 'Boxed freight in containers or trailers',
    keywords: /\b(stack|doublestack|intermodal|containers?|well cars?|ups|fedex|retail)\b/i,
    weight: 0.88,
  },
  steel: {
    label: 'Steel & metal',
    detail: 'Coil, pipe, scrap, or gondola loads',
    keywords: /\b(steel|coil|pipe|scrap metal|metal train)\b/i,
    weight: 0.85,
  },
  lumber: {
    label: 'Lumber & paper',
    detail: 'Forest products',
    keywords: /\b(lumber|forest|paper|pulp|wood|log train)\b/i,
    weight: 0.84,
  },
  cement: {
    label: 'Cement & aggregates',
    detail: 'Sand, gravel, stone',
    keywords: /\b(cement|aggregate|sand|gravel|stone|ballast)\b/i,
    weight: 0.84,
  },
  food: {
    label: 'Refrigerated food',
    detail: 'Perishables in reefers',
    keywords: /\b(reefer|refrigerator|perishable|food train|produce)\b/i,
    weight: 0.86,
  },
  mixed: {
    label: 'Mixed freight',
    detail: 'Manifest — multiple shippers',
    keywords: /\b(manifest|mixed freight|general merchandise|boxcar)\b/i,
    weight: 0.72,
  },
  empty: {
    label: 'Empty cars',
    detail: 'Equipment move · no cargo',
    keywords: /\b(mty|mt\b|empty|baretable|bare table|empties|lite power)\b/i,
    weight: 0.9,
  },
  local: {
    label: 'Local industry freight',
    detail: 'Switching / yard job',
    keywords: /\b(local|yard job|switching|switcher|road switcher)\b/i,
    weight: 0.78,
  },
  hopperBulk: {
    label: 'Bulk hoppers',
    detail: 'Grain or minerals — type unclear',
    keywords: /\b(hopper train|unit hopper)\b/i,
    weight: 0.62,
  },
};

const SYMBOL_TO_CARGO = {
  Z: 'consumerGoods',
  Q: 'consumerGoods',
  S: 'consumerGoods',
  P: 'consumerGoods',
  B: 'empty',
  V: 'autos',
  G: 'grain',
  X: 'emptyGrain',
  C: 'coal',
  E: 'empty',
  U: 'chemicals',
  H: 'mixed',
  M: 'mixed',
  J: 'steel',
  L: 'local',
  R: 'local',
  T: 'mixed',
  D: 'empty',
  Y: 'local',
  I: 'consumerGoods',
};

export function catalogEntry(id) {
  return FREIGHT_CARGO_CATALOG[id] || null;
}

export function normalizeCargoLabel(raw) {
  const text = String(raw || '').toLowerCase();
  if (!text) return null;

  for (const [id, entry] of Object.entries(FREIGHT_CARGO_CATALOG)) {
    if (entry.label.toLowerCase() === text) return { id, ...entry };
    if (text.includes(entry.label.toLowerCase())) return { id, ...entry };
  }

  if (/intermodal|container|stack|trailer/.test(text)) return { id: 'consumerGoods', ...FREIGHT_CARGO_CATALOG.consumerGoods };
  if (/coal/.test(text)) return { id: 'coal', ...FREIGHT_CARGO_CATALOG.coal };
  if (/grain|corn|soy|wheat/.test(text)) return { id: 'grain', ...FREIGHT_CARGO_CATALOG.grain };
  if (/petroleum|crude|oil/.test(text) && !/motor/.test(text)) return { id: 'crudeOil', ...FREIGHT_CARGO_CATALOG.crudeOil };
  if (/lpg|gas|propane|lng/.test(text)) return { id: 'gas', ...FREIGHT_CARGO_CATALOG.gas };
  if (/chemical|ethanol|tank/.test(text)) return { id: 'chemicals', ...FREIGHT_CARGO_CATALOG.chemicals };
  if (/auto|vehicle/.test(text)) return { id: 'autos', ...FREIGHT_CARGO_CATALOG.autos };
  if (/steel|metal|pipe/.test(text)) return { id: 'steel', ...FREIGHT_CARGO_CATALOG.steel };
  if (/mixed|manifest/.test(text)) return { id: 'mixed', ...FREIGHT_CARGO_CATALOG.mixed };
  if (/empty/.test(text)) return { id: 'empty', ...FREIGHT_CARGO_CATALOG.empty };

  return null;
}

export function matchCargoKeywords(haystack) {
  const hits = [];
  for (const [id, entry] of Object.entries(FREIGHT_CARGO_CATALOG)) {
    const match = haystack.match(entry.keywords);
    if (!match) continue;
    hits.push({
      id,
      cargo: entry.label,
      detail: entry.detail,
      weight: entry.weight,
      reason: match[0],
      tier: 'explicit',
      source: 'comment',
    });
  }
  return hits;
}

export function cargoFromSymbolType(typeLetter) {
  const id = SYMBOL_TO_CARGO[String(typeLetter || '').toUpperCase()];
  if (!id) return null;
  const entry = FREIGHT_CARGO_CATALOG[id];
  return {
    id,
    cargo: entry.label,
    detail: entry.detail,
    weight: id === 'consumerGoods' ? 0.92 : id === 'coal' || id === 'grain' ? 0.94 : 0.88,
    tier: 'explicit',
    source: 'train-symbol',
  };
}

export function formatCarryingCargo(clue) {
  const normalized = normalizeCargoLabel(clue.cargo) || {
    id: clue.id,
    label: clue.cargo,
    detail: clue.detail || '',
  };
  return {
    cargo: normalized.label || clue.cargo,
    detail: clue.detail || normalized.detail || null,
    pct: clue.pct,
  };
}

/** @deprecated use formatCarryingCargo */
export const formatDreamCargo = formatCarryingCargo;
