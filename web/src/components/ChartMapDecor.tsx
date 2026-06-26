import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';

/** Ornamental parchment frame + compass for treasure-chart map mode. */
export function ChartMapDecor() {
  const map = useMap();
  const host = map.getContainer();

  return createPortal(
    <div className="chart-map-decor" aria-hidden="true">
      <div className="chart-map-grain" />
      <div className="chart-map-grain chart-map-grain-heavy" />
      <svg className="chart-map-rhumbs" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="0.15" opacity="0.22">
          <line x1="50" y1="50" x2="0" y2="0" />
          <line x1="50" y1="50" x2="100" y2="0" />
          <line x1="50" y1="50" x2="100" y2="100" />
          <line x1="50" y1="50" x2="0" y2="100" />
          <line x1="50" y1="50" x2="50" y2="0" />
          <line x1="50" y1="50" x2="100" y2="50" />
          <line x1="50" y1="50" x2="50" y2="100" />
          <line x1="50" y1="50" x2="0" y2="50" />
          <line x1="20" y1="20" x2="80" y2="80" />
          <line x1="80" y1="20" x2="20" y2="80" />
        </g>
      </svg>
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
      <p className="chart-map-legend">Here be weather</p>
    </div>,
    host
  );
}
