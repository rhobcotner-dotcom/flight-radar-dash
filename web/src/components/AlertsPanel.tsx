import type { Alert } from '../types';

interface Props {
  alerts: Alert[];
}

const severityClass: Record<Alert['severity'], string> = {
  high: 'severity-high',
  medium: 'severity-medium',
  info: 'severity-info',
};

export function AlertsPanel({ alerts }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Alerts</h2>
        <span className="muted">{alerts.length} events</span>
      </div>
      {alerts.length === 0 ? (
        <p className="empty">No unusual events detected.</p>
      ) : (
        <ul className="alert-list">
          {alerts.map((alert, i) => (
            <li key={`${alert.type}-${alert.flight.fr24_id || i}`} className={severityClass[alert.severity]}>
              <span className="alert-type">{alert.type.replace(/_/g, ' ')}</span>
              <span>{alert.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
