/**
 * Hardcore camera feed audit: every direct source, sample cameras, validate media URLs
 * as the browser would (localhost referer) and via our proxy path.
 */
import { DIRECT_FETCHERS } from '../api/lib/cameraSources/directSources.js';
import { cameraNeedsProxy, cameraPreviewUrl, fetchProxiedCameraImage } from '../api/lib/cameraProxy.js';
import { isHlsUrl, STATE_BOUNDS } from '../api/lib/cameraSources/helpers.js';

const BROWSER_REFERER = 'http://localhost:5173/';
const UA = 'flight-radar-dash/1.0 (camera-audit)';
const SAMPLE_PER_SOURCE = 8;
const FETCH_TIMEOUT_MS = 15000;

function bboxForStates(states) {
  const boxes = states.map((s) => STATE_BOUNDS[s]).filter(Boolean);
  if (!boxes.length) return null;
  return {
    west: Math.min(...boxes.map((b) => b.west)),
    south: Math.min(...boxes.map((b) => b.south)),
    east: Math.max(...boxes.map((b) => b.east)),
    north: Math.max(...boxes.map((b) => b.north)),
  };
}

function shrinkBbox(bbox, factor = 0.35) {
  const cx = (bbox.west + bbox.east) / 2;
  const cy = (bbox.south + bbox.north) / 2;
  const hw = ((bbox.east - bbox.west) * factor) / 2;
  const hh = ((bbox.north - bbox.south) * factor) / 2;
  return { west: cx - hw, south: cy - hh, east: cx + hw, north: cy + hh };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function testSnapshot(url, { useProxy = false } = {}) {
  try {
    if (useProxy) {
      try {
        const img = await fetchProxiedCameraImage(url);
        return {
          ok: img.body.length > 500,
          status: 200,
          contentType: img.contentType,
          bytes: img.body.length,
          via: 'proxy',
        };
      } catch (e) {
        return { ok: false, status: e.status || 0, error: e.message, via: 'proxy' };
      }
    }

    const res = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'image/*,*/*',
        Referer: BROWSER_REFERER,
      },
      redirect: 'follow',
    });
    const ct = res.headers.get('content-type') || '';
    const buf = Buffer.from(await res.arrayBuffer());
    const isImage = /^image\//i.test(ct) || (buf[0] === 0xff && buf[1] === 0xd8) || buf.slice(0, 8).toString('ascii') === '\x89PNG\r\n\x1a\n';
    return {
      ok: res.ok && isImage && buf.length > 500,
      status: res.status,
      contentType: ct,
      bytes: buf.length,
      via: 'browser-referer',
      snippet: !isImage && buf.length < 200 ? buf.toString('utf8').slice(0, 120) : undefined,
    };
  } catch (e) {
    return { ok: false, status: 0, error: e.message, via: useProxy ? 'proxy' : 'browser-referer' };
  }
}

