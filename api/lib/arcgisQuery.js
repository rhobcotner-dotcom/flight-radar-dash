const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';

export async function queryArcGisGeoJson(baseUrl, layerId, options = {}) {
  const params = new URLSearchParams({
    where: options.where || '1=1',
    outFields: options.outFields || '*',
    returnGeometry: 'true',
    f: 'geojson',
    resultRecordCount: String(options.limit || 2000),
  });

  const url = `${baseUrl}/${layerId}/query?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`ArcGIS query failed (${res.status})`);
  }

  const body = await res.json();
  if (body?.error) {
    throw new Error(body.error.message || 'ArcGIS query failed');
  }

  return Array.isArray(body?.features) ? body.features : [];
}
