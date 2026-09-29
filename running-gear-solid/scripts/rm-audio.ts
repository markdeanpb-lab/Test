// Offline, deterministic score + SFX for RUNNING GEAR SOLID: REMASTERED.
// Reads the film's own cue list (output/cues.json, written by scripts/rm-render.mjs) and
// synthesises everything from oscillators and seeded noise into output/rm-audio.wav.
// Three buses (music, ambience, sfx); 'silence' cues pull the music (and most ambience) out.
//
//   npx tsx scripts/rm-audio.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CUES = JSON.parse(fs.readFileSync(path.join(ROOT, 'output', 'cues.json'), 'utf8')) as { duration: number; cues: { t: number; kind: string; [k: string]: unknown }[] };
const DURATION = CUES.duration;
const SR = 44100;
const N = Math.ceil((DURATION + 2) * SR);
const mkBus = () => ({ L: new Float32Array(N), R: new Float32Array(N), WL: new Float32Array(N), WR: new Float32Array(N) });
const MUS = mkBus(), AMB = mkBus(), SFX = mkBus();
let BUS = SFX;

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
    BUS.L[i0 + k] += v * gl;
    BUS.R[i0 + k] += v * gr;
    BUS.WL[i0 + k] += v * gl * wet;
    BUS.WR[i0 + k] += v * gr * wet;
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
// music: each id is a short arrangement that fills [t, t + dur]
const Bm = [47, 50, 54], G = [43, 47, 50], Em = [40, 43, 47], E = [40, 44, 47], Cm = [48, 51, 55], Ab = [44, 48, 51], Eb = [39, 43, 46], Fm = [41, 44, 48];
const inRange = (t0: number, t1: number) => (fn: (t: number) => void, t: number) => t < t1 && fn(t);

