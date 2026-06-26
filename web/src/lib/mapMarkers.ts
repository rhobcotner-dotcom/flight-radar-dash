import L from 'leaflet';
import type { Flight, Satellite, Train } from '../types';
import { airlineIcao, airlineNameFromIcao } from './airlineNames';
import { aircraftSpriteSheet, getAircraftSpriteMap } from './aircraftSprites';
import { resolveAircraftTypeCandidates } from '../../../lib/aircraftTypeFallback.js';
import { aircraftIconScale } from './aircraftIconScale';
import { formatSpeedMph } from './flightUtils';

const MAP_PLANE_SIZE = 38;
const MAP_PLANE_ACTIVE = 48;
const MAP_TRAIN_SIZE = 16;
const MAP_TRAIN_ACTIVE = 20;
const MAP_SATELLITE_SIZE = 24;
const MAP_SATELLITE_ACTIVE = 30;

type SpritePosition = { x: number; y: number };

const COMPASS_DEGREES: Record<string, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};

let spriteMapPromise: Promise<Map<string, SpritePosition>> | null = null;

export function preloadMapMarkerSprites() {
  if (!spriteMapPromise) {
    spriteMapPromise = getAircraftSpriteMap();
  }
  return spriteMapPromise;
}

async function resolveSpritePosition(type?: string | null): Promise<SpritePosition | null> {
  const map = await preloadMapMarkerSprites();
  for (const candidate of resolveAircraftTypeCandidates(type || '')) {
    const hit = map.get(candidate);
    if (hit) return hit;
  }
  return map.get('B738') || null;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mapFlightCarrierLabel(flight: Flight) {
  if (flight.carrierName) return flight.carrierName;
  const icao = airlineIcao(flight);
  if (!icao) return null;
  return airlineNameFromIcao(icao);
}

function shellClasses(
  highlighted: boolean,
  military: boolean,
  emergency = false,
  heloKind: string | null = null
) {
  let tone = 'map-aircraft-civil';
  if (emergency) tone = 'map-aircraft-emergency';
  else if (military) tone = 'map-aircraft-military';
  else if (heloKind) tone = `map-aircraft-helo map-aircraft-helo-${heloKind}`;

  return ['map-aircraft-shell', tone, highlighted ? 'map-aircraft-active' : ''].filter(Boolean).join(' ');
}

function markerLabelClass(military: boolean, emergency: boolean, heloKind: string | null = null) {
  if (emergency) return 'map-marker-label-emergency';
  if (military) return 'map-marker-label-military';
  if (heloKind) return `map-marker-label-helo map-marker-label-helo-${heloKind}`;
  return 'map-marker-label-civil';
}

function spriteMaskStyle(position: SpritePosition, sheet: ReturnType<typeof aircraftSpriteSheet>, scale: string) {
  return [
    `-webkit-mask-image:url(${sheet.url})`,
    `mask-image:url(${sheet.url})`,
    `-webkit-mask-position:-${position.x}px -${position.y}px`,
    `mask-position:-${position.x}px -${position.y}px`,
    `-webkit-mask-size:${sheet.width}px ${sheet.height}px`,
    `mask-size:${sheet.width}px ${sheet.height}px`,
    `width:${sheet.cell}px`,
    `height:${sheet.cell}px`,
    `transform:scale(${scale})`,
  ].join(';');
}

function planeFallbackSvg() {
  return `
    <svg viewBox="0 0 32 32" class="map-aircraft-fallback" aria-hidden="true">
      <path d="M16 4 L14 12 L6 14 L4 16 L6 18 L14 20 L14 24 L10 26 L16 28 L22 26 L18 24 L18 20 L26 18 L28 16 L26 14 L18 12 Z" fill="currentColor"/>
    </svg>
  `;
}

function trainSvg() {
  return `
    <svg viewBox="0 0 16 32" class="map-train-svg" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0.5 4.8 4.8 4.2 6.2v19.6l.7 2.1 1.6 2.6h6l1.6-2.6.7-2.1V6.2L11.2 4.8 8 0.5z"
      />
      <path fill="rgba(15,23,42,0.32)" d="M5.4 7.8h5.2v3.4H5.4z" />
      <path stroke="rgba(15,23,42,0.28)" stroke-width="0.65" d="M5.1 13.2h5.8M5.1 17.4h5.8M5.1 21.6h5.8M5.1 25.8h5.8" />
    </svg>
  `;
}

function satelliteSvg() {
  return `
    <svg viewBox="0 0 24 24" class="map-satellite-svg" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.5 9.2 8.5H4.5l4.2 3.1-1.6 6.9L12 15.8l4.9 2.7-1.6-6.9 4.2-3.1h-4.7L12 2.5z"
      />
      <rect x="10.5" y="16.5" width="3" height="5.5" rx="1" fill="currentColor" />
    </svg>
  `;
}

function coloredSpriteHtml(
  position: SpritePosition,
  sheet: ReturnType<typeof aircraftSpriteSheet>,
  scale: string,
  highlighted: boolean,
  military: boolean,
  emergency = false,
  heloKind: string | null = null
) {
  return `<div class="${shellClasses(highlighted, military, emergency, heloKind)}"><div class="map-aircraft-mask" style="${spriteMaskStyle(position, sheet, scale)}"></div></div>`;
}

function buildRotatedMarkerIcon(options: {
  html: string;
  size: number;
  rotation: number;
  className: string;
  bottomLabel?: string | null;
  bottomLabelClass?: string;
}) {
  const { html, size, rotation, className, bottomLabel, bottomLabelClass = '' } = options;
  const labelHtml = bottomLabel
    ? `<div class="map-marker-label ${bottomLabelClass}">${escapeHtml(bottomLabel)}</div>`
    : '';
  const labelHeight = bottomLabel ? 18 : 0;
  const totalHeight = size + labelHeight;

  return L.divIcon({
    className,
    html: `
      <div class="map-marker-stack" style="width:${size}px;">
        <div class="map-rotating-marker" style="width:${size}px;height:${size}px;transform:rotate(${rotation}deg);">
          ${html}
        </div>
        ${labelHtml}
      </div>
    `,
    iconSize: [size, totalHeight],
    iconAnchor: [size / 2, size / 2],
  });
}

export async function buildFlightMapIcon(
  flight: Flight,
  highlighted: boolean,
  military: boolean,
  emergency = false,
  heloKind: string | null = null
): Promise<L.DivIcon> {
  const typeScale = aircraftIconScale(flight.type);
  const size = (highlighted ? MAP_PLANE_ACTIVE : MAP_PLANE_SIZE) * typeScale;
  const track = Number.isFinite(flight.track) ? Number(flight.track) : 0;
  const sheet = aircraftSpriteSheet();
  const position = await resolveSpritePosition(flight.type);
  const scale = (size / sheet.cell).toFixed(3);

  const inner = position
    ? coloredSpriteHtml(position, sheet, scale, highlighted, military, emergency, heloKind)
    : `<div class="${shellClasses(highlighted, military, emergency, heloKind)}">${planeFallbackSvg()}</div>`;

  return buildRotatedMarkerIcon({
    html: inner,
    size,
    rotation: track,
    className: 'map-aircraft-marker',
    bottomLabel: mapFlightCarrierLabel(flight),
    bottomLabelClass: markerLabelClass(military, emergency, heloKind),
  });
}

function trainMarkerBodyClass(train: Train, highlighted: boolean) {
  const base =
    train.trainKind === 'freight'
      ? 'map-train-body-freight'
      : train.trainKind === 'crossing'
        ? 'map-train-body-crossing'
        : train.trainKind === 'yard'
          ? 'map-train-body-yard'
          : train.trainKind === 'corridor'
            ? 'map-train-body-corridor'
            : 'map-train-body';
  return highlighted ? `${base} map-train-active` : base;
}

export function buildTrainMapIcon(train: Train, highlighted: boolean): L.DivIcon {
  const size = highlighted ? MAP_TRAIN_ACTIVE : MAP_TRAIN_SIZE;
  const rotation = COMPASS_DEGREES[String(train.heading || '').toUpperCase()] ?? 90;
  const classes = trainMarkerBodyClass(train, highlighted);
  const inner =
    train.trainKind === 'crossing'
      ? '<div class="map-train-crossing-glyph">✕</div>'
      : train.trainKind === 'yard'
        ? '<div class="map-train-yard-glyph">Y</div>'
        : train.trainKind === 'corridor'
          ? '<div class="map-train-corridor-glyph">≡</div>'
          : trainSvg();

  return buildRotatedMarkerIcon({
    html: `<div class="${classes}">${inner}</div>`,
    size,
    rotation: train.trainKind === 'crossing' ? 0 : rotation,
    className: 'map-train-marker',
  });
}

export function buildSatelliteMapIcon(satellite: Satellite, highlighted: boolean): L.DivIcon {
  const size = highlighted ? MAP_SATELLITE_ACTIVE : MAP_SATELLITE_SIZE;
  const classes = highlighted ? 'map-satellite-body map-satellite-active' : 'map-satellite-body';

  return buildRotatedMarkerIcon({
    html: `<div class="${classes}">${satelliteSvg()}</div>`,
    size,
    rotation: 0,
    className: 'map-satellite-marker',
  });
}

export function buildFlightMapIconPlaceholder(
  flight: Flight,
  highlighted: boolean,
  military: boolean,
  emergency = false,
  heloKind: string | null = null
): L.DivIcon {
  const typeScale = aircraftIconScale(flight.type);
  const size = (highlighted ? MAP_PLANE_ACTIVE : MAP_PLANE_SIZE) * typeScale;
  const track = Number.isFinite(flight.track) ? Number(flight.track) : 0;

  return buildRotatedMarkerIcon({
    html: `<div class="${shellClasses(highlighted, military, emergency, heloKind)}">${planeFallbackSvg()}</div>`,
    size,
    rotation: track,
    className: 'map-aircraft-marker',
    bottomLabel: mapFlightCarrierLabel(flight),
    bottomLabelClass: markerLabelClass(military, emergency, heloKind),
  });
}
