import { inferFreightDreamState } from '../lib/freightDreamState.js';

function trainFromRequest(req) {
  if (req.method === 'POST' && req.body && typeof req.body === 'object') {
    return req.body.train || req.body;
  }

  const q = req.query;
  const lat = Number(q.lat);
  const lon = Number(q.lon);
  return {
    trainId: q.trainId || null,
    trainNum: q.trainNum || null,
    routeName: q.routeName || null,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    heading: q.heading ?? null,
    velocityMph: q.velocityMph != null ? Number(q.velocityMph) : null,
    timely: q.timely || null,
    originCode: q.originCode || null,
    destCode: q.destCode || null,
    trainState: q.trainState || null,
    trainKind: q.trainKind || 'freight',
    railroad: q.railroad || null,
    crossingStatus: q.crossingStatus || null,
    sourceLabel: q.sourceLabel || null,
  };
}

export async function handleFreightDreamState(req, res) {
  const train = trainFromRequest(req);
  if (!Number.isFinite(Number(train.lat)) || !Number.isFinite(Number(train.lon))) {
    res.status(400).json({ error: 'Train lat/lon required for dream state inference' });
    return;
  }

  const payload = await inferFreightDreamState(train);
  res.json(payload);
}
