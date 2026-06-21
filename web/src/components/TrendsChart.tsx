import { useEffect, useState } from 'react';
import type { TrendSummary } from '../types';

interface Props {
  hours?: number;
}

export function TrendsChart({ hours = 24 }: Props) {
  const [summary, setSummary] = useState<TrendSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/trends/summary?hours=${hours}`)
      .then((res) => res.json())
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, [hours]);

  if (error) return <div className="panel"><p className="error">{error}</p></div>;

  if (!summary || summary.snapshotCount === 0) {
    return (
      <div className="panel">
        <div className="panel-header"><h2>Trends ({hours}h)</h2></div>
        <p className="empty">No snapshots yet. Run <code>npm run poll</code> every 5–15 minutes.</p>
      </div>
    );
  }

  const max = Math.max(...summary.points.map((p) => p.totalCount), 1);

  return (
    <div className="panel">
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
    </div>
  );
}
