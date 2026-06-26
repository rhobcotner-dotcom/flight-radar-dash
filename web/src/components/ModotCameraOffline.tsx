import type { TrafficCamera } from '../lib/mapLayers';

interface Props {
  cam: TrafficCamera;
  href: string;
  checking?: boolean;
  onSkip?: () => void;
}

export function ModotCameraOffline({ cam, href, checking = false, onSkip }: Props) {
  return (
    <div className="camera-modot-offline">
      {checking ? (
        <p className="muted">Checking MoDOT stream CDN…</p>
      ) : (
        <>
          <p className="camera-modot-offline-title">MoDOT live CDN unreachable</p>
          <p className="camera-modot-offline-detail muted">
            The <code>sfs0X-traveler.modot.mo.gov</code> stream for this camera is not responding
            from your network right now (same URLs power the official Traveler map). This is a MoDOT
            infrastructure issue, not a misconfigured link in this app.
          </p>
        </>
      )}
      <a className="camera-preview-modot-fallback" href={href} target="_blank" rel="noreferrer">
        Open {cam.description} on MoDOT Traveler map ↗
      </a>
      {onSkip ? (
        <button type="button" className="btn-secondary camera-modot-offline-skip" onClick={onSkip}>
          Try next nearby camera
        </button>
      ) : null}
    </div>
  );
}
