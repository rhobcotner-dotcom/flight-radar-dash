import { useState } from 'react';
import type { AreaSettings } from '../types';

interface Props {
  area: AreaSettings;
  onSave: (area: AreaSettings) => void;
}

export function AreaSettingsPanel({ area, onSave }: Props) {
  const [draft, setDraft] = useState(area);
  const [open, setOpen] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      ...draft,
      lat: Number(draft.lat),
      lon: Number(draft.lon),
      radiusMiles: Number(draft.radiusMiles),
    });
    setOpen(false);
  }

  return (
    <div className="panel settings-panel">
      <div className="panel-header">
        <h2>Area</h2>
        <button type="button" className="btn-secondary" onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Edit'}
        </button>
      </div>
      <p className="area-summary">
        <strong>{area.name}</strong>
        <span>{area.lat.toFixed(3)}°, {area.lon.toFixed(3)}° · {area.radiusMiles} mi radius</span>
      </p>
      {open ? (
        <form className="settings-form" onSubmit={handleSubmit}>
          <label>
            Metro name
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            Latitude
            <input
              type="number"
              step="0.001"
              value={draft.lat}
              onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="0.001"
              value={draft.lon}
              onChange={(e) => setDraft({ ...draft, lon: Number(e.target.value) })}
            />
          </label>
          <label>
            Radius (miles)
            <input
              type="number"
              min="5"
              max="300"
              value={draft.radiusMiles}
              onChange={(e) => setDraft({ ...draft, radiusMiles: Number(e.target.value) })}
            />
          </label>
          <button type="submit" className="btn-primary">Save area</button>
        </form>
      ) : null}
    </div>
  );
}
