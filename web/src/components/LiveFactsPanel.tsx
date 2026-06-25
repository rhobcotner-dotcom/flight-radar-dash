import { PanelTip } from './PanelTip';
import { PANEL_HELP } from '../lib/panelHelp';
import type { LiveDashboardPayload } from '../lib/liveData';

interface Props {
  data: LiveDashboardPayload | null;
  error: string | null;
}

export function LiveFactsPanel({ data, error }: Props) {
  return (
    <PanelTip tip={PANEL_HELP.liveFacts} className="panel live-facts-panel panel-tip-wrap">
      <div className="panel-header">
        <div>
          <h2>Live facts</h2>
          <span className="muted">Grid, sports, FAA NAS, sky &amp; seasonal context</span>
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      {!data ? (
        <p className="muted">Loading live dashboard…</p>
      ) : (
        <div className="live-facts-grid">
          {data.miso ? (
            <div className="live-fact">
              <strong>MISO grid</strong>
              <span>
                {data.miso.totalMw.toLocaleString()} MW · Illinois hub ${data.miso.hubLmp ?? '—'}/MWh
              </span>
              <span className="muted">
                {data.miso.carbonLabel}
                {data.miso.fuels[0] ? ` · top fuel: ${data.miso.fuels[0].category}` : ''}
              </span>
            </div>
          ) : null}

          {data.sports ? (
            <div className="live-fact">
              <strong>Sports tonight</strong>
              {data.sports.tonight.length ? (
                data.sports.tonight.map((game) => (
                  <span key={`${game.league}-${game.startTime}`}>
                    {game.team} vs {game.opponent} ·{' '}
                    {new Date(game.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                ))
              ) : (
                <span className="muted">No Cardinals/Blues home game tonight</span>
              )}
              <span className="muted">{data.sports.trafficNote}</span>
            </div>
          ) : null}

          {data.nas ? (
            <div className="live-fact">
              <strong>FAA NAS status</strong>
              <span>{data.nas.summary}</span>
            </div>
          ) : null}

          <div className="live-fact">
            <strong>Aurora</strong>
            <span>{data.aurora.message}</span>
          </div>

          <div className="live-fact">
            <strong>Golden hour</strong>
            <span>
              {data.goldenHour.phase} · sunrise ~{data.goldenHour.sunriseApprox} · sunset ~
              {data.goldenHour.sunsetApprox}
            </span>
            <span className="muted">{data.goldenHour.milkyWayNote}</span>
          </div>

          <div className="live-fact">
            <strong>Drought at home</strong>
            <span>{data.drought.homeLabel}</span>
          </div>

          <div className="live-fact">
            <strong>Power outages</strong>
            <span className="muted">{data.outages.message}</span>
          </div>

          <div className="live-fact">
            <strong>PulsePoint / EMS</strong>
            <span className="muted">{data.pulsepoint.message}</span>
          </div>

          <div className="live-fact">
            <strong>Pollen</strong>
            <span className="muted">{data.pollen.message}</span>
          </div>
        </div>
      )}
    </PanelTip>
  );
}
