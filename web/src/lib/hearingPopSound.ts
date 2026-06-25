let sharedContext: AudioContext | null = null;
let unlocked = false;

function getContext() {
  if (typeof window === 'undefined') return null;
  if (!sharedContext) {
    sharedContext = new AudioContext();
  }
  return sharedContext;
}

export function unlockHearingSound() {
  const context = getContext();
  if (!context || unlocked) return;

  if (context.state === 'suspended') {
    void context.resume();
  }

  const buffer = context.createBuffer(1, 1, 22050);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
  unlocked = true;
}

export async function playHearingPop() {
  const context = getContext();
  if (!context) return;

  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      return;
    }
  }

  const now = context.currentTime;
  const tone = context.createOscillator();
  const chime = context.createOscillator();
  const toneGain = context.createGain();
  const chimeGain = context.createGain();

  tone.type = 'sine';
  chime.type = 'sine';

  tone.frequency.setValueAtTime(392, now);
  tone.frequency.exponentialRampToValueAtTime(330, now + 0.18);

  chime.frequency.setValueAtTime(523.25, now);
  chime.frequency.exponentialRampToValueAtTime(440, now + 0.14);

  toneGain.gain.setValueAtTime(0.0001, now);
  toneGain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
  toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

  chimeGain.gain.setValueAtTime(0.0001, now);
  chimeGain.gain.exponentialRampToValueAtTime(0.045, now + 0.015);
  chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  tone.connect(toneGain);
  chime.connect(chimeGain);
  toneGain.connect(context.destination);
  chimeGain.connect(context.destination);

  tone.start(now);
  chime.start(now + 0.03);
  tone.stop(now + 0.3);
  chime.stop(now + 0.26);
}

export async function playMilitarySiren() {
  const context = getContext();
  if (!context) return;

  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      return;
    }
  }

  const now = context.currentTime;
  const cycle = 0.42;
  const bursts = 2;

  for (let i = 0; i < bursts; i += 1) {
    const start = now + i * (cycle * 2 + 0.12);
    playSirenWail(context, start, 880, 520, cycle);
    playSirenWail(context, start + cycle, 520, 880, cycle);
  }
}

function playSirenWail(
  context: AudioContext,
  start: number,
  fromHz: number,
  toHz: number,
  duration: number
) {
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(fromHz, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(toHz, 1), start + duration * 0.92);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.11, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}
