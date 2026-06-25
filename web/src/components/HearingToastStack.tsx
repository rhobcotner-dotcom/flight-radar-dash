import type { HearingToast } from '../types';
import { b52AlertStats as defaultB52AlertStats } from '../lib/b52Alerts';
import { hearingAlertCarrier, hearingAlertLeadLabel, hearingAlertStats } from '../lib/hearingAlerts';
import { weatherAlertIcon, weatherAlertTiming } from '../lib/weatherAlerts';
import { flightLabel, routeLabel } from '../lib/flightUtils';
import { FlightVisual } from './FlightVisual';

interface Props {
  toasts: HearingToast[];
  onDismiss: (toastId: string, entityKey?: string) => void;
  onSelect?: (flightKey: string) => void;
  b52AlertStats?: (flight: NonNullable<HearingToast['flight']>) => string;
}

export function HearingToastStack({ toasts, onDismiss, onSelect, b52AlertStats = defaultB52AlertStats }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="hearing-toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => {
        if (toast.variant === 'fun') {
          return (
            <div key={toast.id} className="hearing-toast hearing-toast-fun" role="status">
              <div className="hearing-toast-main hearing-toast-main-static">
                <div className="weather-toast-icon" aria-hidden="true">
                  🛸
                </div>
                <div className="hearing-toast-copy">
                  <strong>{toast.title}</strong>
                  <span className="hearing-toast-route">{toast.body}</span>
                </div>
              </div>
              <button
                type="button"
                className="hearing-toast-dismiss"
                aria-label="Dismiss fun alert"
                onClick={() => onDismiss(toast.id, toast.flightKey)}
              >
                ×
              </button>
            </div>
          );
        }

        if (toast.variant === 'weather' && toast.weatherAlert) {
          const alert = toast.weatherAlert;
          const timing = weatherAlertTiming(alert);

          return (
            <div
              key={toast.id}
              className={`hearing-toast hearing-toast-weather hearing-toast-weather-${alert.severity}`}
              role="alert"
            >
              <div className="hearing-toast-main hearing-toast-main-static">
                <div className="weather-toast-icon" aria-hidden="true">
                  {weatherAlertIcon(alert.event)}
                </div>
                <div className="hearing-toast-copy">
                  <strong>{toast.title}</strong>
                  <span className="hearing-toast-route">{toast.body}</span>
                  {alert.areaDesc ? (
                    <span className="hearing-toast-stats">{alert.areaDesc}</span>
                  ) : null}
                  {timing ? <span className="hearing-toast-timing">{timing}</span> : null}
                </div>
              </div>
              <button
                type="button"
                className="hearing-toast-dismiss"
                aria-label="Dismiss weather alert"
                onClick={() => onDismiss(toast.id, toast.flightKey)}
              >
                ×
              </button>
            </div>
          );
        }

        if (toast.variant === 'b52' && toast.flight) {
          const flight = toast.flight;
          const stats = b52AlertStats(flight);

          return (
            <div key={toast.id} className="hearing-toast hearing-toast-b52" role="alert">
              <button
                type="button"
                className="hearing-toast-main"
                onClick={() => onSelect?.(toast.flightKey)}
              >
                <div className="hearing-toast-visual">
                  <FlightVisual flight={flight} size="md" showCaption={false} />
                </div>
                <div className="hearing-toast-copy">
                  <strong>{toast.title}</strong>
                  <span className="hearing-toast-flight">{flightLabel(flight)}</span>
                  <span className="hearing-toast-route">{toast.body}</span>
                  <span className="hearing-toast-stats">{stats}</span>
                </div>
              </button>
              <button
                type="button"
                className="hearing-toast-dismiss"
                aria-label="Dismiss B-52 alert"
                onClick={() => onDismiss(toast.id, toast.flightKey)}
              >
                ×
              </button>
            </div>
          );
        }

        const isMilitary = toast.variant === 'military';
        const flight = toast.flight || toast.prediction?.flight;
        if (!flight) return null;

        return (
          <div
            key={toast.id}
            className={`hearing-toast${isMilitary ? ' hearing-toast-military' : ''}`}
            role="status"
          >
            <button
              type="button"
              className="hearing-toast-main"
              onClick={() => onSelect?.(toast.flightKey)}
            >
              <div className="hearing-toast-visual">
                <FlightVisual flight={flight} size="md" showCaption={false} />
              </div>
              <div className="hearing-toast-copy">
                <strong>{toast.title}</strong>
                {isMilitary ? (
                  <>
                    <span className="hearing-toast-flight">{flightLabel(flight)}</span>
                    <span className="hearing-toast-route">{toast.body}</span>
                  </>
                ) : (
                  <>
                    <span className="hearing-toast-flight">{flightLabel(flight)}</span>
                    {toast.prediction ? (
                      <>
                        <span className="hearing-toast-carrier">{hearingAlertCarrier(toast.prediction)}</span>
                        <span className="hearing-toast-route">{routeLabel(flight)}</span>
                        <span className="hearing-toast-timing">{hearingAlertLeadLabel(toast.prediction)}</span>
                        <span className="hearing-toast-stats">{hearingAlertStats(toast.prediction)}</span>
                      </>
                    ) : (
                      <span className="hearing-toast-route">{toast.body}</span>
                    )}
                  </>
                )}
              </div>
            </button>
            <button
              type="button"
              className="hearing-toast-dismiss"
              aria-label="Dismiss alert"
              onClick={() => onDismiss(toast.id, toast.flightKey)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
