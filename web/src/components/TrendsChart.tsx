import { useEffect, useState } from 'react';
import type { TrendSummary } from '../types';
import { PANEL_HELP } from '../lib/panelHelp';
import { PanelTip } from './PanelTip';

interface Props {
  hours?: number;
  reloadKey?: number;
}

export function TrendsChart({ hours = 24, reloadKey = 0 }: Props) {
  const [summary, setSummary] = useState<TrendSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/trends/summary?hours=${hours}`)
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Trends request failed (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [hours, reloadKey]);

  if (error) {
    return (
      <PanelTip tip={PANEL_HELP.trends} className="panel">
        <p className="error">{error}</p>
      </PanelTip>
    );
  }

  if (!summary || summary.snapshotCount === 0) {
    return (
      <PanelTip tip={PANEL_HELP.trends} className="panel">
        <div className="panel-header"><h2>Trends ({hours}h)</h2></div>
        <p className="empty">No snapshots yet. Click <strong>Refresh</strong> to load flights and record a trend point.</p>
      </PanelTip>
    );
  }

  const max = Math.max(...summary.points.map((p) => p.totalCount), 1);

  return (
    <PanelTip tip={PANEL_HELP.trends} className="panel">
      <div className="panel-header">
        <h2>Trends ({hours}h)</h2>
        <span className="muted">{summary.snapshotCount} snapshots</span>
      </div>
      <div className="trend-stats">
        <div><span>Avg</span><strong>{summary.avgCount}</strong></div>
        <div><span>Peak</span><strong>{summary.peakCount}</strong></div>
        <div><span>Peak hour</span><strong>{summary.peakHour ?? '—'}:00</strong></div>
        <div><span>Alerts logged</span><strong>{summary.alertCount}</strong></div>
      </div>
      <div className="sparkline" aria-label="Flight count over time">
        {summary.points.map((p) => (
          <div
            key={p.ts}
            className="spark-bar"
            style={{ height: `${Math.max(8, (p.totalCount / max) * 100)}%` }}
            title={`${p.ts}: ${p.totalCount} flights`}
          />
        ))}
      </div>
      <div className="category-grid">
        {Object.entries(summary.categoryTotals).map(([key, value]) => (
          <div key={key} className="category-chip">
            <span>{key.replace(/_/g, ' ')}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </PanelTip>
  );
}
