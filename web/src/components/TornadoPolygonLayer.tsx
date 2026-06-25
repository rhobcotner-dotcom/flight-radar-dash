import { GeoJSON } from 'react-leaflet';
import type { PathOptions, TooltipOptions } from 'leaflet';
import {
  formatTornadoPolygonPopup,
  formatTornadoPolygonTooltip,
  type TornadoPolygonCollection,
} from '../lib/tornadoPolygons';

interface Props {
  collection: TornadoPolygonCollection | null;
}

const TOOLTIP_OPTIONS: TooltipOptions = {
  sticky: false,
  direction: 'top',
  opacity: 1,
  className: 'tornado-tooltip',
};

function polygonStyle(kind: 'warning' | 'pds' | undefined): PathOptions {
  if (kind === 'pds') {
    return {
      color: '#fb7185',
      weight: 3,
      fillColor: '#9f1239',
      fillOpacity: 0.34,
      dashArray: '6 4',
    };
  }

  return {
    color: '#ef4444',
    weight: 2,
    fillColor: '#991b1b',
    fillOpacity: 0.24,
  };
}

export function TornadoPolygonLayer({ collection }: Props) {
  if (!collection?.features?.length) return null;

  return (
    <GeoJSON
      data={collection}
      style={(feature) => polygonStyle(feature?.properties?.kind)}
      onEachFeature={(feature, layer) => {
        const props = feature?.properties;
        if (!props) return;

        layer.bindTooltip(formatTornadoPolygonTooltip(props), TOOLTIP_OPTIONS);
        layer.bindPopup(formatTornadoPolygonPopup(props));
      }}
    />
  );
}
