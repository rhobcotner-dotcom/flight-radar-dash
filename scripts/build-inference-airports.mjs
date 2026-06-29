#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '../lib/data/inferenceAirports.json');
const SOURCE_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const ALLOWED_TYPES = new Set(['large_airport', 'medium_airport']);

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`Failed to fetch ${SOURCE_URL}: ${res.status}`);
const lines = (await res.text()).trim().split('\n');
const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, ''));
const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
const airports = [];

for (const line of lines.slice(1)) {
  const cols = parseCsvLine(line);
  if (cols[idx.iso_country] !== 'US') continue;
  if (!ALLOWED_TYPES.has(cols[idx.type])) continue;
  const lat = Number(cols[idx.latitude_deg]);
  const lon = Number(cols[idx.longitude_deg]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  const iata = cols[idx.iata_code]?.trim();
  const icao = cols[idx.gps_code]?.trim() || cols[idx.ident]?.trim();
  if (!iata && !icao) continue;
  airports.push({
    icao: icao || undefined,
    iata: iata || undefined,
    city: cols[idx.municipality]?.trim() || cols[idx.name]?.trim() || undefined,
    lat,
    lon,
  });
}

airports.sort((a, b) => String(a.iata || a.icao).localeCompare(String(b.iata || b.icao)));
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(airports)}\n`);
console.log(`Wrote ${airports.length} airports to ${outPath}`);
