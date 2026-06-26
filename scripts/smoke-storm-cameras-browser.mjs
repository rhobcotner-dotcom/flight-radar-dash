#!/usr/bin/env node
/**
 * Browser smoke test: storm briefing shows closest live cameras and mounts players.
 */
import { chromium } from 'playwright';

const APP_URL = 'http://localhost:5173/?lat=38.787&lon=-90.629';
const MODOT_MANIFEST =
  'https://sfs02-traveler.modot.mo.gov/rtplive/MODOT_CAM_224/playlist.m3u8';

async function modotReachable(page) {
  return page
    .evaluate(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { Referer: 'https://traveler.modot.org/map/index.html' },
          signal: AbortSignal.timeout(8000),
        });
        return res.ok;
      } catch {
        return false;
      }
    }, MODOT_MANIFEST)
    .catch(() => false);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Open app...');
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.leaflet-container', { timeout: 60000 });
  await page.waitForFunction(
    () => !document.querySelector('.map-loading') && document.querySelectorAll('.leaflet-tile-loaded').length > 0,
    { timeout: 60000 }
  );
  await page.waitForTimeout(3000);

  const mapBox = await page.locator('.leaflet-container').first().boundingBox();
  if (!mapBox) throw new Error('Map container not visible');

  const clickX = mapBox.x + mapBox.width * 0.52;
  const clickY = mapBox.y + mapBox.height * 0.48;
  console.log(`Click map at ${Math.round(clickX)},${Math.round(clickY)}...`);
  await page.mouse.click(clickX, clickY);

  console.log('Wait for storm briefing...');
  await page.waitForSelector('.storm-analysis-popup', { timeout: 25000 });
  await page.waitForSelector('.storm-analysis-cam', { timeout: 15000 });

  const camLabels = await page.locator('.storm-analysis-cam-label').allTextContents();
  console.log('Cameras:', camLabels.filter(Boolean).join(' | '));
  if (camLabels.filter(Boolean).length < 3) {
    throw new Error(`Expected 3 camera labels, got ${camLabels.filter(Boolean).length}`);
  }

  await page.waitForSelector('.storm-analysis-cam video', { timeout: 10000 });
  const videoCount = await page.locator('.storm-analysis-cam video').count();
  if (videoCount < 3) {
    throw new Error(`Expected 3 video elements, got ${videoCount}`);
  }
  console.log(`OK ${videoCount} video players mounted`);

  const modotUp = await modotReachable(page);
  console.log(`MoDOT CDN reachable from browser: ${modotUp}`);

  if (modotUp) {
    console.log('Wait for live video (up to 25s)...');
    const played = await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('.storm-analysis-cam video')].some(
            (v) =>
              v.classList.contains('is-playing') ||
              (!v.classList.contains('is-loading') && v.readyState >= 2 && v.videoWidth > 0)
          ),
        { timeout: 25000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!played) throw new Error('MoDOT reachable but no storm video started playing');
    console.log('PASS: storm camera video playing.');
  } else {
    const unavailable = await page.locator('.storm-analysis-cam .camera-preview-unavailable').count();
    if (unavailable > 0) {
      throw new Error('Storm UI collapsed to unavailable while MoDOT CDN is down (expected loading state)');
    }
    console.log('PASS: structural checks (MoDOT CDN down here — videos stay in loading state, no collapse).');
  }

  await browser.close();
}

main().catch((err) => {
  console.error('BROWSER SMOKE FAILED:', err.message);
  process.exit(1);
});
