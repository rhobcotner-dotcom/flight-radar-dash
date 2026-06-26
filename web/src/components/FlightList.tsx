import { useMemo, useState } from 'react';
import type { AreaSettings, Flight } from '../types';
import type { useHighlight } from '../hooks/useHighlight';
import { PANEL_HELP } from '../lib/panelHelp';
import { PanelTip } from './PanelTip';
import { carrierLabel } from '../lib/airlineNames';
import { flightKey, flightLabel, formatFlightSpeedMph, routeLabel, sortFlightsByDistance } from '../lib/flightUtils';
import { FlightVisual } from './FlightVisual';

const MINIMIZED_KEY = 'flight-radar-dash-nearby-flights-minimized';

function readMinimizedFlag() {
  try {
    return localStorage.getItem(MINIMIZED_KEY) === 'true';
  } catch {
    return false;
  }
}

interface Props {
  area: AreaSettings;
  flights: Flight[];
  inViewCount?: number;
  homeCount?: number;
  highlightedId?: string | null;
  listHandlers: ReturnType<typeof useHighlight>['listHandlers'];
}

export function FlightList({ area, flights, inViewCount, highlightedId, listHandlers }: Props) {
  const [minimized, setMinimized] = useState(readMinimizedFlag);
  const nearby = useMemo(
    () =>
      sortFlightsByDistance(flights, area.lat, area.lon).filter(
        (flight) => (flight.distanceMiles ?? Infinity) <= area.radiusMiles
      ),
    [area.lat, area.lon, area.radiusMiles, flights]
  );

  const countLabel = `${nearby.length} near home${
    typeof inViewCount === 'number' ? ` · ${inViewCount.toLocaleString()} in map view` : ''
  }`;

  const toggleMinimized = () => {
    setMinimized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MINIMIZED_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <PanelTip
      tip={PANEL_HELP.nearbyFlights}
      className={`panel flight-list-panel${minimized ? ' is-minimized' : ''}`}
    >
      <div className="panel-header flight-list-panel-header">
        <div className="panel-header-title">
          <h2>Nearby flights</h2>
          <span className="muted">{countLabel}</span>
        </div>
        <button
          type="button"
          className="btn-secondary panel-minimize-btn"
          onClick={toggleMinimized}
          aria-expanded={!minimized}
        >
          {minimized ? 'Show' : 'Minimize'}
        </button>
      </div>
      {minimized ? null : nearby.length === 0 ? (
        <p className="empty">
          No flights near home right now. Pan the map — flights load for whatever is in view worldwide.
        </p>
      ) : (
        <ul className="nearby-flight-list">
          {nearby.map((flight, index) => {
            const id = flightKey(flight);
            const active = highlightedId === id;
            return (
              <li
                key={id}
                className={active ? 'active track-list-item' : 'track-list-item'}
                {...listHandlers(id)}
              >
                <div className="nearby-flight-rank-col">
                  <div className="nearby-flight-rank">{index + 1}</div>
                  <FlightVisual flight={flight} size="md" showCaption={false} />
                </div>
                <div className="nearby-flight-body">
                  <div className="nearby-flight-top">
                    <strong>{flightLabel(flight)}</strong>
                    <span>{flight.distanceMiles?.toFixed(1)} mi</span>
                  </div>
                  <div className="nearby-carrier">{carrierLabel(flight)}</div>
                  <div className="muted">{routeLabel(flight)}</div>
                  <div className="nearby-flight-stats">
                    <span>{flight.type || '—'}</span>
                    <span>{flight.alt ?? '—'} ft</span>
                    <span>{formatFlightSpeedMph(flight.gspeed) || '—'}</span>
                    <span>SQ {flight.squawk ?? '—'}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PanelTip>
  );
}
