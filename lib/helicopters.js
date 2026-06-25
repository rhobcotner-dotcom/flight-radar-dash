const HELI_TYPE =
  /^(R22|R44|R66|AS50|AS55|AS65|EC35|EC45|EC55|EC75|H125|H130|H135|H145|H160|H175|B06|B407|B412|B429|B505|A109|A119|AW09|AW13|AW15|AW19|AW39|AW69|AW09|S76|S92|UH|CH47|CH53|H60|H47|H64|H53|H65|MD52|MD60|MD90|BK17|ENST|ASTR|H500|H600)/i;

const MED_CALLSIGN = /^(ARCH|LIFE|RESC|RESCUE|MED|AIR|MEDEVAC|N\d+MH|N\d+LF|N\d+ME)/i;
const NEWS_CALLSIGN = /^(KMOV|KSDK|KTVI|KPLR|KETC|KMOX|NEWS|TV|CH\d|N\d+TV|N\d+NC|N\d+HE)/i;
const LAW_CALLSIGN = /^(MO|ILL|ISP|HP|STATE|SHERIFF|POLICE|N\d+SP|N\d+HP|N\d+PD)/i;

export function classifyHelicopter(flight) {
  if (!flight) return null;

  const type = String(flight.type || '').trim().toUpperCase();
  const callsign = String(flight.callsign || flight.flight || '').trim().toUpperCase();
  const reg = String(flight.reg || '').trim().toUpperCase();

  const isHeliType = HELI_TYPE.test(type) || /^H/.test(type) || type.startsWith('EC');
  const alt = Number(flight.alt);
  const lowAndSlow = Number.isFinite(alt) && alt > 0 && alt < 6000;

  if (!isHeliType && !lowAndSlow) {
    return null;
  }

  if (!isHeliType && lowAndSlow) {
    const speed = Number(flight.gspeed);
    if (!Number.isFinite(speed) || speed > 180) return null;
  }

  if (MED_CALLSIGN.test(callsign) || /LIFE|RESC|AIR METHODS/i.test(callsign)) {
    return 'medevac';
  }
  if (NEWS_CALLSIGN.test(callsign)) {
    return 'news';
  }
  if (LAW_CALLSIGN.test(callsign) || /^N\d+[0-9]{2,}[A-Z]{0,2}$/.test(reg)) {
    return 'law';
  }
  if (isHeliType) {
    return 'helicopter';
  }

  return null;
}

export function isLikelyHelicopter(flight) {
  return classifyHelicopter(flight) != null;
}
