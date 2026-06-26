import { USER_AGENT } from './cameraSources/helpers.js';

/** Hosts that block browser hotlinks without a DOT-site Referer. */
const PROXY_RULES = new Map([
  ['cctv.travelmidwest.com', 'https://www.travelmidwest.com/'],
  ['atmsqf.iowadot.gov', 'https://511ia.org/'],
  ['cmhimg01.dot.state.oh.us', 'https://www.artimis.org/'],
  ['itscameras.dot.state.oh.us', 'https://www.ohgo.com/'],
  ['sfs01-traveler.modot.mo.gov', 'https://traveler.modot.org/'],
  ['sfs02-traveler.modot.mo.gov', 'https://traveler.modot.org/'],
  ['sfs03-traveler.modot.mo.gov', 'https://traveler.modot.org/'],
  ['sfs04-traveler.modot.mo.gov', 'https://traveler.modot.org/'],
  ['sfs05-traveler.modot.mo.gov', 'https://traveler.modot.org/'],
]);

const DIRECT_IMAGE_HOST_SUFFIXES = [
  '511pa.com',
  '511la.org',
  'fl511.com',
  'az511.gov',
  'nvroads.com',
  'ctroads.org',
  'newengland511.org',
  'udottraffic.utah.gov',
  'tripcheck.com',
  'wsdot.wa.gov',
  'trimarc.org',
  'micamerasimages.net',
  'img.cdn.prod.alertwest.com',
  'nmroads.com',
  '511ga.org',
  '511wi.gov',
  '511.alaska.gov',
  '511.idaho.gov',
  'drivenc.gov',
  'kscam.carsprogram.org',
  'vdotcameras.com',
  'webapps.arlingtontx.gov',
  'cotrip.org',
  'carsprogram.org',
  'api.algotraffic.com',
  'dot.ca.gov',
  'iteris-atis.com',
];

export function cameraNeedsProxy(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (PROXY_RULES.has(host)) return true;
    return !DIRECT_IMAGE_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
  } catch {
    return false;
  }
}

export function cameraPreviewUrl(streamUrl, mediaType) {
  if (mediaType === 'hls') return streamUrl;
  if (!cameraNeedsProxy(streamUrl)) return streamUrl;
  return `/api/live/camera-image?url=${encodeURIComponent(streamUrl)}`;
}

function ruleForUrl(urlString) {
  const url = new URL(urlString);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Invalid camera URL');
  }
  const referer = PROXY_RULES.get(url.hostname);
  if (!referer) throw new Error('Camera host not allowed');
  return { url, referer };
}

export async function fetchProxiedCameraImage(urlString) {
  const { url, referer } = ruleForUrl(urlString);
  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'image/*,*/*',
      Referer: referer,
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    const err = new Error(`Camera image unavailable (${res.status})`);
    err.status = res.status === 404 ? 404 : 502;
    throw err;
  }
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  if (!/^image\//i.test(contentType) && !contentType.includes('octet-stream')) {
    throw new Error('Camera URL did not return an image');
  }
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType,
    cacheControl: res.headers.get('cache-control') || 'public, max-age=30',
  };
}
