import type { Train } from '../types';
import { trainKindLabel, trainLabel, trainRouteLabel } from '../lib/trainUtils';
import { FreightDreamState } from './FreightDreamState';

interface Props {
  train: Train;
  compact?: boolean;
}

function formatObserved(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function TrainDetails({ train, compact = false }: Props) {
  const observed = formatObserved(train.timely);
  const status =
    train.crossingStatus ||
    (train.trainState && train.trainState !== 'aprs' && train.trainState !== 'beacon' ? train.trainState : null);

  if (compact) {
    return (
      <div className="train-details compact">
        <strong>{trainLabel(train)}</strong>
        <div>{trainKindLabel(train)}{train.sourceLabel ? ` · ${train.sourceLabel}` : ''}</div>
        {train.routeName && train.routeName !== train.trainNum ? <div>{train.routeName}</div> : null}
        <div className="muted">{trainRouteLabel(train)}</div>
        {train.velocityMph != null ? <div>{train.velocityMph} mph</div> : null}
        {train.crossingStatus ? <div>{train.crossingStatus}</div> : null}
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
        {train.velocityMph != null ? (
          <div><dt>Speed</dt><dd>{train.velocityMph} mph</dd></div>
        ) : null}
        {train.heading != null && train.heading !== '' ? (
          <div><dt>Heading</dt><dd>{train.heading}°</dd></div>
        ) : null}
        {status ? (
          <div><dt>Status</dt><dd>{status}</dd></div>
        ) : null}
        {observed ? (
          <div><dt>Seen</dt><dd>{observed}</dd></div>
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
