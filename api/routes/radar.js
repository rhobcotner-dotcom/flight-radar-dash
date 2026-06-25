import { buildIemRadarPayload, getRadarRefreshMs, getRadarSource } from '../lib/radarSources.js';

const RAINVIEWER_CACHE_MS = 60 * 1000;
const RAINVIEWER_API_URL = 'https://api.rainviewer.com/public/weather-maps.json';

let rainviewerCache = { fetchedAt: 0, data: null };

async function fetchRainviewerFrames() {
  if (rainviewerCache.data && Date.now() - rainviewerCache.fetchedAt < RAINVIEWER_CACHE_MS) {
    return rainviewerCache.data;
  }

  const response = await fetch(RAINVIEWER_API_URL, {
    headers: {
      'User-Agent': 'flight-radar-dash/1.0 (personal home dashboard)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`RainViewer unavailable (${response.status})`);
  }

  const body = await response.json();
  const frames = Array.isArray(body?.radar?.past)
    ? body.radar.past.map((frame) => ({
        time: frame.time,
        path: frame.path,
      }))
    : [];

  const data = {
    source: 'rainviewer',
    mode: 'frames',
    label: 'RainViewer mosaic',
    host: body.host || 'https://tilecache.rainviewer.com',
    frames,
    generated: body.generated,
    refreshMs: getRadarRefreshMs('rainviewer'),
    typicalLatencyMinutes: 10,
    attribution: {
      name: 'RainViewer',
      url: 'https://www.rainviewer.com/',
    },
  };

  rainviewerCache = { fetchedAt: Date.now(), data };
  return data;
}

export async function handleRadarFrames(_req, res) {
  try {
    const source = getRadarSource();

    if (source === 'rainviewer') {
      const data = await fetchRainviewerFrames();
      return res.json(data);
    }

    res.json(buildIemRadarPayload());
  } catch (err) {
    res.status(502).json({ error: err.message || 'Failed to load radar overlay' });
  }
}
