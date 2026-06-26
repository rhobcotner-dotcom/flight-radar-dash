#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const outPath = process.argv[2];

if (!outPath) {
  console.error('Usage: node scripts/export-code-condensed.mjs <output-path>');
  process.exit(1);
}

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.cursor',
  'coverage',
  '.netlify',
]);

const SKIP_FILES = new Set([
  'package-lock.json',
  'flight-radar-dash-full-export.txt',
]);

const TEXT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.css',
  '.html',
  '.sql',
  '.toml',
  '.yml',
  '.yaml',
  '.env.example',
  '.gitignore',
  '.gitattributes',
  '.nvmrc',
  '.editorconfig',
]);

const SECRET_PATTERNS = [
  /(FR24_API_TOKEN\s*=\s*).+/gi,
  /(METRO_API_KEY\s*=\s*).+/gi,
  /(EBIRD_API_KEY\s*=\s*).+/gi,
  /(APRS_FI_API_KEY\s*=\s*).+/gi,
  /(NASA_FIRMS_MAP_KEY\s*=\s*).+/gi,
  /(WINDY_API_KEY\s*=\s*).+/gi,
  /(OPENAI_API_KEY\s*=\s*).+/gi,
  /(process\.env\.[A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*['"])[^'"]+(['"])/gi,
  /(["']?(?:api[_-]?key|apikey|secret|token|password)["']?\s*[:=]\s*["'])[^"']+(["'])/gi,
  /(Bearer\s+)[A-Za-z0-9._-]{12,}/gi,
  /(sk-[A-Za-z0-9]{16,})/g,
];

function shouldInclude(relPath, stat) {
  const base = path.basename(relPath);
  if (base.startsWith('.env') && base !== '.env.example') return false;
  if (SKIP_FILES.has(base)) return false;
  if (!stat.isFile()) return false;
  const ext = path.extname(base).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (base === '.env.example' || base.startsWith('Dockerfile')) return true;
  return false;
}

function redact(content) {
  let next = content;
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, (_, prefix, suffix = '') => `${prefix}[REDACTED]${suffix}`);
  }
  return next;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(repoRoot, full);
    if (entry.isDirectory()) {
      walk(full, files);
      continue;
    }
    const stat = fs.statSync(full);
    if (shouldInclude(rel, stat)) files.push(rel);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

const files = walk(repoRoot);
const chunks = [
  'HOMESCOPE / flight-radar-dash — condensed source export',
  `Generated: ${new Date().toISOString()}`,
  `Root: ${repoRoot}`,
  `Files: ${files.length}`,
  'Secrets redacted. .env and lockfiles excluded.',
  '='.repeat(80),
  '',
];

for (const rel of files) {
  const full = path.join(repoRoot, rel);
  let content;
  try {
    content = fs.readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  chunks.push(`===== FILE: ${rel} =====`);
  chunks.push(redact(content));
  if (!content.endsWith('\n')) chunks.push('');
  chunks.push('');
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, chunks.join('\n'), 'utf8');
console.log(`Wrote ${files.length} files to ${outPath}`);
