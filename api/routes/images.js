import { resolveAircraftPhotoUrl } from '../lib/aircraftImages.js';
import { resolveAirlineLiveryPhotoUrl } from '../lib/aircraftLiveryImages.js';
import { resolveAircraftTypeImageUrl } from '../lib/aircraftTypeImages.js';
import { resolveVesselPhotoUrl, resolveVesselTypeImageUrl } from '../lib/vesselImages.js';

async function proxyImageUrl(res, imageUrl, cacheSeconds) {
  const upstream = await fetch(imageUrl, {
    headers: { Accept: 'image/*' },
  });

  if (!upstream.ok) {
    res.status(upstream.status).json({ error: 'Unable to fetch aircraft image' });
    return;
  }

  res.set('Cache-Control', `public, max-age=${cacheSeconds}`);
  res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.send(buffer);
}

export async function handleAircraftImage(req, res) {
  const reg = typeof req.query.reg === 'string' ? req.query.reg : '';
  const hex = typeof req.query.hex === 'string' ? req.query.hex : '';
  const type = typeof req.query.type === 'string' ? req.query.type : '';

  const imageUrl = await resolveAircraftPhotoUrl({ reg, hex, type });
  if (!imageUrl) {
    res.status(404).json({ error: 'Aircraft photo not found' });
    return;
  }

  await proxyImageUrl(res, imageUrl, 86400);
}

export async function handleAircraftLiveryImage(req, res) {
  const airline = typeof req.query.airline === 'string' ? req.query.airline : '';
  const type = typeof req.query.type === 'string' ? req.query.type : '';

  const match = await resolveAirlineLiveryPhotoUrl({ airline, type: type || undefined });
  if (!match?.url) {
    res.status(404).json({ error: 'Airline livery photo not found' });
    return;
  }

  await proxyImageUrl(res, match.url, 604800);
}

export async function handleAircraftTypeImage(req, res) {
  const type = typeof req.query.type === 'string' ? req.query.type : '';

  const match = await resolveAircraftTypeImageUrl(type);
  if (!match?.url) {
    res.status(404).json({ error: 'Aircraft type image not found' });
    return;
  }

  await proxyImageUrl(res, match.url, 604800);
}

export async function handleVesselImage(req, res) {
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  const rawType = typeof req.query.rawType === 'string' ? req.query.rawType : '';
  const photoType = typeof req.query.photoType === 'string' ? req.query.photoType : '';

  const match = await resolveVesselPhotoUrl({ name, type, rawType, photoType });
  if (!match?.url) {
    res.status(404).json({ error: 'Vessel photo not found' });
    return;
  }

  await proxyImageUrl(res, match.url, 604800);
}

export async function handleVesselTypeImage(req, res) {
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  const rawType = typeof req.query.rawType === 'string' ? req.query.rawType : '';
  const photoType = typeof req.query.photoType === 'string' ? req.query.photoType : '';
  const seed = typeof req.query.seed === 'string' ? req.query.seed : '';

  const match = await resolveVesselTypeImageUrl(type, rawType, photoType, seed);
  if (!match?.url) {
    res.status(404).json({ error: 'Vessel type image not found' });
    return;
  }

  await proxyImageUrl(res, match.url, 604800);
}
