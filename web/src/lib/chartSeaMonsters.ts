/** Open-ocean placements for treasure-chart sea monster doodles. */
export type ChartSeaMonsterVariant = 'serpent-ship' | 'kraken' | 'whale' | 'hybrid';

export interface ChartSeaMonsterSpec {
  id: string;
  lat: number;
  lon: number;
  variant: ChartSeaMonsterVariant;
  rotation?: number;
  scale?: number;
  caption?: string;
}

export const CHART_SEA_MONSTERS: ChartSeaMonsterSpec[] = [
  { id: 'sargasso', lat: 32, lon: -58, variant: 'serpent-ship', rotation: -12, scale: 1.08, caption: 'Here be dragons' },
  { id: 'mid-atlantic', lat: 42, lon: -42, variant: 'kraken', rotation: 8, scale: 1 },
  { id: 'bermuda-triangle', lat: 26, lon: -66, variant: 'whale', rotation: 4, scale: 0.92 },
  { id: 'gulf', lat: 24, lon: -88, variant: 'hybrid', rotation: -8, scale: 0.94 },
  { id: 'caribbean', lat: 14, lon: -72, variant: 'serpent-ship', rotation: 18, scale: 0.88 },
  { id: 'tropical-atlantic', lat: 8, lon: -38, variant: 'kraken', rotation: -10, scale: 0.96 },
  { id: 'south-atlantic', lat: -28, lon: -18, variant: 'whale', rotation: 6, scale: 1.02 },
  { id: 'north-pacific', lat: 38, lon: -152, variant: 'serpent-ship', rotation: -6, scale: 1.04 },
  { id: 'pacific-hawaii', lat: 19, lon: -158, variant: 'kraken', rotation: 14, scale: 0.9 },
  { id: 'south-pacific', lat: -22, lon: -148, variant: 'hybrid', rotation: -5, scale: 0.92 },
  { id: 'equatorial-pacific', lat: 2, lon: -138, variant: 'whale', rotation: 2, scale: 0.9 },
  { id: 'north-sea', lat: 56, lon: 2, variant: 'kraken', rotation: -16, scale: 0.86 },
  { id: 'mediterranean', lat: 36, lon: 20, variant: 'hybrid', rotation: 10, scale: 0.82 },
  { id: 'indian-ocean', lat: -18, lon: 78, variant: 'serpent-ship', rotation: -8, scale: 0.98 },
  { id: 'arabian-sea', lat: 12, lon: 62, variant: 'whale', rotation: 12, scale: 0.84 },
  { id: 'south-indian', lat: -38, lon: 92, variant: 'kraken', rotation: 5, scale: 0.9 },
  { id: 'tasman', lat: -42, lon: 158, variant: 'serpent-ship', rotation: -12, scale: 0.88 },
  { id: 'bering', lat: 54, lon: -172, variant: 'whale', rotation: 7, scale: 0.86 },
  { id: 'labrador-sea', lat: 58, lon: -48, variant: 'hybrid', rotation: -3, scale: 0.8 },
  { id: 'off-virginia', lat: 36, lon: -72, variant: 'serpent-ship', rotation: 10, scale: 0.78, caption: 'Beware' },
];

function woodcutDefs(id: string) {
  const safe = id.replace(/[^a-z0-9-]/gi, '');
  return `<defs>
    <pattern id="hatch-${safe}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <line x1="0" y1="0" x2="0" y2="5" stroke="currentColor" stroke-width="0.55" opacity="0.5"/>
    </pattern>
    <pattern id="cross-${safe}" width="7" height="7" patternUnits="userSpaceOnUse">
      <path d="M0 7 L7 0 M0 0 L7 7" stroke="currentColor" stroke-width="0.45" opacity="0.38"/>
    </pattern>
    <pattern id="scale-${safe}" width="10" height="8" patternUnits="userSpaceOnUse">
      <path d="M0 4 Q5 0 10 4" fill="none" stroke="currentColor" stroke-width="0.55" opacity="0.45"/>
    </pattern>
  </defs>`;
}

