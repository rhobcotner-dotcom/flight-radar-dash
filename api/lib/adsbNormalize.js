export function normalizeAdsbAircraft(ac) {
  if (!ac || !Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) return null;

  const callsign = String(ac.flight || ac.callsign || '').trim();
  const altBaro = ac.alt_baro;

  return {
    fr24_id: ac.hex,
    hex: String(ac.hex || '').toLowerCase(),
    flight: callsign || undefined,
    callsign: callsign || undefined,
    lat: ac.lat,
    lon: ac.lon,
    track: ac.track !== undefined ? Math.round(ac.track) : undefined,
    alt: altBaro === 'ground' ? 0 : altBaro,
    gspeed: ac.gs !== undefined ? Math.round(ac.gs) : undefined,
    vspeed: ac.baro_rate ?? ac.geom_rate,
    squawk: ac.squawk,
    type: ac.t,
    reg: ac.r,
    source: 'adsb.lol',
    painted_as: undefined,
    operating_as: undefined,
  };
}

export function normalizeAdsbResponse(body, maxDistanceNm) {
  const aircraft = Array.isArray(body?.ac) ? body.ac : [];
  return aircraft
    .map(normalizeAdsbAircraft)
    .filter(Boolean)
    .filter((flight) => {
      if (!maxDistanceNm) return true;
      const ac = aircraft.find((item) => item.hex === flight.hex);
      return ac?.dst === undefined || ac.dst <= maxDistanceNm + 5;
    });
}
