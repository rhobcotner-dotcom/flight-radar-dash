import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

/** @type {Map<string, { fetchedAt: number, lookup: Map<string, string> | null }>} */
const cache = new Map();

function loadBundledStopFile(feedId) {
  const file = path.join(ROOT, 'config', `${feedId}-stops.json`);
  try {
    const raw = readFileSync(file, 'utf8');
    const body = JSON.parse(raw);
    const rows = body?.stops || body;
    if (!rows || typeof rows !== 'object') return null;
    const lookup = new Map(Object.entries(rows).map(([id, name]) => [String(id), String(name)]));
    return lookup.size ? lookup : null;
  } catch {
    return null;
  }
}

export function getStopNameLookup(feedId) {
  const key = feedId || 'default';
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return cached.lookup || undefined;
  }

  const lookup = loadBundledStopFile(key);
  cache.set(key, { fetchedAt: Date.now(), lookup });
  return lookup || undefined;
}

export function resolveStopName(feedId, stopId) {
  const lookup = getStopNameLookup(feedId);
  if (!lookup) return null;
  return lookup.get(String(stopId)) || null;
}
