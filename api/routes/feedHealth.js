import { fetchFeedHealthReport } from '../lib/feedHealth.js';

export async function handleFeedHealth(req, res) {
  const probe = req.query.probe === '1' || req.query.probe === 'true';
  const group = req.query.group || 'all';
  const payload = await fetchFeedHealthReport({ probe, group });
  res.json(payload);
}
