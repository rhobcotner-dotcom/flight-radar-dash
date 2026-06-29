import type { Train } from '../types';
import { trainKindLabel, trainLabel, trainRouteLabel, isMetroTrain } from '../lib/trainUtils';
import { formatOccupancyLine, occupancyDetailLabel } from '../lib/occupancyUtils';
import { FreightDreamState } from './FreightDreamState';

interface Props {
  train: Train;
  compact?: boolean;
}

function formatObserved(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (/^\d+$/.test(String(value).trim())) return null;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatHeading(heading?: string | number | null) {
  const value = Number(heading);
  if (!Number.isFinite(value) || value === 0) return null;
  return `${Math.round(value)}°`;
}

function metroTitle(train: Train) {
  if (train.lineName) return train.lineName;
  if (train.headsign) return train.headsign;
  return trainLabel(train);
}

function metroSubtitle(train: Train) {
  const parts = [
    train.direction,
    train.lineCode ? `#${train.lineCode}` : null,
    train.headsign && train.headsign !== metroTitle(train) ? train.headsign : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

function MetroRouteSummary({ train }: { train: Train }) {
  const parts = [
    train.railroad || train.sourceLabel,
    train.routeId ? `Route ${train.routeId}` : null,
    train.vehicleId ? `Car ${train.vehicleId}` : null,
  ].filter(Boolean);
  return parts.length ? <div className="muted">{parts.join(' · ')}</div> : null;
}

function stopDetail(stop: NonNullable<Train['nextStop']>) {
  const eta = stop.scheduledDeparture || stop.scheduledArrival;
  const parts = [stop.name];
  if (eta) parts.push(eta);
  if (stop.status) parts.push(stop.status);
  return parts.join(' · ');
}

export function TrainDetails({ train, compact = false }: Props) {
  const observed = formatObserved(train.observedAt || train.timely);
  const heading = formatHeading(train.heading);
  const isMetro = isMetroTrain(train);
  const status =
    train.crossingStatus ||
    (isMetro && train.trainState && !['live', 'aprs', 'beacon'].includes(train.trainState)
      ? train.trainState
      : !isMetro && train.trainState && train.trainState !== 'aprs' && train.trainState !== 'beacon'
        ? train.trainState
        : null);
  const subtitle = isMetro ? metroSubtitle(train) : null;

  if (compact) {
    return (
      <div className="train-details compact">
        <strong>{isMetro ? metroTitle(train) : trainLabel(train)}</strong>
        {isMetro && subtitle ? <div>{subtitle}</div> : null}
        <div>{trainKindLabel(train)}{train.sourceLabel ? ` · ${train.sourceLabel}` : ''}</div>
        {!isMetro && train.direction ? <div>{train.direction}</div> : null}
        {train.routeName && train.routeName !== train.trainNum ? <div>{train.routeName}</div> : null}
        <div className="muted">{isMetro ? train.nextStop?.name || train.destName || trainRouteLabel(train) : trainRouteLabel(train)}</div>
        {train.velocityMph != null && train.velocityMph > 0 ? <div>{train.velocityMph} mph</div> : null}
        {train.crossingStatus ? <div>{train.crossingStatus}</div> : null}
      </div>
    );
  }

  if (isMetro) {
    return (
      <div className="train-details train-details-metro">
        <strong>{metroTitle(train)}</strong>
        {subtitle ? <div className="train-details-metro-direction">{subtitle}</div> : null}
        <MetroRouteSummary train={train} />
        {train.activeAlerts?.length ? (
          <div className="train-details-alerts">
            {train.activeAlerts.slice(0, 2).map((alert) => (
              <div key={alert.header} className="train-details-alert">
                <strong>{alert.header}</strong>
                {alert.description ? <div className="muted">{alert.description}</div> : null}
              </div>
            ))}
          </div>
        ) : null}
        <dl className="detail-grid">
          {train.previousStop ? (
            <div><dt>Last stop</dt><dd>{stopDetail(train.previousStop)}</dd></div>
          ) : null}
          {train.nextStop ? (
            <div><dt>Next stop</dt><dd>{stopDetail(train.nextStop)}</dd></div>
          ) : null}
          {train.stopsRemaining != null && train.stopsRemaining > 0 ? (
            <div><dt>Stops left</dt><dd>{train.stopsRemaining}</dd></div>
          ) : null}
          {train.destStop && train.destStop.name !== train.destName && train.destStop.name !== train.nextStop?.name ? (
            <div><dt>End of line</dt><dd>{train.destStop.name}</dd></div>
          ) : null}
          {train.originStop ? (
            <div><dt>Trip origin</dt><dd>{train.originStop.name}</dd></div>
          ) : null}
          {train.tripStartTime ? (
            <div><dt>Trip started</dt><dd>{train.tripStartTime}</dd></div>
          ) : null}
          {train.delayMinutes != null && train.delayMinutes !== 0 ? (
            <div>
              <dt>Delay</dt>
              <dd>{train.delayMinutes > 0 ? `${train.delayMinutes} min late` : `${Math.abs(train.delayMinutes)} min early`}</dd>
            </div>
          ) : null}
          {train.occupancyLabel ? (
            <div>
              <dt>{occupancyDetailLabel(train.occupancyKind)}</dt>
              <dd>
                {formatOccupancyLine(train)?.value || train.occupancyLabel}
              </dd>
            </div>
          ) : null}
          {train.velocityMph != null && train.velocityMph > 0 ? (
            <div><dt>Speed</dt><dd>{train.velocityMph} mph</dd></div>
          ) : null}
          {heading ? (
            <div><dt>Heading</dt><dd>{heading}</dd></div>
          ) : null}
          {status ? (
            <div><dt>Status</dt><dd>{status}</dd></div>
          ) : null}
          {observed ? (
            <div><dt>Updated</dt><dd>{observed}</dd></div>
          ) : null}
          {train.distanceMiles != null ? (
            <div><dt>Distance</dt><dd>{train.distanceMiles.toFixed(1)} mi</dd></div>
          ) : null}
          {train.sourceLabel ? (
            <div><dt>Source</dt><dd>{train.sourceLabel}</dd></div>
          ) : null}
        </dl>
      </div>
    );
  }

  return (
    <div className="train-details">
      <strong>{trainLabel(train)} · {trainKindLabel(train)}</strong>
      {train.routeName && train.routeName !== train.trainNum ? (
        <div className="muted">{train.routeName}</div>
      ) : null}
      <dl className="detail-grid">
        {train.sourceLabel ? (
          <div><dt>Source</dt><dd>{train.sourceLabel}</dd></div>
        ) : null}
        {train.railroad ? (
          <div><dt>Railroad</dt><dd>{train.railroad}</dd></div>
        ) : null}
        {train.velocityMph != null && train.velocityMph > 0 ? (
          <div><dt>Speed</dt><dd>{train.velocityMph} mph</dd></div>
        ) : null}
        {heading ? (
          <div><dt>Heading</dt><dd>{heading}</dd></div>
        ) : null}
        {status ? (
          <div><dt>Status</dt><dd>{status}</dd></div>
        ) : null}
        {observed ? (
          <div><dt>Updated</dt><dd>{observed}</dd></div>
        ) : null}
        {train.distanceMiles != null ? (
          <div><dt>Distance</dt><dd>{train.distanceMiles.toFixed(1)} mi</dd></div>
        ) : null}
        {train.nextStop ? (
          <div><dt>Next stop</dt><dd>{train.nextStop.name} ({train.nextStop.status})</dd></div>
        ) : null}
      </dl>
      {train.trainKind === 'freight' || train.trainKind === 'crossing' ? (
        <FreightDreamState train={train} />
      ) : null}
    </div>
  );
}