async function testHls(url) {
  const variants = [url, url.replace(/^http:\/\//i, 'https://')];
  for (const u of [...new Set(variants)]) {
    try {
      const res = await fetchWithTimeout(u, {
        headers: { 'User-Agent': UA, Accept: '*/*' },
        redirect: 'follow',
      });
      const text = await res.text();
      if (res.ok && (text.includes('#EXTM3U') || text.includes('#EXT-X-'))) {
        return { ok: true, status: res.status, url: u, via: 'hls-manifest' };
      }
    } catch {}
  }
  return { ok: false, status: 0, error: 'no manifest', via: 'hls-manifest' };
}

async function auditSource({ id, states, fetch }) {
  const full = bboxForStates(states);
  if (!full) return { id, states, error: 'no bbox', samples: [] };

  let cameras = [];
  for (const factor of [0.35, 0.55, 0.85, 1.0]) {
    const bbox = shrinkBbox(full, factor);
    try {
      const batch = await fetch(bbox);
      if (batch?.length) {
        cameras = batch;
        break;
      }
    } catch (e) {
      if (factor === 1.0) return { id, states, error: e.message, samples: [] };
    }
  }

  if (!cameras.length) {
    return { id, states, error: 'zero cameras in state bbox', samples: [] };
  }

  const picked = [];
  const step = Math.max(1, Math.floor(cameras.length / SAMPLE_PER_SOURCE));
  for (let i = 0; i < cameras.length && picked.length < SAMPLE_PER_SOURCE; i += step) {
    picked.push(cameras[i]);
  }

  const samples = [];
  for (const cam of picked) {
    try {
      const isHls = cam.mediaType === 'hls' || isHlsUrl(cam.streamUrl);
      let browser = isHls ? await testHls(cam.streamUrl) : await testSnapshot(cam.streamUrl);
      let proxy = null;
      const needsProxy = cameraNeedsProxy(cam.streamUrl);
      const previewPath = cameraPreviewUrl(cam.streamUrl, isHls ? 'hls' : 'snapshot');

      if (!browser.ok && !isHls) {
        if (needsProxy || previewPath !== cam.streamUrl) {
          proxy = await testSnapshot(cam.streamUrl, { useProxy: true });
        }
        if (!browser.ok && !proxy?.ok) {
          const noRef = await fetchWithTimeout(cam.streamUrl, {
            headers: { 'User-Agent': UA, Accept: 'image/*,*/*' },
          }).then(async (r) => ({
            ok: r.ok,
            status: r.status,
          })).catch((e) => ({ ok: false, error: e.message }));
          if (noRef.ok) {
            browser = { ...browser, note: 'works without referer (use referrerPolicy)', ok: true };
          }
        }
      }

      samples.push({
        id: cam.id,
        state: cam.state,
        source: cam.source,
        url: cam.streamUrl,
        previewPath,
        mediaType: isHls ? 'hls' : 'snapshot',
        browser,
        proxy,
        needsProxy,
        fixed: proxy?.ok || browser.ok,
      });
    } catch (e) {
      samples.push({
        id: cam.id,
        state: cam.state,
        source: cam.source,
        url: cam.streamUrl,
        mediaType: cam.mediaType || 'snapshot',
        browser: { ok: false, error: e.message },
        proxy: null,
        needsProxy: cameraNeedsProxy(cam.streamUrl),
        fixed: false,
      });
    }
  }

  const failed = samples.filter((s) => !s.fixed);
  return {
    id,
    states,
    total: cameras.length,
    tested: samples.length,
    passed: samples.length - failed.length,
    failed: failed.length,
    failRate: failed.length / samples.length,
    samples,
    failures: failed,
  };
}

async function discoverRefererBlocks(allSamples) {
  const hosts = new Map();
  for (const s of allSamples) {
    try {
      const host = new URL(s.url).hostname;
      if (!hosts.has(host)) hosts.set(host, { host, urls: [], browserFails: 0, noRefOk: 0 });
      const h = hosts.get(host);
      h.urls.push(s.url);
      if (!s.browser.ok) h.browserFails += 1;
    } catch {}
  }

  const discoveries = [];
  for (const { host, urls } of hosts.values()) {
    const url = urls[0];
    const [browser, noRef] = await Promise.all([
      fetchWithTimeout(url, { headers: { Referer: BROWSER_REFERER, 'User-Agent': UA } }).then((r) => r.status).catch(() => 0),
      fetchWithTimeout(url, { headers: { 'User-Agent': UA } }).then((r) => r.status).catch(() => 0),
    ]);
    if (browser === 403 || (browser >= 400 && noRef === 200)) {
      discoveries.push({ host, browserStatus: browser, noRefStatus: noRef, sample: url });
    }
  }
  return discoveries;
}

console.log('=== CAMERA HEALTH AUDIT ===');
console.log(`Sources: ${DIRECT_FETCHERS.length}, samples/source: ${SAMPLE_PER_SOURCE}`);
console.log(`Started: ${new Date().toISOString()}\n`);

const results = [];
for (const entry of DIRECT_FETCHERS) {
  process.stdout.write(`Auditing ${entry.id} (${entry.states.join(',')})... `);
  const r = await auditSource(entry);
  results.push(r);
  if (r.error) console.log(`ERROR: ${r.error}`);
  else console.log(`${r.passed}/${r.tested} ok (${r.total} cams in bbox)`);
}

const allFailures = results.flatMap((r) => (r.failures || []).map((f) => ({ sourceId: r.id, ...f })));
const allSamples = results.flatMap((r) => r.samples || []);

console.log('\n=== SUMMARY ===');
console.log(`Sources audited: ${results.length}`);
console.log(`Sources with errors: ${results.filter((r) => r.error).length}`);
console.log(`Total sample tests: ${allSamples.length}`);
console.log(`Passed: ${allSamples.filter((s) => s.fixed).length}`);
console.log(`Failed: ${allFailures.length}`);

if (allFailures.length) {
  console.log('\n=== FAILURES BY SOURCE ===');
  for (const r of results.filter((x) => x.failed > 0)) {
    console.log(`\n[${r.id}] ${r.failed}/${r.tested} failed`);
    for (const f of r.failures) {
      console.log(`  ${f.state} ${f.id}: ${f.url.slice(0, 90)}`);
      console.log(`    browser: ${JSON.stringify(f.browser)}`);
      if (f.proxy) console.log(`    proxy: ${JSON.stringify(f.proxy)}`);
    }
  }
}

console.log('\n=== REFERER DISCOVERY (hosts blocking localhost) ===');
const blocked = await discoverRefererBlocks(allFailures.length ? allFailures : allSamples.slice(0, 40));
for (const b of blocked) {
  console.log(`  ${b.host} browser=${b.browserStatus} noRef=${b.noRefStatus}`);
  console.log(`    ${b.sample.slice(0, 100)}`);
}

const out = { auditedAt: new Date().toISOString(), results, blockedHosts: blocked, failureCount: allFailures.length };
await import('node:fs/promises').then((fs) =>
  fs.writeFile('/tmp/camera-health-audit.json', JSON.stringify(out, null, 2))
);
console.log('\nWrote /tmp/camera-health-audit.json');

process.exit(allFailures.length > 0 ? 1 : 0);
