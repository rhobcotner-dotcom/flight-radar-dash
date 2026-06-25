import { enrichFreightTrain, sanitizeFreightSpeed } from './freightIntel.js';
import { formatCarryingCargo, matchCargoKeywords } from './freightCargoCatalog.js';

const WEAK_CARGO_IDS = new Set(['mixed', 'local', 'hopperBulk']);

function headingToDirection(heading) {
  const deg = Number(heading);
  if (!Number.isFinite(deg)) return null;
  const n = ((deg % 360) + 360) % 360;
  if (n >= 315 || n < 45) return 'NB';
  if (n >= 45 && n < 135) return 'EB';
  if (n >= 135 && n < 225) return 'SB';
  return 'WB';
}

function keywordHaystack(intel, liveTrain) {
  return [
    intel.aprsLive?.comment,
    intel.symbol ? liveTrain.routeName : null,
    intel.highball?.routeName,
    intel.highball?.trainNum,
  ]
    .filter(Boolean)
    .join(' ');
}

function mergeScores(clues) {
  const scores = new Map();
  for (const clue of clues) {
    if (!clue.cargo || !clue.weight) continue;

    const key = clue.id || clue.cargo;
    const prev = scores.get(key) || {
      id: clue.id,
      cargo: clue.cargo,
      detail: clue.detail,
      score: 0,
      tier: clue.tier,
      sources: new Set(),
    };
    prev.score = Math.max(prev.score, clue.weight);
    if (clue.detail && !prev.detail) prev.detail = clue.detail;
    if (clue.tier === 'explicit') prev.tier = 'explicit';
    else if (clue.tier === 'strong' && prev.tier !== 'explicit') prev.tier = 'strong';
    if (clue.source) prev.sources.add(clue.source);
    scores.set(key, prev);
  }

  const rows = [...scores.values()].map((row) => ({
    id: row.id,
    cargo: row.cargo,
    detail: row.detail,
    pct: Math.round(row.score * 100),
    tier: row.tier,
    sources: [...row.sources],
  }));

  for (const row of rows) {
    const corroborations = rows.filter(
      (other) => other !== row && (other.id === row.id || other.cargo === row.cargo)
    ).length;
    if (corroborations > 0) {
      row.pct = Math.min(98, row.pct + 12 * corroborations);
      row.tier = 'explicit';
    }
  }

  return rows.sort((a, b) => b.pct - a.pct);
}

function qualifies(primary, intel, ranked) {
  if (!primary) return false;
  if (WEAK_CARGO_IDS.has(primary.id) && !intel.symbol) return false;

  const liveComment = intel.aprsLive?.comment || '';
  const liveKeywords = liveComment ? matchCargoKeywords(liveComment) : [];
  const liveMatch = liveKeywords.some((hit) => hit.id === primary.id || hit.cargo === primary.cargo);
  const hasSymbol = Boolean(intel.symbol && (intel.symbol.cargoId === primary.id || intel.symbol.cargo === primary.cargo));
  const sourceCount = primary.sources?.length || 0;
  const corroborated = ranked.filter((row) => row.id === primary.id || row.cargo === primary.cargo).length >= 2;

  if (hasSymbol && primary.pct >= 88) return true;
  if (liveMatch && primary.pct >= 85) return true;
  if (hasSymbol && liveMatch) return true;
  if (corroborated && primary.pct >= 78) return true;
  if (intel.highball && primary.sources?.includes('highball') && primary.pct >= 70) return true;

  return false;
}

export async function inferFreightDreamState(train, options = {}) {
  if (!train || (train.trainKind !== 'freight' && train.trainKind !== 'crossing')) {
    return { supported: false };
  }

  const enriched = options.skipEnrich
    ? {
        train,
        intel: {
          clues: [],
          haystack: train.routeName || '',
          aprsLive: train.routeName ? { comment: train.routeName } : null,
          speedInfo: sanitizeFreightSpeed(train),
        },
      }
    : await enrichFreightTrain(train);

  const { train: liveTrain, intel } = enriched;
  const haystack = keywordHaystack(intel, liveTrain) || intel.haystack || liveTrain.routeName || '';
  const clues = [...(intel.clues || []), ...matchCargoKeywords(haystack)];

  const ranked = mergeScores(clues.filter((c) => c.cargo && c.weight));
  const primary = ranked[0] || null;

  if (!qualifies(primary, intel, ranked)) {
    return { supported: false };
  }

  const altRow =
    ranked.find(
      (row) =>
        row !== primary &&
        row.cargo !== primary.cargo &&
        !WEAK_CARGO_IDS.has(row.id) &&
        row.pct >= 78
    ) || null;

  return {
    supported: true,
    primary: formatCarryingCargo(primary),
    alt: altRow ? formatCarryingCargo(altRow) : null,
    tagline: [
      liveTrain.railroad || intel.symbol?.railroad,
      headingToDirection(liveTrain.heading),
      intel.speedInfo?.reliable && intel.speedInfo.mph != null ? `${intel.speedInfo.mph} mph` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null,
    generatedAt: new Date().toISOString(),
  };
}
