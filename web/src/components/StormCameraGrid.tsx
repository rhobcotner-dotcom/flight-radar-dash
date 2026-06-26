import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initialStormCameraSlots,
  nextStormCameraReplacement,
  STORM_CAM_LIMIT,
  type StormCamera,
} from '../lib/stormCellCameras';
import { StormCameraTile } from './StormCameraTile';

interface Props {
  pool: StormCamera[];
}

export function StormCameraGrid({ pool }: Props) {
  const sortedPool = pool;
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [slots, setSlots] = useState<(StormCamera | null)[]>(() =>
    initialStormCameraSlots(sortedPool, STORM_CAM_LIMIT)
  );
  const poolKeyRef = useRef(sortedPool.map((cam) => cam.id).join('|'));

  useEffect(() => {
    const poolKey = sortedPool.map((cam) => cam.id).join('|');
    if (poolKey === poolKeyRef.current) return;
    poolKeyRef.current = poolKey;
    setFailedIds(new Set());
    setSlots(initialStormCameraSlots(sortedPool, STORM_CAM_LIMIT));
  }, [sortedPool]);

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
          const replacement = nextStormCameraReplacement(sortedPool, failed, used);
          const next = [...current];
          next[slotIndex] = replacement;
          return next;
        });

        return failed;
      });
    },
    [sortedPool]
  );

  if (!sortedPool.length) {
    return (
      <div className="storm-analysis-camera-grid">
        {Array.from({ length: STORM_CAM_LIMIT }, (_, index) => (
          <div key={`empty-${index}`} className="storm-analysis-cam">
            <div className="storm-analysis-cam-label muted">No nearby cameras</div>
            <div className="storm-analysis-cam-video camera-preview-unavailable muted">
              No working view in range
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
              <div className="storm-analysis-cam-label muted">No closer view</div>
              <div className="storm-analysis-cam-video camera-preview-unavailable muted">
                No working view in range
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
