import {
  getAirportLight,
  getFlightSummaryLight,
  getLiveFlightsByAirport,
} from '../fr24-client.js';
import { enrichFlightsCarriers, carrierLabel } from './airlineNames.js';
import { distanceMiles } from './distance.js';

const AIRPORT_COORDS = {
  STL: { lat: 38.748697, lon: -90.370003 },
};

function rows(body) {
  return Array.isArray(body?.data) ? body.data : [];
}

function todayWindow() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return {
    from: start.toISOString().slice(0, 19),
    to: end.toISOString().slice(0, 19),
    label: start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
  };
}

function formatTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function minutesUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 60000);
}

function movementFromLive(flight, role) {
  return {
    fr24_id: flight.fr24_id,
    flight: flight.flight || flight.callsign,
    callsign: flight.callsign,
    carrierLabel: flight.carrierLabel || carrierLabel(flight),
    type: flight.type,
    reg: flight.reg,
    route:
      role === 'departure'
        ? `${flight.orig_iata || 'STL'} → ${flight.dest_iata || '?'}`
        : `${flight.orig_iata || '?'} → ${flight.dest_iata || 'STL'}`,
    alt: flight.alt,
    gspeed: flight.gspeed,
    eta: flight.eta,
    etaLabel: formatTime(flight.eta),
    minutesUntilEta: minutesUntil(flight.eta),
    squawk: flight.squawk,
    status: liveStatus(flight, role),
  };
}

function movementFromSummaryUpcoming(flight) {
  const scheduled = flight.first_seen || flight.datetime_takeoff;
  return {
    fr24_id: flight.fr24_id,
    flight: flight.flight || flight.callsign,
    callsign: flight.callsign,
    carrierLabel: carrierLabel(flight),
    type: flight.type,
    reg: flight.reg,
    route: `${flight.orig_iata || 'STL'} → ${flight.dest_iata || '?'}`,
    eta: scheduled,
    etaLabel: formatTime(scheduled),
    minutesUntilEta: minutesUntil(scheduled),
    timeLabel: formatTime(scheduled),
    status: 'Scheduled',
  };
}

function isEnRouteDeparture(flight, airportLat, airportLon) {
  const alt = Number(flight.alt || 0);
  const speed = Number(flight.gspeed || 0);
  const dist = distanceMiles(airportLat, airportLon, flight.lat, flight.lon);
  if (alt >= 10000) return true;
  if (alt >= 8000 && speed > 280) return true;
  if (dist > 25 && alt > 3000) return true;
  return false;
}

function pickUpcomingDepartures(liveOutbound, departuresToday, code) {
  const coords = AIRPORT_COORDS[code] || AIRPORT_COORDS.STL;
  const now = Date.now();
  const seen = new Set();
  const combined = [];

  for (const flight of liveOutbound) {
    if (isEnRouteDeparture(flight, coords.lat, coords.lon)) continue;
    if (seen.has(flight.fr24_id)) continue;
    seen.add(flight.fr24_id);
    combined.push(movementFromLive(flight, 'departure'));
  }

  for (const flight of departuresToday) {
    if (flight.flight_ended) continue;
    if (flight.datetime_takeoff && new Date(flight.datetime_takeoff).getTime() <= now) continue;
    if (seen.has(flight.fr24_id)) continue;
    seen.add(flight.fr24_id);
    combined.push(movementFromSummaryUpcoming(flight));
  }

  return combined
    .sort((a, b) => (a.minutesUntilEta ?? 9999) - (b.minutesUntilEta ?? 9999))
    .slice(0, 12);
}

function movementFromSummary(flight, role) {
  const time = role === 'departure' ? flight.datetime_takeoff : flight.datetime_landed;
  return {
    fr24_id: flight.fr24_id,
    flight: flight.flight || flight.callsign,
    callsign: flight.callsign,
    carrierLabel: carrierLabel(flight),
    type: flight.type,
    reg: flight.reg,
    route:
      role === 'departure'
        ? `${flight.orig_iata || 'STL'} → ${flight.dest_iata || '?'}`
        : `${flight.orig_iata || '?'} → ${flight.dest_iata || 'STL'}`,
    timeLabel: formatTime(time),
    ended: Boolean(flight.flight_ended),
    status: flight.flight_ended ? 'Completed' : 'Active',
  };
}