const MUSIC: Record<string, (t: number, d: number) => void> = {
  // THE DOOR: a tense, slightly ridiculous stealth-boss loop (low ostinato, stabs, ticking)
  door(t, d) {
    const bpm = 128;
    drums(t, t + d, bpm, 'drive', 0.75);
    bassline(t, t + d, bpm, [50, 50, 53, 48], 8, 0.22, [1, 0, 1, 0, 1, 1, 0, 1]);
    loop(t, t + d, bpm, 1, (i, x) => i % 4 === 3 && lead(x, [74, 77, 76, 72][Math.floor(i / 4) % 4], 0.12, 0.05));
    pads(t, t + d, [Dm, Bb, Gm, A], 60 / bpm * 8, 0.03, 900);
  },
  dread(t, d) {
    note(t, d, mtof(38), { wave: 'saw', amp: 0.05, a: 3, d: 0.1, s: 1, r: 2, lp: 300, detune: 7, wet: 0.5 });
    pads(t + 1, t + d, [Dm, Bb], 6, 0.03, 700);
    for (let k = 3; k < d - 2; k += 4.5) piano(t + k, THEME[Math.floor(k / 4.5) % 4] - 12, 0.05);
  },
  title(t, d) {
    riser(t, 4.8, 0.18);
    hit(t + 4.9, 0.8);
    pads(t + 4.9, t + d, [Dm, Bb, C, Am], 2.4, 0.05, 1600);
    bassline(t + 4.9, t + d - 1, 96, [50, 46, 48, 45], 4, 0.18);
    theme(t + 5.4, 0.32, 0, 0.08);
  },
  'first-steps'(t, d) {
    pads(t, t + d, [F, C, Dm, Bb], 4, 0.035, 1100);
    for (let k = 0; k < d - 2; k += 2) piano(t + k, [65, 69, 72, 69, 67, 64, 65, 60][Math.floor(k / 2) % 8], 0.06);
  },
  build(t, d) {
    const bpm = 112;
    pads(t, t + d, [Dm, C, Bb, C], 4.3, 0.035, 1200);
    bassline(t + 2, t + d, bpm, [50, 48, 46, 48], 8, 0.18);
    drums(t + 4, t + d, bpm, 'four', 0.7);
    arp(t + 6, t + d, bpm, [Dm, C, Bb, C], 16, 0.04);
  },
  'build-long'(t, d) {
    const bpm = 108;
    pads(t, t + d, [Dm, Bb, F, C], 4.4, 0.035, 1000);
    bassline(t + d * 0.25, t + d, bpm, [50, 46, 41, 48], 8, 0.16);
    arp(t + d * 0.4, t + d, bpm, [Dm, Bb, F, C], 16, 0.035);
    drums(t + d * 0.55, t + d - 1, bpm, 'half', 0.7);
    theme(t + d * 0.72, 0.36, 12, 0.05);
  },
  hare(t, d) {
    const bpm = 150;
    loop(t, t + d, bpm, 4, (i, x) => {
      if (i % 2 === 0) hat(x, 0.05);
      if (i % 8 === 0) kick(x, 0.5);
      pluck(x, [65, 72, 69, 77][i % 4] + (Math.floor(i / 16) % 2 ? 2 : 0), 0.035, ((i % 4) - 1.5) * 0.4);
    });
    pads(t, t + d, [F, C], 3.2, 0.025, 1500);
  },
  boss(t, d) {
    const bpm = 128;
    hit(t, 0.5);
    drums(t + 0.5, t + d, bpm, 'drive', 0.85);
    bassline(t + 0.5, t + d, bpm, [50, 50, 46, 48], 8, 0.22);
    pads(t, t + d, [Dm, Bb, Gm, A], 3.75, 0.035, 1400);
    for (let x = t + 4; x < t + d - 3.5; x += 7.5) theme(x, 0.23, 0, 0.06);
  },
  'boss-mini'(t, d) {
    const bpm = 124;
    drums(t, t + d, bpm, 'half', 0.8);
    arp(t, t + d, bpm, [Am, F, C, G], 16, 0.045);
    bassline(t, t + d, bpm, [45, 41, 48, 43], 8, 0.18);
  },
  vr(t, d) {
    const bpm = 120;
    drums(t, t + d, bpm, 'four', 0.75);
    arp(t, t + d, bpm, [Dm, F, C, Am], 16, 0.05, 36);
    bassline(t, t + d, bpm, [50, 53, 48, 45], 8, 0.16, [1, 1, 0, 1, 1, 0, 1, 0]);
  },
  tension(t, d) {
    note(t, d, mtof(38), { wave: 'saw', amp: 0.04, a: 2, d: 0.1, s: 1, r: 1.5, lp: 380, detune: 9, wet: 0.4 });
    loop(t, t + d, 90, 2, (i, x) => i % 2 === 0 && beep(x, 220, 0.015, 0.05));
    pads(t, t + d, [Dm, Bb, Gm, A], 4, 0.03, 900);
  },
  anthem(t, d) {
    const bpm = 100;
    pads(t, t + d, [D, A, Bm, G], 2.4, 0.045, 1900);
    drums(t + 2.4, t + d, bpm, 'half', 0.7);
    bassline(t + 2.4, t + d, bpm, [50, 45, 47, 43], 4, 0.17);
    for (let x = t + 4.8; x < t + d - 3; x += 7.2) theme(x, 0.3, 16, 0.05);
  },
  dz2(t, d) {
    // restrained, then driving, then everything: the last 90 seconds
    const bpm = 124;
    pads(t, t + d, [Dm, Bb, C, Am], 3.9, 0.04, 1300);
    bassline(t + 6, t + d, bpm, [50, 46, 48, 45], 8, 0.2);
    drums(t + 12, t + d * 0.6, bpm, 'half', 0.8);
    drums(t + d * 0.6, t + d, bpm, 'drive', 0.95);
    arp(t + d * 0.45, t + d, bpm, [Dm, Bb, C, Am], 16, 0.045);
    theme(t + d * 0.62, 0.24, 12, 0.07);
    riser(t + d - 4, 4, 0.2);
  },
  complete(t, d) {
    jingle(t, true);
    pads(t + 1.4, t + d, [D, G, D], 2.6, 0.05, 2200);
    theme(t + 1.6, 0.34, 12, 0.06);
  },
  quiet(t, d) {
    pads(t, t + d, [F, Am, Dm, C], 4.5, 0.03, 900);
    for (let k = 1; k < d - 2; k += 3) piano(t + k, [69, 65, 62, 64][Math.floor(k / 3) % 4], 0.05);
  },
  arcade(t, d) {
    // chiptune: square lead, pulse bass, noise hats
    const bpm = 150;
    drums(t, t + d, bpm, 'drive', 0.6);
    bassline(t, t + d, bpm, [45, 45, 41, 43], 8, 0.2, [1, 1, 0, 1, 1, 0, 1, 1]);
    const mel = [81, 84, 88, 86, 84, 81, 79, 81, 84, 83, 79, 76, 77, 79, 81, 84];
    loop(t + 1.6, t + d, bpm, 2, (i, x) => lead(x, mel[i % 16], 0.18, 0.045));
  },
  haunt(t, d) {
    // a low tritone drone, a music-box figure a semitone out, far-off bell
    note(t, d, mtof(33), { wave: 'saw', amp: 0.05, a: 3, d: 0.1, s: 1, r: 2, lp: 260, detune: 11, wet: 0.6 });
    note(t + 1, d - 1, mtof(39), { wave: 'saw', amp: 0.03, a: 3, d: 0.1, s: 1, r: 2, lp: 320, detune: 9, wet: 0.6 });
    for (let k = 1.5; k < d - 1; k += 0.62) bell(t + k, [81, 80, 77, 76, 81, 84, 83, 76][Math.floor(k / 0.62) % 8], 0.025);
  },
  hunted(t, d) {
    // hunted: a quickening pulse and a rising string cluster
    const bpm = 132;
    drums(t, t + d, bpm, 'drive', 0.6);
    bassline(t, t + d, bpm, [40, 41, 40, 46], 8, 0.22);
    [52, 53, 58].forEach((m, i) => note(t + i * 1.5, d - i * 1.5, mtof(m), { wave: 'saw', amp: 0.025, a: d * 0.6, d: 0.1, s: 1, r: 0.6, lp: 2400, detune: 14, vib: 0.01, wet: 0.5 }));
  },
  phantom(t, d) {
    const bpm = 118;
    pads(t, t + d, [Em, C, Am, B7()], 4, 0.04, 1200);
    drums(t + 2, t + d, bpm, 'drive', 0.75);
    bassline(t + 2, t + d, bpm, [40, 36, 45, 47], 8, 0.2);
    for (let x = t + 4; x < t + d; x += 2.03) bell(x, [76, 79, 83, 81][Math.floor((x - t) / 2.03) % 4], 0.04);
  },
  phantom2(t, d) {
    const bpm = 122;
    pads(t, t + d, [E, A, Bm7(), E], 3.9, 0.04, 1600);
    drums(t + 1, t + d, bpm, 'drive', 0.85);
    bassline(t + 1, t + d, bpm, [40, 45, 47, 40], 8, 0.2);
    arp(t + 8, t + d, bpm, [E, A, Bm, E], 16, 0.04);
    for (let x = t + 10; x < t + d - 4; x += 8) theme(x, 0.25, 14, 0.055);
  },
  furnace(t, d) {
    const bpm = 80;
    note(t, d, mtof(33), { wave: 'saw', amp: 0.06, a: 2, d: 0.1, s: 1, r: 2, lp: 250, drive: 3, wet: 0.4 });
    drums(t, t + d, bpm, 'half', 0.9);
    bassline(t, t + d, bpm, [45, 44, 43, 41], 4, 0.2);
    pads(t, t + d, [Am, Fm, Dm, E], 3, 0.04, 800);
  },
  claw(t, d) {
    const bpm = 132;
    drums(t, t + d, bpm, 'drive', 0.8);
    loop(t, t + d, bpm, 1, (i, x) => i % 4 === 3 && tom(x, 70 + (i % 8) * 6, 0.35));
    bassline(t, t + d, bpm, [43, 43, 46, 41], 8, 0.2);
    pads(t, t + d, [Gm, Eb, Cm, D], 3.6, 0.035, 1100);
  },
  night(t, d) {
    pads(t, t + d, [Cm, Ab, Eb, Bb], 3.5, 0.03, 900);
    loop(t + 1, t + d - 1, 80, 2, (i, x) => pluck(x, [60, 63, 67, 70][i % 4] + 12, 0.025, 0.2));
  },
  farewell(t, d) {
    pads(t, t + d, [D, Bm, G, A], 5, 0.035, 1100);
    let x = t + 2;
    const mel = [66, 69, 71, 69, 66, 64, 62, 64, 66, 62, 59, 62];
    for (let i = 0; x < t + d - 3; i++, x += 2.6) piano(x, mel[i % mel.length], 0.055);
  },
  memory(t, d) {
    pads(t, t + d, [Bm, G, D, A], 3.8, 0.03, 1100);
    for (let x = t + 1; x < t + d - 2; x += 1.9) bell(x, [71, 74, 78, 76][Math.floor((x - t) / 1.9) % 4], 0.03);
  },
  machine(t, d) {
    // the metronome: 4:15 per kilometre, every kilometre
    const bpm = 126;
    pads(t, t + d, [Dm, Bb, F, C], 3.8, 0.035, 1500);
    drums(t + 1, t + d, bpm, 'four', 0.8);
    bassline(t + 1, t + d, bpm, [50, 46, 41, 48], 8, 0.2, [1, 0, 1, 0, 1, 0, 1, 0]);
    arp(t + 8, t + d, bpm, [Dm, Bb, F, C], 16, 0.04);
    for (let x = t + 12; x < t + d - 4; x += 15.2) theme(x, 0.24, 12, 0.055);
  },
  friction(t, d) {
    const bpm = 126;
    drums(t, t + d, bpm, 'half', 0.7);
    bassline(t, t + d, bpm, [50, 49, 50, 49], 8, 0.2);
    pads(t, t + d, [[50, 53, 56], [49, 53, 56]], 3, 0.04, 900);
  },
  wall(t, d) {
    for (let x = t; x < t + d; x += 3.2) boom(x, 0.55);
    rumble(t, d, 0.18);
    pads(t, t + d, [[38, 41, 44], [37, 40, 44]], 4, 0.05, 600);
    note(t, d, mtof(26), { wave: 'saw', amp: 0.06, a: 3, d: 0.1, s: 1, r: 2, lp: 200, drive: 3, wet: 0.3 });
  },
  survival(t, d) {
    note(t, d, mtof(38), { wave: 'sine', amp: 0.06, a: 3, d: 0.1, s: 1, r: 3, wet: 0.5 });
    pads(t, t + d, [Dm, Bb, Gm, A], 6, 0.025, 700);
    for (let x = t + 3; x < t + d - 3; x += 6) piano(x, [62, 60, 58, 57][Math.floor((x - t) / 6) % 4] - 12, 0.05);
  },
  end(t, d) {
    pads(t, t + d, [D, G, Bm, A], 3.2, 0.04, 1500);
    theme(t + 1, 0.42, 12, 0.05, [1, 1, 2, 1, 1, 1, 1, 6]);
  },
};
function B7() {
  return [47, 51, 54];
}
function Bm7() {
  return [47, 50, 57];
}
void inRange;

