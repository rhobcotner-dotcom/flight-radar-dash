#!/usr/bin/env node
/**
 * Attempt to provision free GTFS-RT API keys into .env via public signup flows.
 * Uses PLAYWRIGHT_EMAIL (or prompts via env) for registrations that require email.
 *
 * Usage:
 *   PLAYWRIGHT_EMAIL=you@example.com node scripts/provision-transit-keys.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

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

async function provision511(email, env) {
  if (hasEnvValue(env, 'API_511_KEY')) return { env, status: 'already set' };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('https://511.org/open-data/token', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('input[name*="First" i], #FirstName, input[placeholder*="First" i]', 'HomeScope');
    await page.fill('input[name*="Last" i], #LastName, input[placeholder*="Last" i]', 'Dashboard');
    const emailInput = page.locator('input[type="email"]').first();
    await emailInput.fill(email);
    const terms = page.locator('input[type="checkbox"]').first();
    if (await terms.count()) await terms.check();
    await page.getByRole('button', { name: /submit/i }).click();
    await page.waitForTimeout(5000);
    const body = await page.content();
    const tokenMatch = body.match(/api[_-]?key["'>:=\s]+([a-f0-9-]{20,})/i);
    await browser.close();
    if (tokenMatch) {
      return {
        env: upsertEnvValue(env, 'API_511_KEY', tokenMatch[1], '511.org open data — auto-provisioned'),
        status: 'provisioned',
      };
    }
    return { env, status: 'submitted — check email for 511 token and paste into API_511_KEY' };
  } catch (err) {
    await browser.close();
    return { env, status: `511 failed: ${err.message}` };
  }
}

async function provisionWmata(email, env) {
  if (hasEnvValue(env, 'WMATA_API_KEY')) return { env, status: 'already set' };
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('https://developer.wmata.com/signup', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    const emailField = page.locator('input[type="email"]').first();
    if (await emailField.count()) {
      await emailField.fill(email);
      const password = `Hs${Math.random().toString(36).slice(2)}!9Aa`;
      const pwdFields = page.locator('input[type="password"]');
      if ((await pwdFields.count()) >= 2) {
        await pwdFields.nth(0).fill(password);
        await pwdFields.nth(1).fill(password);
      }
      const submit = page.getByRole('button', { name: /sign up|register|create/i }).first();
      if (await submit.count()) await submit.click();
      await page.waitForTimeout(8000);
    }
    await browser.close();
    return { env, status: 'WMATA signup attempted — retrieve primary subscription key from developer.wmata.com profile' };
  } catch (err) {
    await browser.close();
    return { env, status: `WMATA failed: ${err.message}` };
  }
}

async function main() {
  const email = process.env.PLAYWRIGHT_EMAIL?.trim();
  if (!email) {
    console.error('Set PLAYWRIGHT_EMAIL to run automated signup flows.');
    console.error('Example: PLAYWRIGHT_EMAIL=you@example.com node scripts/provision-transit-keys.mjs');
    process.exit(1);
  }

  let env = await readEnvFile();
  const results = [];

  const wmata = await provisionWmata(email, env);
  env = wmata.env;
  results.push({ service: 'WMATA', status: wmata.status });

  const five11 = await provision511(email, env);
  env = five11.env;
  results.push({ service: '511.org', status: five11.status });

  await fs.writeFile(ENV_PATH, env.endsWith('\n') ? env : `${env}\n`, 'utf8');

  console.log('Transit key provisioning results:\n');
  for (const row of results) console.log(`  ${row.service}: ${row.status}`);
  console.log('\nManual (email approval):');
  console.log('  METRA_API_TOKEN → https://metra.com/developers');
  console.log('  MTA_API_KEY     → https://api.mta.info');
  console.log('  CTA_API_KEY     → https://www.transitchicago.com/developers/bustracker/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