function liveStatus(flight, role) {
  const alt = Number(flight.alt || 0);
  const speed = Number(flight.gspeed || 0);
  const etaMins = minutesUntil(flight.eta);

  if (role === 'arrival' && etaMins !== null && etaMins < 0 && alt > 1000) {
    return 'Delayed arrival';
  }
  if (role === 'departure') {
    if (alt < 500 && speed < 80) return 'On ground';
    if (alt < 10000) return 'Departing';
    return 'En route';
  }
  if (etaMins !== null && etaMins <= 30) return 'On final';
  return 'En route';
}

function detectDelays(liveInbound, liveOutbound) {
  const delays = [];

  for (const flight of liveInbound) {
    const etaMins = minutesUntil(flight.eta);
    const alt = Number(flight.alt || 0);
    if (etaMins !== null && etaMins < -10 && alt > 1000) {
      delays.push({
        type: 'arrival_delay',
        severity: 'medium',
        message: `${flight.callsign || flight.flight} arrival past ETA (${Math.abs(etaMins)}m)`,
        flight: movementFromLive(flight, 'arrival'),
      });
    }
  }

  for (const flight of liveOutbound) {
    if ([7500, 7600, 7700].includes(Number(flight.squawk))) {
      delays.push({
        type: 'emergency',
        severity: 'high',
        message: `${flight.callsign || flight.flight} squawking ${flight.squawk}`,
        flight: movementFromLive(flight, 'departure'),
      });
    }
  }

  return delays;
}

export async function buildAirportHub(airportCode = 'STL') {
  const code = String(airportCode || 'STL').toUpperCase();
  const window = todayWindow();

  const [airportBody, liveOutboundBody, liveInboundBody, departuresBody, arrivalsBody] =
    await Promise.all([
      getAirportLight(code).catch(() => ({ data: { name: `${code} Airport`, iata: code, icao: code } })),
      getLiveFlightsByAirport('outbound', code),
      getLiveFlightsByAirport('inbound', code),
      getFlightSummaryLight({
        airports: `outbound:${code}`,
        flight_datetime_from: window.from,
        flight_datetime_to: window.to,
      }).catch(() => ({ data: [] })),
      getFlightSummaryLight({
        airports: `inbound:${code}`,
        flight_datetime_from: window.from,
        flight_datetime_to: window.to,
      }).catch(() => ({ data: [] })),
    ]);

  const airport = airportBody?.data || airportBody || {};
  const liveOutbound = enrichFlightsCarriers(rows(liveOutboundBody));
  const liveInbound = enrichFlightsCarriers(rows(liveInboundBody));
  const departuresToday = rows(departuresBody);
  const arrivalsToday = rows(arrivalsBody);

  const onGround = liveOutbound.filter((f) => Number(f.alt || 0) < 500 && Number(f.gspeed || 0) < 80);
  const upcomingDepartures = pickUpcomingDepartures(liveOutbound, departuresToday, code);

  const upcomingArrivals = [...liveInbound]
    .sort((a, b) => (minutesUntil(a.eta) ?? 9999) - (minutesUntil(b.eta) ?? 9999))
    .slice(0, 12)
    .map((f) => movementFromLive(f, 'arrival'));

  const recentDepartures = [...departuresToday]
    .filter((f) => f.datetime_takeoff)
    .sort((a, b) => new Date(b.datetime_takeoff) - new Date(a.datetime_takeoff))
    .slice(0, 8)
    .map((f) => movementFromSummary(f, 'departure'));

  const delays = detectDelays(liveInbound, liveOutbound);

  return {
    code,
    name: airport.name || `${code} Airport`,
    iata: airport.iata || code,
    icao: airport.icao || code,
    dateLabel: window.label,
    fetchedAt: new Date().toISOString(),
    stats: {
      liveOutbound: liveOutbound.length,
      liveInbound: liveInbound.length,
      upcomingDepartures: upcomingDepartures.length,
      departuresToday: departuresToday.length,
      arrivalsToday: arrivalsToday.length,
      onGround: onGround.length,
      delayedCount: delays.length,
    },
    upcomingDepartures,
    upcomingArrivals,
    recentDepartures,
    delays,
    liveOutbound: liveOutbound.slice(0, 20).map((f) => movementFromLive(f, 'departure')),
    liveInbound: liveInbound.slice(0, 20).map((f) => movementFromLive(f, 'arrival')),
  };
}
