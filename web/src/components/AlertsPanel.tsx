import type { Alert } from '../types';
import { PANEL_HELP } from '../lib/panelHelp';
import { PanelTip } from './PanelTip';

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
    <PanelTip tip={PANEL_HELP.alerts} className="panel">
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
    </PanelTip>
  );
}
