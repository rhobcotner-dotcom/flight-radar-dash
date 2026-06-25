import { distanceMiles } from '../../lib/geo.js';
import { aisShipTypeLabel, aisVesselLengthMeters, isSignificantVessel } from '../../lib/aisVesselFilter.js';
import { inferVesselPhotoType, vesselPhotoTypeLabel } from '../../lib/vesselPhotoType.js';

const AXIOM_URL = 'https://axiomoverwatch.io/api/v1/positions/latest';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const FETCH_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = { fetchedAt: 0, key: '', payload: null };

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`Axiom vessel feed unavailable (${res.status})`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeAxiomFeature(feature) {
  const props = feature?.properties || {};
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const imo = String(props.imo || '').trim();
  const name = String(props.name || imo || 'Unknown vessel').trim();
  const id = imo ? `imo:${imo}` : `${name}:${lat.toFixed(3)}:${lon.toFixed(3)}`;

  const vessel = {
    mmsi: id,
    name,
    lat,
    lon,
    course: props.course != null ? Math.round(Number(props.course)) : null,
    speedKnots: props.speed != null ? Math.round(Number(props.speed) * 10) / 10 : null,
    shipType: null,
    typeLabel: formatAxiomType(props.vessel_type),
    rawVesselType: String(props.vessel_type || '').trim() || null,
    lengthMeters: props.length != null ? Number(props.length) : null,
    draughtMeters: props.draft != null ? Number(props.draft) : null,
    destination: String(props.destination || '').trim() || null,
    photoUrl: String(props.photo_url || props.photoUrl || '').trim() || null,
    sourceLabel: 'Axiom AIS',
  };

  vessel.lengthMeters = aisVesselLengthMeters(vessel);
  if (!vessel.typeLabel || vessel.typeLabel === 'Ship') {
    vessel.typeLabel = aisShipTypeLabel(vessel.shipType) || vessel.typeLabel;
  }

  vessel.photoType = inferVesselPhotoType(vessel);
  if (vessel.typeLabel === 'Ship' && vessel.photoType) {
    vessel.typeLabel = vesselPhotoTypeLabel(vessel.photoType);
  }

  return vessel;
}

function formatAxiomType(type) {
  const value = String(type || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
  if (!value || value === 'other') return 'Ship';
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function fetchAxiomVessels(lat, lon, radiusMiles = 85) {
  const cacheKey = `${lat.toFixed(2)}:${lon.toFixed(2)}:${radiusMiles}`;
  if (cache.payload && cache.key === cacheKey && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.payload;
  }

  const pad = radiusMiles / 69;
  const params = new URLSearchParams({
    west: String(lon - pad * 1.2),
    east: String(lon + pad * 1.2),
    south: String(lat - pad),
    north: String(lat + pad),
  });

  const body = await fetchWithTimeout(`${AXIOM_URL}?${params.toString()}`);
  const features = Array.isArray(body?.features) ? body.features : [];

  const vessels = features
    .map(normalizeAxiomFeature)
    .filter(Boolean)
    .filter(isSignificantVessel)
    .map((vessel) => ({
      ...vessel,
      distanceMiles: Math.round(distanceMiles(lat, lon, vessel.lat, vessel.lon) * 10) / 10,
    }))
    .filter((vessel) => vessel.distanceMiles <= radiusMiles)
    .sort((a, b) => {
      const sizeDelta = (b.lengthMeters ?? 0) - (a.lengthMeters ?? 0);
      if (sizeDelta !== 0) return sizeDelta;
      return a.distanceMiles - b.distanceMiles;
    });

  const payload = {
    enabled: true,
    source: 'axiomoverwatch.io',
    fetchedAt: body?.meta?.updated_at || new Date().toISOString(),
    count: vessels.length,
    radiusMiles,
    filter: 'significant-only',
    vessels,
  };

  cache = { fetchedAt: Date.now(), key: cacheKey, payload };
  return payload;
}
