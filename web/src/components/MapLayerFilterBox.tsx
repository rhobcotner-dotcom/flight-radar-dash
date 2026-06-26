import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LayerToggle } from './PanelTip';

export interface MapLayerFilterItem {
  id: string;
  label: string;
  tip: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  storageKey?: string;
  extra?: ReactNode;
}

export interface MapLayerFilterSection {
  title: string;
  items: MapLayerFilterItem[];
}

interface MapLayerFilterBoxProps {
  sections: MapLayerFilterSection[];
  /** Layer ids pinned on the compact bar for one-click access. */
  quickIds?: string[];
  float?: boolean;
}

const DEFAULT_QUICK_IDS = ['flights', 'rail', 'radar', 'cameras'];

function flattenItems(sections: MapLayerFilterSection[]) {
  const byId = new Map<string, MapLayerFilterItem>();
  for (const section of sections) {
    for (const item of section.items) {
      byId.set(item.id, item);
    }
  }
  return byId;
}

export function MapLayerFilterBox({
  sections,
  quickIds = DEFAULT_QUICK_IDS,
  float = false,
}: MapLayerFilterBoxProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemsById = useMemo(() => flattenItems(sections), [sections]);
  const activeCount = useMemo(
    () => [...itemsById.values()].filter((item) => item.checked).length,
    [itemsById]
  );
  const quickItems = quickIds
    .map((id) => itemsById.get(id))
    .filter((item): item is MapLayerFilterItem => Boolean(item));

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`map-layer-filter-box${open ? ' map-layer-filter-box-open' : ''}${float ? ' map-layer-filter-box-float' : ''}`}
    >
      <div className="map-layer-filter-bar">
        <div className="map-layer-filter-quick">
          {quickItems.map((item) => (
            <LayerToggle
              key={item.id}
              label={item.label}
              tip={item.tip}
              checked={item.checked}
              onChange={item.onChange}
              storageKey={item.storageKey}
            />
          ))}
        </div>
        <button
          type="button"
          className="map-layer-filter-trigger"
          aria-expanded={open}
          aria-controls="map-layer-filter-panel"
          onClick={() => setOpen((prev) => !prev)}
        >
          <span>Layers</span>
          <span className="map-layer-filter-count">{activeCount} on</span>
        </button>
      </div>

      {open ? (
        <div id="map-layer-filter-panel" className="map-layer-filter-panel" role="dialog" aria-label="Map layers">
          <div className="map-layer-filter-panel-head">
            <strong>Map layers</strong>
            <span className="muted">{activeCount} enabled</span>
          </div>
          <div className="map-layer-filter-sections">
            {sections.map((section) => (
              <section key={section.title} className="map-layer-filter-section">
                <h3 className="map-layer-filter-section-title">{section.title}</h3>
                <div className="map-layer-filter-section-items">
                  {section.items.map((item) => (
                    <div key={item.id} className="map-layer-filter-item">
                      <LayerToggle
                        label={item.label}
                        tip={item.tip}
                        checked={item.checked}
                        onChange={item.onChange}
                        storageKey={item.storageKey}
                      />
                      {item.extra ? <div className="map-layer-filter-item-extra">{item.extra}</div> : null}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
