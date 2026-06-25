import { resolveArea } from '../lib/area.js';
import { fetchAreaTrains } from '../lib/trainTracking.js';

export async function handleLiveTrains(req, res) {
  const area = resolveArea(req.query);
  const payload = await fetchAreaTrains(area);

  res.json({
    area,
    fetchedAt: new Date().toISOString(),
    count: payload.trains.length,
    radiusMiles: payload.radiusMiles,
    source: payload.source,
    sources: payload.sources,
    sourceCounts: payload.sourceCounts,
    coverage: payload.coverage,
    counts: payload.counts,
    errors: payload.errors,
    freightHints: payload.freightHints,
    trains: payload.trains,
  });
}