// ---------------------------------------------------------------------------
// ambience + sfx
const birds = (t: number, dur: number, amp = 0.02) => {
  for (let x = t + rnd() * 2; x < t + dur; x += 1.5 + rnd() * 3) for (let k = 0; k < 3; k++) note(x + k * 0.09, 0.07, 2600 + rnd() * 1800, { wave: 'sine', amp, a: 0.005, d: 0.06, s: 0, glide: 1.3, pan: rnd() * 1.6 - 0.8, wet: 0.5 });
};
const water = (t: number, dur: number, amp = 0.03) => {
  for (let k = 0; k < dur; k += 0.4) note(t + k, 0.5, 1, { wave: 'noise', amp: amp * (0.6 + 0.4 * rnd()), a: 0.15, d: 0.1, s: 1, r: 0.25, lp: 900, hp: 200, wet: 0.3, pan: rnd() - 0.5 });
};
const rain = (t: number, dur: number, amp = 0.05) => {
  for (let k = 0; k < dur; k += 0.3) note(t + k, 0.4, 1, { wave: 'noise', amp, a: 0.1, d: 0.1, s: 1, r: 0.2, hp: 2500, lp: 9000, wet: 0.2, pan: rnd() - 0.5 });
};
const cityHum = (t: number, dur: number) => {
  note(t, dur, 55, { wave: 'sine', amp: 0.02, a: 1, d: 0.1, s: 1, r: 1, wet: 0 });
  wind(t, dur, 0.03);
};

