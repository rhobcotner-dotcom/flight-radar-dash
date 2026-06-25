import fs from 'node:fs/promises';
import path from 'node:path';

const USER_AGENT = 'flight-radar-dash/1.0 (personal home dashboard)';
const KEY_URL = 'https://api.highballplatform.com/v1/keys';
const KEY_PATH = path.join(process.cwd(), 'data', 'highball.key');

let cachedKey = null;

async function readStoredKey() {
  try {
    const key = String(await fs.readFile(KEY_PATH, 'utf8')).trim();
    return key || null;
  } catch {
    return null;
  }
}

async function writeStoredKey(key) {
  await fs.mkdir(path.dirname(KEY_PATH), { recursive: true });
  await fs.writeFile(KEY_PATH, `${key}\n`, 'utf8');
}

async function createHighballKey() {
  const res = await fetch(KEY_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      name: 'flight-radar-dash',
      email: 'freight@localhost',
    }),
  });

  if (!res.ok) {
    throw new Error(`Highball key request failed (${res.status})`);
  }

  const body = await res.json();
  const key = String(body?.key || '').trim();
  if (!key) throw new Error('Highball key missing from response');
  return key;
}

export async function resolveHighballApiKey() {
  const fromEnv = String(process.env.HIGHBALL_API_KEY || '').trim();
  if (fromEnv) return fromEnv;

  if (cachedKey) return cachedKey;

  const stored = await readStoredKey();
  if (stored) {
    cachedKey = stored;
    return stored;
  }

  if (String(process.env.HIGHBALL_AUTO_KEY || 'true').toLowerCase() === 'false') {
    return '';
  }

  try {
    const key = await createHighballKey();
    await writeStoredKey(key);
    cachedKey = key;
    return key;
  } catch {
    return '';
  }
}
