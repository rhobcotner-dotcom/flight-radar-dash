import { fetchViewportFlights, resolveFlightViewport } from './flightViewport.js';

export async function fetchAreaFlights(area, query = {}) {
  const viewport = resolveFlightViewport(query, area);
  const enrich = query.enrich !== '0' && query.enrich !== 'false';
  const payload = await fetchViewportFlights(viewport, area, { enrich });
  return payload;
}
