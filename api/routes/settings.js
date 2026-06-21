import { loadDefaultArea } from '../lib/area.js';

export function handleDefaultSettings(_req, res) {
  res.json(loadDefaultArea());
}
