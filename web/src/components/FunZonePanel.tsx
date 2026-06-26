import { funConfig } from '../lib/fun/funCalculations';
import { describePlaneOrUfo } from '../lib/fun/funGames';
import type { useFunMode } from '../hooks/useFunMode';
import { PanelTip } from './PanelTip';
import { FUN_TOGGLE_HELP, PANEL_HELP } from '../lib/panelHelp';

type FunMode = ReturnType<typeof useFunMode>;

interface Props {
  fun: FunMode;
}

function FunToggle({
  label,
  checked,
  onChange,
  tip,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  tip: string;
}) {
  return (
    <PanelTip tip={tip} className="fun-toggle-tip">
      <label className="fun-toggle">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{label}</span>
      </label>
    </PanelTip>
  );
}

export function FunZonePanel({ fun }: Props) {
  const {
    settings,
    setSetting,
    funStatus,
    moon,
    archShadow,
    tRavioli,
    meteor,
    disasterScore,
    disasterActive,
    werewolfActive,
    kpClass,
    rouletteTarget,
    planeOrUfo,
    planeOrUfoScore,
    guessPlaneOrUfo,
    startPlaneOrUfo,
    quakePoll,
    recordQuakePoll,
    issSatellite,
  } = fun;

  return (
    <div className="panel fun-zone-panel">
      <PanelTip tip={PANEL_HELP.funZone} className="fun-zone-header-tip">
        <div className="panel-header">
          <div>
            <h2>Fun zone</h2>
            <span className="muted">Loony layers, games, and STL absurdity — hover each toggle for details</span>
          </div>
        </div>
      </PanelTip>

      <div className="fun-stats-grid">
        <div className="fun-stat">
          <strong>Moon</strong>
          <span>{moon.label}{werewolfActive ? ' · WEREWOLF MODE' : ''}</span>
        </div>
        <div className="fun-stat">
          <strong>T-ravioli index</strong>
          <span>
            {tRavioli.score}/100 — {tRavioli.verdict}
          </span>
        </div>
        <div className="fun-stat">
          <strong>Arch shadow</strong>
          <span>{archShadow.message}</span>
        </div>
        {funStatus ? (
          <>
            <div className="fun-stat">
              <strong>Space weather</strong>
              <span>
                Kp {funStatus.spaceWeather.kp ?? '—'} · {funStatus.spaceWeather.mood}
                {settings.solarMoodRing ? ` · ring: ${kpClass}` : ''}
              </span>
            </div>
            <div className="fun-stat">
              <strong>Bird migration</strong>
              <span>{funStatus.birdMigration.message}</span>
            </div>
            <div className="fun-stat">
              <strong>Cardinals flyover</strong>
              <span>
                {(funStatus.cardinals.probability * 100).toFixed(0)}% vibes — {funStatus.cardinals.message}
              </span>
            </div>
          </>
        ) : null}
        <div className="fun-stat">
          <strong>Meteors</strong>
          <span>{meteor.message}</span>
        </div>
        {disasterActive ? (
          <div className="fun-stat fun-stat-disaster">
            <strong>DISASTER MOVIE MODE</strong>
            <span>Score {disasterScore} — UI has gone full 1996 action trailer.</span>
          </div>
        ) : null}
        {issSatellite ? (
          <div className="fun-stat">
            <strong>ISS</strong>
            <span>
              {issSatellite.elevationDeg.toFixed(0)}° elevation · {issSatellite.name}
            </span>
          </div>
        ) : null}
      </div>

      <div className="fun-toggles">
        <FunToggle
          label="ISS wave toasts"
          tip={FUN_TOGGLE_HELP.issWave}
          checked={settings.issWave}
          onChange={(v) => setSetting('issWave', v)}
        />
        <FunToggle
          label="Chemtrail satire"
          tip={FUN_TOGGLE_HELP.chemtrails}
          checked={settings.chemtrails}
          onChange={(v) => setSetting('chemtrails', v)}
        />
        <FunToggle
          label="Bird panic"
          tip={FUN_TOGGLE_HELP.birdPanic}
          checked={settings.birdPanic}
          onChange={(v) => setSetting('birdPanic', v)}
        />
        <FunToggle
          label="Werewolf full moon"
          tip={FUN_TOGGLE_HELP.werewolf}
          checked={settings.werewolf}
          onChange={(v) => setSetting('werewolf', v)}
        />
        <FunToggle
          label="Solar mood ring"
          tip={FUN_TOGGLE_HELP.solarMoodRing}
          checked={settings.solarMoodRing}
          onChange={(v) => setSetting('solarMoodRing', v)}
        />
        <FunToggle
          label="Disaster movie UI"
          tip={FUN_TOGGLE_HELP.disasterMovie}
          checked={settings.disasterMovie}
          onChange={(v) => setSetting('disasterMovie', v)}
        />
        <FunToggle
          label="River monster"
          tip={FUN_TOGGLE_HELP.monster}
          checked={settings.monster}
          onChange={(v) => setSetting('monster', v)}
        />
        <FunToggle
          label="Train horn fiction"
          tip={FUN_TOGGLE_HELP.trainHorns}
          checked={settings.trainHorns}
          onChange={(v) => setSetting('trainHorns', v)}
        />
        <FunToggle
          label="METAR wind chimes"
          tip={FUN_TOGGLE_HELP.windChimes}
          checked={settings.windChimes}
          onChange={(v) => setSetting('windChimes', v)}
        />
        <FunToggle
          label="Cat hearing mode"
          tip={FUN_TOGGLE_HELP.catMode}
          checked={settings.catMode}
          onChange={(v) => setSetting('catMode', v)}
        />
        <FunToggle
          label="Celebrity stalker"
          tip={FUN_TOGGLE_HELP.celebrityStalker}
          checked={settings.celebrityStalker}
          onChange={(v) => setSetting('celebrityStalker', v)}
        />
        <FunToggle
          label="Callsign roulette"
          tip={FUN_TOGGLE_HELP.roulette}
          checked={settings.roulette}
          onChange={(v) => setSetting('roulette', v)}
        />
        <FunToggle
          label="Treasure chart"
          tip={FUN_TOGGLE_HELP.radarNoir}
          checked={settings.radarNoir}
          onChange={(v) => setSetting('radarNoir', v)}
        />
      </div>

      <div className="fun-games">
        <section className="fun-game-block">
          <h3>Callsign roulette</h3>
          <p className="muted">
            Today&apos;s holy grail: <strong>{rouletteTarget}</strong>
          </p>
        </section>

        <section className="fun-game-block">
          <h3>Plane or UFO?</h3>
          <p className="muted">
            Score: {planeOrUfoScore.correct}/{planeOrUfoScore.total}
          </p>
          {planeOrUfo ? (
            <>
              <p>{describePlaneOrUfo(planeOrUfo.flight)}</p>
              <div className="fun-game-actions">
                <button type="button" className="btn-secondary" onClick={() => guessPlaneOrUfo('plane')}>
                  Plane
                </button>
                <button type="button" className="btn-secondary" onClick={() => guessPlaneOrUfo('balloon')}>
                  Balloon
                </button>
                <button type="button" className="btn-secondary" onClick={() => guessPlaneOrUfo('aliens')}>
                  Aliens
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn-secondary" onClick={startPlaneOrUfo}>
              Next blip
            </button>
          )}
        </section>

        <section className="fun-game-block">
          <h3>Earthquake poll</h3>
          <p className="muted">Did you feel the latest USGS event?</p>
          <div className="fun-game-actions">
            <button
              type="button"
              className={`btn-secondary${quakePoll === 'felt' ? ' btn-active' : ''}`}
              onClick={() => recordQuakePoll('felt')}
            >
              I felt nothing (liar)
            </button>
            <button
              type="button"
              className={`btn-secondary${quakePoll === 'nothing' ? ' btn-active' : ''}`}
              onClick={() => recordQuakePoll('nothing')}
            >
              Definitely nothing
            </button>
            <button
              type="button"
              className={`btn-secondary${quakePoll === 'dog' ? ' btn-active' : ''}`}
              onClick={() => recordQuakePoll('dog')}
            >
              My dog knew
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
