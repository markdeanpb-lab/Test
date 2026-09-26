// Period sound, synthesised with WebAudio (no samples to license): an engine voice per car era whose pitch
// follows the watched car through its gears, crowd murmur scaled by attendance, rain, and short cues for
// the start, flags and the chequered flag. Muted by default; created only after a user gesture.
import type { CarEra } from '../sim/types';

interface Voice { idle: number; max: number; gears: number; wave: OscillatorType; harm: number; rough: number; whine: number; turbo: number }
const VOICES: Record<CarEra, Voice> = {
  vintage: { idle: 28, max: 70, gears: 3, wave: 'sawtooth', harm: 1.5, rough: 0.55, whine: 0, turbo: 0 },
  streamliner: { idle: 36, max: 95, gears: 4, wave: 'sawtooth', harm: 2, rough: 0.4, whine: 0.04, turbo: 0 },
  frontengine: { idle: 45, max: 120, gears: 4, wave: 'sawtooth', harm: 2, rough: 0.3, whine: 0, turbo: 0 },
  cigar: { idle: 60, max: 165, gears: 5, wave: 'sawtooth', harm: 2, rough: 0.2, whine: 0, turbo: 0 },
  wedge: { idle: 70, max: 190, gears: 5, wave: 'sawtooth', harm: 2, rough: 0.15, whine: 0, turbo: 0 },
  groundeffect: { idle: 75, max: 200, gears: 5, wave: 'sawtooth', harm: 2, rough: 0.12, whine: 0, turbo: 0 },
  turbo: { idle: 70, max: 180, gears: 6, wave: 'square', harm: 2, rough: 0.15, whine: 0, turbo: 0.12 },
  raisednose: { idle: 110, max: 290, gears: 6, wave: 'sawtooth', harm: 2, rough: 0.08, whine: 0.02, turbo: 0 },
  aero: { idle: 120, max: 310, gears: 7, wave: 'sawtooth', harm: 2, rough: 0.06, whine: 0.03, turbo: 0 },
  hybrid: { idle: 85, max: 190, gears: 8, wave: 'square', harm: 1.5, rough: 0.08, whine: 0.08, turbo: 0.05 },
  future: { idle: 160, max: 900, gears: 1, wave: 'sine', harm: 2, rough: 0, whine: 0.18, turbo: 0 },
};

export type Cue = 'start' | 'finish' | 'sc' | 'red' | 'overtake';
export interface AudioFrame { playing: boolean; speed: number; carV: number; near: number; crowd: number; rain: number; era: CarEra }

