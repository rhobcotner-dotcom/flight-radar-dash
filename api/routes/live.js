import { detectAlerts, isLikelyMilGov, summarizeCategories } from '../lib/alerts.js';
import { mergeB52Flights, resolveB52Flights } from '../lib/b52Watch.js';
import { assertFr24PullEnabled } from '../lib/local-only.js';
import { resolveArea } from '../lib/area.js';
import { insertSnapshot } from '../db/snapshots.js';
import { buildAirportHub } from '../lib/airportHub.js';
import { loadDefaultArea } from '../lib/area.js';
import { fetchAreaFlights } from '../lib/mapData.js';
import { enrichAirportTsaOccupancy } from '../lib/tsaWaitTimes.js';

function emptyAirportHub(airportCode, fetchedAt, error) {
  return {
    code: airportCode,
    name: `${airportCode} Airport`,
    iata: airportCode,
    icao: airportCode,
    dateLabel: new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    fetchedAt,
    error,
    stats: {
      liveOutbound: 0,
      liveInbound: 0,
      upcomingDepartures: 0,
      departuresToday: 0,
      arrivalsToday: 0,
      onGround: 0,
      delayedCount: 0,
    },
    upcomingDepartures: [],
    upcomingArrivals: [],
    recentDepartures: [],
    delays: [],
    liveOutbound: [],
    liveInbound: [],
  };
}

export async function handleMapRefresh(req, res) {
  const area = resolveArea(req.query);
  const enrich = req.query.enrich !== '0' && req.query.enrich !== 'false';
  const payload = await fetchAreaFlights(area, req.query);
  const { flights, homeFlights, viewport, dataSource, dataWarning, inViewCount, homeCount } = payload;
  const govFlights = flights.filter(isLikelyMilGov);
  const b52Flights = enrich ? await resolveB52Flights(flights) : mergeB52Flights(flights);
  const alerts = detectAlerts(homeFlights);
  const fetchedAt = new Date().toISOString();
  const recordSnapshot = req.query.snapshot !== 'false';

  if (recordSnapshot) {
    insertSnapshot({
      ts: fetchedAt,
      bounds: area.bounds,
      metroName: area.name,
      totalCount: homeCount,
      byCategory: summarizeCategories(homeFlights),
      notableEvents: alerts,
    });
  }

  res.json({
    area,
    viewport,
    fetchedAt,
    count: inViewCount,
    homeCount,
    flights,
    govFlights,
    b52Flights,
    alerts,
    alertCount: alerts.length,
    dataSource,
    dataWarning: dataWarning || null,
    routeSource: 'adsbdb.com',
    fr24Calls: 0,
    estimatedCredits: 0,
  });
}

export async function handleDashboardRefresh(req, res) {
  return handleMapRefresh(req, res);
}

export async function handleAirportHub(req, res) {
  assertFr24PullEnabled();
  const airportCode = String(req.query.nearbyAirport || loadDefaultArea().nearbyAirport || 'STL').toUpperCase();
  const fetchedAt = new Date().toISOString();

  try {
    const airport = await enrichAirportTsaOccupancy(await buildAirportHub(airportCode), airportCode);
    res.json({
      airport,
      fetchedAt,
      fr24Calls: 5,
    });
  } catch (err) {
    res.json({
      airport: emptyAirportHub(airportCode, fetchedAt, err.message || 'Failed to load airport data'),
      fetchedAt,
      fr24Calls: 5,
    });
  }
}

export async function handleLiveFlights(req, res) {
  const area = resolveArea(req.query);
  const payload = await fetchAreaFlights(area, req.query);

  res.json({
    area,
    viewport: payload.viewport,
    fetchedAt: new Date().toISOString(),
    count: payload.inViewCount,
    homeCount: payload.homeCount,
    flights: payload.flights,
    dataSource: payload.dataSource,
  });
}

export async function handleLiveGovFlights(req, res) {
  req.query.categories = 'M';
  return handleLiveFlights(req, res);
}

export async function handleLiveCount(req, res) {
  const area = resolveArea(req.query);
  const payload = await fetchAreaFlights(area, req.query);
  res.json({
    area,
    fetchedAt: new Date().toISOString(),
    count: payload.inViewCount,
    homeCount: payload.homeCount,
    dataSource: payload.dataSource,
  });
}

export async function handleLiveAlerts(req, res) {
  const area = resolveArea(req.query);
  const payload = await fetchAreaFlights(area, req.query);
  const alerts = detectAlerts(payload.homeFlights);

  res.json({
    area,
    fetchedAt: new Date().toISOString(),
    alertCount: alerts.length,
    alerts,
    dataSource: payload.dataSource,
  });
}