const SFX_FN: Record<string, (c: { t: number; [k: string]: unknown }) => void> = {
  // game feel
  'item-get': (c) => [74, 78, 81, 86].forEach((m, i) => lead(c.t + i * 0.08, m, 0.14, 0.07)),
  'hit-dmg': (c) => {
    hit(c.t, 0.55);
    note(c.t, 0.35, 70, { wave: 'sine', amp: 0.4, a: 0.002, d: 0.3, s: 0, glide: 0.5, wet: 0.2 });
    note(c.t, 0.15, 1, { wave: 'noise', amp: 0.3, a: 0.001, d: 0.14, s: 0, lp: 3000, wet: 0.2 });
  },
  countered: (c) => {
    beep(c.t, 1320, 0.07, 0.06);
    beep(c.t + 0.07, 1760, 0.07, 0.09);
  },
  letterbox: (c) => {
    clank(c.t, 0.25);
    whoosh(c.t + 0.05, 0.12);
  },
  mash: (c) => {
    for (let k = 0; k < (c.dur as number); k += 1 / 12) tick(c.t + k, 0.05);
    rumble(c.t + 1, (c.dur as number) - 1, 0.25);
  },
  'door-open': (c) => {
    hit(c.t, 0.9);
    riser(c.t - 1.2, 1.2, 0.2);
    note(c.t, 3, 1, { wave: 'noise', amp: 0.08, a: 0.3, d: 0.5, s: 0.6, r: 1.5, lp: 6000, hp: 800, wet: 0.7 });
  },
  'tv-news': (c) => {
    // murmur of a presenter from another room
    for (let k = 0; k < (c.dur as number); k += 0.22) note(c.t + k, 0.18, 180 + 60 * Math.sin(k * 3.1) + 40 * rnd(), { wave: 'saw', amp: 0.012 * (0.5 + rnd()), a: 0.02, d: 0.1, s: 0.5, r: 0.05, lp: 900, hp: 150, wet: 0.35 });
  },
  'codec-ring': (c) => codecRing(c.t, c.t + (c.dur as number)),
  'codec-open': (c) => {
    staticBurst(c.t, 0.18, 0.08);
    beep(c.t + 0.2, 880, 0.05, 0.05);
  },
  'codec-line': (c) => codecLines(c.t, [[0, c.chars as number]]),
  'codec-close': (c) => {
    beep(c.t, 660, 0.04, 0.05);
    staticBurst(c.t + 0.08, 0.12, 0.06);
  },
  'codec-blip': (c) => {
    beep(c.t, 1320, 0.035, 0.04);
    beep(c.t + 0.06, 990, 0.03, 0.04);
  },
  chapter: (c) => {
    hit(c.t + 0.4, 0.45);
    whoosh(c.t, 0.18);
  },
  'log-line': (c) => typing(c.t + 0.35, c.t + 1.6, 30, 0.03),
  type: (c) => typing(c.t, c.t + 1.2, 26, 0.03),
  board: (c) => {
    hit(c.t, 0.35);
    beep(c.t + 0.1, 1500, 0.03, 0.05);
  },
  'number-hit': (c) => {
    clank(c.t, 0.18);
    beep(c.t, 1700, 0.025, 0.03);
  },
  counter: (c) => typing(c.t, c.t + (c.dur as number), 40, 0.035),
  gun: (c) => {
    note(c.t, 0.6, 1, { wave: 'noise', amp: 0.9, a: 0.0005, d: 0.5, s: 0, lp: 6000, wet: 0.7 });
    boom(c.t, 0.5);
  },
  'crowd-roar': (c) => crowd(c.t, c.dur as number, 0.12),
  'crowd-far': (c) => crowd(c.t, c.dur as number, 0.035),
  'title-hit': (c) => hit(c.t, 0.8),
  'watch-beep': (c) => {
    beep(c.t, 2400, 0.05, 0.05);
    beep(c.t + 0.12, 2400, 0.05, 0.05);
  },
  cctv: (c) => note(c.t, c.dur as number, 60, { wave: 'square', amp: 0.012, a: 0.2, d: 0.1, s: 1, r: 0.2, lp: 400, wet: 0 }),
  result: (c) => jingle(c.t, true),
  'hare-laugh': (c) => {
    for (let k = 0; k < 4; k++) note(c.t + k * 0.12, 0.1, 900 - k * 60, { wave: 'pulse', pw: 0.2, amp: 0.035, a: 0.005, d: 0.08, s: 0, glide: 1.4, wet: 0.5 });
  },
  fail: (c) => jingle(c.t, false),
  'fail-big': (c) => {
    boom(c.t, 0.7);
    jingle(c.t + 0.4, false);
  },
  win: (c) => jingle(c.t, true),
  'win-small': (c) => {
    beep(c.t, 1320, 0.05, 0.08);
    beep(c.t + 0.1, 1760, 0.05, 0.12);
  },
  'win-grim': (c) => {
    boom(c.t, 0.5);
    pad(c.t + 0.3, [50, 53, 57, 62], 3, 0.05, 1200);
  },
  'boss-intro': (c) => {
    riser(c.t - 1.4, 1.4, 0.2);
    hit(c.t, 0.7);
  },
  heartbeat: (c) => {
    for (let x = c.t; x < c.t + (c.dur as number); x += 0.82) heartbeat(x, 0.45);
  },
  breath: (c) => {
    for (let x = c.t; x < c.t + (c.dur as number); x += 2.6) {
      note(x, 1.0, 1, { wave: 'noise', amp: 0.04, a: 0.4, d: 0.3, s: 0.5, r: 0.3, lp: 1400, hp: 300, wet: 0.2 });
      note(x + 1.2, 1.2, 1, { wave: 'noise', amp: 0.03, a: 0.2, d: 0.5, s: 0.4, r: 0.4, lp: 1000, hp: 250, wet: 0.2 });
    }
  },
  shatter: (c) => {
    shatter(c.t, 0.6);
    hit(c.t, 0.5);
  },
  boom: (c) => boom(c.t, 0.8),
  lava: (c) => {
    // a deep roar with bubbling pops
    note(c.t, c.dur as number, 42, { wave: 'saw', amp: 0.035, a: 2, d: 0.1, s: 1, r: 2, lp: 160, detune: 8, wet: 0.5 });
    for (let x = c.t; x < c.t + (c.dur as number); x += 0.3 + rnd() * 0.9) note(x, 0.14, 90 + rnd() * 120, { wave: 'sine', amp: 0.03, a: 0.005, d: 0.12, s: 0, glide: 1.8, wet: 0.4, pan: rnd() - 0.5 });
  },
  rumble: (c) => {
    for (let x = c.t; x < c.t + (c.dur as number); x += 0.45) note(x, 0.6, 1, { wave: 'noise', amp: 0.06 * (0.6 + 0.4 * rnd()), a: 0.05, d: 0.5, s: 0, lp: 350, wet: 0.4, pan: rnd() - 0.5 });
  },
  denied: (c) => {
    // the MGS 'can't do that' buzz
    note(c.t, 0.28, 110, { wave: 'square', amp: 0.06, a: 0.002, d: 0.05, s: 1, r: 0.05, lp: 1400, wet: 0.1 });
    note(c.t, 0.28, 116, { wave: 'square', amp: 0.05, a: 0.002, d: 0.05, s: 1, r: 0.05, lp: 1400, wet: 0.1 });
  },
  beep3: (c) => {
    for (let k = 0; k < 3; k++) beep(c.t + 0.8 + k * 0.8, 880, 0.07, 0.15);
  },
  checkpoint: (c) => [72, 76, 79, 84].forEach((m, i) => lead(c.t + i * 0.06, m, 0.1, 0.07)),
  timeup: (c) => [76, 72, 67, 60].forEach((m, i) => lead(c.t + i * 0.16, m, 0.18, 0.08)),
  hiscore: (c) => [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => lead(c.t + i * 0.12, m, 0.14, 0.07)),
  toll: (c) => {
    // a church bell: low partials, long ring
    [[45, 0.12], [57, 0.06], [64, 0.035], [69, 0.02]].forEach(([m, a]) => note(c.t, 5, mtof(m), { wave: 'sine', amp: a, a: 0.003, d: 4.8, s: 0, r: 0.5, wet: 0.7 }));
    note(c.t, 0.08, 1, { wave: 'noise', amp: 0.05, a: 0.001, d: 0.07, s: 0, hp: 2000, wet: 0.5 });
  },
  'grave-rise': (c) => {
    note(c.t, 2.4, 1, { wave: 'noise', amp: 0.08, a: 0.4, d: 1.8, s: 0.2, lp: 500, wet: 0.5 });
    note(c.t, 2.6, mtof(28), { wave: 'saw', amp: 0.06, a: 0.8, d: 1.6, s: 0.3, lp: 240, glide: 1.5, wet: 0.6 });
    for (let k = 0; k < 6; k++) note(c.t + 0.2 + k * 0.28, 0.1, 1, { wave: 'noise', amp: 0.05, a: 0.002, d: 0.09, s: 0, lp: 1500, wet: 0.3 });
  },
  goggles: (c) => {
    note(c.t, 0.5, 400, { wave: 'sine', amp: 0.05, a: 0.01, d: 0.45, s: 0, glide: 6, wet: 0.2 });
    beep(c.t + 0.45, 2400, 0.04, 0.05);
  },
  scream: (c) => {
    // the Phantom dissolving: a falling, tearing wail and a burst of air
    [0, 7, 13].forEach((st, i) => note(c.t + i * 0.05, 2.6, mtof(84 + st), { wave: 'saw', amp: 0.035, a: 0.08, d: 2.3, s: 0, glide: 0.18, vib: 0.03, lp: 5000, detune: 30, wet: 0.8 }));
    note(c.t, 2.4, 1, { wave: 'noise', amp: 0.09, a: 0.05, d: 2.2, s: 0, lp: 3000, hp: 600, wet: 0.7 });
  },
  'phantom-pass': (c) => {
    whoosh(c.t, 0.35);
    note(c.t, 2, mtof(83), { wave: 'sine', amp: 0.04, a: 0.1, d: 1.8, s: 0, glide: 0.5, wet: 0.7 });
  },
  siren: (c) => siren(c.t, c.dur as number, 0.04),
  marker: (c) => note(c.t, 0.5, 1, { wave: 'noise', amp: 0.04, a: 0.02, d: 0.4, s: 0.3, r: 0.1, lp: 3000, hp: 1200, wet: 0.1 }),
  'drone-low': (c) => note(c.t, c.dur as number, mtof(31), { wave: 'saw', amp: 0.05, a: 3, d: 0.1, s: 1, r: 2, lp: 220, detune: 5, wet: 0.5 }),
  crack: (c) => {
    for (let x = c.t; x < c.t + (c.dur as number); x += 0.6 + rnd() * 1.2) note(x, 0.15, 1, { wave: 'noise', amp: 0.08, a: 0.001, d: 0.12, s: 0, hp: 1800, wet: 0.5, pan: rnd() - 0.5 });
  },
  gameover: (c) => {
    [62, 58, 55, 50].forEach((m, i) => lead(c.t + i * 0.28, m, 0.26, 0.06));
  },
  select: (c) => beep(c.t, 1760, 0.05, 0.06),
  tick: (c) => beep(c.t, 2200, 0.03, 0.02),
  'boss-flash': (c) => {
    staticBurst(c.t, 0.1, 0.06);
    clank(c.t + 0.02, 0.1);
  },
  alert: (c) => {
    for (let k = 0; k < 4; k++) beep(c.t + k * 0.45, 1480, 0.05, 0.18);
  },
  bricks: (c) => {
    for (let k = 0; k < 8; k++) brick(c.t + k * 0.09 + rnd() * 0.04, 0.07);
  },
  'wall-rise': (c) => {
    rumble(c.t, c.dur as number, 0.3);
    for (let x = c.t; x < c.t + (c.dur as number); x += 0.07) brick(x + rnd() * 0.05, 0.1);
    boom(c.t, 0.9);
  },
};
const AMB_FN: Record<string, (c: { t: number; dur?: unknown; level?: unknown }) => void> = {
  'amb-crowd': (c) => crowd(c.t, c.dur as number, 0.04 * ((c.level as number) ?? 1)),
  'amb-park': (c) => {
    wind(c.t, c.dur as number, 0.02 * ((c.level as number) ?? 1));
    birds(c.t, c.dur as number, 0.018 * ((c.level as number) ?? 1));
  },
  'amb-city-quiet': (c) => cityHum(c.t, c.dur as number),
  'amb-lake': (c) => {
    water(c.t, c.dur as number, 0.02);
    birds(c.t, c.dur as number, 0.015);
  },
  'amb-track': (c) => {
    crowd(c.t, c.dur as number, 0.02);
    wind(c.t, c.dur as number, 0.015);
  },
  rain: (c) => rain(c.t, c.dur as number, 0.045),
  wind: (c) => wind(c.t, c.dur as number, 0.09),
};

