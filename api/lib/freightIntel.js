import { distanceMiles } from '../../lib/geo.js';
import { fetchAprsFiMapStations } from './aprsFiMap.js';
import { fetchAprsStations } from './aprs.js';
import { fetchHighballTrains } from './highballTrains.js';
import { parseTrainSymbol, stationCommodityHint } from './freightSymbolParser.js';
import { fetchNearbyFreightContext } from './freightOsmContext.js';
import { hasFreightCargoClue } from './aprsRail.js';

const MAX_FREIGHT_MPH = 70;

export function sanitizeFreightSpeed(train) {
  const mph = Number(train.velocityMph);
  if (!Number.isFinite(mph)) return { mph: null, reliable: false };
  if (mph <= 0 || mph > MAX_FREIGHT_MPH) {
    return { mph: mph > MAX_FREIGHT_MPH ? null : mph, reliable: false, rawMph: mph };
  }
  return { mph: Math.round(mph), reliable: true, rawMph: mph };
}

function aprsCallsign(train) {
  if (train.trainId?.startsWith('aprs:')) {
    return train.trainId.slice(5).toUpperCase();
  }
  return String(train.originCode || train.trainNum || '').trim().toUpperCase() || null;
}

async function refreshAprsStation(train) {
  const callsign = aprsCallsign(train);
  if (!callsign) return null;

  const lat = Number(train.lat);
  const lon = Number(train.lon);
  const radiusMiles = 15;

  const apiKey = String(process.env.APRS_FI_API_KEY || '').trim();
  const payload = apiKey
    ? await fetchAprsStations(lat, lon, radiusMiles, { maxStations: 80 })
    : await fetchAprsFiMapStations(lat, lon, radiusMiles, { maxStations: 120 });

  if (!payload.enabled) return null;

  const match =
    payload.stations.find((s) => String(s.callsign || '').toUpperCase() === callsign) ||
    payload.stations.find((s) => distanceMiles(lat, lon, s.lat, s.lon) < 0.5);

  if (!match) return null;

  const speed = Number(match.speed);
  const speedMph = Number.isFinite(speed) ? Math.round(speed * 0.621371) : null;

  return {
    callsign: match.callsign,
    comment: match.comment || '',
    course: match.course,
    speedMph,
    observedAt: match.observedAt,
    source: payload.source?.includes('xml2') ? 'APRS map (live)' : 'APRS.fi (live)',
  };
}

async function matchHighball(train) {
  const lat = Number(train.lat);
  const lon = Number(train.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  try {
    const result = await fetchHighballTrains({ lat, lon, radiusMiles: 8 }, 8);
    if (!result.configured || !result.trains.length) return null;

    const nearest = result.trains
      .filter((row) => row.trainKind === 'freight')
      .sort((a, b) => distanceMiles(lat, lon, a.lat, a.lon) - distanceMiles(lat, lon, b.lat, b.lon))[0];

    if (!nearest) return null;
    const dist = distanceMiles(lat, lon, nearest.lat, nearest.lon);
    if (dist > 2) return null;

    return {
      routeName: nearest.routeName,
      railroad: nearest.railroad,
      trainNum: nearest.trainNum,
      source: 'Highball freight match',
    };
  } catch {
    return null;
  }
}

function extractLiveClues(train, aprsLive, highball) {
  const clues = [];
  const textParts = [
    aprsLive?.comment,
    train.routeName,
    train.trainNum,
    train.destCode,
    highball?.routeName,
    highball?.trainNum,
  ].filter(Boolean);
  const haystack = textParts.join(' ');

  const symbol = parseTrainSymbol(haystack, train.railroad || highball?.railroad);
  if (symbol) {
    clues.push({
      tier: 'explicit',
      id: symbol.cargoId,
      cargo: symbol.cargo,
      detail: symbol.detail,
      weight: symbol.weight,
      reason: `Symbol ${symbol.raw}`,
      source: 'train-symbol',
    });

    for (const code of [symbol.origin, symbol.dest]) {
      const hint = stationCommodityHint(code);
      if (hint) {
        clues.push({ tier: 'strong', ...hint, source: 'symbol-route' });
      }
    }
  }

  if (aprsLive?.comment) {
    clues.push({
      tier: 'explicit',
      rawComment: aprsLive.comment,
      source: aprsLive.source,
    });
  }

  if (highball) {
    clues.push({
      tier: 'strong',
      cargo: highball.routeName,
      weight: 0.65,
      reason: `Highball route ${highball.trainNum}`,
      source: 'highball',
    });
  }

  const loaded = String(train.trainState || '').toLowerCase();
  if (loaded.includes('empty') || /\b(mty|mt\b|empt)/i.test(haystack)) {
    clues.push({
      tier: 'explicit',
      id: 'empty',
      cargo: 'Empty cars',
      detail: 'Equipment move · no cargo',
      weight: 0.9,
      reason: 'Marked empty',
      source: 'status',
    });
  }

  return { clues, haystack, symbol };
}

export async function enrichFreightTrain(train) {
  const [aprsLive, highball, osmContext] = await Promise.all([
    refreshAprsStation(train),
    matchHighball(train),
    fetchNearbyFreightContext(Number(train.lat), Number(train.lon)),
  ]);

  const speedInfo = sanitizeFreightSpeed({
    ...train,
    velocityMph: aprsLive?.speedMph ?? train.velocityMph,
  });

  const { clues, haystack, symbol } = extractLiveClues(train, aprsLive, highball);

  if (osmContext && (symbol || hasFreightCargoClue({ routeName: haystack }))) {
    clues.push({ tier: 'strong', ...osmContext });
  }

  const railroad =
    train.railroad ||
    symbol?.railroad ||
    highball?.railroad ||
    haystack.match(/\b(BNSF|UP|CSX|NS|KCS|CN|CP|CPKC)\b/i)?.[1]?.toUpperCase().replace('CPKC', 'KCS') ||
    null;

  return {
    train: {
      ...train,
      routeName: aprsLive?.comment || train.routeName,
      velocityMph: speedInfo.mph,
      heading: aprsLive?.course ?? train.heading,
      railroad,
    },
    intel: {
      aprsLive,
      highball,
      osmContext,
      symbol,
      speedInfo,
      clues,
      haystack,
    },
  };
}
