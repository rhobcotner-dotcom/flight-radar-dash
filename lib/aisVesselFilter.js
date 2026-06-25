/** AIS ship type categories (first two digits). See ITU-R M.1371. */
const SIGNIFICANT_TYPE_RANGES = [
  [60, 69], // Passenger
  [70, 79], // Cargo
  [80, 89], // Tanker
  [90, 99], // Other (often large)
];

const SMALL_TYPE_RANGES = [
  [30, 39], // Fishing, towing, pleasure-adjacent
  [40, 49], // High-speed craft
  [50, 59], // Pilot / tug / small special — kept only if dimensions say large
];

export function aisTypeCategory(type) {
  const code = Number(type);
  if (!Number.isFinite(code) || code <= 0) return null;
  return Math.floor(code / 10);
}

export function aisVesselLengthMeters(vessel) {
  const length = Number(vessel?.lengthMeters);
  if (Number.isFinite(length) && length > 0) return length;

  const a = Number(vessel?.dimensionA);
  const b = Number(vessel?.dimensionB);
  if (Number.isFinite(a) && Number.isFinite(b) && a + b > 0) return a + b;

  return null;
}

export function isSignificantVessel(vessel) {
  if (!vessel) return false;

  const length = aisVesselLengthMeters(vessel);
  const draught = Number(vessel?.draughtMeters);
  const type = Number(vessel?.shipType);
  const rawType = String(vessel?.rawVesselType || vessel?.vesselType || '').toLowerCase();

  if (rawType) {
    if (/fishing|pleasure|yacht|recreational|sailing|dive/.test(rawType)) {
      return (length ?? 0) >= 45 || (Number.isFinite(draught) && draught >= 4);
    }
    if (/tanker|cargo|bulk|container|passenger|carrier|barge|tug|general|roro|ferry/.test(rawType)) {
      return true;
    }
    if (rawType === 'other') {
      return (length ?? 0) >= 40 || (Number.isFinite(draught) && draught >= 3.5);
    }
  }

  if (Number.isFinite(type) && type > 0) {
    for (const [min, max] of SMALL_TYPE_RANGES) {
      if (type >= min && type <= max) {
        return (length ?? 0) >= 45 || (Number.isFinite(draught) && draught >= 4);
      }
    }

    for (const [min, max] of SIGNIFICANT_TYPE_RANGES) {
      if (type >= min && type <= max) return true;
    }

    return false;
  }

  return (length ?? 0) >= 50 || (Number.isFinite(draught) && draught >= 4);
}

export function aisShipTypeLabel(type) {
  const category = aisTypeCategory(type);
  if (category == null) return 'Ship';
  if (category >= 70 && category <= 79) return 'Cargo';
  if (category >= 80 && category <= 89) return 'Tanker';
  if (category >= 60 && category <= 69) return 'Passenger';
  if (category >= 90) return 'Other';
  return 'Ship';
}
