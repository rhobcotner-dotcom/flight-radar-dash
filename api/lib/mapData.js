import { fetchViewportFlights, resolveFlightViewport } from './flightViewport.js';

export async function fetchAreaFlights(area, query = {}) {
  const viewport = resolveFlightViewport(query, area);
  const payload = await fetchViewportFlights(viewport, area);
  return payload;
}
