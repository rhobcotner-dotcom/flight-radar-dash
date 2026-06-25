import type { AirportHub, AirportMovement } from '../types';
import { PANEL_HELP } from '../lib/panelHelp';
import { PanelTip } from './PanelTip';

interface Props {
  airport: AirportHub | null;
  airportCode: string;
  loading?: boolean;
  error?: string | null;
  fetchedAt?: string | null;
  onLoad: () => void;
}

function MovementRow({ item }: { item: AirportMovement }) {
  const etaHint =
    item.minutesUntilEta !== null && item.minutesUntilEta !== undefined
      ? item.minutesUntilEta <= 0
        ? 'Due now'
        : `in ${item.minutesUntilEta}m`
      : null;

  return (
    <li>
      <div className="movement-top">
        <strong>{item.flight || item.callsign || '—'}</strong>
        <span className={`status-chip status-${(item.status || 'unknown').replace(/\s+/g, '-').toLowerCase()}`}>
          {item.status || '—'}
        </span>
      </div>
      <div className="muted movement-carrier">{item.carrierLabel}</div>
      <div className="movement-meta">
        <span>{item.route}</span>
        <span>{item.type || '—'}</span>
        <span>{item.alt !== undefined ? `${item.alt} ft` : '—'}</span>
        <span>
          ETA {item.etaLabel || item.timeLabel || '—'}
          {etaHint ? ` (${etaHint})` : ''}
        </span>
      </div>
    </li>
  );
}

function MovementBoard({
  title,
  emptyMessage,
  items,
}: {
  title: string;
  emptyMessage: string;
  items: AirportMovement[];
}) {
  return (
    <section className="airport-board">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty">{emptyMessage}</p>
      ) : (
        <ul className="movement-list">
          {items.map((item) => (
            <MovementRow key={item.fr24_id || item.flight} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function AirportHubPanel({ airport, airportCode, loading = false, error, fetchedAt, onLoad }: Props) {
  if (!airport) {
    return (
      <PanelTip tip={PANEL_HELP.airportBoard} className="panel airport-panel">
        <div className="panel-header">
          <div>
            <h2>{airportCode} airport board</h2>
            <span className="muted">On demand · uses 5 FR24 calls (~300–500 credits)</span>
          </div>
        </div>
        <p className="empty">
          Load departures, arrivals, and today&apos;s summary for {airportCode} when you want it — not on every map refresh.
        </p>
        {error ? <p className="banner error">{error}</p> : null}
        <button type="button" className="btn-secondary" onClick={onLoad} disabled={loading}>
          {loading ? 'Loading airport board…' : `Load ${airportCode} status`}
        </button>
      </PanelTip>
    );
  }

  if (airport.error) {
    return (
      <PanelTip tip={PANEL_HELP.airportBoard} className="panel airport-panel">
        <div className="panel-header">
          <h2>{airport.iata} · {airport.name}</h2>
        </div>
        <p className="banner error">{airport.error}</p>
        <button type="button" className="btn-secondary" onClick={onLoad} disabled={loading}>
          {loading ? 'Retrying…' : 'Retry'}
        </button>
      </PanelTip>
    );
  }

  return (
    <PanelTip tip={PANEL_HELP.airportBoard} className="panel airport-panel">
      <div className="panel-header">
        <div>
          <h2>{airport.iata} · {airport.name}</h2>
          <span className="muted">
            {airport.dateLabel} · {airport.icao}
            {fetchedAt ? ` · updated ${new Date(fetchedAt).toLocaleTimeString()}` : ''}
          </span>
        </div>
        <button type="button" className="btn-secondary btn-compact" onClick={onLoad} disabled={loading}>
          {loading ? 'Updating…' : 'Refresh board'}
        </button>
      </div>

      <div className="airport-stats">
        <div><span>Upcoming departures</span><strong>{airport.stats.upcomingDepartures ?? airport.upcomingDepartures.length}</strong></div>
        <div><span>Live arrivals</span><strong>{airport.stats.liveInbound}</strong></div>
        <div><span>En route from {airport.iata}</span><strong>{airport.stats.liveOutbound}</strong></div>
        <div><span>Departures today</span><strong>{airport.stats.departuresToday}*</strong></div>
        <div><span>Arrivals today</span><strong>{airport.stats.arrivalsToday}*</strong></div>
        <div><span>On ground</span><strong>{airport.stats.onGround}</strong></div>
        <div><span>Delays / alerts</span><strong>{airport.stats.delayedCount}</strong></div>
      </div>

      <p className="airport-footnote muted">* Counts reflect API sample limits on your plan.</p>

      {airport.delays.length > 0 ? (
        <section className="airport-section">
          <h3>Delays &amp; alerts</h3>
          <ul className="airport-alert-list">
            {airport.delays.map((delay, i) => (
              <li key={`${delay.type}-${i}`} className={`severity-${delay.severity}`}>
                {delay.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="airport-boards">
        <MovementBoard
          title={`Upcoming departures from ${airport.iata}`}
          emptyMessage="No upcoming departures on ground or scheduled in the feed right now."
          items={airport.upcomingDepartures}
        />
        <MovementBoard
          title={`Upcoming arrivals to ${airport.iata}`}
          emptyMessage="No inbound flights in the live feed right now."
          items={airport.upcomingArrivals}
        />
      </div>

      <section className="airport-section">
        <h3>Recent departures today</h3>
        {airport.recentDepartures.length === 0 ? (
          <p className="empty">No completed departures in today&apos;s summary sample.</p>
        ) : (
          <ul className="movement-list compact">
            {airport.recentDepartures.map((item) => (
              <MovementRow key={item.fr24_id || item.flight} item={item} />
            ))}
          </ul>
        )}
      </section>
    </PanelTip>
  );
}