/** Vintage woodcut-style map monster illustration (unique pattern ids per placement). */
export function chartSeaMonsterSvg(variant: ChartSeaMonsterVariant, id: string) {
  const safe = id.replace(/[^a-z0-9-]/gi, '');
  const defs = woodcutDefs(id);

  switch (variant) {
    case 'kraken':
      return `<svg viewBox="0 0 200 160" class="chart-ocean-monster-svg" role="presentation">
        ${defs}
        <ellipse cx="98" cy="72" rx="34" ry="28" fill="url(#cross-${safe})" stroke="currentColor" stroke-width="2.2"/>
        <ellipse cx="98" cy="72" rx="34" ry="28" fill="none" stroke="currentColor" stroke-width="2.2"/>
        <circle cx="88" cy="66" r="2.4" fill="currentColor"/>
        <circle cx="108" cy="66" r="2.4" fill="currentColor"/>
        <path d="M92 78 Q98 82 104 78" fill="none" stroke="currentColor" stroke-width="1.4"/>
        <path d="M64 82 C52 92, 44 108, 38 124" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M76 88 C68 102, 62 118, 58 134" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M98 98 C98 112, 96 126, 92 140" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M118 88 C126 104, 132 118, 138 132" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M132 82 C142 94, 150 108, 158 122" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M148 74 C160 78, 170 84, 178 92" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M48 74 C36 78, 26 86, 18 96" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M42 68 C34 62, 28 54, 24 44" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M154 68 C164 60, 172 50, 176 38" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M34 108 L28 112 M36 116 L30 122 M40 124 L34 130" stroke="currentColor" stroke-width="0.9" opacity="0.65"/>
        <path d="M162 108 L168 114 M160 118 L166 124" stroke="currentColor" stroke-width="0.9" opacity="0.65"/>
      </svg>`;

    case 'whale':
      return `<svg viewBox="0 0 200 160" class="chart-ocean-monster-svg" role="presentation">
        ${defs}
        <path d="M24 92 C48 72, 78 68, 108 74 C138 80, 162 92, 176 102 L168 112 C148 104, 118 98, 88 98 C58 98, 36 104, 24 92 Z"
          fill="url(#hatch-${safe})" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M176 102 C182 96, 188 88, 192 78 C186 82, 180 86, 176 90" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path d="M168 112 C174 118, 178 126, 182 134 C176 128, 170 122, 164 116" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path d="M164 116 C158 122, 150 128, 140 132" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <circle cx="148" cy="88" r="2.6" fill="currentColor"/>
        <path d="M118 54 C120 38, 126 28, 132 22 C128 32, 124 42, 122 52" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <path d="M122 52 C118 46, 112 42, 106 40 C112 44, 116 48, 118 54" fill="none" stroke="currentColor" stroke-width="1.4"/>
        <path d="M52 86 L46 82 M58 84 L52 78 M64 88 L58 82" stroke="currentColor" stroke-width="0.9" opacity="0.55"/>
        <path d="M88 76 C92 70, 98 68, 104 70" fill="none" stroke="currentColor" stroke-width="1.2"/>
      </svg>`;

    case 'hybrid':
      return `<svg viewBox="0 0 200 160" class="chart-ocean-monster-svg" role="presentation">
        ${defs}
        <path d="M118 48 C108 42, 94 44, 86 54 C78 64, 80 78, 88 88 C72 92, 58 98, 46 108 C38 116, 34 126, 36 136
                 C48 128, 64 122, 82 118 C98 114, 118 112, 136 114 C152 116, 164 122, 172 130
                 C174 118, 170 104, 160 92 C148 78, 132 68, 118 48 Z"
          fill="url(#scale-${safe})" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>
        <path d="M118 48 C126 40, 136 38, 144 42 C152 46, 156 56, 154 66 C150 74, 142 80, 132 82"
          fill="url(#hatch-${safe})" stroke="currentColor" stroke-width="2"/>
        <circle cx="136" cy="56" r="2.2" fill="currentColor"/>
        <path d="M148 58 L156 54 M150 64 L158 62" stroke="currentColor" stroke-width="1.2"/>
        <path d="M132 82 L140 92 L136 104 L124 108 L112 102 L108 90 Z" fill="none" stroke="currentColor" stroke-width="1.5"/>
        <path d="M172 130 C178 124, 182 116, 184 106" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <path d="M36 136 C30 128, 26 118, 26 108" fill="none" stroke="currentColor" stroke-width="1.6"/>
        <path d="M98 88 L92 96 M104 92 L100 102" stroke="currentColor" stroke-width="1" opacity="0.6"/>
      </svg>`;

    default:
      // Serpent coiled around a small ship — classic carte marine motif
      return `<svg viewBox="0 0 200 160" class="chart-ocean-monster-svg" role="presentation">
        ${defs}
        <path d="M88 98 L88 78 L92 62 L98 52 L104 48 L110 52 L114 62 L114 78 L114 98 Z"
          fill="url(#hatch-${safe})" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
        <line x1="98" y1="52" x2="98" y2="34" stroke="currentColor" stroke-width="1.4"/>
        <line x1="106" y1="56" x2="106" y2="38" stroke="currentColor" stroke-width="1.2"/>
        <path d="M94 34 L102 30 L106 34 L102 38 Z" fill="currentColor" opacity="0.85"/>
        <path d="M102 38 L110 34 L114 38 L110 42 Z" fill="currentColor" opacity="0.7"/>
        <path d="M88 98 L82 102 L78 108 L76 116 L78 124 L84 128 L92 126 L98 120 L102 112 L104 104"
          fill="none" stroke="currentColor" stroke-width="1.3"/>
        <path d="M18 108 C34 96, 52 88, 72 86 C92 84, 112 88, 128 96 C144 104, 158 116, 168 128"
          fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M168 128 C174 118, 178 106, 180 92 C176 98, 170 104, 162 108"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M18 108 C12 118, 8 128, 8 140 C14 132, 22 124, 32 118"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M48 92 C56 84, 66 80, 76 82" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path d="M122 94 C132 88, 144 86, 154 90" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path d="M62 84 C58 78, 56 70, 58 62 C62 68, 66 74, 72 78" fill="url(#cross-${safe})" stroke="currentColor" stroke-width="1.8"/>
        <path d="M138 88 C142 80, 146 72, 152 66 C148 74, 142 82, 134 88" fill="url(#cross-${safe})" stroke="currentColor" stroke-width="1.8"/>
        <circle cx="176" cy="96" r="2.4" fill="currentColor"/>
        <path d="M182 92 L190 86 M184 98 L192 96" stroke="currentColor" stroke-width="1.2"/>
        <path d="M14 132 L8 136 M16 140 L10 146" stroke="currentColor" stroke-width="1" opacity="0.65"/>
        <path d="M72 78 Q76 72, 80 76 Q76 80, 72 78" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.55"/>
        <path d="M128 82 Q132 76, 136 80 Q132 84, 128 82" fill="none" stroke="currentColor" stroke-width="0.9" opacity="0.55"/>
      </svg>`;
  }
}
