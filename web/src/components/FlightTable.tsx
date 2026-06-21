import { useMemo, useState } from 'react';
import type { Flight } from '../types';

type SortKey = 'callsign' | 'alt' | 'gspeed' | 'route';

interface Props {
  flights: Flight[];
}

function route(f: Flight) {
  const from = f.orig_iata || '?';
  const to = f.dest_iata || '?';
  return `${from} → ${to}`;
}

export function FlightTable({ flights }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('alt');
  const [desc, setDesc] = useState(true);

  const sorted = useMemo(() => {
    const copy = [...flights];
    copy.sort((a, b) => {
      let av: string | number = 0;
      let bv: string | number = 0;
      if (sortKey === 'callsign') {
        av = a.callsign || a.flight || '';
        bv = b.callsign || b.flight || '';
      } else if (sortKey === 'alt') {
        av = a.alt ?? 0;
        bv = b.alt ?? 0;
      } else if (sortKey === 'gspeed') {
        av = a.gspeed ?? 0;
        bv = b.gspeed ?? 0;
      } else {
        av = route(a);
        bv = route(b);
      }
      if (av < bv) return desc ? 1 : -1;
      if (av > bv) return desc ? -1 : 1;
      return 0;
    });
    return copy;
  }, [flights, sortKey, desc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(true);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Flights in area</h2>
        <span className="muted">{flights.length} total</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th><button type="button" onClick={() => toggleSort('callsign')}>Callsign</button></th>
              <th>Type</th>
              <th><button type="button" onClick={() => toggleSort('alt')}>Alt</button></th>
              <th><button type="button" onClick={() => toggleSort('gspeed')}>Speed</button></th>
              <th><button type="button" onClick={() => toggleSort('route')}>Route</button></th>
              <th>Squawk</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 100).map((f) => (
              <tr key={f.fr24_id || f.hex || `${f.lat}-${f.lon}`}>
                <td>{f.callsign || f.flight || '—'}</td>
                <td>{f.type || '—'}</td>
                <td>{f.alt ?? '—'}</td>
                <td>{f.gspeed ?? '—'}</td>
                <td>{route(f)}</td>
                <td>{f.squawk ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {flights.length > 100 ? <p className="muted table-note">Showing first 100 of {flights.length}</p> : null}
      </div>
    </div>
  );
}
