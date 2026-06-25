import type { Flight } from '../types';
import { carrierLabel, carrierName } from '../lib/airlineNames';
import {
  arrivalStatus,
  flightLabel,
  formatEta,
  formatFlightSpeedMph,
  googleFlightsUrl,
  routeCodesLabel,
  routeLabel,
  typicalSeatsLabel,
  verticalTrend,
} from '../lib/flightUtils';
import { FlightVisual } from './FlightVisual';

interface Props {
  flight: Flight;
  compact?: boolean;
  showVisual?: boolean;
}

function RouteLine({ flight, prominent = false }: { flight: Flight; prominent?: boolean }) {
  const url = googleFlightsUrl(flight);
  const label = routeLabel(flight);
  const codes = routeCodesLabel(flight);
  const seats = typicalSeatsLabel(flight);

  return (
    <div className={`route-block${prominent ? ' route-block-prominent' : ''}`}>
      <div className="route-line">
        <span className="route-cities">{label}</span>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="route-link">
            Google Flights
          </a>
        ) : null}
      </div>
      {codes && label !== codes ? <div className="muted route-codes">{codes}</div> : null}
      {seats ? <div className="muted route-seats">{seats} · not live passenger count</div> : null}
    </div>
  );
}

export function FlightDetails({ flight, compact = false, showVisual = true }: Props) {
  const label = flightLabel(flight);
  const eta = formatEta(flight);
  const status = arrivalStatus(flight);
  const carrier = flight.carrierLabel || carrierLabel(flight);
  const airline = flight.carrierName || carrierName(flight);

  if (compact) {
    return (
      <div className="flight-details compact">
        {showVisual ? <FlightVisual flight={flight} size="md" /> : null}
        <div className="carrier-line">{carrier}</div>
        <div className="flight-details-head">
          <strong>{label}</strong>
          {flight.flight && flight.flight !== label ? <span className="muted">{flight.flight}</span> : null}
        </div>
        <RouteLine flight={flight} prominent />
        <div>{flight.type || '—'} · {flight.alt ?? '—'} ft · {formatFlightSpeedMph(flight.gspeed) || '—'} · SQ {flight.squawk ?? '—'}</div>
        <div className="muted">{status}</div>
      </div>
    );
  }

  return (
    <div className="flight-details">
      {showVisual ? <FlightVisual flight={flight} size="lg" /> : null}
      <div className="carrier-line">{carrier}</div>
      <div className="flight-details-head">
        <strong>{label}</strong>
        {flight.flight && flight.flight !== label ? <span className="muted">{flight.flight}</span> : null}
      </div>
      <dl className="flight-meta">
        <div><dt>Carrier</dt><dd>{airline}</dd></div>
        <div><dt>Route</dt><dd><RouteLine flight={flight} prominent /></dd></div>
        <div><dt>Aircraft</dt><dd>{flight.type || '—'}{flight.reg ? ` · ${flight.reg}` : ''}</dd></div>
        <div><dt>Altitude</dt><dd>{flight.alt ?? '—'} ft ({verticalTrend(flight.vspeed)})</dd></div>
        <div><dt>Speed</dt><dd>{formatFlightSpeedMph(flight.gspeed) || '—'} · track {flight.track ?? '—'}°</dd></div>
        <div><dt>Squawk</dt><dd>{flight.squawk ?? '—'}</dd></div>
        <div><dt>Status</dt><dd>{status}</dd></div>
        {eta ? <div><dt>ETA</dt><dd>{eta}</dd></div> : null}
        {flight.distanceMiles !== undefined ? (
          <div><dt>Distance</dt><dd>{flight.distanceMiles.toFixed(1)} mi from you</dd></div>
        ) : null}
        {flight.hex ? <div><dt>Hex</dt><dd>{flight.hex}</dd></div> : null}
        {flight.source ? <div><dt>Source</dt><dd>{flight.source}</dd></div> : null}
      </dl>
    </div>
  );
}
