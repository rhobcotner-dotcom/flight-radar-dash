import { AreaSettingsPanel } from './components/AreaSettings';
import { AlertsPanel } from './components/AlertsPanel';
import { FlightMap } from './components/FlightMap';
import { FlightTable } from './components/FlightTable';
import { GovFlights } from './components/GovFlights';
import { TrendsChart } from './components/TrendsChart';
import { useAreaSettings } from './hooks/useAreaSettings';
import { useFlights } from './hooks/useFlights';

export default function App() {
  const { area, setArea, queryString } = useAreaSettings();
  const { flights, govFlights, alerts, loading, error, fetchedAt, refresh } = useFlights(queryString);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Flight Radar Dash</h1>
          <p className="muted">Personal area dashboard · {area.name}</p>
        </div>
        <div className="header-actions">
          {fetchedAt ? <span className="muted">Updated {new Date(fetchedAt).toLocaleTimeString()}</span> : null}
          <button type="button" className="btn-secondary" onClick={refresh} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error ? <div className="banner error">{error}</div> : null}

      <main className="dashboard-grid">
        <AreaSettingsPanel area={area} onSave={setArea} />
        <FlightMap area={area} flights={flights} />
        <AlertsPanel alerts={alerts} />
        <GovFlights flights={govFlights} />
        <TrendsChart hours={24} />
        <TrendsChart hours={168} />
        <div className="full-width">
          <FlightTable flights={flights} />
        </div>
      </main>
    </div>
  );
}
