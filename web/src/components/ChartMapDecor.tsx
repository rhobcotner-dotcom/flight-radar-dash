import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';

function SeaMonsterDoodle() {
  return (
    <svg className="chart-map-sea-monster" viewBox="0 0 220 140" role="presentation" aria-hidden="true">
      <path
        d="M18 92 C 34 72, 52 68, 72 76 C 88 62, 108 58, 128 66 C 146 54, 168 52, 196 58
           C 182 74, 166 88, 142 94 C 118 102, 92 108, 64 104 C 42 100, 28 98, 18 92 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M196 58 C 204 48, 214 44, 218 36 M 208 64 L 218 58 M 204 70 L 214 74"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M34 88 C 28 78, 22 72, 12 68 M 40 82 L 30 76 M 46 96 L 36 98"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="168" cy="72" r="2.2" fill="currentColor" />
      <circle cx="174" cy="70" r="1.4" fill="currentColor" opacity="0.7" />
      <path
        d="M52 82 Q 58 76, 64 80 Q 58 86, 52 82"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M88 74 C 96 66, 104 64, 112 68"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M118 84 C 126 78, 134 76, 142 80"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <text x="108" y="28" textAnchor="middle" fontSize="13" fill="currentColor" fontFamily="serif" opacity="0.82">
        Here be dragons
      </text>
    </svg>
  );
}

/** Ornamental parchment frame + compass for treasure-chart map mode. */
export function ChartMapDecor() {
  const map = useMap();
  const host = map.getContainer();

  return createPortal(
    <div className="chart-map-decor" aria-hidden="true">
      <div className="chart-map-grain" />
      <div className="chart-map-grain chart-map-grain-heavy" />
      <div className="chart-map-vignette" />
      <div className="chart-map-burn chart-map-burn-tl" />
      <div className="chart-map-burn chart-map-burn-tr" />
      <div className="chart-map-burn chart-map-burn-bl" />
      <div className="chart-map-burn chart-map-burn-br" />
      <div className="chart-map-burn chart-map-burn-edge" />
      <div className="chart-map-frame">
        <span className="chart-map-corner chart-map-corner-nw">❧</span>
        <span className="chart-map-corner chart-map-corner-ne">❧</span>
        <span className="chart-map-corner chart-map-corner-sw">❧</span>
        <span className="chart-map-corner chart-map-corner-se">❧</span>
      </div>
      <div className="chart-map-compass">
        <svg viewBox="0 0 64 64" width="56" height="56" role="presentation">
          <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.85" />
          <circle cx="32" cy="32" r="22" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.55" />
          <path d="M32 8 L35 28 L32 32 L29 28 Z" fill="currentColor" opacity="0.9" />
          <path d="M32 56 L29 36 L32 32 L35 36 Z" fill="currentColor" opacity="0.45" />
          <path d="M8 32 L28 29 L32 32 L28 35 Z" fill="currentColor" opacity="0.55" />
          <path d="M56 32 L36 35 L32 32 L36 29 Z" fill="currentColor" opacity="0.55" />
          <text x="32" y="18" textAnchor="middle" fontSize="7" fill="currentColor" fontFamily="serif">
            N
          </text>
        </svg>
      </div>
      <div className="chart-map-sea-monster-wrap">
        <SeaMonsterDoodle />
      </div>
      <p className="chart-map-legend">Here be weather</p>
    </div>,
    host
  );
}
