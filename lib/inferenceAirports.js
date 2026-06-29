import airports from './data/inferenceAirports.json' with { type: 'json' };

/** US medium/large airports (OurAirports) for nationwide approach/departure inference. */
export const INFERENCE_AIRPORTS = airports;

/** Airports within a rough bounding box before precise distance checks. */
export function inferenceAirportsNear(lat, lon, radiusMiles) {
  const latDelta = radiusMiles / 69;
  const lonDelta = radiusMiles / (69 * Math.cos((lat * Math.PI) / 180));
  return airports.filter(
    (airport) =>
      Math.abs(airport.lat - lat) <= latDelta && Math.abs(airport.lon - lon) <= lonDelta
  );
}
