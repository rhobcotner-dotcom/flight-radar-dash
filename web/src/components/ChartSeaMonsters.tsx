import { useMemo, useState } from 'react';
import { Marker, Pane, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { CHART_SEA_MONSTERS, chartSeaMonsterSvg, type ChartSeaMonsterSpec } from '../lib/chartSeaMonsters';

function monsterIcon(spec: ChartSeaMonsterSpec, zoom: number) {
  const scale =
    (spec.scale ?? 1) * (zoom <= 5 ? 1.22 : zoom <= 7 ? 1.05 : zoom <= 9 ? 0.9 : zoom <= 10 ? 0.72 : 0);
  const rotation = spec.rotation ?? 0;
  const caption = spec.caption
    ? `<span class="chart-ocean-monster-caption">${spec.caption}</span>`
    : '';
  const html = `<div class="chart-ocean-monster" style="transform: rotate(${rotation}deg) scale(${scale})">${chartSeaMonsterSvg(spec.variant, spec.id)}${caption}</div>`;

  return L.divIcon({
    className: 'chart-ocean-monster-marker',
    html,
    iconSize: [220, 176],
    iconAnchor: [110, 88],
  });
}

/** Geographic sea monster doodles — only for treasure-chart mode. */
export function ChartSeaMonsters() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
    moveend: () => setZoom(map.getZoom()),
  });

  const markers = useMemo(
    () => CHART_SEA_MONSTERS.map((spec) => ({ spec, icon: monsterIcon(spec, zoom) })),
    [zoom]
  );

  if (zoom >= 11) return null;

  return (
    <Pane name="chart-sea-monsters" className="chart-sea-monsters-pane" style={{ zIndex: 420 }}>
      {markers.map(({ spec, icon }) => (
        <Marker
          key={spec.id}
          position={[spec.lat, spec.lon]}
          icon={icon}
          interactive={false}
          zIndexOffset={0}
        />
      ))}
    </Pane>
  );
}
