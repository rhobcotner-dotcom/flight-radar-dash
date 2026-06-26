import { reverseGeocodeLatLon } from '../../lib/reverseGeocode.js';

export async function handleReverseGeocode(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon query params required' });
  }

  const place = await reverseGeocodeLatLon(lat, lon);
  res.json(place);
}
