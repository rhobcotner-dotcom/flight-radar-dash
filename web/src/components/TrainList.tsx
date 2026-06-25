import type { Train } from '../types';
import type { useHighlight } from '../hooks/useHighlight';
import { PANEL_HELP } from '../lib/panelHelp';
import { PanelTip } from './PanelTip';
import { sortTrainsByDistance, trainKey, trainKindLabel, trainLabel, trainRouteLabel } from '../lib/trainUtils';

interface TrainCounts {
  total?: number;
  passenger?: number;
  freight?: number;
  crossing?: number;
  yard?: number;
  corridor?: number;
}

interface Props {
  lat: number;
  lon: number;
  trains: Train[];
  radiusMiles?: number | null;
  counts?: TrainCounts | null;
  coverage?: string | null;
  loading?: boolean;
  error?: string | null;
  highlightedId?: string | null;
  listHandlers: ReturnType<typeof useHighlight>['listHandlers'];
}

function countSummary(counts: TrainCounts | null | undefined, total: number) {
  if (!counts) return `${total} train${total === 1 ? '' : 's'}`;
  const parts = [
    counts.passenger ? `${counts.passenger} passenger` : null,
    counts.freight ? `${counts.freight} freight` : null,
    counts.crossing ? `${counts.crossing} crossing` : null,
    counts.yard ? `${counts.yard} yard` : null,
    counts.corridor ? `${counts.corridor} corridor` : null,
  ].filter(Boolean);
  if (!parts.length) return `${total} train${total === 1 ? '' : 's'}`;
  return parts.join(' · ');
}

export function TrainList({
  lat,
  lon,
  trains,
  radiusMiles,
  counts,
  coverage,
  loading,
  error,
  highlightedId,
  listHandlers,
}: Props) {
  const sorted = sortTrainsByDistance(trains, lat, lon);

  return (
    <PanelTip tip={PANEL_HELP.nearbyTrains} className="panel train-list-panel">
      <div className="panel-header">
        <h2>Nearby trains</h2>
        <span className="muted">
          {countSummary(counts, sorted.length)}{radiusMiles ? ` · ${radiusMiles} mi` : ''}
        </span>
      </div>
      <p className="train-list-intro muted">
        {coverage ||
          'Amtrak + MetroLink passenger, live freight/crossings, APRS rail, FRA yards/corridors. Refreshes every 10 seconds.'}
      </p>
      {error ? <p className="train-list-error">{error}</p> : null}
      {loading && sorted.length === 0 ? (
        <p className="empty">Loading trains…</p>
      ) : sorted.length === 0 ? (
        <p className="empty">No trains within range right now.</p>
      ) : (
        <ul className="nearby-flight-list train-list">
          {sorted.map((train, index) => {
            const id = trainKey(train);
            const active = highlightedId === id;
            return (
              <li
                key={id}
                className={active ? 'active track-list-item train-list-item' : 'track-list-item train-list-item'}
                {...listHandlers(id)}
              >
                <div className="nearby-flight-rank">{index + 1}</div>
                <div className="nearby-flight-body">
                  <div className="nearby-flight-top">
                    <strong>{trainLabel(train)}</strong>
                    <span>{train.distanceMiles?.toFixed(1)} mi</span>
                  </div>
                  <div className="nearby-carrier">
                    {trainKindLabel(train)}
                    {train.sourceLabel ? ` · ${train.sourceLabel}` : ''}
                    {train.routeName && train.trainKind !== 'crossing' ? ` · ${train.routeName}` : null}
                  </div>
                  <div className="muted">{trainRouteLabel(train)}</div>
                  <div className="nearby-flight-stats">
                    <span>{train.velocityMph ?? '—'} mph</span>
                    <span>{train.heading || '—'}</span>
                    <span>{train.crossingStatus || train.timely || train.trainState || '—'}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PanelTip>
  );
}
