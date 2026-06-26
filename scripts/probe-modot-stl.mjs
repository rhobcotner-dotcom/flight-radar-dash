import { fetchProxiedHlsManifest } from '../api/lib/cameraStreamProxy.js';
import { USER_AGENT } from '../api/lib/cameraSources/helpers.js';

const STL_BBOX = { west: -91, south: 38.5, east: -90, north: 39.2 };

async function queryModotCameras() {
  const params = new URLSearchParams({
    where: 'URL2 IS NOT NULL',
    geometry: `${STL_BBOX.west},${STL_BBOX.south},${STL_BBOX.east},${STL_BBOX.north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'CAM_ID,DESCRIPTION,URL2,STREAM_ERROR',
    returnGeometry: 'false',
    resultRecordCount: '200',
    f: 'json',
  });
  const res = await fetch(
    `https://mapping.modot.org/arcgis/rest/services/TravelerInformation/NWSDATA/MapServer/0/query?${params}`
  );
  const body = await res.json();
  return body.features.map((f) => f.attributes).filter((a) => a.STREAM_ERROR !== 'Y');
}

async function probeDirect(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: '*/*',
        Referer: 'https://traveler.modot.org/',
      },
      redirect: 'follow',
    });
    const text = await res.text();
    return {
      ok: res.ok && text.includes('#EXTM3U'),
      ms: Date.now() - t0,
      status: res.status,
      err: null,
    };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, status: null, err: err.name };
  }
}

async function probeProxy(url) {
  const t0 = Date.now();
  try {
    await fetchProxiedHlsManifest(url);
    return { ok: true, ms: Date.now() - t0, err: null };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, err: err.message };
  }
}

const snapshotPatterns = (camId, url) => {
  const match = url.match(/MODOT_CAM_(\d+)/i) || url.match(/CAM(\d+)/i);
  const id = match?.[1] ?? camId;
  return [
    `https://traveler.modot.org/map/CameraImages/MODOT_CAM_${id}.jpg`,
    `https://traveler.modot.org/map/CameraImages/CAM${id}.jpg`,
    `https://mapping.modot.org/cameraimages/MODOT_CAM_${id}.jpg`,
    `https://sfs02-traveler.modot.mo.gov/snapshots/MODOT_CAM_${id}.jpg`,
    `https://sfs02-traveler.modot.mo.gov/CameraImages/MODOT_CAM_${id}.jpg`,
  ];
};

async function probeSnapshot(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*,*/*' },
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    return res.ok && /^image\//i.test(ct) && buf.length > 500;
  } catch {
    return false;
  }
}

const cameras = await queryModotCameras();
console.log(`STL area MoDOT cameras: ${cameras.length}`);

const byHost = new Map();
for (const cam of cameras) {
  const host = new URL(cam.URL2).hostname;
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(cam);
}

console.log('\nDirect HLS probe by host (first 3 each):');
for (const [host, list] of [...byHost.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const sample = list.slice(0, 3);
  const results = await Promise.all(sample.map((c) => probeDirect(c.URL2)));
  const ok = results.filter((r) => r.ok).length;
  console.log(`${host}: ${ok}/${sample.length} ok`, results.map((r) => `${r.ok ? 'OK' : r.err || 'bad'}@${r.ms}ms`).join(', '));
}

console.log('\nProxy HLS probe (first 5 STL cams):');
for (const cam of cameras.slice(0, 5)) {
  const r = await probeProxy(cam.URL2);
  console.log(r.ok ? 'OK' : 'FAIL', `${r.ms}ms`, cam.DESCRIPTION.slice(0, 40), r.err || '');
}

console.log('\nSnapshot pattern probe (cam 128):');
for (const url of snapshotPatterns(128, cameras.find((c) => c.URL2.includes('128'))?.URL2 || '')) {
  const ok = await probeSnapshot(url);
  console.log(ok ? 'OK' : 'no', url);
}
