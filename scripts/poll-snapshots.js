import 'dotenv/config';
import { getLiveFlightsFull } from '../api/fr24-client.js';
import { detectAlerts, summarizeCategories } from '../api/lib/alerts.js';
import { loadDefaultArea, resolveArea } from '../api/lib/area.js';
import { insertSnapshot } from '../api/db/snapshots.js';

function flightsFromResponse(body) {
  return Array.isArray(body?.data) ? body.data : [];
}

async function main() {
  const defaults = loadDefaultArea();
  const area = resolveArea({
    lat: process.env.POLL_LAT || defaults.lat,
    lon: process.env.POLL_LON || defaults.lon,
    radiusMiles: process.env.POLL_RADIUS_MILES || defaults.radiusMiles,
    name: process.env.POLL_METRO_NAME || defaults.name,
  });

  const body = await getLiveFlightsFull(area.bounds);
  const flights = flightsFromResponse(body);
  const byCategory = summarizeCategories(flights);
  const notableEvents = detectAlerts(flights);
  const ts = new Date().toISOString();

  insertSnapshot({
    ts,
    bounds: area.bounds,
    metroName: area.name,
    totalCount: flights.length,
    byCategory,
    notableEvents,
  });

  console.log(`Snapshot saved at ${ts}: ${flights.length} flights, ${notableEvents.length} alerts`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
