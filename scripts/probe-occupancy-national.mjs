#!/usr/bin/env node
/**
 * National GTFS-RT occupancy probe — tests vehicle feeds at protobuf level.
 * Run: node scripts/probe-occupancy-national.mjs
 * Optional env: TRIMET_APP_ID, OBA_API_KEY, API_511_KEY, LA_METRO_SWIFTLY_KEY, etc.
 */
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { extractVehiclePositions } from '../api/lib/gtfsRtClient.js';

const USER_AGENT = 'homescope-occupancy-probe/1.0';

/** @type {Array<{ id: string, name: string, url: string, headers?: Record<string,string>, note?: string }>} */
const CANDIDATES = [
  // Already in rail config (re-probe occupancy)
  { id: 'mbta', name: 'MBTA', url: 'https://cdn.mbta.com/realtime/VehiclePositions.json' },
  { id: 'septa', name: 'SEPTA', url: 'https://www3.septa.org/gtfsrt/septa-pa-us/Vehicle/rtVehiclePosition.pb' },
  { id: 'rtd-denver', name: 'RTD Denver', url: 'https://www.rtd-denver.com/files/gtfs-rt/VehiclePosition.pb' },
  { id: 'metro-transit-mn', name: 'Metro Transit MN', url: 'https://svc.metrotransit.org/mtgtfs/vehiclepositions.pb' },
  { id: 'metro-stl', name: 'Metro St Louis', url: 'https://www.metrostlouis.org/RealTimeData/StlRealTimeVehicles.pb' },
  { id: 'mta-subway', name: 'MTA NYCT', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs' },
  { id: 'mta-lirr', name: 'MTA LIRR', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr' },
  { id: 'mta-mnr', name: 'MTA MNR', url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr' },

  // Pacific Northwest
  {
    id: 'trimet',
    name: 'TriMet Portland',
    url: `https://developer.trimet.org/ws/gtfs/VehiclePositions?appID=${process.env.TRIMET_APP_ID || 'demo'}`,
  },
  {
    id: 'king-county-metro',
    name: 'King County Metro',
    url: `https://api.pugetsound.onebusaway.org/api/gtfs_realtime/vehicle-positions-for-agency/1.pb?key=${process.env.OBA_API_KEY || ''}`,
    note: 'needs OBA_API_KEY',
  },
  {
    id: 'sound-transit',
    name: 'Sound Transit',
    url: `https://api.pugetsound.onebusaway.org/api/gtfs_realtime/vehicle-positions-for-agency/40.pb?key=${process.env.OBA_API_KEY || ''}`,
    note: 'needs OBA_API_KEY',
  },

  // Bay Area
  { id: 'sfmta', name: 'SF Muni', url: 'https://gtfs.sfmta.com/trrip/VehiclePositions.pb' },
  { id: 'bart-direct', name: 'BART direct', url: 'https://api.bart.gov/gtfsrt.aspx?cmd=veh' },
  {
    id: '511-ba',
    name: '511 BART',
    url: process.env.API_511_KEY
      ? `https://api.511.org/transit/VehicleMonitoring?api_key=${process.env.API_511_KEY}&agency=BA&format=json`
      : '',
    note: '511 JSON not GTFS-RT occupancy',
  },
  { id: 'ac-transit', name: 'AC Transit', url: 'https://api.actransit.org/transit/gtfsrt/vehiclepositions.pb' },

  // SoCal
  {
    id: 'la-metro-swiftly',
    name: 'LA Metro Swiftly',
    url: 'https://api.goswift.ly/lametro/gtfs-rt/vehicle-positions',
    headers: process.env.LA_METRO_SWIFTLY_KEY
      ? { Authorization: process.env.LA_METRO_SWIFTLY_KEY }
      : undefined,
    note: 'needs LA_METRO_SWIFTLY_KEY',
  },
  { id: 'octa', name: 'OCTA Orange County', url: 'https://api.octa.net/gtfs-rt/VehiclePositions.pb' },

  // Texas
  { id: 'dart-dallas', name: 'DART Dallas', url: 'https://www.dart.org/transitdata/gtfsrealtime/VehiclePositions.pb' },
  {
    id: 'houston-metro',
    name: 'Houston METRO',
    url: 'https://webservices.metro.net/TransitDataFeed/GTFS-Realtime/MetroBusPositions.pb',
  },

  // Southeast
  { id: 'marta', name: 'MARTA Atlanta', url: 'https://itsmarta.com/google/vehiclepositions.pb' },
  {
    id: 'miami-dade',
    name: 'Miami-Dade Transit',
    url: 'https://gtfsrealtime.miamidade.gov/vehiclepositions/VehiclePositions.pb',
  },

  // Northeast
  {
    id: 'nj-transit-bus',
    name: 'NJ Transit Bus GTFS-RT',
    url: 'https://pcsdata.njtransit.com/bustogtfs/bustripupdate',
    note: 'may be trip-only',
  },
  {
    id: 'nj-transit-rail',
    name: 'NJ Transit Rail GTFS-RT',
    url: 'https://raildata.njtransit.com/railtogtfs/railvehicleposition',
  },
  { id: 'path', name: 'PATH', url: 'https://pathways.journey.io/gtfsrt/path/vehiclepositions' },

  // Midwest
  { id: 'pace-chicago', name: 'PACE Chicago', url: 'https://www.pacebus.com/gtfsrt/vehicles/VehiclePositions.pb' },
  { id: 'cta', name: 'CTA', url: process.env.CTA_API_KEY ? `https://gtfsapi.transitchicago.com/gtfspublic/vehicles/vehicles.pb?key=${process.env.CTA_API_KEY}` : '' },
  { id: 'wmata', name: 'WMATA', url: process.env.WMATA_API_KEY ? 'https://api.wmata.com/gtfs/rail-gtfsrt-vehiclepositions.pb' : '', headers: process.env.WMATA_API_KEY ? { api_key: process.env.WMATA_API_KEY } : undefined },

  // Mountain / Southwest
  { id: 'valley-metro', name: 'Valley Metro Phoenix', url: 'https://gtfs-rt.valleymetro.org/gtfsrt/VehiclePositions.pb' },
  { id: 'capmetro', name: 'CapMetro Austin', url: 'https://data.texas.gov/download/capmetro/gtfs-rt-vehicle-positions.pb' },
  { id: 'rtc-snv', name: 'RTC Southern Nevada', url: 'https://rtc.api.transitdata.org/gtfs-rt/vehiclepositions' },

  // Other
  { id: 'chattanooga', name: 'CARTA Chattanooga', url: 'https://chattanoogata.org/gtfsrealtime/VehiclePositions' },
];

function scanOccupancy(feed) {
  const entities = Array.isArray(feed?.entity) ? feed.entity : [];
  let occPresent = 0;
  let pctPresent = 0;
  let depOccPresent = 0;
  const statusDist = {};
  const pctDist = {};

  for (const entity of entities) {
    const v = entity?.vehicle;
    if (v) {
      if (Object.hasOwnProperty.call(v, 'occupancyStatus')) {
        occPresent += 1;
        const s = v.occupancyStatus;
        statusDist[s] = (statusDist[s] || 0) + 1;
      }
      if (Object.hasOwnProperty.call(v, 'occupancyPercentage')) {
        pctPresent += 1;
        const p = v.occupancyPercentage;
        pctDist[p] = (pctDist[p] || 0) + 1;
      }
    }
    const tu = entity?.tripUpdate;
    if (tu?.stopTimeUpdate) {
      for (const st of tu.stopTimeUpdate) {
        if (Object.hasOwnProperty.call(st, 'departureOccupancyStatus')) {
          depOccPresent += 1;
        }
      }
    }
  }

  const positions = extractVehiclePositions(feed);
  const rowOcc = positions.filter((r) => r.occupancyStatusPresent || r.occupancyPercentagePresent).length;

  return {
    entities: entities.length,
    positions: positions.length,
    occPresent,
    pctPresent,
    depOccPresent,
    rowOcc,
    statusDist,
    pctDist,
  };
}

async function probe(candidate) {
  if (!candidate.url) {
    return { ...candidate, ok: false, error: candidate.note || 'no-url' };
  }

  try {
    const res = await fetch(candidate.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(candidate.headers || {}) },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
      return { ...candidate, ok: false, error: `HTTP ${res.status}`, bodyHead: buf.slice(0, 80).toString('utf8') };
    }

    let feed;
    if (buf[0] === 0x7b || String(buf.slice(0, 20)).includes('{')) {
      feed = JSON.parse(buf.toString());
      if (!feed.entity && feed.vehicles) feed = { entity: feed.vehicles };
    } else {
      feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);
    }

    const scan = scanOccupancy(feed);
    const classification =
      scan.rowOcc > 0 || scan.occPresent > 0 || scan.pctPresent > 0
        ? 'REAL'
        : scan.depOccPresent > 0
          ? 'REAL_TRIP'
          : scan.positions > 0
            ? 'GAP'
            : 'NO_VEHICLES';

    return { ...candidate, ok: true, classification, ...scan };
  } catch (err) {
    return { ...candidate, ok: false, error: err.message };
  }
}

console.log('National GTFS-RT occupancy probe\n');
const results = [];
for (const c of CANDIDATES) {
  const r = await probe(c);
  results.push(r);
  if (!r.ok) {
    console.log(`${r.name}\tFAIL\t${r.error}`);
    continue;
  }
  console.log(
    `${r.name}\t${r.classification}\tveh=${r.positions}\tocc=${r.rowOcc || r.occPresent}\tpct=${r.pctPresent}\tdepOcc=${r.depOccPresent}\t${JSON.stringify(r.statusDist).slice(0, 60)}`
  );
}

const real = results.filter((r) => r.classification === 'REAL' || r.classification === 'REAL_TRIP');
console.log(`\nSummary: ${real.length} feeds with occupancy on wire / ${results.filter((r) => r.ok).length} reachable`);
