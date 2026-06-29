#!/usr/bin/env node
/**
 * Verify GTFS-RT feeds using keys from .env and print vehicle counts.
 * Run: node scripts/verify-gtfs-keys.mjs
 */
import dotenv from 'dotenv';
dotenv.config();

import { fetchRegionalRailTrains, fetchAllRegionalRailTrains } from '../api/lib/gtfsRtRail.js';
import { AGENCY_KEY_DOCS } from '../api/lib/transitAgencies.js';

const nationwide = await fetchAllRegionalRailTrains();
console.log('Nationwide GTFS-RT vehicle count:', nationwide.count);
console.log('Per-feed counts:', JSON.stringify(nationwide.sourceCounts, null, 2));

const stl = await fetchRegionalRailTrains({ lat: 38.787, lon: -90.629, radiusMiles: 80 }, 80);
console.log('\nNear STL (80 mi):', stl.trains.length, 'trains');
console.log('Nearby by agency:', JSON.stringify(stl.sourceCounts.nearby, null, 2));

console.log('\nKeys still needed:');
for (const [key, doc] of Object.entries(AGENCY_KEY_DOCS)) {
  if (!process.env[key]?.trim()) console.log(`  ${key} → ${doc}`);
}
