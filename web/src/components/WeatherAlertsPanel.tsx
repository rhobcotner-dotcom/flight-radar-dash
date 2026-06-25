import type { WeatherAlert } from '../types';
import { PANEL_HELP } from '../lib/panelHelp';
import { weatherAlertIcon, weatherAlertSummary, weatherAlertTiming } from '../lib/weatherAlerts';
import { PanelTip } from './PanelTip';

interface Props {
  alerts: WeatherAlert[];
  fetchedAt?: string | null;
  error?: string | null;
}

const severityClass: Record<WeatherAlert['severity'], string> = {
  high: 'severity-high',
  medium: 'severity-medium',
  info: 'severity-info',
};

export function WeatherAlertsPanel({ alerts, fetchedAt, error }: Props) {
  return (
    <PanelTip tip={PANEL_HELP.weatherAlertsPanel} className="panel weather-alerts-panel">
      <div className="panel-header">
        <h2>Weather alerts</h2>
        <span className="muted">
          {alerts.length} active{fetchedAt ? ` · ${new Date(fetchedAt).toLocaleTimeString()}` : ''}
        </span>
      </div>
      <p className="weather-alerts-intro muted">
        Official NWS watches, warnings, and advisories for your home location via weather.gov.
      </p>
      {error ? <p className="weather-alerts-error">{error}</p> : null}
      {alerts.length === 0 && !error ? (
        <p className="empty">No active weather alerts for your area.</p>
      ) : (
        <ul className="weather-alert-list">
          {alerts.map((alert) => (
            <li key={alert.id} className={`weather-alert-item ${severityClass[alert.severity]}`}>
              <div className="weather-alert-head">
                <span className="weather-alert-icon" aria-hidden="true">
                  {weatherAlertIcon(alert.event)}
                </span>
                <div>
                  <strong>{alert.event}</strong>
                  <div className="muted weather-alert-meta">
                    {alert.areaDesc}
                    {weatherAlertTiming(alert) ? ` · ${weatherAlertTiming(alert)}` : ''}
                  </div>
                </div>
              </div>
              <p className="weather-alert-headline">{weatherAlertSummary(alert)}</p>
              {alert.instruction ? (
                <p className="weather-alert-instruction muted">{alert.instruction}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </PanelTip>
  );
}
