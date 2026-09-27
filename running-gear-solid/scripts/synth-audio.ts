// Offline, deterministic soundtrack for RUNNING GEAR SOLID.
// Everything here is synthesised from scratch (oscillators + seeded noise):
// original music in a late-90s tactical-espionage mood, plus UI/SFX cues timed
// against the film schedule. Output: output/audio.wav and public/audio.wav.
//
//   npx tsx scripts/synth-audio.ts

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEDULE, DURATION } from '../src/cinematics/schedule';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SR = 44100;
const N = Math.ceil((DURATION + 1) * SR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const WL = new Float32Array(N); // reverb send
const WR = new Float32Array(N);
const S = Object.fromEntries(SCHEDULE.map((s) => [s.id, s.start])) as Record<string, number>;

// ---------------------------------------------------------------------------
// primitives
let seed = 1998;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

type Wave = 'sine' | 'square' | 'saw' | 'tri' | 'pulse' | 'noise';
function wave(w: Wave, ph: number, pw = 0.25) {
  const p = ph - Math.floor(ph);
  switch (w) {
    case 'sine': return Math.sin(p * Math.PI * 2);
    case 'square': return p < 0.5 ? 1 : -1;
    case 'pulse': return p < pw ? 1 : -1;
    case 'saw': return 2 * p - 1;
    case 'tri': return 1 - 4 * Math.abs(p - 0.5);
    case 'noise': return rnd() * 2 - 1;
  }
}

interface NoteOpts {
  wave?: Wave;
  amp?: number;
  a?: number;
  d?: number;
  s?: number;
  r?: number;
  pan?: number; // -1..1
  lp?: number; // low-pass cutoff (Hz)
  lpEnv?: number; // extra cutoff at attack peak, decays with d
  hp?: number;
  glide?: number; // end frequency multiplier (exp sweep over the note)
  vib?: number;
  detune?: number; // cents for a second voice
  drive?: number;
  wet?: number;
  pw?: number;
}

function note(t0: number, dur: number, f: number, o: NoteOpts = {}) {
  const w = o.wave ?? 'square';
  const amp = o.amp ?? 0.2, a = o.a ?? 0.005, d = o.d ?? 0.1, s = o.s ?? 0.7, r = o.r ?? 0.08;
  const pan = o.pan ?? 0, wet = o.wet ?? 0.2;
  const gl = Math.cos(((pan + 1) * Math.PI) / 4), gr = Math.sin(((pan + 1) * Math.PI) / 4);
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const len = Math.floor((dur + r) * SR);
  let ph = rnd(), ph2 = rnd(), lpS = 0, hpS = 0, hpPrev = 0;
  const det = o.detune ? Math.pow(2, o.detune / 1200) : 0;
  for (let k = 0; k < len && i0 + k < N; k++) {
    const t = k / SR;
    let env: number;
    if (t < a) env = t / a;
    else if (t < a + d) env = 1 - (1 - s) * ((t - a) / d);
    else if (t < dur) env = s;
    else env = s * (1 - (t - dur) / r);
    if (env <= 0) continue;
    const fm = o.glide ? Math.pow(o.glide, clamp(t / dur)) : 1;
    const vib = o.vib ? 1 + o.vib * Math.sin(t * 2 * Math.PI * 5.5) : 1;
    const fr = f * fm * vib;
    ph += fr / SR;
    let x = wave(w, ph, o.pw);
    if (det) {
      ph2 += (fr * det) / SR;
      x = 0.6 * x + 0.6 * wave(w, ph2, o.pw);
    }
    if (o.lp) {
      const cut = o.lp + (o.lpEnv ?? 0) * Math.max(0, 1 - t / (a + d));
      const c = 1 - Math.exp((-2 * Math.PI * Math.min(cut, SR * 0.45)) / SR);
      lpS += c * (x - lpS);
      x = lpS;
    }
    if (o.hp) {
      const c = Math.exp((-2 * Math.PI * o.hp) / SR);
      hpS = c * (hpS + x - hpPrev);
      hpPrev = x;
      x = hpS;
    }
    if (o.drive) x = Math.tanh(x * o.drive) / Math.tanh(o.drive);
    const v = x * env * amp;
    L[i0 + k] += v * gl;
    R[i0 + k] += v * gr;
    WL[i0 + k] += v * gl * wet;
    WR[i0 + k] += v * gr * wet;
  }
}

// ---------------------------------------------------------------------------
// instruments
const kick = (t: number, amp = 0.9) => note(t, 0.28, 130, { wave: 'sine', amp, a: 0.001, d: 0.25, s: 0, r: 0.02, glide: 0.3, wet: 0.05 });
const snare = (t: number, amp = 0.35) => {
  note(t, 0.18, 1, { wave: 'noise', amp, a: 0.001, d: 0.16, s: 0, r: 0.02, lp: 7000, hp: 900, wet: 0.25 });
  note(t, 0.1, 190, { wave: 'tri', amp: amp * 0.6, a: 0.001, d: 0.09, s: 0, glide: 0.7 });
};
const hat = (t: number, amp = 0.09, open = false) => note(t, open ? 0.18 : 0.04, 1, { wave: 'noise', amp, a: 0.001, d: open ? 0.17 : 0.035, s: 0, r: 0.01, hp: 7000, wet: 0.08, pan: 0.3 });
const tom = (t: number, f = 90, amp = 0.6) => note(t, 0.4, f, { wave: 'sine', amp, a: 0.002, d: 0.38, s: 0, glide: 0.55, wet: 0.3 });
const bass = (t: number, m: number, dur: number, amp = 0.28) => note(t, dur, mtof(m), { wave: 'saw', amp, a: 0.004, d: 0.15, s: 0.5, r: 0.05, lp: 380, lpEnv: 900, drive: 1.5, wet: 0.05 });
const pad = (t: number, ms: number[], dur: number, amp = 0.06, lp = 1400) =>
  ms.forEach((m, i) => note(t, dur, mtof(m), { wave: 'saw', amp, a: 0.8, d: 0.5, s: 0.8, r: 1.2, lp, detune: 9, pan: (i - 1) * 0.4, wet: 0.5 }));
const pluck = (t: number, m: number, amp = 0.12, pan = 0) => note(t, 0.25, mtof(m), { wave: 'pulse', pw: 0.3, amp, a: 0.002, d: 0.2, s: 0.1, r: 0.15, lp: 2400, lpEnv: 2500, pan, wet: 0.35 });
const lead = (t: number, m: number, dur: number, amp = 0.1) => note(t, dur, mtof(m), { wave: 'square', amp, a: 0.01, d: 0.1, s: 0.8, r: 0.12, lp: 3200, vib: 0.006, wet: 0.35, pan: -0.1 });
const bell = (t: number, m: number, amp = 0.1) => {
  note(t, 1.2, mtof(m), { wave: 'sine', amp, a: 0.002, d: 1.1, s: 0, r: 0.4, wet: 0.5 });
  note(t, 0.6, mtof(m + 19), { wave: 'sine', amp: amp * 0.35, a: 0.002, d: 0.5, s: 0, r: 0.2, wet: 0.5 });
};
const piano = (t: number, m: number, amp = 0.12) => {
  note(t, 1.6, mtof(m), { wave: 'tri', amp, a: 0.003, d: 1.4, s: 0.05, r: 0.5, lp: 2200, lpEnv: 2000, wet: 0.45 });
  note(t, 1.0, mtof(m + 12), { wave: 'sine', amp: amp * 0.25, a: 0.003, d: 0.9, s: 0, r: 0.3, wet: 0.45 });
};

// sfx
const boom = (t: number, amp = 0.9) => {
  note(t, 1.6, 70, { wave: 'sine', amp, a: 0.002, d: 1.5, s: 0, glide: 0.35, wet: 0.4 });
  note(t, 1.2, 1, { wave: 'noise', amp: amp * 0.5, a: 0.002, d: 1.1, s: 0, lp: 400, wet: 0.5 });
};
const hit = (t: number, amp = 0.7) => {
  boom(t, amp);
  note(t, 0.5, 1, { wave: 'noise', amp: amp * 0.4, a: 0.001, d: 0.45, s: 0, hp: 2500, wet: 0.6 });
  [50, 57, 62].forEach((m) => note(t, 1.4, mtof(m), { wave: 'saw', amp: amp * 0.12, a: 0.002, d: 1.3, s: 0, lp: 1800, detune: 12, wet: 0.6 }));
};
const riser = (t: number, dur: number, amp = 0.25) => {
  for (let k = 0; k < 12; k++) {
    const tt = t + (k / 12) * dur;
    note(tt, dur / 12 + 0.05, 1, { wave: 'noise', amp: amp * (k / 12), a: 0.01, d: 0.05, s: 1, r: 0.05, lp: 400 + k * 600, wet: 0.4 });
  }
  note(t, dur, 110, { wave: 'saw', amp: amp * 0.3, a: dur * 0.8, d: 0.1, s: 1, r: 0.1, glide: 4, lp: 3000, wet: 0.4 });
};
const whoosh = (t: number, amp = 0.3) => note(t, 0.6, 1, { wave: 'noise', amp, a: 0.25, d: 0.3, s: 0, lp: 2500, wet: 0.4 });
const beep = (t: number, f = 1200, amp = 0.08, dur = 0.06) => note(t, dur, f, { wave: 'square', amp, a: 0.001, d: 0.01, s: 1, r: 0.01, lp: 5000, wet: 0.1 });
const tick = (t: number, amp = 0.05) => note(t, 0.012, 1, { wave: 'noise', amp, a: 0.0005, d: 0.01, s: 0, hp: 3000, wet: 0.05 });
const typing = (t0: number, t1: number, rate = 26, amp = 0.04) => {
  for (let t = t0; t < t1; t += 1 / rate) tick(t + rnd() * 0.01, amp * (0.7 + 0.6 * rnd()));
};
const staticBurst = (t: number, dur: number, amp = 0.12) => note(t, dur, 1, { wave: 'noise', amp, a: 0.005, d: 0.02, s: 1, r: 0.05, hp: 1500, wet: 0.05 });
const codecRing = (t: number, open: number) => {
  for (let x = t; x < open - 0.05; x += 0.25) {
    beep(x, 1760, 0.07, 0.07);
    beep(x + 0.09, 1320, 0.07, 0.07);
  }
  staticBurst(open, 0.2, 0.1);
  beep(open + 0.2, 880, 0.06, 0.05);
};
const codecLines = (t0: number, lines: [number, number][]) => {
  // [at, chars] -> a soft blip per character at 34 chars/s
  for (const [at, n] of lines) for (let i = 0; i < n; i += 2) beep(t0 + at + i / 34, 600 + (i % 6) * 40, 0.018, 0.02);
};
const crowd = (t: number, dur: number, amp = 0.05) => {
  for (let k = 0; k < dur; k += 0.5) note(t + k, 0.6, 1, { wave: 'noise', amp: amp * (0.6 + 0.4 * rnd()), a: 0.2, d: 0.1, s: 1, r: 0.3, lp: 1400, hp: 300, wet: 0.3, pan: rnd() * 1.4 - 0.7 });
};
const wind = (t: number, dur: number, amp = 0.08) => {
  for (let k = 0; k < dur; k += 0.4) note(t + k, 0.5, 1, { wave: 'noise', amp: amp * (0.5 + 0.5 * Math.sin(k * 1.3) ** 2), a: 0.2, d: 0.1, s: 1, r: 0.3, lp: 500 + 300 * Math.sin(k), wet: 0.2 });
};
const heartbeat = (t: number, amp = 0.5) => {
  note(t, 0.12, 55, { wave: 'sine', amp, a: 0.002, d: 0.11, s: 0, glide: 0.7, wet: 0.1 });
  note(t + 0.18, 0.12, 50, { wave: 'sine', amp: amp * 0.7, a: 0.002, d: 0.11, s: 0, glide: 0.7, wet: 0.1 });
};
const siren = (t: number, dur: number, amp = 0.07) => {
  for (let k = 0; k < dur; k += 0.5) note(t + k, 0.48, k % 1 < 0.5 ? 740 : 988, { wave: 'square', amp, a: 0.01, d: 0.01, s: 1, r: 0.02, lp: 2500, wet: 0.4, pan: Math.sin(k) * 0.6 });
};
const rumble = (t: number, dur: number, amp = 0.35) => note(t, dur, 1, { wave: 'noise', amp, a: 0.3, d: 0.1, s: 1, r: 0.8, lp: 180, wet: 0.3 });
const shatter = (t: number, amp = 0.5) => {
  note(t, 0.8, 1, { wave: 'noise', amp, a: 0.001, d: 0.7, s: 0, hp: 3000, wet: 0.6 });
  for (let k = 0; k < 14; k++) note(t + rnd() * 0.5, 0.2, 2000 + rnd() * 3000, { wave: 'sine', amp: amp * 0.15, a: 0.001, d: 0.18, s: 0, wet: 0.6, pan: rnd() * 2 - 1 });
};
const clank = (t: number, amp = 0.3) => {
  note(t, 0.3, 180 + rnd() * 60, { wave: 'square', amp: amp * 0.3, a: 0.001, d: 0.25, s: 0, lp: 1200, wet: 0.4 });
  note(t, 0.2, 1, { wave: 'noise', amp, a: 0.001, d: 0.18, s: 0, lp: 2500, hp: 200, wet: 0.4 });
};
const brick = (t: number, amp = 0.12) => note(t, 0.08, 300 + rnd() * 200, { wave: 'noise', amp, a: 0.001, d: 0.07, s: 0, lp: 1800, hp: 150, wet: 0.2, pan: rnd() - 0.5 });
const jingle = (t: number, happy = true) => {
  const seqn = happy ? [62, 66, 69, 74, 78, 81] : [62, 65, 69, 74, 72, 69];
  seqn.forEach((m, i) => lead(t + i * 0.09, m, 0.12, 0.08));
  pad(t + 0.54, happy ? [62, 66, 69, 74] : [62, 65, 69, 74], 1.4, 0.06, 2600);
};

// ---------------------------------------------------------------------------
// patterns
function loop(t0: number, t1: number, bpm: number, stepsPerBeat: number, fn: (i: number, t: number, step: number) => void) {
  const step = 60 / bpm / stepsPerBeat;
  for (let i = 0, t = t0; t < t1 - 1e-6; i++, t = t0 + i * step) fn(i, t, step);
}
const Dm = [50, 53, 57], Bb = [46, 50, 53], C = [48, 52, 55], Am = [45, 48, 52], Gm = [43, 46, 50], F = [41, 45, 48], A = [45, 49, 52], D = [50, 54, 57];
const THEME = [62, 65, 69, 67, 65, 64, 62, 57]; // original motif

function drums(t0: number, t1: number, bpm: number, style: 'drive' | 'half' | 'four' | 'sparse', amp = 1) {
  loop(t0, t1, bpm, 4, (i, t) => {
    const s = i % 16;
    if (style === 'four') {
      if (s % 4 === 0) kick(t, 0.8 * amp);
      if (s === 4 || s === 12) snare(t, 0.28 * amp);
      if (s % 2 === 1) hat(t, 0.06 * amp);
    } else if (style === 'drive') {
      if (s === 0 || s === 6 || s === 8 || s === 11) kick(t, 0.85 * amp);
      if (s === 4 || s === 12) snare(t, 0.32 * amp);
      hat(t, (s % 2 ? 0.05 : 0.08) * amp, s === 14);
    } else if (style === 'half') {
      if (s === 0 || s === 10) kick(t, 0.8 * amp);
      if (s === 8) snare(t, 0.35 * amp);
      if (s % 4 === 2) hat(t, 0.05 * amp);
    } else {
      if (s === 0) kick(t, 0.7 * amp);
      if (s === 8) tom(t, 80, 0.4 * amp);
    }
  });
}
function bassline(t0: number, t1: number, bpm: number, roots: number[], per = 8, amp = 0.26, pattern = [1, 0, 1, 1, 0, 1, 1, 0]) {
  loop(t0, t1, bpm, 2, (i, t, st) => {
    const root = roots[Math.floor(i / per) % roots.length];
    if (pattern[i % pattern.length]) bass(t, root - 12 + (i % 8 === 7 ? 12 : 0), st * 0.8, amp);
  });
}
function arp(t0: number, t1: number, bpm: number, chords: number[][], per = 16, amp = 0.07, oct = 24) {
  loop(t0, t1, bpm, 4, (i, t) => {
    const ch = chords[Math.floor(i / per) % chords.length];
    pluck(t, ch[i % 3] + oct + (i % 6 === 5 ? 12 : 0), amp, ((i % 4) - 1.5) * 0.3);
  });
}
function pads(t0: number, t1: number, chords: number[][], dur: number, amp = 0.05, lp = 1400) {
  for (let t = t0, k = 0; t < t1 - 0.2; t += dur, k++) pad(t, chords[k % chords.length].map((m) => m + 12), Math.min(dur, t1 - t), amp, lp);
}
function theme(t0: number, beat: number, oct = 0, amp = 0.09, rhythm = [1, 1, 2, 1, 1, 1, 1, 4]) {
  let t = t0;
  THEME.forEach((m, i) => {
    lead(t, m + oct, rhythm[i] * beat * 0.92, amp);
    t += rhythm[i] * beat;
  });
  return t;
}

// ---------------------------------------------------------------------------
// the score

// COLD OPEN: empty city, CCTV hum, a first slow statement of the motif
{
  const t = S.coldOpen;
  typing(t + 0.3, t + 3.6, 22, 0.05);
  note(t + 3.5, 9.5, 60, { wave: 'sine', amp: 0.03, a: 0.5, d: 0.1, s: 1, r: 0.5, wet: 0 }); // mains hum
  wind(t + 3.4, 9.6, 0.05);
  pads(t + 3.5, t + 13, [Dm, Bb], 4.5, 0.035, 900);
  [0, 1, 2, 3].forEach((k) => piano(t + 5 + k * 1.1, THEME[k] - 12, 0.08));
  beep(t + 4.0, 1600, 0.03, 0.03); // REC
  piano(t + 10.6, 57, 0.07);
  piano(t + 11.4, 62, 0.07);
}

// TITLE: logo assembly, main theme, PRESS START
{
  const t = S.title;
  riser(t + 0.2, 1.6, 0.2);
  hit(t + 2.2, 0.8);
  pads(t + 2.2, t + 10, [Dm, Bb, C, Am], 2.0, 0.05, 1600);
  bassline(t + 2.2, t + 8.2, 100, [50, 46, 48, 45], 4, 0.2);
  drums(t + 4.6, t + 8.2, 100, 'half', 0.8);
  theme(t + 4.6, 0.3, 0, 0.08);
  for (let x = t + 5.2; x < t + 8.2; x += 0.6) beep(x, 980, 0.02, 0.03);
  beep(t + 8.25, 1500, 0.1, 0.12);
  hit(t + 8.25, 0.4);
  beep(t + 9.0, 900, 0.05, 0.04);
}

// BASIC TRAINING: upbeat drill groove
{
  const t = S.training;
  typing(t + 0.2, t + 2.2, 20, 0.04);
  const bpm = 120;
  drums(t + 2.6, t + 15.6, bpm, 'four', 0.8);
  bassline(t + 2.6, t + 15.6, bpm, [50, 48, 46, 48], 8, 0.22);
  arp(t + 2.6, t + 15.6, bpm, [Dm, C, Bb, C], 16, 0.05);
  theme(t + 8.6, 0.25, 12, 0.06);
  [2.8, 3.3, 3.8].forEach((k) => beep(t + k + 3, 1200, 0.03, 0.04));
}

// CODECS
function codec(t: number, open: number, lines: [number, number][]) {
  codecRing(t, t + open);
  codecLines(t, lines);
  note(t + open, 5, 55, { wave: 'sine', amp: 0.025, a: 0.3, d: 0.1, s: 1, r: 0.5, wet: 0 });
  pad(t + open, [50, 57, 62], 5.2, 0.03, 700);
}
codec(S.hingeBrief, 0.8, [[1.1, 56], [3.2, 25], [4.7, 34]]);
codec(S.richmondBrief, 0.6, [[0.9, 44], [2.7, 34], [4.2, 31]]);
codec(S.shingles, 0.6, [[0.9, 27], [2.4, 22], [3.8, 38], [5.9, 3]]);

// HINGE: night half marathon, a hydraulic knee in pursuit
{
  const t = S.hinge;
  crowd(t, 22, 0.035);
  pads(t, t + 3.4, [Dm], 3.4, 0.04, 700);
  clank(t + 1.2, 0.25);
  clank(t + 2.3, 0.3);
  hit(t + 3.4, 0.8);
  const bpm = 132;
  drums(t + 5.5, t + 18, bpm, 'drive', 0.9);
  bassline(t + 5.5, t + 18, bpm, [50, 50, 46, 48], 8, 0.26, [1, 1, 0, 1, 1, 0, 1, 1]);
  loop(t + 5.5, t + 18, bpm / 2, 1, (i, x) => clank(x + 0.05, 0.12)); // piston
  pads(t + 5.5, t + 18, [Dm, Bb, Gm, A], 1.82, 0.035, 1200);
  theme(t + 9.2, 0.227, 0, 0.07);
  loop(t + 15.5, t + 17, 8, 1, (i, x) => beep(x, 880, 0.05, 0.2)); // knee alarm
  jingle(t + 18.2, true);
  pads(t + 19.6, t + 22, [D], 2.4, 0.04, 1800);
}

// DOUBLE ZERO: a clock that will not go below 20:00
{
  const t = S.doubleZero;
  typing(t + 0.3, t + 2.4, 18, 0.04);
  wind(t + 3, 11.5, 0.09);
  rumble(t + 3.6, 2.2, 0.25);
  hit(t + 5.9, 0.8);
  const bpm = 128;
  loop(t + 3, t + 14.5, 1, 1, (i, x) => tick(x, 0.06)); // the clock
  drums(t + 8, t + 14.5, bpm, 'drive', 0.85);
  bassline(t + 8, t + 14.5, bpm, [50, 46, 48, 45], 8, 0.24);
  arp(t + 8, t + 14.5, bpm, [Dm, Bb, C, Am], 16, 0.05);
  // freeze at exactly 20:00
  boom(t + 14.6, 0.7);
  beep(t + 14.6, 440, 0.08, 0.6);
  pads(t + 14.8, t + 18, [Gm, A], 1.6, 0.04, 800);
  // round 2: the chain of 20:xx, then 19:25
  riser(t + 16.4, 1.6, 0.18);
  drums(t + 18, t + 24, bpm, 'four', 0.9);
  bassline(t + 18, t + 24, bpm, [50, 48, 46, 45], 8, 0.25);
  theme(t + 18.9, 0.234, 12, 0.06);
  shatter(t + 24.1, 0.55);
  jingle(t + 24.3, true);
  pads(t + 25.2, t + 27, [D], 1.8, 0.04, 1800);
}

// PHANTOM 1: chased by a 1:30 ghost - and losing it
{
  const t = S.phantom1;
  crowd(t, 8.2, 0.03);
  hit(t + 0.3, 0.6);
  const bpm = 140;
  drums(t + 2.6, t + 8.2, bpm, 'drive', 0.8);
  bassline(t + 2.6, t + 8.2, bpm, [50, 48, 46, 45], 8, 0.22);
  loop(t + 2.6, t + 8.2, bpm, 2, (i, x) => note(x, 0.2, mtof([74, 77, 81, 79][i % 4]), { wave: 'sine', amp: 0.035, a: 0.02, d: 0.1, s: 0.5, r: 0.2, vib: 0.02, wet: 0.7 }));
  pads(t + 8.2, t + 12, [Gm, Dm], 1.9, 0.045, 900);
  piano(t + 8.4, 57, 0.09);
  piano(t + 8.9, 53, 0.09);
  piano(t + 9.4, 50, 0.1);
  typing(t + 10.2, t + 11.6, 20, 0.03);
}

// FURNACE: Richmond, the day the course burned
{
  const t = S.furnace;
  for (let x = t + 0.4; x < t + 3.2; x += 0.35) beep(x, 1400, 0.03, 0.03);
  whoosh(t + 2.9, 0.35);
  staticBurst(t + 3.05, 0.35, 0.12);
  const bpm = 124;
  drums(t + 3.4, t + 9.2, bpm, 'four', 0.7);
  bassline(t + 3.4, t + 9.2, bpm, [50, 53, 48, 46], 8, 0.2);
  arp(t + 3.4, t + 9.2, bpm, [Dm, F, C, Bb], 16, 0.045);
  // the plant wakes
  rumble(t + 9.2, 4, 0.2);
  riser(t + 9.3, 1.6, 0.18);
  hit(t + 10.9, 0.85);
  // meltdown: detuned, heavier, slower
  drums(t + 13.4, t + 19, 112, 'half', 0.9);
  bassline(t + 13.4, t + 19, 112, [50, 49, 48, 47], 8, 0.28);
  loop(t + 13.4, t + 19, 112, 1, (i, x) => note(x, 0.5, mtof(62 + (i % 2)), { wave: 'saw', amp: 0.035, a: 0.05, d: 0.2, s: 0.6, r: 0.2, lp: 1600, detune: 35, wet: 0.4 }));
  // evacuation
  siren(t + 19, 5.2, 0.05);
  drums(t + 19, t + 24.2, 150, 'drive', 0.9);
  bassline(t + 19, t + 24.2, 150, [50, 50, 48, 46], 8, 0.25);
  loop(t + 22.2, t + 23.9, 20, 1, (i, x) => clank(x, 0.12)); // shutters
  boom(t + 23.9, 0.6);
  jingle(t + 24.3, false);
  pads(t + 25.6, t + 29, [Dm, Bb], 1.7, 0.04, 1200);
  typing(t + 25.9, t + 27.8, 16, 0.03);
}

// THE CLAW: Highgate, five fingers
{
  const t = S.claw;
  wind(t, 17, 0.06);
  pads(t, t + 13.5, [[38, 45, 50], [37, 44, 49]], 3.4, 0.045, 700);
  loop(t + 1.8, t + 3.3, 6, 1, (i, x) => beep(x, 330 + i * 40, 0.03, 0.08)); // knuckle lights
  hit(t + 3.0, 0.8);
  const bpm = 110;
  loop(t + 5.2, t + 13.5, bpm, 2, (i, x) => {
    const s = i % 8;
    if (s === 0 || s === 3 || s === 6) tom(x, 70, 0.55);
    if (s === 4) tom(x, 110, 0.35);
    if (s % 2 === 1) hat(x, 0.04);
  });
  bassline(t + 5.2, t + 13.5, bpm, [38, 38, 41, 36], 8, 0.24, [1, 0, 0, 1, 0, 0, 1, 0]);
  [7.7, 10.0, 11.7, 12.5, 13.45].forEach((c) => {
    bell(t + c, 74, 0.07);
    clank(t + c + 0.2, 0.2);
  });
  rumble(t + 13.5, 2, 0.35);
  jingle(t + 14.2, true);
}

// PHANTOM 2: the same ghost, one year later - chased down
{
  const t = S.phantom2;
  loop(t + 0.2, t + 2.2, 2, 1, (i, x) => beep(x, 2000, 0.05, 0.05)); // watch
  riser(t + 1.2, 1.2, 0.2);
  whoosh(t + 2.3, 0.4);
  hit(t + 3.6, 0.7);
  const bpm = 140;
  drums(t + 6, t + 16, bpm, 'drive', 0.9);
  bassline(t + 6, t + 16, bpm, [50, 46, 48, 45], 8, 0.25);
  arp(t + 6, t + 16, bpm, [D, Bb.map((m) => m + 0), C, A], 16, 0.045);
  theme(t + 8.8, 0.214, 12, 0.07);
  theme(t + 12.2, 0.214, 12, 0.07, [1, 1, 1, 1, 1, 1, 1, 6]);
  shatter(t + 16.1, 0.4);
  jingle(t + 16.3, true);
  // peak form montage
  drums(t + 19, t + 22.8, 128, 'four', 0.7);
  bassline(t + 19, t + 22.8, 128, [50, 55, 57, 55], 8, 0.2);
  arp(t + 19, t + 22.8, 128, [D, [55, 59, 62], A, [55, 59, 62]], 8, 0.05);
}

// SETBACK: sore ankles, stress reaction, cancelled
{
  const t = S.setback;
  beep(t + 0.3, 900, 0.04, 0.04);
  [1.0, 1.8].forEach((k) => beep(t + k, 520, 0.05, 0.15));
  staticBurst(t + 2.8, 0.3, 0.1);
  note(t + 3.0, 4, 110, { wave: 'sine', amp: 0.04, a: 0.3, d: 0.1, s: 1, r: 0.3, vib: 0.01, wet: 0.2 }); // scanner
  loop(t + 4.4, t + 7, 3.2, 1, (i, x) => beep(x, 660, 0.04, 0.12)); // fault
  boom(t + 7.0, 0.8);
  note(t + 7.0, 2.4, mtof(38), { wave: 'saw', amp: 0.08, a: 0.01, d: 2, s: 0.2, r: 0.5, lp: 600, wet: 0.5 });
  piano(t + 8.0, 62, 0.08);
  piano(t + 8.6, 60, 0.08);
  piano(t + 9.3, 57, 0.08);
  piano(t + 10.4, 58, 0.07);
  loop(t + 11.3, t + 13.1, 5, 1, (i, x) => beep(x, 700 - i * 20, 0.06, 0.08)); // 9..1
  jingle(t + 13.15, true);
}

// COMEBACK: montage
{
  const t = S.comeback;
  const bpm = 128;
  drums(t, t + 13, bpm, 'four', 0.8);
  bassline(t, t + 13, bpm, [50, 45, 46, 48], 8, 0.22);
  arp(t, t + 13, bpm, [Dm, Am, Bb, C], 16, 0.05);
  theme(t + 1.9, 0.235, 12, 0.07);
  theme(t + 9.0, 0.235, 12, 0.07);
  [5.9, 11.5].forEach((k) => bell(t + k, 81, 0.08)); // 5K PBs
  [0, 1.9, 3.6, 5.4, 7.2, 9.0, 11.0].forEach((k) => whoosh(t + k, 0.15));
}

// WALL BUILD: brick by brick
{
  const t = S.wallBuild;
  const wk = [52.6, 33.4, 81.1, 69.2, 64.3, 61.1, 83.0, 41.2, 75.0, 46.6, 86.8, 80.5, 62.1, 80.8, 44.4, 59.9, 43.3, 54.3];
  wk.forEach((km, w) => {
    const rows = Math.round(km / 4);
    for (let r = 0; r < rows; r += 3) brick(t + 0.5 + w * 0.26 + r * 0.012 + 0.1, 0.07);
    tom(t + 0.5 + w * 0.26, 70 + (km / 87) * 40, 0.25);
  });
  pads(t, t + 6.2, [Dm, Bb, Gm], 2.1, 0.04, 900);
  codec(t + 6.2, 0.4, [[0.6, 35], [2.4, 10]]);
}

// THE WALL: Manchester
{
  const t = S.wall;
  crowd(t, 14.5, 0.05);
  note(t + 0.1, 3.5, 1, { wave: 'noise', amp: 0.03, a: 1, d: 0.1, s: 1, r: 0.5, lp: 600, wet: 0.2 });
  loop(t + 0.3, t + 3.6, 1.1, 1, (i, x) => heartbeat(x, 0.35));
  pads(t, t + 3.6, [Dm], 3.6, 0.04, 800);
  riser(t + 2.4, 1.3, 0.2);
  hit(t + 3.8, 0.9);
  // THE MACHINE: relentless and even
  const bpm = 150;
  drums(t + 6.8, t + 14.5, bpm, 'drive', 0.9);
  bassline(t + 6.8, t + 14.5, bpm, [50, 50, 46, 48], 8, 0.26, [1, 1, 1, 1, 1, 1, 1, 1]);
  arp(t + 6.8, t + 14.5, bpm, [Dm, Bb, C, Dm], 16, 0.045);
  theme(t + 9.6, 0.2, 12, 0.07);
  // FRICTION: the filter closes, the groove thins
  loop(t + 14.5, t + 20, 138, 4, (i, x) => {
    const s = i % 16;
    if (s === 0 || s === 8) kick(x, 0.7);
    if (s === 12) snare(x, 0.22);
    if (s % 4 === 2) hat(x, 0.03);
  });
  loop(t + 14.5, t + 20, 138, 2, (i, x, st) => note(x, st * 0.8, mtof(38 + (i % 16 < 8 ? 0 : -1)), { wave: 'saw', amp: 0.22, a: 0.004, d: 0.15, s: 0.5, lp: 380 - i * 3, lpEnv: 500, drive: 1.5, wet: 0.05 }));
  pads(t + 14.5, t + 20, [Dm, [49, 52, 56]], 2.75, 0.04, 700);
  // the wall rises
  rumble(t + 20.1, 3.2, 0.5);
  boom(t + 20.2, 1.0);
  loop(t + 20.3, t + 22.6, 16, 1, (i, x) => brick(x + rnd() * 0.05, 0.15));
  beep(t + 21.3, 330, 0.08, 0.5); // projection lost
  beep(t + 21.8, 311, 0.08, 0.7);
  // THE WALL: dirge
  loop(t + 23, t + 30.5, 70, 1, (i, x) => {
    kick(x, 0.9);
    if (i % 2 === 1) snare(x, 0.18);
    heartbeat(x + 0.35, 0.25);
  });
  pads(t + 23, t + 30.5, [Dm, Bb, Gm, [45, 49, 52]], 1.9, 0.05, 900);
  loop(t + 23, t + 30.5, 70, 1, (i, x) => bass(x, [38, 34, 31, 33][Math.floor(i / 2) % 4], 0.7, 0.26));
  // SURVIVAL: sparse, just breathing and steps
  loop(t + 30.5, t + 34.6, 84, 1, (i, x) => tom(x, 60, 0.35));
  pads(t + 30.5, t + 34.6, [Dm, C], 2.05, 0.045, 1100);
  crowd(t + 32, 3, 0.07);
  // finish
  hit(t + 34.6, 0.5);
  pad(t + 34.8, [50, 57, 62, 65], 4.6, 0.045, 1200);
  typing(t + 36.1, t + 38.4, 14, 0.03);
  // the athlete's words
  piano(t + 39.7, 62, 0.1);
  piano(t + 40.3, 57, 0.08);
  piano(t + 41.0, 53, 0.08);
  piano(t + 41.3, 50, 0.09);
}

// AFTERMATH: crutches, then the way back
{
  const t = S.aftermath;
  loop(t + 0.2, t + 4.2, 1.6, 1, (i, x) => {
    clank(x, 0.06); // crutch tips
    pluck(x + 0.3, [62, 60, 57, 55, 57, 62][i % 6], 0.06);
  });
  beep(t + 2.0, 1320, 0.05, 0.1);
  jingle(t + 2.1, true);
  const bpm = 118;
  drums(t + 4.2, t + 12, bpm, 'four', 0.6);
  bassline(t + 4.2, t + 12, bpm, [50, 55, 57, 55], 8, 0.18);
  arp(t + 4.2, t + 12, bpm, [D, [55, 59, 62], A, [55, 59, 62]], 16, 0.045);
  shatter(t + 9.2, 0.2); // the pace group dissolves
  theme(t + 10.0, 0.25, 12, 0.07, [1, 1, 1, 1, 1, 1, 1, 3]);
}

// SERVICE RECORD
{
  const t = S.records;
  pads(t, t + 14, [Dm, Bb, F, C], 3.5, 0.055, 1500);
  loop(t, t + 14, 96, 4, (i, x) => pluck(x, [74, 77, 81, 79, 77, 74, 72, 69][i % 8], 0.035, 0.2));
  [0.6, 1.1, 1.6, 2.1].forEach((k) => typing(t + k, t + k + 0.8, 30, 0.025));
  for (let i = 0; i < 7; i++) beep(t + 5.2 + i * 0.18, 700 + i * 90, 0.04, 0.05);
  for (let i = 0; i < 5; i++) beep(t + 9.5 + i * 0.3, 1000, 0.035, 0.05);
}

// NEXT OBJECTIVE
{
  const t = S.next;
  codec(t, 0.5, [[0.8, 35], [3.2, 8]]);
  staticBurst(t + 5.4, 0.3, 0.1);
  wind(t + 5.6, 7, 0.05);
  pads(t + 5.6, t + 13, [Dm, Bb], 3.7, 0.045, 900);
  theme(t + 6.4, 0.45, 0, 0.07, [1, 1, 2, 1, 1, 1, 1, 3]);
  hit(t + 11.2, 0.6);
}

// ---------------------------------------------------------------------------
// reverb (Schroeder: 4 combs + 2 allpasses per channel), mix, master
function reverb(src: Float32Array, dst: Float32Array, offset: number) {
  const combs = [1557, 1617, 1491, 1422].map((n) => ({ buf: new Float32Array(n + offset), i: 0, fb: 0.8, lp: 0 }));
  const aps = [225, 556].map((n) => ({ buf: new Float32Array(n + Math.floor(offset / 2)), i: 0 }));
  for (let k = 0; k < src.length; k++) {
    const x = src[k] * 0.25;
    let y = 0;
    for (const c of combs) {
      const out = c.buf[c.i];
      c.lp = out * 0.6 + c.lp * 0.4;
      c.buf[c.i] = x + c.lp * c.fb;
      c.i = (c.i + 1) % c.buf.length;
      y += out;
    }
    for (const a of aps) {
      const b = a.buf[a.i];
      const v = -y * 0.5 + b;
      a.buf[a.i] = y + b * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      y = v;
    }
    dst[k] += y * 0.9;
  }
}
reverb(WL, L, 0);
reverb(WR, R, 23);

let peak = 0;
for (let k = 0; k < N; k++) {
  L[k] = Math.tanh(L[k] * 1.1);
  R[k] = Math.tanh(R[k] * 1.1);
  peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]));
}
const gain = peak > 0 ? 0.89 / peak : 1;

const samples = Math.ceil(DURATION * SR);
const buf = Buffer.alloc(44 + samples * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + samples * 4, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(samples * 4, 40);
for (let k = 0; k < samples; k++) {
  const fade = Math.min(1, (samples - k) / (SR * 0.5));
  buf.writeInt16LE(Math.round(clamp(L[k] * gain * fade, -1, 1) * 32767), 44 + k * 4);
  buf.writeInt16LE(Math.round(clamp(R[k] * gain * fade, -1, 1) * 32767), 46 + k * 4);
}
for (const out of [path.join(ROOT, 'output', 'audio.wav'), path.join(ROOT, 'public', 'audio.wav')]) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
}
console.log(`audio.wav: ${DURATION.toFixed(1)} s, peak gain ${gain.toFixed(2)}`);
