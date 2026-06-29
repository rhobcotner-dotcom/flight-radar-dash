#!/usr/bin/env node
/**
 * Provision GTFS-RT transit API keys into .env using headed Playwright + Mailinator.
 * Email: flightradardash@mailinator.com (public inbox)
 *
 * Agencies with bot protection (511 antibot, WMATA captcha, CTA Cloudflare) need headed
 * Chromium. Run locally: node scripts/provision-all-transit-keys.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const EMAIL = process.env.PROVISION_EMAIL || 'flightradardash@mailinator.com';
const INBOX = EMAIL.split('@')[0];
const PASSWORD = 'FlightRd2026!9Aa';
const ANTIBOT_WAIT_MS = 12000;

async function readEnvFile() {
  try {
    return await fs.readFile(ENV_PATH, 'utf8');
  } catch {
    return '';
  }
}

function upsertEnvValue(content, key, value, comment) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, line);
  const block = comment ? `\n# ${comment}\n${line}\n` : `\n${line}\n`;
  return `${content.trimEnd()}${block}`;
}

function hasEnvValue(content, key) {
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return Boolean(match?.[1]?.trim());
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchInboxMessages() {
  const res = await fetch(`https://mailinator.com/api/v2/domains/public/inboxes/${INBOX}?limit=30`);
  if (!res.ok) return [];
  const body = await res.json();
  return body.msgs || [];
}

async function fetchMessageBody(messageId) {
  const res = await fetch(`https://mailinator.com/api/v2/domains/public/messages/${messageId}`);
  if (!res.ok) return '';
  const body = await res.json();
  return `${body.subject || ''}\n${(body.parts || []).map((p) => p.body || '').join('\n')}`;
}

async function waitForEmail(matcher, { timeoutMs = 120000, intervalMs = 4000 } = {}) {
  const seen = new Set();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msgs = await fetchInboxMessages();
    for (const msg of msgs) {
      if (seen.has(msg.id)) continue;
      seen.add(msg.id);
      const text = await fetchMessageBody(msg.id);
      const full = { subject: msg.subject, from: msg.from };
      if (matcher(text, full)) return { text, msg, full };
    }
    await sleep(intervalMs);
  }
  return null;
}

function extractUuid(text) {
  return text.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)?.[1] || null;
}

function extractHex32(text) {
  return text.match(/\b([a-f0-9]{32})\b/i)?.[1] || null;
}

async function provision511(env, browser) {
  if (hasEnvValue(env, 'API_511_KEY')) return { env, status: 'already set' };

  const page = await browser.newPage();
  try {
    await page.goto('https://511.org/open-data/token', { waitUntil: 'networkidle', timeout: 90000 });
    await page.waitForSelector('#edit-first-name', { state: 'visible' });
    await page.fill('#edit-first-name', 'Robert');
    await page.fill('#edit-last-name', 'Sorrell');
    await page.fill('#edit-email', EMAIL);
    await page.locator('label[for="edit-terms"]').click();
    await sleep(ANTIBOT_WAIT_MS);
    await page.getByRole('button', { name: /^submit$/i }).click();
    await sleep(5000);

    const verifyMail = await waitForEmail(
      (t, f) => /511/i.test(f.from || '') && /token request|verify/i.test(t),
      { timeoutMs: 90000 },
    );
    if (verifyMail) {
      const link = verifyMail.text.match(/https:\/\/511\.org\/request-verify[^\s"'<>]+/)?.[0];
      if (link) {
        await page.goto(link, { waitUntil: 'networkidle' });
        await sleep(5000);
      }
    }

    const tokenMail = await waitForEmail(
      (t, f) => /511/i.test(f.from || '') && /welcome|your token/i.test(t),
      { timeoutMs: 90000 },
    );
    const key = tokenMail ? extractUuid(tokenMail.text) : null;
    await page.close();
    if (!key) return { env, status: '511 submitted — check Mailinator for token email' };
    return {
      env: upsertEnvValue(env, 'API_511_KEY', key, '511.org Bay Area GTFS-RT'),
      status: 'provisioned',
    };
  } catch (err) {
    await page.close();
    return { env, status: `511 failed: ${err.message}` };
  }
}

async function provisionWmata(env, browser) {
  if (hasEnvValue(env, 'WMATA_API_KEY')) return { env, status: 'already set' };

  const page = await browser.newPage();
  try {
    await page.goto('https://developer.wmata.com/signup', { waitUntil: 'networkidle', timeout: 90000 });
    await sleep(3000);
    await page.locator('input[type="email"]').first().fill(EMAIL);
    const pwds = page.locator('input[type="password"]');
    for (let i = 0; i < (await pwds.count()); i += 1) await pwds.nth(i).fill(PASSWORD);
    await page.locator('label').filter({ hasText: /license|terms|agree/i }).first().click().catch(() => {});
    await page.getByRole('button', { name: /sign up|register|create/i }).first().click();
    await sleep(10000);

    const mail = await waitForEmail((t) => /wmata|confirm|verify/i.test(t), { timeoutMs: 90000 });
    if (mail) {
      const link = mail.text.match(/https:\/\/developer\.wmata\.com[^\s"'<>]+/)?.[0];
      if (link) {
        await page.goto(link, { waitUntil: 'networkidle' });
        await sleep(5000);
      }
    }

    await page.goto('https://developer.wmata.com/signin', { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).first().click();
    await sleep(8000);
    await page.goto('https://developer.wmata.com/products', { waitUntil: 'networkidle' });
    await sleep(5000);
    const key = extractHex32(await page.innerText('body'));
    await page.close();
    if (!key) return { env, status: 'WMATA account created — copy primary key from developer portal profile' };
    return {
      env: upsertEnvValue(env, 'WMATA_API_KEY', key, 'WMATA Metro rail GTFS-RT'),
      status: 'provisioned',
    };
  } catch (err) {
    await page.close();
    return { env, status: `WMATA failed: ${err.message}` };
  }
}

async function provisionMetra(env, browser) {
  if (hasEnvValue(env, 'METRA_API_TOKEN')) return { env, status: 'already set' };

  const page = await browser.newPage();
  try {
    await page.goto('https://metra.com/developers', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await sleep(4000);
    await page.locator('#edit-first-name').fill('Robert');
    await page.locator('#edit-last-name').fill('Sorrell');
    const emails = page.locator('input[type="email"]');
    await emails.nth(0).fill(EMAIL);
    if ((await emails.count()) >= 2) await emails.nth(1).fill(EMAIL);
    await page.locator('textarea').first().fill('Personal transit map dashboard for HomeScope');
    await page.locator('label[for="edit-license-agreement"]').click();
    await page
      .locator('form.webform-submission-form button[type="submit"], #webform-submission-gtfs-realtime-api-key-request-form button[type="submit"]')
      .first()
      .click({ force: true });
    await sleep(5000);

    const mail = await waitForEmail(
      (t, f) => /metra|metrarr/i.test(f.from || '') && /token|api_token|gtfs/i.test(t),
      { timeoutMs: 60000 },
    );
    const key = mail?.text.match(/(?:api_token|token)[:\s]+([A-Za-z0-9._-]{16,})/i)?.[1] || null;
    await page.close();
    if (!key) return { env, status: 'Metra form submitted — token emailed (often next business day)' };
    return {
      env: upsertEnvValue(env, 'METRA_API_TOKEN', key, 'Metra Chicago commuter GTFS-RT'),
      status: 'provisioned',
    };
  } catch (err) {
    await page.close();
    return { env, status: `Metra failed: ${err.message}` };
  }
}

async function main() {
  let env = await readEnvFile();
  const browser = await chromium.launch({ headless: false, slowMo: 40 });
  const results = [];

  for (const [name, fn] of [
    ['511.org', provision511],
    ['WMATA', provisionWmata],
    ['Metra', provisionMetra],
  ]) {
    console.log(`Provisioning ${name}...`);
    const out = await fn(env, browser);
    env = out.env;
    results.push({ name, status: out.status });
    console.log(`  → ${out.status}`);
  }

  await browser.close();
  await fs.writeFile(ENV_PATH, env.endsWith('\n') ? env : `${env}\n`, 'utf8');
  console.log('\nWrote .env');
  console.log('\nManual (blocked by Cloudflare / no self-service signup):');
  console.log('  MTA_API_KEY  → api.mta.info (LIRR/MNR still need x-api-key; contact MTA developer resources)');
  console.log('  CTA_API_KEY  → transitchicago.com/developers/traintrackerapply/ (apply from a normal browser)');

  console.log('\nVerification:');
  process.env.API_511_KEY = (env.match(/^API_511_KEY=(.+)$/m)?.[1] || '').trim();
  process.env.WMATA_API_KEY = (env.match(/^WMATA_API_KEY=(.+)$/m)?.[1] || '').trim();
  process.env.METRA_API_TOKEN = (env.match(/^METRA_API_TOKEN=(.+)$/m)?.[1] || '').trim();
  const { fetchAllRegionalRailTrains } = await import('../api/lib/gtfsRtRail.js');
  const verify = await fetchAllRegionalRailTrains();
  console.log(JSON.stringify(verify.sourceCounts, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
