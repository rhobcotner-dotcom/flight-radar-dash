import { useMemo } from 'react';
import type { HearingPrediction, WeatherConditions } from '../types';
import { hearingPhaseLabel } from '../lib/hearingAlerts';
import { PANEL_HELP } from '../lib/panelHelp';
import { flightLabel, routeLabel } from '../lib/flightUtils';
import { FlightVisual } from './FlightVisual';
import { PanelTip } from './PanelTip';

interface Props {
  weather: WeatherConditions | null;
  weatherError?: string | null;
  predictions?: HearingPrediction[];
  alertsEnabled: boolean;
  soundEnabled: boolean;
  onAlertsEnabledChange: (value: boolean) => void;
  onSoundEnabledChange: (value: boolean) => void;
}

function formatLead(prediction: HearingPrediction) {
  if (prediction.audibleNow) return 'Audible now';
  if (prediction.secondsUntilAudible == null) return 'Maybe soon';
  if (prediction.secondsUntilAudible <= 15) return 'Any moment';
  if (prediction.secondsUntilAudible < 60) return `~${prediction.secondsUntilAudible}s`;
  const minutes = Math.round(prediction.secondsUntilAudible / 60);
  return `~${minutes} min`;
}

export function HearingWatchPanel({
  weather,
  weatherError,
  predictions: predictionsProp,
  alertsEnabled,
  soundEnabled,
  onAlertsEnabledChange,
  onSoundEnabledChange,
}: Props) {
  const predictions = useMemo(() => {
    if (predictionsProp) return predictionsProp.slice(0, 5);
    return [];
  }, [predictionsProp]);

  return (
    <PanelTip tip={PANEL_HELP.hearingWatch} className="panel hearing-watch-panel">
      <div className="panel-header">
        <h2>Hearing watch</h2>
        <span className="muted">Toast alerts {alertsEnabled ? 'on' : 'off'}</span>
      </div>
      <p className="hearing-watch-intro muted">
        Estimates indoor audibility for civilian traffic (red toasts). Military aircraft within 8 mi trigger yellow alerts with a siren. NWS watches and warnings for your home also toast here.
      </p>
      <div className="hearing-watch-controls">
        <label className="hearing-toggle">
          <input
            type="checkbox"
            checked={alertsEnabled}
            onChange={(e) => onAlertsEnabledChange(e.target.checked)}
          />
          Toast alerts
        </label>
        <label className="hearing-toggle">
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => onSoundEnabledChange(e.target.checked)}
          />
          Pop sound
        </label>
      </div>
      {weather ? (
        <div className="hearing-weather muted">
          Weather: {weather.windSpeedMph ?? '—'} mph from {weather.windDirectionDeg ?? '—'}°
          {weather.surfaceInversion ? ' · surface inversion likely' : ''}
        </div>
      ) : weatherError ? (
        <div className="hearing-weather muted">Weather unavailable — using geometry-only estimates.</div>
      ) : (
        <div className="hearing-weather muted">Loading weather…</div>
      )}
      {predictions.length === 0 ? (
        <p className="empty">Nothing you should hear soon from home.</p>
      ) : (
        <ul className="hearing-watch-list">
          {predictions.map((prediction) => (
            <li key={prediction.flight.hex || prediction.flight.fr24_id || flightLabel(prediction.flight)}>
              <div className="hearing-watch-item">
                <div className="hearing-watch-thumb">
                  <FlightVisual flight={prediction.flight} size="sm" showCaption={false} />
                </div>
                <div className="hearing-watch-body">
                  <div className="hearing-watch-top">
                    <strong>{flightLabel(prediction.flight)}</strong>
                    <span className={`hearing-tier hearing-tier-${prediction.alertTier}`}>{formatLead(prediction)}</span>
                  </div>
                  <div className="muted">{routeLabel(prediction.flight)}</div>
                  <div className="hearing-watch-stats">
                    <span>{prediction.categoryLabel}</span>
                    <span>{hearingPhaseLabel(prediction.phase)}</span>
                    <span>{prediction.horizontalMiles.toFixed(1)} mi</span>
                    <span>{prediction.flight.alt ?? '—'} ft</span>
                    <span>~{prediction.estimatedDb} dBA indoor</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </PanelTip>
  );
}
