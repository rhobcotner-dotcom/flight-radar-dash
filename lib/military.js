const MIL_CALLSIGN = /^(RCH|CNV|EVAC|NAVY|ARMY|USAF|SPAR|DUKE|IRON|REACH|SAM|CONVOY|HOMER|TOPCAT|VIPER|HAWK|TIGR|MOXY|BOLT|GOLD|JAKE|NINJA|REDEYE|TORCH|CHAOS|COBRA|HIDE|KING|MAKO|MOON|PACK|PAT|TALON|TEXAS|SENTRY|STEEL|SLAM|SNIP)/i;
const MIL_REG = /^(AF|AE|AD|CN|AN)\d/i;
const MIL_TYPE =
  /^(F1[568]|F2[23]|F35|T38|B52|B1B|B2|C17|C5|C130|C2|C30J|C32|C37|C40|KC10|KC135|KC46|U2|E3|E6|E8|H60|UH|CH47|CH53|AH64|V22|A10|A29|PC21|T6|P8|P3|RC135|EC130|GLF5|GLF6)/i;
const MIL_TYPE_PREFIXES = [
  'KC',
  'C17',
  'C5',
  'C130',
  'C30',
  'C32',
  'C37',
  'C40',
  'B52',
  'B1',
  'B2',
  'F15',
  'F16',
  'F18',
  'F22',
  'F35',
  'T38',
  'A10',
  'V22',
  'UH',
  'CH',
  'AH',
  'EC',
  'E3',
  'E6',
  'E8',
  'P8',
  'P3',
  'RC',
  'U2',
];

const MIL_PHOTO_ALIASES = {
  B52H: 'B52',
  B52: 'B52',
  B1: 'B1B',
  B1B: 'B1B',
  B2A: 'B2',
  B2: 'B2',
  C30J: 'C130',
  C130J: 'C130',
  C130: 'C130',
  C17A: 'C17',
  C17: 'C17',
  C5M: 'C5',
  C5: 'C5',
  KC135R: 'KC135',
  KC135T: 'KC135',
  KC135: 'KC135',
  KC10A: 'KC10',
  KC10: 'KC10',
  KC46A: 'KC46',
  KC46: 'KC46',
  F15C: 'F15',
  F15D: 'F15',
  F15E: 'F15',
  F15: 'F15',
  F16C: 'F16',
  F16D: 'F16',
  F16: 'F16',
  F18C: 'F18',
  F18E: 'F18',
  F18F: 'F18',
  F18: 'F18',
  FA18: 'F18',
  F22A: 'F22',
  F22: 'F22',
  F35A: 'F35',
  F35B: 'F35',
  F35C: 'F35',
  F35: 'F35',
  A10C: 'A10',
  A10: 'A10',
  V22A: 'V22',
  V22B: 'V22',
  V22: 'V22',
  CV22: 'V22',
  E3B: 'E3',
  E3C: 'E3',
  E3: 'E3',
  E6B: 'E6',
  E6: 'E6',
  E8C: 'E8',
  E8: 'E8',
  U2S: 'U2',
  U2: 'U2',
  P8A: 'P8',
  P8: 'P8',
  P3C: 'P3',
  P3: 'P3',
  RC135W: 'RC135',
  RC135V: 'RC135',
  RC135: 'RC135',
  T38A: 'T38',
  T38C: 'T38',
  T38: 'T38',
  CH47D: 'CH47',
  CH47F: 'CH47',
  CH47: 'CH47',
  CH53E: 'CH53',
  CH53: 'CH53',
  UH60M: 'UH60',
  UH60: 'UH60',
  H60: 'H60',
  AH64D: 'AH64',
  AH64E: 'AH64',
  AH64: 'AH64',
  EC130H: 'EC130',
  EC130: 'EC130',
  C2A: 'C2',
  C2: 'C2',
  GLF5: 'GLF5',
  GLF6: 'GLF6',
};

export function isLikelyMilGov(flight) {
  if (!flight) return false;

  const callsign = String(flight.callsign || flight.flight || '').trim();
  const reg = String(flight.reg || '').trim();
  const type = String(flight.type || '').trim().toUpperCase();

  if (MIL_CALLSIGN.test(callsign)) return true;
  if (MIL_REG.test(reg)) return true;
  if (MIL_TYPE.test(type)) return true;

  return MIL_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix));
}

export function resolveMilPhotoType(type) {
  const code = String(type || '')
    .trim()
    .toUpperCase();
  if (!code) return null;

  if (MIL_PHOTO_ALIASES[code]) return MIL_PHOTO_ALIASES[code];
  if (code.startsWith('B52')) return 'B52';
  if (code.startsWith('B1')) return 'B1B';
  if (code.startsWith('KC135')) return 'KC135';
  if (code.startsWith('KC10')) return 'KC10';
  if (code.startsWith('KC46')) return 'KC46';
  if (code.startsWith('C130') || code.startsWith('C30J')) return 'C130';
  if (code.startsWith('C17')) return 'C17';
  if (code.startsWith('C5')) return 'C5';
  if (code.startsWith('F15')) return 'F15';
  if (code.startsWith('F16')) return 'F16';
  if (code.startsWith('F18') || code.startsWith('FA18')) return 'F18';
  if (code.startsWith('F22')) return 'F22';
  if (code.startsWith('F35')) return 'F35';
  if (code.startsWith('A10')) return 'A10';
  if (code.startsWith('V22') || code.startsWith('CV22')) return 'V22';
  if (code.startsWith('E3')) return 'E3';
  if (code.startsWith('E6')) return 'E6';
  if (code.startsWith('E8')) return 'E8';
  if (code.startsWith('U2')) return 'U2';
  if (code.startsWith('P8')) return 'P8';
  if (code.startsWith('P3')) return 'P3';
  if (code.startsWith('RC135')) return 'RC135';
  if (code.startsWith('T38')) return 'T38';
  if (code.startsWith('CH47')) return 'CH47';
  if (code.startsWith('CH53')) return 'CH53';
  if (code.startsWith('UH60') || code.startsWith('H60')) return 'UH60';
  if (code.startsWith('AH64')) return 'AH64';
  if (code.startsWith('EC130')) return 'EC130';
  if (code.startsWith('C2')) return 'C2';

  return MIL_PHOTO_ALIASES[code.slice(0, 4)] || MIL_PHOTO_ALIASES[code.slice(0, 3)] || null;
}

export function isB52(flight) {
  if (!flight) return false;
  return resolveMilPhotoType(flight.type) === 'B52';
}

export const MILITARY_ALERT_RADIUS_MILES = 8;