export class RaceAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private eng!: { o1: OscillatorNode; o2: OscillatorNode; lfo: OscillatorNode; lfoGain: GainNode; filter: BiquadFilterNode; gain: GainNode; whine: OscillatorNode; whineGain: GainNode; turbo: OscillatorNode; turboGain: GainNode };
  private crowd!: { gain: GainNode; filter: BiquadFilterNode };
  private rain!: { gain: GainNode };
  private era: CarEra = 'vintage';
  enabled = false;
  volume = 0.6;

  /** Must be called from a user gesture the first time (browser autoplay rules). */
  setEnabled(on: boolean, volume: number) {
    this.enabled = on; this.volume = volume;
    if (on && !this.ctx) this.build();
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(on ? volume * 0.5 : 0, this.ctx.currentTime, 0.1);
  }
  resumeOnGesture() { if (this.enabled && this.ctx?.state === 'suspended') this.ctx.resume(); if (this.enabled && !this.ctx) this.build(); }

  private noise(seconds = 2): AudioBuffer {
    const ctx = this.ctx!; const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate); const d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // brown-ish noise
    return b;
  }
  private loop(buf: AudioBuffer, to: AudioNode) { const s = this.ctx!.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(to); s.start(); return s; }

  private build() {
    const Ctx: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = this.ctx = new Ctx();
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    // engine: two detuned oscillators through a low-pass, with a slow roughness LFO on the pitch
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 2;
    const gain = ctx.createGain(); gain.gain.value = 0; filter.connect(gain); gain.connect(this.master);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.connect(filter); o2.connect(filter);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lfoGain = ctx.createGain(); lfoGain.gain.value = 0; lfo.connect(lfoGain); lfoGain.connect(o1.frequency); lfoGain.connect(o2.frequency);
    const whine = ctx.createOscillator(); whine.type = 'sine'; const whineGain = ctx.createGain(); whineGain.gain.value = 0; whine.connect(whineGain); whineGain.connect(this.master);
    const turbo = ctx.createOscillator(); turbo.type = 'sine'; const turboGain = ctx.createGain(); turboGain.gain.value = 0; turbo.connect(turboGain); turboGain.connect(this.master);
    for (const o of [o1, o2, lfo, whine, turbo]) o.start();
    this.eng = { o1, o2, lfo, lfoGain, filter, gain, whine, whineGain, turbo, turboGain };
    // crowd: band-passed noise; rain: high-passed noise
    const nb = this.noise(3);
    const cf = ctx.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 700; cf.Q.value = 0.6;
    const cg = ctx.createGain(); cg.gain.value = 0; cf.connect(cg); cg.connect(this.master); this.loop(nb, cf);
    this.crowd = { gain: cg, filter: cf };
    const rf = ctx.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 2500;
    const rg = ctx.createGain(); rg.gain.value = 0; rf.connect(rg); rg.connect(this.master); this.loop(this.noise(2), rf);
    this.rain = { gain: rg };
    this.setEra(this.era, true);
  }

  setEra(era: CarEra, force = false) {
    if (era === this.era && !force) return;
    this.era = era;
    if (!this.ctx) return;
    const v = VOICES[era];
    this.eng.o1.type = v.wave; this.eng.o2.type = v.wave;
    this.eng.lfoGain.gain.value = v.rough * 6;
  }

  /** Called every frame with the watched car and the scene. Engines fade out when paused or at high playback speed. */
  update(f: AudioFrame) {
    if (!this.ctx || !this.enabled) return;
    this.setEra(f.era);
    const v = VOICES[this.era]; const t = this.ctx.currentTime; const e = this.eng;
    const frac = Math.max(0, Math.min(1, f.carV / 85));
    const gearPos = v.gears > 1 ? (frac * v.gears) % 1 : frac;
    const rpm = v.idle + (v.max - v.idle) * (v.gears > 1 ? 0.45 + 0.55 * gearPos : frac) * (0.6 + 0.4 * frac);
    const audible = f.playing && f.speed <= 2 ? 1 : 0;
    e.o1.frequency.setTargetAtTime(rpm, t, 0.05); e.o2.frequency.setTargetAtTime(rpm * v.harm * 1.003, t, 0.05);
    e.filter.frequency.setTargetAtTime(300 + rpm * 6 * (0.5 + f.near * 0.5), t, 0.08);
    e.gain.gain.setTargetAtTime(audible * (0.08 + 0.22 * f.near) * (0.4 + 0.6 * frac), t, 0.08);
    e.whine.frequency.setTargetAtTime(900 + frac * 2400, t, 0.05); e.whineGain.gain.setTargetAtTime(audible * v.whine * f.near * frac, t, 0.1);
    e.turbo.frequency.setTargetAtTime(2200 + frac * 3000, t, 0.2); e.turboGain.gain.setTargetAtTime(audible * v.turbo * 0.3 * f.near * frac, t, 0.3);
    this.crowd.gain.gain.setTargetAtTime((f.playing ? 1 : 0.4) * 0.12 * f.crowd, t, 0.4);
    this.rain.gain.gain.setTargetAtTime(Math.min(1, f.rain / 6) * 0.16, t, 0.5);
  }

  cue(kind: Cue) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const tone = (freq: number, at: number, dur: number, type: OscillatorType = 'sine', vol = 0.18) => {
      const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(vol, t + at + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + at + dur);
      o.connect(g); g.connect(this.master); o.start(t + at); o.stop(t + at + dur + 0.05);
    };
    if (kind === 'start') { tone(440, 0, 0.25, 'square', 0.08); tone(880, 0.35, 0.5, 'square', 0.1); }
    else if (kind === 'finish') { tone(1318, 0, 1.4); tone(1568, 0.12, 1.4); tone(2093, 0.24, 1.8); }
    else if (kind === 'sc' || kind === 'red') { tone(kind === 'red' ? 330 : 520, 0, 0.3, 'triangle', 0.12); tone(kind === 'red' ? 330 : 520, 0.4, 0.3, 'triangle', 0.12); }
    else if (kind === 'overtake') { const g = this.crowd.gain.gain; g.cancelScheduledValues(t); g.setTargetAtTime(0.2, t, 0.05); g.setTargetAtTime(0.06, t + 0.6, 0.6); }
  }
}
