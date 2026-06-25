import { useEffect, useState } from 'react';
import type { AreaSettings } from '../types';
import { PANEL_HELP } from '../lib/panelHelp';
import { PanelTip } from './PanelTip';

interface Props {
  area: AreaSettings;
  onSave: (area: AreaSettings) => void;
}

const DEFAULT_COORDS = { lat: 38.787, lon: -90.629 };

function coordsLookUnset(address: string | undefined, lat: number, lon: number) {
  if (!address?.trim()) return false;
  return (
    Math.abs(lat - DEFAULT_COORDS.lat) < 0.0005
    && Math.abs(lon - DEFAULT_COORDS.lon) < 0.0005
  );
}

async function geocodeAddress(address: string, label: string) {
  const query = address.includes(',') ? address : `${address}, ${label || 'Saint Peters, MO'}`;
  const params = new URLSearchParams({ q: query });
  const res = await fetch(`/api/geocode?${params.toString()}`);
  const raw = await res.text();
  let data: { error?: string; address?: string; label?: string; lat?: number; lon?: number };
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      res.ok
        ? 'Address lookup returned an invalid response.'
        : 'Address lookup failed — restart the app (`npm run dev`) so the API picks up geocoding.'
    );
  }
  if (!res.ok) throw new Error(data.error || 'Address lookup failed');
  if (!Number.isFinite(data.lat) || !Number.isFinite(data.lon)) {
    throw new Error('Address lookup did not return coordinates.');
  }
  return {
    address: data.address || query,
    label: data.label,
    lat: data.lat!,
    lon: data.lon!,
  };
}

export function AreaSettingsPanel({ area, onSave }: Props) {
  const [draft, setDraft] = useState(area);
  const [open, setOpen] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    setDraft(area);
  }, [area]);

  const needsGeocode = coordsLookUnset(area.address, area.lat, area.lon);

  async function lookupAddress() {
    const query = draft.address?.trim();
    if (!query) {
      setLookupError('Enter your street address first.');
      return null;
    }

    setLookupLoading(true);
    setLookupError(null);
    try {
      const result = await geocodeAddress(query, draft.name);
      setDraft((prev) => ({
        ...prev,
        address: result.address,
        name: result.label || prev.name,
        lat: result.lat,
        lon: result.lon,
      }));
      return result;
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Address lookup failed');
      return null;
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaveLoading(true);
    setLookupError(null);

    try {
      let next = { ...draft };

      if (next.address?.trim()) {
        const result = await geocodeAddress(next.address.trim(), next.name);
        next = {
          ...next,
          address: result.address,
          name: result.label || next.name,
          lat: result.lat,
          lon: result.lon,
        };
      }

      onSave({
        ...next,
        lat: Number(next.lat),
        lon: Number(next.lon),
        radiusMiles: Number(next.radiusMiles),
        mapFocusMiles: Number(next.mapFocusMiles),
      });
      setOpen(false);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Address lookup failed');
    } finally {
      setSaveLoading(false);
    }
  }

  return (
    <PanelTip tip={PANEL_HELP.home} className="panel settings-panel">
      <div className="panel-header">
        <h2>Home</h2>
        <button type="button" className="btn-secondary" onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Edit'}
        </button>
      </div>
      <p className="area-summary">
        <strong>{area.address || area.name}</strong>
        <span>{area.lat.toFixed(4)}°, {area.lon.toFixed(4)}° · hearing alerts use this point</span>
      </p>
      {needsGeocode ? (
        <p className="settings-warning">
          Address saved, but coordinates still look like the old default. Open Edit and click Save home to pin your house.
        </p>
      ) : null}
      {open ? (
        <form className="settings-form" onSubmit={(e) => void handleSubmit(e)}>
          <label>
            Your address
            <input
              value={draft.address || ''}
              placeholder="362 Misty Valley Dr, Saint Peters, MO"
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </label>
          <div className="settings-inline-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void lookupAddress()}
              disabled={lookupLoading || saveLoading}
            >
              {lookupLoading ? 'Looking up…' : 'Preview on map'}
            </button>
          </div>
          {lookupError ? <p className="settings-error">{lookupError}</p> : null}
          <label>
            Label
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <div className="settings-grid">
            <label>
              Latitude
              <input
                type="number"
                step="0.0001"
                value={draft.lat}
                onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })}
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                step="0.0001"
                value={draft.lon}
                onChange={(e) => setDraft({ ...draft, lon: Number(e.target.value) })}
              />
            </label>
          </div>
          <label>
            Map zoom area (miles)
            <input
              type="number"
              min="3"
              max="40"
              value={draft.mapFocusMiles ?? 12}
              onChange={(e) => setDraft({ ...draft, mapFocusMiles: Number(e.target.value) })}
            />
          </label>
          <label>
            Aircraft fetch radius (miles)
            <input
              type="number"
              min="5"
              max="300"
              value={draft.radiusMiles}
              onChange={(e) => setDraft({ ...draft, radiusMiles: Number(e.target.value) })}
            />
          </label>
          <button type="submit" className="btn-primary" disabled={saveLoading}>
            {saveLoading ? 'Saving…' : 'Save home'}
          </button>
        </form>
      ) : null}
    </PanelTip>
  );
}
