/** Approximate US state bounds for viewport → agency filtering. */
export const US_STATE_BOUNDS = {
  AK: { south: 51, north: 71.5, west: -179, east: -130 },
  AL: { south: 30.1, north: 35.0, west: -88.5, east: -84.9 },
  AR: { south: 33, north: 36.5, west: -94.6, east: -89.6 },
  AZ: { south: 31.3, north: 37.0, west: -114.8, east: -109.0 },
  CA: { south: 32.5, north: 42.0, west: -124.5, east: -114.1 },
  CO: { south: 37.0, north: 41.0, west: -109.1, east: -102.0 },
  CT: { south: 41.0, north: 42.1, west: -73.7, east: -71.8 },
  DC: { south: 38.8, north: 39.0, west: -77.1, east: -76.9 },
  DE: { south: 38.4, north: 39.8, west: -75.8, east: -75.0 },
  FL: { south: 24.5, north: 31.0, west: -87.6, east: -80.0 },
  GA: { south: 30.4, north: 35.0, west: -85.6, east: -80.8 },
  HI: { south: 18.9, north: 22.3, west: -160.3, east: -154.8 },
  IA: { south: 40.4, north: 43.5, west: -96.6, east: -90.1 },
  ID: { south: 42.0, north: 49.0, west: -117.2, east: -111.0 },
  IL: { south: 37.0, north: 42.5, west: -91.5, east: -87.5 },
  IN: { south: 37.8, north: 41.8, west: -88.1, east: -84.8 },
  KS: { south: 37.0, north: 40.0, west: -102.1, east: -94.6 },
  KY: { south: 36.5, north: 39.2, west: -89.6, east: -82.0 },
  LA: { south: 29.0, north: 33.0, west: -94.0, east: -89.0 },
  MA: { south: 41.2, north: 42.9, west: -73.5, east: -69.9 },
  MD: { south: 37.9, north: 39.7, west: -79.5, east: -75.0 },
  ME: { south: 43.1, north: 47.5, west: -71.1, east: -66.9 },
  MI: { south: 41.7, north: 48.3, west: -90.4, east: -82.4 },
  MN: { south: 43.5, north: 49.4, west: -97.2, east: -89.5 },
  MO: { south: 36.0, north: 40.6, west: -95.8, east: -89.1 },
  MS: { south: 30.2, north: 35.0, west: -91.7, east: -88.1 },
  MT: { south: 45.0, north: 49.0, west: -116.0, east: -104.0 },
  NC: { south: 33.8, north: 36.6, west: -84.3, east: -75.5 },
  ND: { south: 45.9, north: 49.0, west: -104.1, east: -96.6 },
  NE: { south: 40.0, north: 43.0, west: -104.1, east: -95.3 },
  NH: { south: 42.7, north: 45.3, west: -72.6, east: -70.6 },
  NJ: { south: 38.9, north: 41.4, west: -75.6, east: -73.9 },
  NM: { south: 31.3, north: 37.0, west: -109.1, east: -103.0 },
  NV: { south: 35.0, north: 42.0, west: -120.0, east: -114.0 },
  NY: { south: 40.5, north: 45.0, west: -79.8, east: -71.9 },
  OH: { south: 38.4, north: 42.0, west: -84.8, east: -80.5 },
  OK: { south: 33.6, north: 37.0, west: -103.0, east: -94.4 },
  OR: { south: 42.0, north: 46.3, west: -124.6, east: -116.5 },
  PA: { south: 39.7, north: 42.3, west: -80.5, east: -74.7 },
  RI: { south: 41.1, north: 42.0, west: -71.9, east: -71.1 },
  SC: { south: 32.0, north: 35.2, west: -83.4, east: -78.5 },
  SD: { south: 42.5, north: 46.0, west: -104.1, east: -96.4 },
  TN: { south: 35.0, north: 36.7, west: -90.3, east: -81.6 },
  TX: { south: 25.8, north: 36.5, west: -106.7, east: -93.5 },
  UT: { south: 37.0, north: 42.0, west: -114.1, east: -109.0 },
  VA: { south: 36.5, north: 39.5, west: -83.7, east: -75.2 },
  VT: { south: 42.7, north: 45.0, west: -73.4, east: -71.5 },
  WA: { south: 45.5, north: 49.0, west: -124.8, east: -116.9 },
  WI: { south: 42.5, north: 47.1, west: -92.9, east: -86.8 },
  WV: { south: 37.2, north: 40.6, west: -82.6, east: -77.7 },
  WY: { south: 41.0, north: 45.0, west: -111.1, east: -104.0 },
};

export function statesOverlappingBbox(bbox) {
  if (!bbox) return null;
  return Object.entries(US_STATE_BOUNDS)
    .filter(
      ([, bounds]) =>
        !(bounds.east < bbox.west || bounds.west > bbox.east || bounds.north < bbox.south || bounds.south > bbox.north)
    )
    .map(([code]) => code);
}

export function filterAgenciesByBbox(agencies, bbox, { maxFallback = 16 } = {}) {
  if (!bbox || !agencies?.length) return agencies || [];
  const states = new Set(statesOverlappingBbox(bbox));
  if (!states.size) return agencies.slice(0, maxFallback);
  const matched = agencies.filter((agency) => agency.state && states.has(agency.state));
  return matched.length ? matched : agencies.slice(0, maxFallback);
}

export function filterIncidentsToBbox(incidents, bbox) {
  if (!bbox || !incidents?.length) return incidents || [];
  return incidents.filter(
    (incident) =>
      incident.lat >= bbox.south &&
      incident.lat <= bbox.north &&
      incident.lon >= bbox.west &&
      incident.lon <= bbox.east
  );
}
