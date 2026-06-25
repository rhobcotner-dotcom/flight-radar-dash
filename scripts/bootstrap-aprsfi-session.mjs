#!/usr/bin/env node
/**
 * Bootstrap an aprs.fi browser session (winid + cookies) for the public xml2 map feed.
 * This avoids needing APRS_FI_API_KEY for radius queries.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const SESSION_PATH = path.join(ROOT, 'data', 'aprsfi.session.json');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  await page.goto('https://aprs.fi/#!lat=38.63&lng=-90.2&range=160', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });

  await page.waitForTimeout(8000);

  await page.waitForFunction(() => typeof window.winid === 'string' && window.winid.length > 0, {
    timeout: 120000,
  });

  const winid = await page.evaluate(() => window.winid);
  const cookies = await context.cookies('https://aprs.fi');

  await fs.mkdir(path.dirname(SESSION_PATH), { recursive: true });
  await fs.writeFile(
    SESSION_PATH,
    `${JSON.stringify({ winid, cookies, savedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );

  const probe = await page.evaluate(async (id) => {
    const box = '38.04984,-91.31218,39.20848,-89.08745';
    const rid = 'bootstrap-probe';
    const url = `https://aprs.fi/xml2?n=&box=${box}&rid=${rid}&v=2&winid=${id}&timerange=3600&tail=3600&lastupd=0&oth=1`;
    const text = await fetch(url).then((r) => r.text());
    return { points: (text.match(/pnt\(/g) || []).length, stopped: /stopped\s*=\s*1/.test(text) };
  }, winid);

  await browser.close();

  console.log(`Saved aprs.fi session → ${SESSION_PATH}`);
  console.log(`  winid: ${winid}`);
  console.log(`  cookies: ${cookies.length}`);
  console.log(`  probe: ${probe.points} stations${probe.stopped ? ' (stopped!)' : ''}`);

  if (probe.stopped || probe.points < 1) {
    console.error('Session bootstrap may have failed — xml2 returned no data.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
