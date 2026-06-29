import { boundingBox, distanceMiles } from '../../lib/geo.js';
import { enrichWildfireOccupancy } from './occupancyEnrichment.js';

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/VIIRS_SNPP_NRT';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 15 * 60 * 1000;

let cache = { fetchedAt: 0, data: null };

function parseCsv(text) {
  const lines = String(text || '')
    .trim()
    .split('\n')
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((value) => value.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim()]));
  });
}

export async function fetchWildfireHotspots(lat, lon, radiusMiles = 200) {
  const mapKey = String(process.env.NASA_FIRMS_MAP_KEY || '').trim();
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}:${mapKey ? 'on' : 'off'}`;

  if (!mapKey) {
    return {
      enabled: false,
      source: 'firms.modaps.eosdis.nasa.gov',
      message: 'Set NASA_FIRMS_MAP_KEY in .env (free at firms.modaps.eosdis.nasa.gov) for wildfire hotspots.',
      fetchedAt: new Date().toISOString(),
      count: 0,
      radiusMiles,
      hotspots: [],
    };
  }

  if (cache.data?.cacheKey === cacheKey && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.data.payload;
  }

  const box = boundingBox(lat, lon, radiusMiles);
  const area = [box.west, box.south, box.east, box.north].join(',');
  const url = `${FIRMS_BASE}/${area}/1?MAP_KEY=${encodeURIComponent(mapKey)}`;

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv' },
  });

  if (!res.ok) {
    throw new Error(`NASA FIRMS unavailable (${res.status})`);
  }

  const text = await res.text();
  if (text.includes('Invalid MAP_KEY')) {
    throw new Error('Invalid NASA_FIRMS_MAP_KEY');
  }

  const hotspots = parseCsv(text)
    .map((row) => {
      const hotspotLat = Number(row.latitude);
      const hotspotLon = Number(row.longitude);
      if (!Number.isFinite(hotspotLat) || !Number.isFinite(hotspotLon)) return null;
      return enrichWildfireOccupancy({
        lat: hotspotLat,
        lon: hotspotLon,
        brightness: Number(row.bright_ti4 || row.bright_ti5) || null,
        frp: Number(row.frp) || null,
        confidence: row.confidence || null,
        observedAt: row.acq_date && row.acq_time ? `${row.acq_date}T${row.acq_time}` : null,
        satellite: row.satellite || 'VIIRS',
        distanceMiles:
          Math.round(distanceMiles(lat, lon, hotspotLat, hotspotLon) * 10) / 10,
      });
    })
    .filter(Boolean)
    .filter((row) => row.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  const payload = {
    enabled: true,
    source: 'firms.modaps.eosdis.nasa.gov',
    fetchedAt: new Date().toISOString(),
    count: hotspots.length,
    radiusMiles,
    hotspots,
  };

  cache = { fetchedAt: Date.now(), data: { cacheKey, payload } };
  return payload;
}
