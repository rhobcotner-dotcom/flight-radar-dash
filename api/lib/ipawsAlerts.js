import { enrichIpawsAlert } from './emergencyEnrichment.js';
import { recordFeedFetch, classifyFeedStatus } from './feedTelemetry.js';

const IPAWS_BASE = 'https://apps.fema.gov/IPAWSOPEN_EAS_SERVICE/rest/public/recent';
const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const CACHE_MS = 120 * 1000;

let cache = { fetchedAt: 0, payload: null };

function parseCapBlocks(xml) {
  const blocks = String(xml || '').split(/<(?:[\w-]+:)?alert[\s>]/i).slice(1);
  return blocks.map((chunk) => parseCapAlert(`<alert>${chunk}`)).filter(Boolean);
}

function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i'));
  return match ? match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : null;
}

function readAllTags(xml, tag) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'gi');
  const values = [];
  let match;
  while ((match = re.exec(xml))) {
    values.push(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim());
  }
  return values;
}

function parseCircle(text) {
  const parts = String(text || '')
    .trim()
    .split(/\s+/)
    .map(Number)
    .filter(Number.isFinite);
  if (parts.length < 3) return null;
  const [lat, lon, radiusMeters] = parts;
  const ring = [];
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    const dLat = (radiusMeters / 111320) * Math.cos(angle);
    const dLon = (radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
    ring.push([lon + dLon, lat + dLat]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

function classifyIpawsEvent(event) {
  const label = String(event || '').toLowerCase();
  if (label.includes('amber') || label.includes('child abduction')) return 'ipaws-amber';
  if (label.includes('911') && label.includes('outage')) return 'ipaws-outage';
  if (label.includes('civil emergency')) return 'ipaws-civil';
  if (label.includes('law enforcement')) return 'ipaws-law-enforcement';
  return 'ipaws-alert';
}

function parsePolygon(text) {
  const coords = String(text || '')
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number))
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon))
    .map(([lat, lon]) => [lon, lat]);
  if (coords.length < 3) return null;
  return { type: 'Polygon', coordinates: [coords] };
}

function parseCapAlert(xml) {
  const identifier = readTag(xml, 'identifier');
  const sent = readTag(xml, 'sent');
  const status = readTag(xml, 'status');
  const msgType = readTag(xml, 'msgType');
  const infoBlock = xml.match(/<(?:[\w-]+:)?info[\s\S]*?<\/(?:[\w-]+:)?info>/i)?.[0] || xml;
  const event = readTag(infoBlock, 'event');
  const headline = readTag(infoBlock, 'headline') || event;
  const severity = readTag(infoBlock, 'severity');
  const urgency = readTag(infoBlock, 'urgency');
  const certainty = readTag(infoBlock, 'certainty');
  const areaDesc = readAllTags(infoBlock, 'areaDesc').join('; ');
  const polygonText = readAllTags(infoBlock, 'polygon')[0];
  const circleText = readAllTags(infoBlock, 'circle')[0];
  const geometry = parsePolygon(polygonText) || parseCircle(circleText);
  const alertClass = classifyIpawsEvent(event);

  if (!identifier && !headline) return null;

  const alert = enrichIpawsAlert({
    id: `ipaws:${identifier || headline}`,
    identifier,
    sent,
    status,
    msgType,
    event,
    headline,
    severity,
    urgency,
    certainty,
    areaDesc,
    geometry,
    alertClass,
    entityKind: alertClass,
  });

  return alert;
}

export async function fetchIpawsAlerts() {
  if (cache.payload && Date.now() - cache.fetchedAt < CACHE_MS) {
    return cache.payload;
  }

  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const res = await fetch(`${IPAWS_BASE}/${encodeURIComponent(timestamp)}`, {
    headers: { Accept: 'application/xml', 'User-Agent': USER_AGENT },
  });

  if (!res.ok) throw new Error(`IPAWS feed unavailable (${res.status})`);
  const xml = await res.text();
  const alerts = parseCapBlocks(xml);

  const collectionFeatures = alerts
    .filter((alert) => alert.geometry)
    .map((alert) => ({
      type: 'Feature',
      id: alert.id,
      geometry: alert.geometry,
      properties: { ...alert, entityKind: 'ipaws-alert' },
    }));

  const payload = {
    source: 'FEMA IPAWS All-Hazards Feed',
    timingClass: 'real-time',
    timingNote: 'CAP XML feed — poll ~120s recommended; empty feed is normal when no alerts active',
    count: alerts.length,
    alerts,
    collection: { type: 'FeatureCollection', features: collectionFeatures },
  };

  cache = { fetchedAt: Date.now(), payload };
  recordFeedFetch('ipaws-cap', {
    group: 'emergency',
    status: classifyFeedStatus({ entityCount: alerts.length }),
    entityCount: alerts.length,
    endpoint: IPAWS_BASE,
    warning: alerts.length === 0 ? 'Empty CAP feed — normal when no public alerts active' : null,
  });
  return payload;
}
