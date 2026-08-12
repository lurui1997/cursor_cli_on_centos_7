export type SoundName =
  | 'place'
  | 'deny'
  | 'sell'
  | 'synth'
  | 'hit'
  | 'crit'
  | 'kill'
  | 'boss'
  | 'leak'
  | 'wave'
  | 'achievement'
  | 'victory'
  | 'defeat';

interface Tone {
  freq: number;
  at: number;
  dur: number;
  gain: number;
  type: OscillatorType;
  sweepTo?: number;
}

/** Minimum seconds between repeats, so rapid combat stays audible instead of buzzing. */
const THROTTLE: Partial<Record<SoundName, number>> = {
  hit: 0.05,
  crit: 0.07,
  kill: 0.04,
};

function toneSet(name: SoundName): Tone[] {
  switch (name) {
    case 'place':
      return [{ freq: 420, at: 0, dur: 0.12, gain: 0.22, type: 'triangle', sweepTo: 620 }];
    case 'deny':
      return [{ freq: 200, at: 0, dur: 0.16, gain: 0.2, type: 'square', sweepTo: 120 }];
    case 'sell':
      return [{ freq: 640, at: 0, dur: 0.14, gain: 0.18, type: 'triangle', sweepTo: 340 }];
    case 'synth':
      return [
        { freq: 523.25, at: 0, dur: 0.14, gain: 0.24, type: 'triangle' },
        { freq: 659.25, at: 0.08, dur: 0.14, gain: 0.24, type: 'triangle' },
        { freq: 783.99, at: 0.16, dur: 0.22, gain: 0.26, type: 'triangle' },
        { freq: 1046.5, at: 0.26, dur: 0.32, gain: 0.2, type: 'sine' },
      ];
    case 'hit':
      return [{ freq: 320, at: 0, dur: 0.05, gain: 0.09, type: 'square', sweepTo: 240 }];
    case 'crit':
      return [
        { freq: 880, at: 0, dur: 0.06, gain: 0.14, type: 'square' },
        { freq: 1320, at: 0.05, dur: 0.08, gain: 0.12, type: 'triangle' },
      ];
    case 'kill':
      return [{ freq: 300, at: 0, dur: 0.14, gain: 0.16, type: 'triangle', sweepTo: 90 }];
    case 'boss':
      return [
        { freq: 180, at: 0, dur: 0.5, gain: 0.3, type: 'sawtooth', sweepTo: 60 },
        { freq: 520, at: 0.1, dur: 0.4, gain: 0.18, type: 'triangle', sweepTo: 180 },
      ];
    case 'leak':
      return [{ freq: 260, at: 0, dur: 0.35, gain: 0.26, type: 'sawtooth', sweepTo: 90 }];
    case 'wave':
      return [
        { freq: 392, at: 0, dur: 0.14, gain: 0.2, type: 'triangle' },
        { freq: 587.33, at: 0.11, dur: 0.24, gain: 0.2, type: 'triangle' },
      ];
    case 'achievement':
      return [
        { freq: 659.25, at: 0, dur: 0.12, gain: 0.22, type: 'sine' },
        { freq: 830.61, at: 0.1, dur: 0.12, gain: 0.22, type: 'sine' },
        { freq: 1046.5, at: 0.2, dur: 0.34, gain: 0.24, type: 'sine' },
      ];
    case 'victory':
      return [
        { freq: 523.25, at: 0, dur: 0.18, gain: 0.24, type: 'triangle' },
        { freq: 659.25, at: 0.16, dur: 0.18, gain: 0.24, type: 'triangle' },
        { freq: 783.99, at: 0.32, dur: 0.18, gain: 0.24, type: 'triangle' },
        { freq: 1046.5, at: 0.48, dur: 0.6, gain: 0.26, type: 'sine' },
      ];
    case 'defeat':
      return [
        { freq: 392, at: 0, dur: 0.24, gain: 0.24, type: 'sawtooth' },
        { freq: 294, at: 0.2, dur: 0.28, gain: 0.24, type: 'sawtooth' },
        { freq: 196, at: 0.44, dur: 0.6, gain: 0.24, type: 'sawtooth', sweepTo: 110 },
      ];
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}

/**
 * Tiny synthesised SFX layer. Browsers block audio until a gesture, so the
 * context is created lazily on the first user-initiated `unlock()`.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private lastAt = new Map<SoundName, number>();
  private muted = false;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  play(name: SoundName, pitchScale = 1): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;

    const now = ctx.currentTime;
    const throttle = THROTTLE[name];
    if (throttle) {
      const last = this.lastAt.get(name) ?? -Infinity;
      if (now - last < throttle) return;
      this.lastAt.set(name, now);
    }

    for (const tone of toneSet(name)) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + tone.at;
      const end = start + tone.dur;

      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.freq * pitchScale, start);
      if (tone.sweepTo) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(40, tone.sweepTo * pitchScale), end);
      }

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(tone.gain, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
  }
}
