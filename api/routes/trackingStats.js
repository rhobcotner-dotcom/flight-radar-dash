import { fetchTrackingStats } from '../lib/trackingStats.js';

export async function handleTrackingStats(_req, res) {
  const payload = await fetchTrackingStats();
  res.json(payload);
}
