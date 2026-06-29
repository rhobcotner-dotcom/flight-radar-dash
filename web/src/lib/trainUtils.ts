import type { Train } from '../types';

export type MarkerRouteEndpoints = {
  to?: string | null;
  from?: string | null;
};

export function trainKey(train: Train) {
  return `train:${train.trainKind || 'passenger'}:${train.trainNum}:${train.trainId}`;
}

export function trainKindLabel(train: Train) {
  if (train.trainKind === 'freight') return 'Freight';
  if (train.trainKind === 'crossing') return 'Crossing';
  if (train.trainKind === 'yard') return 'Rail yard';
  if (train.trainKind === 'corridor') return 'Freight corridor';
  if (train.trainKind === 'subway') return 'Subway';
  if (train.trainKind === 'light_rail') return 'Light rail';
  if (train.trainKind === 'commuter') return 'Commuter';
  return 'Passenger';
}

export function trainLabel(train: Train) {
  if (train.trainKind === 'crossing') {
    return train.routeName || 'Crossing blocked';
  }
  if (train.trainKind === 'yard') {
    return train.routeName || train.railroad || 'Rail yard';
  }
  if (train.trainKind === 'corridor') {
    return train.routeName || train.railroad || 'Freight corridor';
  }
  if (train.trainKind === 'freight') {
    if (train.railroad) return `${train.railroad} · ${train.trainNum}`;
    if (train.trainNum && train.trainNum !== 'APRS') return train.trainNum;
    return train.routeName?.slice(0, 40) || 'Rail beacon';
  }
  return `#${train.trainNum}`;
}

export function trainRouteLabel(train: Train) {
  if (train.trainKind === 'yard') {
    return train.railroad ? `${train.railroad} yard` : 'Class I yard';
  }
  if (train.trainKind === 'corridor') {
    return train.timely || train.destCode || train.routeName;
  }
  const endpoints = [train.originCode, train.destCode].filter(Boolean).join(' → ');
  return endpoints || train.routeName;
}

export function isAmtrakTrain(train: Train) {
  return train.railroad === 'Amtrak' || train.sourceLabel === 'Amtrak';
}

/** GTFS-RT subway, light rail, commuter, and non-Amtrak regional passenger (MBTA, SEPTA, 511, etc.). */
export function isMetroTrain(train: Train) {
  if (train.trainKind === 'subway' || train.trainKind === 'light_rail' || train.trainKind === 'commuter') {
    return true;
  }
  return train.trainKind === 'passenger' && !isAmtrakTrain(train);
}

export function isClassicRailTrain(train: Train) {
  if (isMetroTrain(train)) return false;
  return (
    train.trainKind === 'passenger' ||
    train.trainKind === 'freight' ||
    train.trainKind === 'crossing' ||
    train.trainKind === 'yard' ||
    train.trainKind === 'corridor'
  );
}

function amtrakEndpointAbbrev(name?: string | null, code?: string | null) {
  const codeLabel = String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (codeLabel) return codeLabel.slice(0, 4);

  const normalized = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!normalized) return null;

  const known: Record<string, string> = {
    'kansas city': 'KC',
    'st. louis': 'STL',
    'st louis': 'STL',
    'chicago union station': 'CHI',
    'chicago': 'CHI',
    'los angeles': 'LAX',
    'san francisco': 'SFO',
    'new york': 'NYP',
    'washington': 'WAS',
    'philadelphia': 'PHL',
    'denver': 'DEN',
    'seattle': 'SEA',
    'portland': 'PDX',
    'boston': 'BOS',
    'atlanta': 'ATL',
    'dallas': 'DFW',
    'houston': 'HOU',
    'new orleans': 'NOL',
    'memphis': 'MEM',
    'omaha': 'OMA',
    'alton': 'ALN',
  };
  if (known[normalized]) return known[normalized];

  for (const [key, abbrev] of Object.entries(known)) {
    if (normalized.startsWith(key)) return abbrev;
  }

  const word = normalized.split(/[\s,–-]+/)[0] || '';
  return word ? word.slice(0, 3).toUpperCase() : null;
}

export function mapAmtrakTrainMarkerLabels(train: Train): {
  bottomLabel: string | null;
  bottomRoute: MarkerRouteEndpoints | null;
} {
  if (!isAmtrakTrain(train)) {
    return { bottomLabel: null, bottomRoute: null };
  }

  const to = amtrakEndpointAbbrev(train.destName, train.destCode);
  const from = amtrakEndpointAbbrev(train.originName, train.originCode);

  return {
    bottomLabel: 'Amtrak',
    bottomRoute: to || from ? { to, from } : null,
  };
}

export function sortTrainsByDistance(trains: Train[], lat: number, lon: number) {
  const priority = (train: Train) => {
    if (train.trainKind === 'freight' && train.velocityMph) return 0;
    if (train.trainKind === 'crossing') return 1;
    if (train.trainKind === 'freight') return 2;
    if (train.trainKind === 'passenger') return 3;
    if (train.trainKind === 'subway' || train.trainKind === 'light_rail' || train.trainKind === 'commuter') return 3;
    if (train.trainKind === 'yard') return 4;
    return 5;
  };

  return [...trains].sort((a, b) => {
    const kindDelta = priority(a) - priority(b);
    if (kindDelta !== 0) return kindDelta;
    const da = a.distanceMiles ?? Number.POSITIVE_INFINITY;
    const db = b.distanceMiles ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}
