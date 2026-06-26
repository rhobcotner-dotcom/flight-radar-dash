#!/usr/bin/env node
import { chromium } from 'playwright';

const APP_URL = 'http://localhost:5173/?lat=38.787&lon=-90.629';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.leaflet-container', { timeout: 60000 });
  await page.waitForTimeout(4000);

  const modotTest = await page.evaluate(async () => {
    const url = 'https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_128/playlist.m3u8';
    const results = { fetch: null, hls: null };
    try {
      const res = await fetch(url, {
        headers: { Referer: 'https://traveler.modot.org/map/index.html' },
        signal: AbortSignal.timeout(8000),
      });
      const text = await res.text();
      results.fetch = { ok: res.ok, status: res.status, len: text.length, head: text.slice(0, 120) };
    } catch (e) {
      results.fetch = { error: String(e) };
    }

    const video = document.createElement('video');
    video.muted = true;
    document.body.appendChild(video);
    try {
      const Hls = (await import('https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js')).default;
      if (!Hls.isSupported()) {
        results.hls = { error: 'Hls not supported' };
      } else {
        results.hls = await new Promise((resolve) => {
          const hls = new Hls({
            xhrSetup: (xhr) => xhr.setRequestHeader('Referer', 'https://traveler.modot.org/map/index.html'),
          });
          const timer = setTimeout(() => {
            hls.destroy();
            resolve({ error: 'timeout', readyState: video.readyState, width: video.videoWidth });
          }, 15000);
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) {
              clearTimeout(timer);
              hls.destroy();
              resolve({ error: data.type, details: data.details, url: data.url });
            }
          });
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            clearTimeout(timer);
            resolve({ ok: true, readyState: video.readyState, width: video.videoWidth });
            hls.destroy();
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          void video.play().catch(() => {});
        });
      }
    } catch (e) {
      results.hls = { error: String(e) };
    }
    video.remove();
    return results;
  });

  console.log('MoDOT browser test:', JSON.stringify(modotTest, null, 2));

  const mapBox = await page.locator('.leaflet-container').first().boundingBox();
  await page.mouse.click(mapBox.x + mapBox.width * 0.52, mapBox.y + mapBox.height * 0.48);
  await page.waitForSelector('.storm-analysis-cam video', { timeout: 20000 });
  await page.waitForTimeout(20000);

  const videoState = await page.evaluate(() =>
    [...document.querySelectorAll('.storm-analysis-cam video')].map((v, i) => ({
      i,
      className: v.className,
      readyState: v.readyState,
      videoWidth: v.videoWidth,
      networkState: v.networkState,
      error: v.error ? v.error.code : null,
      src: v.currentSrc || v.src,
    }))
  );
  console.log('Storm videos after 20s:', JSON.stringify(videoState, null, 2));

  const failedRequests = [];
  page.on('requestfailed', (req) => {
    if (req.url().includes('modot') || req.url().includes('camera-hls')) {
      failedRequests.push({ url: req.url().slice(0, 120), err: req.failure()?.errorText });
    }
  });
  if (logs.length) console.log('Console (last 20):', logs.slice(-20).join('\n'));

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
