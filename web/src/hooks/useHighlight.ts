import { useCallback, useEffect, useRef, useState } from 'react';

const CLEAR_DELAY_MS = 140;

export type HighlightSource = 'map' | 'list';

export function useHighlight() {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const clearTimer = useRef<number | null>(null);

  const cancelPendingClear = useCallback(() => {
    if (clearTimer.current != null) {
      window.clearTimeout(clearTimer.current);
      clearTimer.current = null;
    }
  }, []);

  const setHighlight = useCallback(
    (id: string | null, _source: HighlightSource) => {
      cancelPendingClear();
      if (id) {
        setHighlightedId(id);
        return;
      }
      clearTimer.current = window.setTimeout(() => {
        setHighlightedId(null);
        clearTimer.current = null;
      }, CLEAR_DELAY_MS);
    },
    [cancelPendingClear]
  );

  const clearHighlightNow = useCallback(() => {
    cancelPendingClear();
    setHighlightedId(null);
  }, [cancelPendingClear]);

  useEffect(() => () => cancelPendingClear(), [cancelPendingClear]);

  const mapHandlers = useCallback(
    (id: string) => ({
      mouseover: () => setHighlight(id, 'map'),
      mouseout: () => setHighlight(null, 'map'),
    }),
    [setHighlight]
  );

  const listHandlers = useCallback(
    (id: string) => ({
      onPointerEnter: () => setHighlight(id, 'list'),
      onPointerLeave: () => setHighlight(null, 'list'),
    }),
    [setHighlight]
  );

  return {
    highlightedId,
    setHighlight,
    clearHighlightNow,
    mapHandlers,
    listHandlers,
  };
}
