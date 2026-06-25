import type { Train } from '../types';

export function trainKey(train: Train) {
  return `train:${train.trainKind || 'passenger'}:${train.trainNum}:${train.trainId}`;
}

export function trainKindLabel(train: Train) {
  if (train.trainKind === 'freight') return 'Freight';
  if (train.trainKind === 'crossing') return 'Crossing';
  if (train.trainKind === 'yard') return 'Rail yard';
  if (train.trainKind === 'corridor') return 'Freight corridor';
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

export function sortTrainsByDistance(trains: Train[], lat: number, lon: number) {
  const priority = (train: Train) => {
    if (train.trainKind === 'freight' && train.velocityMph) return 0;
    if (train.trainKind === 'crossing') return 1;
    if (train.trainKind === 'freight') return 2;
    if (train.trainKind === 'passenger') return 3;
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
