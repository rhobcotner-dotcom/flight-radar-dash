#!/usr/bin/env node
/**
 * End-to-end camera playback diagnosis.
 */
import { chromium } from 'playwright';

const ZUMBEHL =
  'https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_131/playlist.m3u8';
const APP = 'http://localhost:5173/?lat=38.787&lon=-90.537';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });

  console.log('=== 1) Browser fetch MoDOT rtplive direct ===');
  await page.goto('about:blank');
  const directFetch = await page.evaluate(async (url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const text = await res.text();
      return { ok: res.ok, status: res.status, len: text.length, head: text.slice(0, 100) };
    } catch (e) {
      return { error: String(e) };
    }
  }, ZUMBEHL);
  console.log(directFetch);

  console.log('\n=== 2) Browser fetch via app proxy ===');
  await page.goto(APP, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const proxyFetch = await page.evaluate(async (url) => {
    const proxy = `/api/live/camera-hls?url=${encodeURIComponent(url)}`;
    try {
      const res = await fetch(proxy, { signal: AbortSignal.timeout(15000) });
      const text = await res.text();
      return { ok: res.ok, status: res.status, head: text.slice(0, 120) };
    } catch (e) {
      return { error: String(e) };
    }
  }, ZUMBEHL);
  console.log(proxyFetch);

  console.log('\n=== 3) Video.js direct (MoDOT site pattern) ===');
  const vjsDirect = await page.evaluate(async (url) => {
    const videojs = (await import('/@fs/Users/robert.sorrell/Projects/flight-radar-dash/web/node_modules/video.js/dist/video.es.js'))
      .default;
    const v = document.createElement('video');
    v.className = 'video-js vjs-default-skin';
    v.muted = true;
    document.body.appendChild(v);
    return await new Promise((resolve) => {
      const p = videojs(v, {
        autoplay: 'muted',
        muted: true,
        controls: false,
        html5: { vhs: { overrideNative: true } },
      });
      const t = setTimeout(() => {
        resolve({ timeout: true, w: v.videoWidth, err: p.error()?.message });
        p.dispose();
      }, 20000);
      p.one('playing', () => {
        clearTimeout(t);
        resolve({ ok: true, w: v.videoWidth });
        p.dispose();
      });
      p.one('error', () => {
        clearTimeout(t);
        resolve({ error: p.error()?.message, code: p.error()?.code });
        p.dispose();
      });
      p.src({ src: url, type: 'application/x-mpegURL' });
      p.play()?.catch(() => {});
    });
  }, ZUMBEHL);
  console.log(vjsDirect);

  console.log('\n=== 4) Video.js via proxy ===');
  const vjsProxy = await page.evaluate(async (url) => {
    const videojs = (await import('/@fs/Users/robert.sorrell/Projects/flight-radar-dash/web/node_modules/video.js/dist/video.es.js'))
      .default;
    const proxy = `/api/live/camera-hls?url=${encodeURIComponent(url)}`;
    const v = document.createElement('video');
    v.className = 'video-js vjs-default-skin';
    v.muted = true;
    document.body.appendChild(v);
    return await new Promise((resolve) => {
      const p = videojs(v, {
        autoplay: 'muted',
        muted: true,
        controls: false,
        html5: { vhs: { overrideNative: true } },
      });
      const t = setTimeout(() => {
        resolve({ timeout: true, w: v.videoWidth });
        p.dispose();
      }, 20000);
      p.one('playing', () => {
        clearTimeout(t);
        resolve({ ok: true, w: v.videoWidth });
        p.dispose();
      });
      p.one('error', () => {
        clearTimeout(t);
        resolve({ error: p.error()?.message, code: p.error()?.code });
        p.dispose();
      });
      p.src({ src: proxy, type: 'application/x-mpegURL' });
      p.play()?.catch(() => {});
    });
  }, ZUMBEHL);
  console.log(vjsProxy);

  console.log('\n=== 5) HLS.js via proxy ===');
  const hlsProxy = await page.evaluate(async (url) => {
    const Hls = (await import('/@fs/Users/robert.sorrell/Projects/flight-radar-dash/web/node_modules/hls.js/dist/hls.mjs')).default;
    const proxy = `/api/live/camera-hls?url=${encodeURIComponent(url)}`;
    const v = document.createElement('video');
    v.muted = true;
    document.body.appendChild(v);
    return await new Promise((resolve) => {
      const hls = new Hls({ enableWorker: false });
      const t = setTimeout(() => {
        resolve({ timeout: true, w: v.videoWidth });
        hls.destroy();
      }, 20000);
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (d.fatal) {
          clearTimeout(t);
          resolve({ fatal: d.type, details: d.details });
          hls.destroy();
        }
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        clearTimeout(t);
        resolve({ ok: true, w: v.videoWidth });
        hls.destroy();
      });
      hls.loadSource(proxy);
      hls.attachMedia(v);
      v.play().catch(() => {});
    });
  }, ZUMBEHL);
  console.log(hlsProxy);

  if (logs.length) {
    console.log('\n=== Console errors ===');
    console.log(logs.slice(0, 15).join('\n'));
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
