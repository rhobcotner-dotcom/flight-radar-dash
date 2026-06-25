const IEM_NEXRAD_TILE =
  'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0q/{z}/{x}/{y}.png';

export function getRadarSource() {
  return String(process.env.RADAR_SOURCE || 'iem').toLowerCase();
}

export function getRadarRefreshMs(source = getRadarSource()) {
  const configured = Number(process.env.RADAR_REFRESH_MS);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  return source === 'rainviewer' ? 3 * 60 * 1000 : 90 * 1000;
}

export function buildIemRadarPayload(nowMs = Date.now()) {
  return {
    source: 'iem',
    mode: 'live',
    label: 'NEXRAD base reflectivity',
    tileUrl: IEM_NEXRAD_TILE,
    tileSize: 256,
    maxNativeZoom: 9,
    maxZoom: 12,
    refreshMs: getRadarRefreshMs('iem'),
    typicalLatencyMinutes: 5,
    attribution: {
      name: 'Iowa Environmental Mesonet',
      url: 'https://mesonet.agron.iastate.edu/',
    },
    fetchedAt: nowMs,
  };
}
