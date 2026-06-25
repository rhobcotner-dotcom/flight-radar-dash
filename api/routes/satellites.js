import { resolveArea } from '../lib/area.js';
import { fetchOverheadSatellites } from '../lib/satellites.js';

export async function handleLiveSatellites(req, res) {
  const area = resolveArea(req.query);
  const payload = await fetchOverheadSatellites(area, {
    minElevation: req.query.minElevation,
    maxResults: req.query.maxResults,
  });

  res.json(payload);
}
