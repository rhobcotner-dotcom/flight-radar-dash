const USER_AGENT =
  process.env.AIRCRAFT_PHOTO_USER_AGENT ||
  'FlightRadarDash/1.0 (personal aircraft dashboard; https://github.com/local/flight-radar-dash)';

const BAD_TITLE = /^(List of|Index of|Category:|Flag of|Template:|Wikipedia:|ICAO)/i;

export function wikipediaFetchHeaders() {
  return {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
  };
}

export async function wikipediaSummaryThumbnail(title) {
  const encoded = encodeURIComponent(title.replace(/ /g, '_'));
  const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`, {
    headers: wikipediaFetchHeaders(),
  });

  if (!res.ok) return null;

  const body = await res.json();
  const thumb = body?.thumbnail?.source;
  if (!thumb) return null;
  return { url: thumb, title: body.title, query: title };
}

export async function wikipediaSearchThumbnail(query, { requireMatch = null, minTokenHits = 1 } = {}) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.searchParams.set('action', 'query');
  url.searchParams.set('generator', 'search');
  url.searchParams.set('gsrsearch', query);
  url.searchParams.set('gsrnamespace', '0');
  url.searchParams.set('prop', 'pageimages|pageprops');
  url.searchParams.set('piprop', 'thumbnail');
  url.searchParams.set('pithumbsize', '900');
  url.searchParams.set('format', 'json');

  const res = await fetch(url, { headers: wikipediaFetchHeaders() });
  if (!res.ok) return null;

  const body = await res.json();
  const pages = Object.values(body?.query?.pages || {});

  for (const page of pages) {
    const title = page?.title || '';
    if (BAD_TITLE.test(title)) continue;
    if (page?.pageprops?.disambiguation !== undefined) continue;
    if (requireMatch && !titleMatchesQuery(title, requireMatch, minTokenHits)) continue;
    const thumb = page?.thumbnail?.source;
    if (thumb) {
      return { url: thumb, title, query };
    }
  }

  return null;
}

function titleMatchesQuery(title, haystack, minHits) {
  const hay = `${title} ${haystack}`.toLowerCase();
  const tokens = haystack
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !['the', 'and', 'for', 'air', 'aircraft', 'airline'].includes(token));
  if (tokens.length === 0) return true;
  const hits = tokens.filter((token) => hay.includes(token));
  return hits.length >= Math.min(minHits, tokens.length);
}

export async function resolveWikipediaPhotoQueries(queries, matchText = '') {
  const unique = [...new Set(queries.filter(Boolean))];
  for (const query of unique) {
    const summary = await wikipediaSummaryThumbnail(query);
    if (summary?.url) {
      if (!matchText || titleMatchesQuery(summary.title, matchText, 1)) {
        return summary;
      }
    }

    const search = await wikipediaSearchThumbnail(query, {
      requireMatch: matchText || query,
      minTokenHits: matchText ? 2 : 1,
    });
    if (search?.url) return search;
  }
  return null;
}
