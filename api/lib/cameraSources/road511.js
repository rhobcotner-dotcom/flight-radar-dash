import {
  USER_AGENT,
  normalizeCamera,
  pickLiveFirst,
} from './helpers.js';

export function hasRoad511Key() {
  return Boolean(process.env.ROAD511_API_KEY?.trim());
}

export async function fetchRoad511Cameras(bbox, limit) {
  const apiKey = process.env.ROAD511_API_KEY?.trim();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    type: 'cameras',
    bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    limit: String(Math.min(Math.max(limit * 2, 24), 100)),
  });

  const res = await fetch(`https://api.road511.com/api/v1/features?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      'X-API-Key': apiKey,
    },
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Road511 unavailable (${res.status})`);
  }

  const rows = Array.isArray(body?.data) ? body.data : [];
  return rows
    .map((row) => {
      const props = row.properties || {};
      const streamUrl = pickLiveFirst(props.video_url, props.stream_url);
      if (!streamUrl) return null;
      return normalizeCamera({
        id: `road511-${row.id}`,
        description: row.name || props.description || props.location,
        lat: Number(row.latitude),
        lon: Number(row.longitude),
        streamUrl,
        liveUrl: streamUrl,
        source: 'Road511',
        state: row.jurisdiction || props.state || props.jurisdiction,
      });
    })
    .filter(Boolean);
}
