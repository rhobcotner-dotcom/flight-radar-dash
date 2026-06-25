const NWS_ALERTS = 'https://api.weather.gov/alerts/active';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

function cacheKey(lat, lon) {
  return `${lat.toFixed(3)}:${lon.toFixed(3)}`;
}

function mapSeverity(value) {
  switch (String(value || '').toLowerCase()) {
    case 'extreme':
    case 'severe':
      return 'high';
    case 'moderate':
      return 'medium';
    default:
      return 'info';
  }
}

function normalizeAlert(feature) {
  const props = feature?.properties || {};
  return {
    id: props.id || feature?.id || `${props.event}-${props.sent}`,
    event: props.event || 'Weather alert',
    severity: mapSeverity(props.severity),
    urgency: props.urgency || '',
    certainty: props.certainty || '',
    headline: props.headline || props.event || 'Weather alert',
    description: props.description || '',
    instruction: props.instruction || '',
    areaDesc: props.areaDesc || '',
    effective: props.effective || props.onset || null,
    expires: props.expires || props.ends || null,
    senderName: props.senderName || 'National Weather Service',
  };
}

export async function fetchNwsAlerts(lat, lon) {
  const key = cacheKey(lat, lon);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) {
    return hit.data;
  }

  const url = `${NWS_ALERTS}?point=${lat},${lon}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/geo+json',
    },
  });

  if (!res.ok) {
    throw new Error(`NWS alerts unavailable (${res.status})`);
  }

  const body = await res.json();
  const alerts = Array.isArray(body?.features)
    ? body.features
        .map(normalizeAlert)
        .filter((alert) => alert.id)
        .sort((a, b) => {
          const rank = { high: 0, medium: 1, info: 2 };
          return (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3);
        })
    : [];

  const data = {
    source: 'weather.gov',
    fetchedAt: new Date().toISOString(),
    alerts,
  };

  cache.set(key, { fetchedAt: Date.now(), data });
  return data;
}
