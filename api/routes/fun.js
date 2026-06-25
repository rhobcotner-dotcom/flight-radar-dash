import { fetchFunStatus } from '../lib/funDashboard.js';

export async function handleFunStatus(_req, res) {
  const payload = await fetchFunStatus();
  res.json(payload);
}
