#!/usr/bin/env node
/**
 * Provision every train/rail API key that can be obtained without human email verification.
 * Writes discovered keys into .env (preserving existing values).
 *
 * Usage: node scripts/provision-keys.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveHighballApiKey } from '../api/lib/highballKey.js';

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
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }
  const block = comment ? `\n# ${comment}\n${line}\n` : `\n${line}\n`;
  return `${content.trimEnd()}${block}`;
}

function hasEnvValue(content, key) {
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return Boolean(match?.[1]?.trim());
}

async function provisionHighball(env) {
  if (hasEnvValue(env, 'HIGHBALL_API_KEY')) {
    return { env, key: null, status: 'already set in .env' };
  }
  const key = await resolveHighballApiKey();
  if (!key) return { env, key: null, status: 'failed to create' };
  return {
    env: upsertEnvValue(
      env,
      'HIGHBALL_API_KEY',
      key,
      'Auto-provisioned by scripts/provision-keys.mjs (Highball passenger; freight when available)'
    ),
    key,
    status: 'provisioned',
  };
}

async function main() {
  let env = await readEnvFile();
  const results = [];

  const highball = await provisionHighball(env);
  env = highball.env;
  results.push({ service: 'Highball', status: highball.status, configured: Boolean(highball.key || hasEnvValue(env, 'HIGHBALL_API_KEY')) });

  await fs.writeFile(ENV_PATH, env.endsWith('\n') ? env : `${env}\n`, 'utf8');

  console.log('Provisioned API keys → .env\n');
  for (const row of results) {
    console.log(`  ${row.service}: ${row.status}${row.configured ? ' ✓' : ''}`);
  }

  console.log('\nManual (email verification required — cannot automate fully):');
  console.log('  APRS_FI_API_KEY  → https://aprs.fi (Login → My account → API key)');
  console.log('  METRO_API_KEY    → https://metrolinktrains.com/about/gtfs/gtfs-rt-access/');
  console.log('  METRA_API_TOKEN  → https://metra.com/developers');
  console.log('  API_511_KEY      → https://511.org/open-data/token');
  console.log('  RAILSTATE_API_TOKEN → paid: https://railstate.com');
  console.log('  APRS_CALLSIGN    → licensed ham callsign for direct APRS-IS freight');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
