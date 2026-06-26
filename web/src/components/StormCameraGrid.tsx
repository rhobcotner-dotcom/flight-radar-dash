import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initialStormCameraSlots,
  nextStormCameraReplacement,
  STORM_CAM_LIMIT,
  stormCameraEmptyDetail,
  stormCameraEmptyLabel,
  type StormCamera,
  type StormCameraMode,
} from '../lib/stormCellCameras';
import { StormCameraTile } from './StormCameraTile';

interface Props {
  pool: StormCamera[];
  stormCameraMode?: StormCameraMode;
}

export function StormCameraGrid({ pool, stormCameraMode = 'live-only' }: Props) {
  const sortedPool = pool;
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [slots, setSlots] = useState<(StormCamera | null)[]>(() =>
    initialStormCameraSlots(sortedPool, STORM_CAM_LIMIT, stormCameraMode)
  );
  const poolKeyRef = useRef(sortedPool.map((cam) => cam.id).join('|'));
  const modeRef = useRef(stormCameraMode);
  modeRef.current = stormCameraMode;

  useEffect(() => {
    const poolKey = sortedPool.map((cam) => cam.id).join('|');
    if (poolKey === poolKeyRef.current && modeRef.current === stormCameraMode) return;
    poolKeyRef.current = poolKey;
    setFailedIds(new Set());
    setSlots(initialStormCameraSlots(sortedPool, STORM_CAM_LIMIT, stormCameraMode));
  }, [sortedPool, stormCameraMode]);

  const handleGiveUp = useCallback(
    (camId: string, slotIndex: number) => {
      setFailedIds((prevFailed) => {
        const failed = new Set(prevFailed);
        failed.add(camId);

        setSlots((current) => {
          const used = new Set(
            current.map((cam, index) => (index === slotIndex || !cam ? null : cam.id)).filter(Boolean) as string[]
          );
          used.add(camId);
          const replacement = nextStormCameraReplacement(sortedPool, failed, used, modeRef.current);
          const next = [...current];
          next[slotIndex] = replacement;
          return next;
        });

        return failed;
      });
    },
    [sortedPool]
  );

  const emptyLabel = stormCameraEmptyLabel(stormCameraMode);
  const emptyDetail = stormCameraEmptyDetail(stormCameraMode);

  if (!sortedPool.length) {
    return (
      <div className="storm-analysis-camera-grid">
        {Array.from({ length: STORM_CAM_LIMIT }, (_, index) => (
          <div key={`empty-${index}`} className="storm-analysis-cam">
            <div className="storm-analysis-cam-label muted">{emptyLabel}</div>
            <div className="storm-analysis-cam-video camera-preview-unavailable muted">
              {emptyDetail}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="storm-analysis-camera-grid">
      {Array.from({ length: STORM_CAM_LIMIT }, (_, slotIndex) => {
        const cam = slots[slotIndex];
        if (!cam) {
          return (
            <div key={`slot-empty-${slotIndex}`} className="storm-analysis-cam">
              <div className="storm-analysis-cam-label muted">{emptyLabel}</div>
              <div className="storm-analysis-cam-video camera-preview-unavailable muted">
                {emptyDetail}
              </div>
            </div>
          );
        }
        return (
          <StormCameraTile
            key={`${slotIndex}-${cam.id}`}
            cam={cam}
            onGiveUp={() => handleGiveUp(cam.id, slotIndex)}
          />
        );
      })}
    </div>
  );
}
