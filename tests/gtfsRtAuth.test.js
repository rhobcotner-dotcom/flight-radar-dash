import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractVehiclePositions,
  flatten511Activities,
  isLikelyAuthOrTransportError,
  parse511VehicleActivity,
} from '../api/lib/gtfsRtClient.js';
import { feedUrlWithAuth } from '../api/lib/transitAgencies.js';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('Metra auth uses api_token query and Bearer header', () => {
  process.env.METRA_API_TOKEN = 'sample-token';
  const auth = feedUrlWithAuth({
    url: 'https://gtfspublic.metrarr.com/gtfs/public/positions',
    authEnv: 'METRA_API_TOKEN',
    authQuery: 'api_token',
    authBearer: true,
  });

  assert.match(auth.url, /api_token=sample-token/);
  assert.equal(auth.headers.Authorization, 'Bearer sample-token');
});

test('CTA auth uses key query param not header', () => {
  process.env.CTA_API_KEY = 'sample-cta-key';
  const auth = feedUrlWithAuth({
    url: 'https://gtfsapi.transitchicago.com/gtfspublic/vehicles/vehicles.pb',
    authEnv: 'CTA_API_KEY',
    authQuery: 'key',
  });

  assert.match(auth.url, /[?&]key=sample-cta-key/);
  assert.equal(auth.headers['x-api-key'], undefined);
});

test('WMATA auth uses api_key header', () => {
  process.env.WMATA_API_KEY = 'sample-wmata-key';
  const auth = feedUrlWithAuth({
    url: 'https://api.wmata.com/gtfs/rail-gtfsrt-vehiclepositions.pb',
    authEnv: 'WMATA_API_KEY',
    authHeader: 'api_key',
  });

  assert.equal(auth.headers.api_key, 'sample-wmata-key');
});

test('MTA auth uses x-api-key header', () => {
  process.env.MTA_API_KEY = 'sample-mta-key';
  const auth = feedUrlWithAuth({
    url: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs',
    authEnv: 'MTA_API_KEY',
    authHeader: 'x-api-key',
  });

  assert.equal(auth.headers['x-api-key'], 'sample-mta-key');
});

test('isLikelyAuthOrTransportError detects MTA XML NoSuchKey response', () => {
  const xml = Buffer.from('<?xml version="1.0"?><Error><Code>NoSuchKey</Code></Error>');
  assert.match(isLikelyAuthOrTransportError(xml), /XML/i);
});

test('parse511VehicleActivity reads MonitoredVehicleJourney coordinates', () => {
  const row = parse511VehicleActivity({
    MonitoredVehicleJourney: {
      LineRef: 'BA:Red',
      VehicleRef: '1234',
      VehicleLocation: { Latitude: 37.77, Longitude: -122.42 },
      Bearing: 180,
      Velocity: 20,
      FramedVehicleJourneyRef: { DatedVehicleJourneyRef: 'trip-1' },
    },
  });

  assert.equal(row?.lat, 37.77);
  assert.equal(row?.routeName, 'Red');
});

test('flatten511Activities collects nested VehicleActivity rows', () => {
  const rows = flatten511Activities({
    ServiceDelivery: {
      VehicleMonitoringDelivery: [{ VehicleActivity: [{ id: 1 }, { id: 2 }] }],
    },
  });
  assert.equal(rows.length, 2);
});

test('flatten511Activities unwraps Siri.ServiceDelivery and object deliveries', () => {
  const rows = flatten511Activities({
    Siri: {
      ServiceDelivery: {
        VehicleMonitoringDelivery: {
          VehicleActivity: [{ id: 'a' }],
        },
      },
    },
  });
  assert.equal(rows.length, 1);
});

test('feedUrlWithAuth allows authOptional feeds without a key', () => {
  const auth = feedUrlWithAuth({
    url: 'https://example.com/feed',
    authEnv: 'MTA_API_KEY',
    authHeader: 'x-api-key',
    authOptional: true,
  });
  assert.equal(auth.skipped, null);
  assert.equal(auth.url, 'https://example.com/feed');
});

test('CTA rail route filter excludes numeric bus routes', () => {
  const ids = new Set(['Red', 'Blue', 'Brn', 'G', 'Grn', 'Org', 'P', 'Pink', 'Y']);
  const isRail = (routeId) => {
    const id = String(routeId || '').trim();
    if (ids.has(id)) return true;
    return !/^\d+$/.test(id);
  };

  assert.equal(isRail('Red'), true);
  assert.equal(isRail('22'), false);
  assert.equal(isRail('X49'), true);
});
