let audioCtx: AudioContext | null = null;
let chimeTimer: number | null = null;

function ctx() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

function playTone(freq: number, durationSec: number, gain = 0.04) {
  try {
    const ac = ctx();
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(ac.destination);
    osc.start();
    amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + durationSec);
    osc.stop(ac.currentTime + durationSec);
  } catch {
    /* audio blocked */
  }
}

export function unlockWindChimes() {
  try {
    void ctx().resume();
  } catch {
    /* ignore */
  }
}

export function startWindChimes(windMph: number | null | undefined, directionDeg: number | null | undefined) {
  stopWindChimes();
  const speed = Math.max(0, windMph ?? 0);
  if (speed < 3) return;

  const base = 220 + Math.min(speed, 30) * 8;
  const intervalMs = Math.max(400, 2800 - speed * 60);

  const tick = () => {
    const detune = (directionDeg ?? 180) / 360;
    playTone(base + detune * 90, 0.35, 0.025 + speed * 0.0008);
    if (speed > 12) playTone(base * 1.5, 0.2, 0.015);
  };

  tick();
  chimeTimer = window.setInterval(tick, intervalMs);
}

export function stopWindChimes() {
  if (chimeTimer != null) {
    window.clearInterval(chimeTimer);
    chimeTimer = null;
  }
}
