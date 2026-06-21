import { getLiveFlightsFull, getLiveFlightsCount } from '../fr24-client.js';
import { detectAlerts } from '../lib/alerts.js';
import { resolveArea } from '../lib/area.js';

function flightsFromResponse(body) {
  return Array.isArray(body?.data) ? body.data : [];
}

export async function handleLiveFlights(req, res) {
  const area = resolveArea(req.query);
  const extra = {};
  if (req.query.categories) extra.categories = req.query.categories;
  if (req.query.squawks) extra.squawks = req.query.squawks;

  const body = await getLiveFlightsFull(area.bounds, extra);
  const flights = flightsFromResponse(body);

  res.json({
    area,
    fetchedAt: new Date().toISOString(),
    count: flights.length,
    flights,
  });
}

export async function handleLiveGovFlights(req, res) {
  req.query.categories = 'M';
  return handleLiveFlights(req, res);
}

export async function handleLiveCount(req, res) {
  const area = resolveArea(req.query);
  const body = await getLiveFlightsCount(area.bounds);
  res.json({
    area,
    fetchedAt: new Date().toISOString(),
    count: body?.data ?? body?.count ?? body,
  });
}

export async function handleLiveAlerts(req, res) {
  const area = resolveArea(req.query);
  const body = await getLiveFlightsFull(area.bounds);
  const flights = flightsFromResponse(body);
  const alerts = detectAlerts(flights);

  res.json({
    area,
    fetchedAt: new Date().toISOString(),
    alertCount: alerts.length,
    alerts,
  });
}
