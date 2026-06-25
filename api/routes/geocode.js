export async function handleGeocode(req, res) {
  const query = String(req.query.q || '').trim();
  if (!query) {
    return res.status(400).json({ error: 'q query param required' });
  }

  const params = new URLSearchParams({
    format: 'json',
    limit: '1',
    q: query,
    countrycodes: 'us',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: {
      'User-Agent': 'flight-radar-dash/1.0 (personal home dashboard)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    return res.status(502).json({ error: `Geocoder unavailable (${response.status})` });
  }

  const results = await response.json();
  const hit = results?.[0];
  if (!hit) {
    return res.status(404).json({ error: 'Address not found' });
  }

  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(502).json({ error: 'Invalid geocoder response' });
  }

  res.json({
    address: hit.display_name,
    label: hit.name || query,
    lat,
    lon,
  });
}
