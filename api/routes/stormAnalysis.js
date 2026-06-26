import { analyzeStormCell } from '../lib/stormAnalysis.js';

function parseStormCameraMode(req) {
  const mode = String(req.query.cameraMode || '').trim().toLowerCase();
  if (mode === 'all' || mode === 'live-and-snapshots' || mode === 'snapshots') {
    return { liveOnly: false };
  }
  return { liveOnly: true };
}

export async function handleStormAnalysis(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const analysis = await analyzeStormCell(lat, lon, parseStormCameraMode(req));
  res.json(analysis);
}
