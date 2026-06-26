const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';

/** US state / territory full name → postal abbreviation. */
export const US_STATE_ABBREV = {
  Alabama: 'AL',
  Alaska: 'AK',
  Arizona: 'AZ',
  Arkansas: 'AR',
  California: 'CA',
  Colorado: 'CO',
  Connecticut: 'CT',
  Delaware: 'DE',
  'District of Columbia': 'DC',
  Florida: 'FL',
  Georgia: 'GA',
  Hawaii: 'HI',
  Idaho: 'ID',
  Illinois: 'IL',
  Indiana: 'IN',
  Iowa: 'IA',
  Kansas: 'KS',
  Kentucky: 'KY',
  Louisiana: 'LA',
  Maine: 'ME',
  Maryland: 'MD',
  Massachusetts: 'MA',
  Michigan: 'MI',
  Minnesota: 'MN',
  Mississippi: 'MS',
  Missouri: 'MO',
  Montana: 'MT',
  Nebraska: 'NE',
  Nevada: 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  Ohio: 'OH',
  Oklahoma: 'OK',
  Oregon: 'OR',
  Pennsylvania: 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  Tennessee: 'TN',
  Texas: 'TX',
  Utah: 'UT',
  Vermont: 'VT',
  Virginia: 'VA',
  Washington: 'WA',
  'West Virginia': 'WV',
  Wisconsin: 'WI',
  Wyoming: 'WY',
};

export function abbreviateUsState(state) {
  const value = String(state || '').trim();
  if (!value) return null;
  if (value.length === 2) return value.toUpperCase();
  return US_STATE_ABBREV[value] || value;
}

export function formatPlaceLabel(address = {}) {
  const city =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.hamlet ||
    address.suburb ||
    address.neighbourhood ||
    address.county;
  const state = abbreviateUsState(address.state);
  if (city && state) return `${city}, ${state}`;
  if (state) return state;
  if (city) return city;
  return null;
}

export async function reverseGeocodeLatLon(lat, lon, { fetchImpl = fetch } = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('lat and lon required');
  }

  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'json',
    addressdetails: '1',
    zoom: '10',
  });

  const response = await fetchImpl(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Reverse geocoder unavailable (${response.status})`);
  }

  const body = await response.json();
  const address = body?.address || {};
  const label = formatPlaceLabel(address);

  return {
    label: label || body?.display_name || `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
    city:
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.hamlet ||
      address.suburb ||
      null,
    state: abbreviateUsState(address.state),
    lat: latitude,
    lon: longitude,
  };
}
