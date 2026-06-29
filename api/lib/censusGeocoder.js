const CENSUS_GEOCODER =
  'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';

/**
 * Geocode a US one-line address via Census Bureau (free, no API key).
 * @param {string} address
 * @param {{ city?: string, state?: string, zip?: string }} [context]
 */
export async function geocodeCensusAddress(address, context = {}) {
  const line = [address, context.city, context.state, context.zip].filter(Boolean).join(', ').trim();
  if (!line) return null;

  const params = new URLSearchParams({
    address: line,
    benchmark: 'Public_AR_Census2020',
    format: 'json',
  });

  const res = await fetch(`${CENSUS_GEOCODER}?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return null;
  const body = await res.json();
  const match = body?.result?.addressMatches?.[0];
  if (!match?.coordinates) return null;

  return {
    lat: Number(match.coordinates.y),
    lon: Number(match.coordinates.x),
    matchedAddress: match.matchedAddress,
    geocodeSource: 'census-oneline',
  };
}

/**
 * @param {string[]} addresses
 * @param {{ concurrency?: number, city?: string, state?: string }} [opts]
 */
export async function geocodeCensusBatch(addresses, opts = {}) {
  const concurrency = opts.concurrency || 3;
  const results = new Map();
  const queue = [...addresses];

  async function worker() {
    while (queue.length) {
      const address = queue.shift();
      if (!address || results.has(address)) continue;
      const geo = await geocodeCensusAddress(address, opts);
      results.set(address, geo);
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
