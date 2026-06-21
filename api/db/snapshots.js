import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

let db;

function dbPath() {
  const configured = process.env.DB_PATH || './data/snapshots.sqlite';
  const resolved = path.resolve(configured);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

export function getDb() {
  if (db) return db;
  db = new Database(dbPath());
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      bounds TEXT NOT NULL,
      metro_name TEXT,
      total_count INTEGER NOT NULL,
      by_category TEXT NOT NULL,
      notable_events TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);
  `);
  return db;
}

export function insertSnapshot({
  ts,
  bounds,
  metroName,
  totalCount,
  byCategory,
  notableEvents,
}) {
  const stmt = getDb().prepare(`
    INSERT INTO snapshots (ts, bounds, metro_name, total_count, by_category, notable_events)
    VALUES (@ts, @bounds, @metroName, @totalCount, @byCategory, @notableEvents)
  `);
  return stmt.run({
    ts,
    bounds,
    metroName: metroName || null,
    totalCount,
    byCategory: JSON.stringify(byCategory),
    notableEvents: JSON.stringify(notableEvents),
  });
}

export function getTrends(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT ts, total_count, by_category, notable_events
       FROM snapshots
       WHERE ts >= ?
       ORDER BY ts ASC`
    )
    .all(since);

  return rows.map((row) => ({
    ts: row.ts,
    totalCount: row.total_count,
    byCategory: JSON.parse(row.by_category),
    notableEvents: JSON.parse(row.notable_events),
  }));
}

export function getTrendSummary(hours = 24) {
  const points = getTrends(hours);
  if (points.length === 0) {
    return {
      hours,
      snapshotCount: 0,
      avgCount: 0,
      peakCount: 0,
      peakHour: null,
      categoryTotals: {},
      alertCount: 0,
      points: [],
    };
  }

  const totals = points.map((p) => p.totalCount);
  const avgCount = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
  const peakCount = Math.max(...totals);
  const peakPoint = points.find((p) => p.totalCount === peakCount);
  const peakHour = peakPoint ? new Date(peakPoint.ts).getHours() : null;

  const categoryTotals = {};
  let alertCount = 0;
  for (const point of points) {
    for (const [key, value] of Object.entries(point.byCategory || {})) {
      categoryTotals[key] = (categoryTotals[key] || 0) + value;
    }
    alertCount += (point.notableEvents || []).length;
  }

  return {
    hours,
    snapshotCount: points.length,
    avgCount,
    peakCount,
    peakHour,
    categoryTotals,
    alertCount,
    points,
  };
}

export function getLatestSnapshot() {
  return getDb()
    .prepare(
      `SELECT ts, bounds, metro_name, total_count, by_category, notable_events
       FROM snapshots
       ORDER BY ts DESC
       LIMIT 1`
    )
    .get();
}
