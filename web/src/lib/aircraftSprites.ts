import { resolveAircraftTypeCandidates } from '../../../lib/aircraftTypeFallback.js';

const SHEET = {
  width: 576,
  height: 2448,
  cell: 72,
  cols: 8,
  url: '/aircraft-spritesheet.png',
};

type SpritePosition = { x: number; y: number };

let spriteMapPromise: Promise<Map<string, SpritePosition>> | null = null;

async function loadSpriteMap() {
  const res = await fetch('/aircraft-spritesheet.json');
  if (!res.ok) throw new Error('Unable to load aircraft spritesheet metadata');
  const data = await res.json();

  const map = new Map<string, SpritePosition>();
  for (const [code, spriteKey] of Object.entries<string>(data.airframeToSprite || {})) {
    const sprite = data.sprites?.[spriteKey];
    const frame = sprite?.ids?.[0];
    if (frame === undefined) continue;
    map.set(code.toUpperCase(), {
      x: (frame % SHEET.cols) * SHEET.cell,
      y: Math.floor(frame / SHEET.cols) * SHEET.cell,
    });
  }
  return map;
}

export function getAircraftSpriteMap() {
  if (!spriteMapPromise) {
    spriteMapPromise = loadSpriteMap().catch((err) => {
      spriteMapPromise = null;
      throw err;
    });
  }
  return spriteMapPromise;
}

export function aircraftSpriteSheet() {
  return SHEET;
}

export async function aircraftTypeSpritePosition(type?: string) {
  if (!type) return null;
  const map = await getAircraftSpriteMap();
  for (const candidate of resolveAircraftTypeCandidates(type)) {
    const hit = map.get(candidate);
    if (hit) return hit;
  }
  return map.get('B738') || null;
}
