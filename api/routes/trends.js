import { getTrends, getTrendSummary } from '../db/snapshots.js';

export function handleTrends(req, res) {
  const hours = Number(req.query.hours || 24);
  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 168) : 24;
  res.json({
    hours: safeHours,
    points: getTrends(safeHours),
  });
}

export function handleTrendSummary(req, res) {
  const hours = Number(req.query.hours || 24);
  const safeHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 168) : 24;
  res.json(getTrendSummary(safeHours));
}