// ---------------------------------------------------------------------------
// render cues
const silences: [number, number][] = [];
let unknown = new Set<string>();
for (const c of CUES.cues) {
  if (c.kind === 'silence') {
    silences.push([c.t, c.t + (c.dur as number)]);
    continue;
  }
  if (c.kind === 'music') {
    const f = MUSIC[c.id as string];
    BUS = MUS;
    if (f) f(c.t, c.dur as number);
    else unknown.add('music:' + c.id);
    continue;
  }
  if (AMB_FN[c.kind]) {
    BUS = AMB;
    AMB_FN[c.kind](c);
    continue;
  }
  if (SFX_FN[c.kind]) {
    BUS = SFX;
    SFX_FN[c.kind](c);
    continue;
  }
  unknown.add(c.kind);
}
if (unknown.size) console.warn('unhandled cues:', [...unknown].join(', '));

// reverb per bus, then mix with silence ducking on music (and partly on ambience)
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
for (const b of [MUS, AMB, SFX]) {
  reverb(b.WL, b.L, 0);
  reverb(b.WR, b.R, 23);
}
const duck = new Float32Array(N).fill(1);
for (const [a, b] of silences) {
  const i0 = Math.floor(a * SR), i1 = Math.floor(b * SR), f = Math.floor(0.35 * SR);
  for (let k = Math.max(0, i0 - f); k < Math.min(N, i1 + f); k++) {
    const g = k < i0 ? (i0 - k) / f : k > i1 ? (k - i1) / f : 0;
    duck[k] = Math.min(duck[k], g);
  }
}
const L = new Float32Array(N), R = new Float32Array(N);
let peak = 0;
for (let k = 0; k < N; k++) {
  const d = duck[k];
  L[k] = Math.tanh((MUS.L[k] * 0.9 * d + AMB.L[k] * (0.35 + 0.65 * d) + SFX.L[k]) * 1.05);
  R[k] = Math.tanh((MUS.R[k] * 0.9 * d + AMB.R[k] * (0.35 + 0.65 * d) + SFX.R[k]) * 1.05);
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
  const fade = Math.min(1, (samples - k) / (SR * 1.5));
  buf.writeInt16LE(Math.round(clamp(L[k] * gain * fade, -1, 1) * 32767), 44 + k * 4);
  buf.writeInt16LE(Math.round(clamp(R[k] * gain * fade, -1, 1) * 32767), 46 + k * 4);
}
const out = path.join(ROOT, 'output', 'rm-audio.wav');
fs.writeFileSync(out, buf);
console.log(`rm-audio.wav: ${DURATION.toFixed(1)} s, ${CUES.cues.length} cues, ${silences.length} silences, gain ${gain.toFixed(2)}`);
