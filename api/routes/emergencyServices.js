import { fetchEmergencyServices } from '../lib/emergencyServices.js';

export async function handleEmergencyServices(req, res) {
  const payload = await fetchEmergencyServices(req.query);
  res.json(payload);
}
