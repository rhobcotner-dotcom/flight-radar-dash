import { fetchOccupancyOverlay } from '../lib/gtfsOccupancyScanner.js';
import { fetchTsaWaitTimes } from '../lib/tsaWaitTimes.js';

export async function handleOccupancyOverlay(req, res) {
  const airportCode = String(req.query.airport || req.query.nearbyAirport || 'STL').trim().toUpperCase();

  const [gtfs, tsa] = await Promise.all([
    fetchOccupancyOverlay(req.query),
    fetchTsaWaitTimes(airportCode),
  ]);

  const tsaPoints = (tsa.checkpoints || [])
    .filter((cp) => cp.occupancyLevel != null && Number.isFinite(cp.lat) && Number.isFinite(cp.lon))
    .map((cp) => ({
      id: cp.id,
      lat: cp.lat,
      lon: cp.lon,
      agency: cp.airportName || cp.airportCode,
      feedId: 'tsa',
      routeId: null,
      label: cp.occupancyLabel,
      level: cp.occupancyLevel,
      source: cp.occupancySource,
      kind: cp.occupancyKind || 'infrastructure',
      real: cp.occupancySource === 'tsa-wait',
    }));

  res.json({
    fetchedAt: new Date().toISOString(),
    gtfs,
    tsa,
    points: [...gtfs.points, ...tsaPoints],
    pointCount: gtfs.points.length + tsaPoints.length,
    realCount: gtfs.realCount + tsaPoints.filter((p) => p.real).length,
  });
}
