import type { Flight } from '../types';
import { PANEL_HELP } from '../lib/panelHelp';
import { PanelTip } from './PanelTip';

interface Props {
  flights: Flight[];
}

export function GovFlights({ flights }: Props) {
  return (
    <PanelTip tip={PANEL_HELP.govMilitary} className="panel">
      <div className="panel-header">
        <h2>Gov / military</h2>
        <span className="muted">{flights.length} aircraft</span>
      </div>
      {flights.length === 0 ? (
        <p className="empty">No military or government aircraft in bounds right now.</p>
      ) : (
        <ul className="flight-list">
          {flights.map((f) => (
            <li key={f.fr24_id || f.hex || `${f.lat}-${f.lon}`}>
              <strong>{f.callsign || f.flight || f.reg || 'Unknown'}</strong>
              <span>{f.type || '—'} · {f.alt ?? '—'} ft</span>
              <span>{f.orig_iata || '?'} → {f.dest_iata || '?'}</span>
            </li>
          ))}
        </ul>
      )}
    </PanelTip>
  );
}
