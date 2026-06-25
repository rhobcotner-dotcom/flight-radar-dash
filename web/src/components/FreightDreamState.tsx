import { useEffect, useState } from 'react';
import type { Train } from '../types';

interface CarryingPayload {
  supported: boolean;
  primary?: { cargo: string; detail?: string | null };
  alt?: { cargo: string; detail?: string | null } | null;
  tagline?: string | null;
}

interface Props {
  train: Train;
}

export function FreightDreamState({ train }: Props) {
  const [state, setState] = useState<CarryingPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (train.trainKind !== 'freight' && train.trainKind !== 'crossing') {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    fetch('/api/trains/dream-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ train }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('unavailable');
        return res.json();
      })
      .then((payload: CarryingPayload) => {
        setState(payload);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        setLoading(false);
        setState({ supported: false });
      });

    return () => controller.abort();
  }, [train.trainId, train.trainKind, train.lat, train.lon, train.routeName]);

  if (train.trainKind !== 'freight' && train.trainKind !== 'crossing') return null;
  if (loading) return null;
  if (!state?.supported || !state.primary) return null;

  return (
    <section className="freight-carrying">
      <div className="freight-carrying-head">
        <span className="freight-carrying-label">Carrying</span>
        <strong className="freight-carrying-cargo">{state.primary.cargo}</strong>
      </div>
      {state.primary.detail ? (
        <div className="freight-carrying-detail">{state.primary.detail}</div>
      ) : null}
      {state.tagline ? <div className="freight-carrying-meta muted">{state.tagline}</div> : null}
      {state.alt ? (
        <div className="freight-carrying-alt muted">Also: {state.alt.cargo}</div>
      ) : null}
    </section>
  );
}
