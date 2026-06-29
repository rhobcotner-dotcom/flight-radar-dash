import bundledFeeds from '../../config/gtfs-rt-rail-feeds.json' with { type: 'json' };
import bundledTransitFeeds from '../../config/gtfs-rt-transit-feeds.json' with { type: 'json' };

/**
 * Registry of US transit GTFS-RT vehicle-position feeds.
 * See scripts/probe-gtfs-rt-agencies.mjs for live availability checks.
 */
export const AGENCY_FEED_NOTES = {
  'mta-subway': {
    status: 'limited',
    note: 'NYCT feed publishes trip updates; subway vehicle records rarely include GPS (underground).',
  },
  'nj-transit': {
    status: 'credentials',
    note: 'NJ Transit rail GTFS-RT requires developer account credentials, not a simple public URL.',
  },
  'la-metro': {
    status: 'key',
    note: 'LA Metro moved to Swiftly (api.goswift.ly) — requires Authorization header key from goswift.ly.',
  },
};

export const AGENCY_KEY_DOCS = {
  METRA_API_TOKEN: 'https://metra.com/developers — free GTFS Realtime API key form (approval ~1 business day)',
  METRO_API_KEY: 'https://metrolinktrains.com/about/gtfs/gtfs-rt-access/ — Southern California Metrolink only (STL MetroLink is open at metastlouis.org)',
  API_511_KEY: 'https://511.org/open-data/token — free instant token (BART, Caltrain, ACE, SMART)',
  CTA_API_KEY: 'https://www.transitchicago.com/developers/traintrackerapply/ — free Train Tracker API key (Cloudflare Turnstile on apply form)',
  WMATA_API_KEY: 'https://developer.wmata.com — free instant primary subscription key',
  TRIMET_APP_ID: 'https://developer.trimet.org — free app ID for GTFS-RT vehicle positions',
  OBA_API_KEY: 'https://www.onebusaway.org — optional Puget Sound OBA API key (feeds work without key at reduced rate)',
  LA_METRO_SWIFTLY_KEY: 'https://goswift.ly — LA Metro GTFS-RT Authorization header',
};

export function readEnv(name) {
  return String(process.env[name] || '').trim();
}

export function parseTransitOccupancyFeedList() {
  const raw = readEnv('GTFS_RT_TRANSIT_FEEDS');
  if (!raw) return bundledTransitFeeds.filter((feed) => feed.enabled !== false);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : bundledTransitFeeds;
  } catch {
    return bundledTransitFeeds;
  }
}

export function parseTransitFeedList() {
  const raw = readEnv('GTFS_RT_RAIL_FEEDS');
  if (!raw) return bundledFeeds.filter((feed) => feed.enabled !== false);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : bundledFeeds;
  } catch {
    return bundledFeeds;
  }
}

export function feedAuthHeaders(feed) {
  const authEnv = feed.authEnv ? readEnv(feed.authEnv) : '';
  if (!authEnv) return { configured: false, headers: {}, authEnv: feed.authEnv || null, token: '' };

  const headers = {};
  if (feed.authHeader) {
    headers[feed.authHeader] = authEnv;
  }
  if (feed.authBearer) {
    headers.Authorization = `Bearer ${authEnv}`;
  }
  return { configured: true, headers, authEnv: feed.authEnv, token: authEnv };
}

export function feedUrlWithAuth(feed) {
  const auth = feedAuthHeaders(feed);
  if (feed.authEnv && !auth.configured) {
    if (feed.authOptional) {
      return { url: feed.url, headers: auth.headers, configured: false, skipped: null };
    }
    return {
      url: feed.url,
      headers: auth.headers,
      configured: false,
      skipped: `${feed.authEnv} not set`,
    };
  }

  let url = feed.url;
  if (feed.authQuery && auth.configured) {
    const parsed = new URL(url);
    parsed.searchParams.set(feed.authQuery, auth.token);
    url = parsed.toString();
  }

  return { url, headers: auth.headers, configured: true };
}

export function resolveTrainKind(feed) {
  const kind = feed.trainKind || 'passenger';
  if (['passenger', 'subway', 'light_rail', 'commuter', 'freight', 'crossing', 'yard', 'corridor'].includes(kind)) {
    return kind;
  }
  return 'passenger';
}
