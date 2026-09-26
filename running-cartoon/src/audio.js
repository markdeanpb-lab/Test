// Chiptune soundtrack: original tunes written as note strings, turned into a flat list of timed
// events, then played through WebAudio pulse / triangle / noise voices. The same event list plays live
// in the page and renders offline (OfflineAudioContext) for the video, so they sound identical.
'use strict';
const AUDIO = (() => {
  const SEMI = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const hz = (n) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); return 440 * Math.pow(2, (SEMI[m[1]] + (Number(m[2]) - 4) * 12 - 9) / 12); };
  const CHORD = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], sus: [0, 5, 7], dim: [0, 3, 6] };
  const chordNotes = (name, oct = 4) => {
    const m = /^([A-G][#b]?)(.*)$/.exec(name);
    const base = hz(m[1] + oct);
    return CHORD[m[2]].map((s) => base * Math.pow(2, s / 12));
  };

  // Tokens are eighth notes: a note name, '-' to hold the previous note, '.' for a rest. Bars split by '|'.
  // Drums are 16 sixteenths per bar: k kick, s snare, h hat, o open hat.
  const SONGS = {
    title: {
      bpm: 120, chordWave: 'p12',
      lead: 'G4 C5 E5 G5 - - E5 G5 | C6 - - - B5 - G5 - | A5 - F5 - C6 - A5 - | G5 - - - D5 - B4 -',
      bass: 'C3 . C3 . G2 . G2 . | E3 . E3 . E2 . E3 . | F2 . F2 . A2 . A2 . | G2 . G2 . G2 . B2 .',
      chords: 'C | Em | F | G', drums: 'k.......s.......',
    },
    main: {
      bpm: 150,
      lead: 'C5 - E5 G5 - E5 G5 A5 | G5 - - D5 - G5 F5 E5 | E5 - A5 C6 - B5 A5 G5 | A5 - - F5 - E5 F5 G5 | ' +
        'C6 - B5 C6 - G5 E5 G5 | B5 - A5 B5 - G5 D5 G5 | A5 G5 F5 A5 C6 - A5 F5 | G5 - - - D5 E5 F5 G5',
      bass: 'C3 C4 C3 C4 C3 C4 G2 B2 | G2 G3 G2 G3 G2 G3 D3 B2 | A2 A3 A2 A3 A2 A3 E3 G3 | F2 F3 F2 F3 F2 F3 C3 E3 | ' +
        'C3 C4 C3 C4 C3 C4 E3 C3 | G2 G3 G2 G3 G2 G3 B2 D3 | F2 F3 F2 F3 A2 A3 C3 A2 | G2 G3 G2 G3 G2 D3 G2 B2',
      chords: 'C | G | Am | F | C | G | F | G', drums: 'k.h.s.h.k.khs.h.',
    },
    boss: {
      bpm: 168,
      lead: 'E5 - - B4 E5 - G5 F#5 | E5 - D5 - B4 - - - | C5 - E5 - G5 - E5 C5 | B4 - D#5 - F#5 - B5 - | ' +
        'E5 - - B4 E5 - G5 A5 | B5 - A5 - G5 - F#5 - | G5 - E5 - C5 - E5 G5 | F#5 - - - D#5 - B4 -',
      bass: 'E2 E3 E2 E3 E2 E3 E2 E3 | E2 E3 E2 E3 D2 D3 D2 D3 | C2 C3 C2 C3 C2 C3 C2 C3 | B1 B2 B1 B2 B1 B2 D#2 F#2 | ' +
        'E2 E3 E2 E3 E2 E3 E2 E3 | G2 G3 G2 G3 D2 D3 D2 D3 | C2 C3 C2 C3 A1 A2 A1 A2 | B1 B2 B1 B2 B1 B2 B1 B2',
      chords: 'Em | Em | C | B | Em | G | C | B', drums: 'k.hkk.h.s.hkk.s.',
    },
    sad: {
      bpm: 84, chordWave: 'p12',
      lead: 'A4 - - - C5 - B4 A4 | F4 - - - A4 - G4 F4 | E4 - - G4 C5 - B4 A4 | G#4 - - - B4 - - -',
      bass: 'A2 - - - E3 - - - | F2 - - - C3 - - - | C3 - - - G2 - - - | E2 - - - B2 - - -',
      chords: 'Am | F | C | E', drums: '',
    },
    xmas: {
      bpm: 160,
      lead: 'E5 - E5 - E5 - - - | E5 - E5 - E5 - - - | E5 - G5 - C5 - - D5 | E5 - - - - - . . | ' +
        'F5 - F5 - F5 - - F5 | F5 - E5 - E5 - E5 E5 | E5 - D5 - D5 - E5 - | D5 - - - G5 - - -',
      bass: 'C3 . G2 . C3 . G2 . | C3 . G2 . C3 . G2 . | C3 . E3 . F3 . G3 . | C3 . G2 . C3 . E3 . | ' +
        'F2 . C3 . F2 . C3 . | C3 . G2 . C3 . G2 . | D3 . A2 . D3 . A2 . | G2 . D3 . G2 . B2 .',
      chords: 'C | C | C | C | F | C | D7 | G7', drums: 'k.h.s.h.k.h.s.hh',
    },
    montage: {
      bpm: 132,
      lead: 'D5 - F#5 - A5 - - F#5 | E5 - - C#5 - E5 A5 - | F#5 - - D5 - B4 D5 F#5 | G5 - F#5 - E5 - D5 E5 | ' +
        'D5 - F#5 - A5 - D6 - | C#6 - - A5 - E5 A5 - | B5 - A5 - F#5 - D5 F#5 | G5 - - A5 - - - -',
      bass: 'D2 D3 D2 D3 D2 D3 D2 D3 | A1 A2 A1 A2 A1 A2 A1 A2 | B1 B2 B1 B2 B1 B2 B1 B2 | G1 G2 G1 G2 A1 A2 A1 A2 | ' +
        'D2 D3 D2 D3 D2 D3 D2 D3 | A1 A2 A1 A2 A1 A2 A1 A2 | B1 B2 B1 B2 G1 G2 G1 G2 | G1 G2 G1 G2 A1 A2 C#2 E2',
      chords: 'D | A | Bm | G | D | A | Bm | G', drums: 'k.h.s.hkk.h.s.hs',
    },
    japan: {
      bpm: 108, chordWave: 'p12', leadWave: 'p12', pluck: true,
      lead: 'A5 - B5 A5 G5 - E5 - | D5 - E5 G5 A5 - - - | B5 - A5 G5 E5 - G5 - | A5 - - - D6 - B5 - | ' +
        'A5 - G5 E5 D5 - E5 G5 | A5 - B5 - A5 - - - | G5 - E5 D5 B4 - D5 - | E5 - - - . . . .',
      bass: 'D3 . A2 . D3 . A2 . | E3 . B2 . E3 . B2 . | G2 . D3 . G2 . D3 . | A2 . E3 . A2 . E3 . | ' +
        'D3 . A2 . D3 . A2 . | G2 . D3 . G2 . D3 . | E3 . B2 . E3 . B2 . | A2 . E3 . A2 . . .',
      chords: 'D | Em | G | A | D | G | Em | A', drums: 'k.......h...k...',
    },
    credits: {
      bpm: 132,
      lead: 'C5 - E5 G5 - E5 G5 A5 | G5 - - D5 - G5 F5 E5 | E5 - A5 C6 - B5 A5 G5 | A5 - - F5 - E5 F5 G5 | ' +
        'C6 - B5 C6 - G5 E5 G5 | B5 - A5 B5 - G5 D5 G5 | A5 G5 F5 A5 C6 - A5 F5 | C6 - - - - - . .',
      bass: 'C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . | ' +
        'C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | F2 . C3 . F2 . C3 . | C3 . G2 . C3 . . .',
      chords: 'C | G | Am | F | C | G | F | C', drums: 'k...h...s...h.h.',
    },
  };

  function parseTrack(str) {
    // -> [{i (eighth index), len (eighths), note}]
    const toks = str.replace(/\|/g, ' ').trim().split(/\s+/);
    const out = [];
    toks.forEach((tk, i) => {
      if (tk === '-') { if (out.length && out[out.length - 1].open) out[out.length - 1].len++; return; }
      if (out.length) out[out.length - 1].open = false;
      if (tk === '.') return;
      out.push({ i, len: 1, note: tk, open: true });
    });
    return { notes: out, eighths: toks.length };
  }
  const parsed = {};
  for (const k in SONGS) {
    const s = SONGS[k];
    parsed[k] = {
      ...s,
      L: parseTrack(s.lead), B: parseTrack(s.bass),
      chordList: s.chords.split('|').map((c) => c.trim()),
    };
  }

  const ev = (t, d, w, f, v, extra) => Object.assign({ t, d, w, f, v }, extra || {});
  function drumEvents(ch, t, vol = 1) {
    if (ch === 'k') return [ev(t, 0.12, 'kick', 150, 0.5 * vol)];
    if (ch === 's') return [ev(t, 0.14, 'snare', 0, 0.22 * vol)];
    if (ch === 'h') return [ev(t, 0.03, 'hat', 0, 0.07 * vol)];
    if (ch === 'o') return [ev(t, 0.12, 'hat', 0, 0.08 * vol)];
    return [];
  }

  // Events for a song playing from t0 to t1 (seconds), looping, with a short fade at the end.
  function songEvents(name, t0, t1, opts = {}) {
    const s = parsed[name];
    const bpm = opts.bpm || s.bpm;
    const e8 = 30 / bpm; // eighth-note length
    const barLen = e8 * 8;
    const loopLen = s.L.eighths * e8;
    const out = [];
    const vol = opts.vol || 1;
    const leadW = s.leadWave || 'p25';
    for (let base = t0; base < t1; base += loopLen) {
      const addTrack = (tr, w, v, oct = 0, extra) => {
        for (const n of tr.notes) {
          const t = base + n.i * e8;
          if (t >= t1 - 0.02) continue;
          let d = Math.min(n.len * e8, t1 - t);
          const f = hz(n.note) * Math.pow(2, oct);
          out.push(ev(t, d * 0.92, w, f, v * vol, extra));
        }
      };
      addTrack(s.L, leadW, 0.11, 0, s.pluck ? { pluck: true } : { vib: true });
      if (!s.pluck) addTrack(s.L, 'p12', 0.028, -1, { delay: e8 * 0.5 });
      addTrack(s.B, 'tri', 0.3);
      // arpeggiated chords in sixteenths
      const bars = s.chordList.length;
      for (let b = 0; b < bars; b++) {
        const notes = chordNotes(s.chordList[b], 4);
        for (let k = 0; k < 16; k++) {
          const t = base + b * barLen + k * (e8 / 2);
          if (t >= t1 - 0.02) break;
          out.push(ev(t, e8 / 2 * 0.8, s.chordWave || 'p12', notes[k % notes.length] * (k % 8 >= 4 ? 2 : 1), 0.035 * vol, { pluck: true }));
        }
        if (s.drums) for (let k = 0; k < 16; k++) {
          const t = base + b * barLen + k * (e8 / 2);
          if (t >= t1 - 0.02) break;
          out.push(...drumEvents(s.drums[k], t, vol));
        }
      }
    }
    // fade the last half second
    for (const e of out) { const r = t1 - e.t; if (r < 0.6) e.v *= Math.max(0, r / 0.6); }
    return out;
  }

  const N = hz;
  const SFX = {
    coin: (t) => [ev(t, 0.06, 'p25', N('B5'), 0.12), ev(t + 0.06, 0.28, 'p25', N('E6'), 0.12, { pluck: true })],
    pb: (t) => [ev(t, 0.05, 'p25', N('E6'), 0.1), ev(t + 0.05, 0.05, 'p25', N('G6'), 0.1), ev(t + 0.1, 0.3, 'p25', N('C7'), 0.1, { pluck: true })],
    jump: (t) => [ev(t, 0.16, 'p25', 300, 0.1, { f2: 780 })],
    bonk: (t) => [ev(t, 0.1, 'p50', 220, 0.12, { f2: 110 }), ev(t, 0.08, 'snare', 0, 0.15)],
    select: (t) => [ev(t, 0.05, 'p50', N('A5'), 0.1), ev(t + 0.05, 0.12, 'p50', N('A6'), 0.1)],
    tick: (t) => [ev(t, 0.035, 'p12', N('C7'), 0.07)],
    beep: (t) => [ev(t, 0.12, 'p50', N('A4'), 0.12)],
    go: (t) => [ev(t, 0.35, 'p50', N('A5'), 0.12)],
    gameover: (t) => ['G4', 'F#4', 'F4', 'E4', 'D#4', 'D4', 'C#4', 'C4'].map((n, i) => ev(t + i * 0.16, i === 7 ? 0.6 : 0.14, 'p25', N(n), 0.12)),
    whoosh: (t) => [ev(t, 0.35, 'noise', 0, 0.12, { hp: 2500, sweep: true })],
    cheer: (t) => [ev(t, 1.6, 'noise', 0, 0.09, { bp: 1400, swell: true })],
    boom: (t) => [ev(t, 0.5, 'noise', 0, 0.3, { lp: 500 }), ev(t, 0.4, 'tri', 140, 0.35, { f2: 35 })],
    pop: (t) => [ev(t, 0.18, 'noise', 0, 0.16, { hp: 1200 })],
    bark: (t) => [ev(t, 0.08, 'p50', 820, 0.1, { f2: 480 }), ev(t + 0.13, 0.08, 'p50', 900, 0.1, { f2: 520 })],
    fanfare: (t) => {
      const seq = [['G4', 0], ['C5', 1], ['E5', 2], ['G5', 3], ['C6', 4], ['E6', 6], ['G6', 7]];
      const o = seq.map(([n, i]) => ev(t + i * 0.09, i === 7 ? 0.7 : 0.09, 'p25', N(n), 0.12, i === 7 ? { vib: true } : null));
      o.push(ev(t + 0.63, 0.7, 'p12', N('C6'), 0.05), ev(t + 0.63, 0.7, 'p12', N('E6'), 0.05), ev(t + 0.63, 0.7, 'tri', N('C3'), 0.3));
      return o;
    },
    thud: (t) => [ev(t, 0.15, 'kick', 120, 0.5)],
    zap: (t) => [ev(t, 0.25, 'p12', 1600, 0.08, { f2: 200 })],
    ding: (t) => [ev(t, 0.5, 'p12', N('E6'), 0.09, { pluck: true }), ev(t, 0.5, 'p12', N('B6'), 0.05, { pluck: true })],
    sad: (t) => [ev(t, 0.3, 'p25', N('E5'), 0.1, { f2: N('D5') }), ev(t + 0.3, 0.6, 'p25', N('D5'), 0.1, { f2: N('A4') })],
  };

  // timeline: [{start, end, music, musicOpts, sfx: [[t, name]]}] – consecutive scenes sharing a song
  // keep one continuous loop instead of restarting.
  function buildEvents(timeline) {
    const out = [];
    let i = 0;
    while (i < timeline.length) {
      const s = timeline[i];
      let j = i;
      while (j + 1 < timeline.length && timeline[j + 1].music === s.music && !timeline[j + 1].restart) j++;
      if (s.music) out.push(...songEvents(s.music, s.start + (s.musicDelay || 0), timeline[j].end, s.musicOpts));
      i = j + 1;
    }
    for (const s of timeline) for (const [t, name] of s.sfx || []) if (SFX[name]) out.push(...SFX[name](s.start + t));
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  // ---------- WebAudio voices ----------
  function setup(ctx) {
    if (ctx.__px) return ctx.__px;
    const pulse = (duty) => {
      const n = 48, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) re[k] = (2 * Math.sin(k * Math.PI * duty)) / (k * Math.PI);
      return ctx.createPeriodicWave(re, im);
    };
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    let seed = 12345;
    for (let k = 0; k < d.length; k++) { seed = (Math.imul(seed, 1103515245) + 12345) | 0; d[k] = ((seed >>> 8) & 0xffff) / 32768 - 1; }
    ctx.__px = { p12: pulse(0.125), p25: pulse(0.25), p50: pulse(0.5), noise };
    return ctx.__px;
  }
  function play(ctx, dest, e, when) {
    const V = setup(ctx);
    const g = ctx.createGain();
    g.connect(dest);
    const end = when + e.d;
    const gain = g.gain;
    gain.setValueAtTime(0, when);
    if (e.swell) {
      gain.linearRampToValueAtTime(e.v, when + e.d * 0.4);
      gain.linearRampToValueAtTime(0, end);
    } else if (e.pluck || e.w === 'kick' || e.w === 'snare' || e.w === 'hat' || e.w === 'noise') {
      gain.linearRampToValueAtTime(e.v, when + 0.004);
      gain.exponentialRampToValueAtTime(0.0008, end);
    } else {
      gain.linearRampToValueAtTime(e.v, when + 0.006);
      gain.setValueAtTime(e.v, Math.max(when + 0.006, end - Math.min(0.04, e.d * 0.3)));
      gain.linearRampToValueAtTime(0, end);
    }
    const nodes = [];
    if (e.w === 'kick') {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(e.f, when); o.frequency.exponentialRampToValueAtTime(40, end);
      o.connect(g); o.start(when); o.stop(end + 0.01); nodes.push(o);
    } else if (e.w === 'snare' || e.w === 'hat' || e.w === 'noise') {
      const src = ctx.createBufferSource(); src.buffer = V.noise; src.loop = true;
      const f = ctx.createBiquadFilter();
      if (e.w === 'hat') { f.type = 'highpass'; f.frequency.value = 7000; }
      else if (e.w === 'snare') { f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7; }
      else if (e.lp) { f.type = 'lowpass'; f.frequency.value = e.lp; }
      else if (e.bp) { f.type = 'bandpass'; f.frequency.value = e.bp; f.Q.value = 0.5; }
      else { f.type = 'highpass'; f.frequency.value = e.hp || 1000; if (e.sweep) f.frequency.exponentialRampToValueAtTime(e.hp * 3, end); }
      src.connect(f); f.connect(g);
      src.start(when, (e.t * 7.31) % 0.9); src.stop(end + 0.01); nodes.push(src);
      if (e.w === 'snare') {
        const o = ctx.createOscillator(); o.type = 'triangle';
        o.frequency.setValueAtTime(190, when); o.frequency.exponentialRampToValueAtTime(110, end);
        const og = ctx.createGain(); og.gain.value = 0.6; o.connect(og); og.connect(g);
        o.start(when); o.stop(end + 0.01); nodes.push(o);
      }
    } else {
      const o = ctx.createOscillator();
      if (e.w === 'tri') o.type = 'triangle'; else o.setPeriodicWave(V[e.w] || V.p25);
      const t0 = when + (e.delay || 0);
      o.frequency.setValueAtTime(e.f, t0);
      if (e.f2) o.frequency.exponentialRampToValueAtTime(e.f2, end);
      if (e.vib && e.d > 0.25) {
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
        const lg = ctx.createGain(); lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(e.f * 0.012, when + Math.min(0.3, e.d));
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(when); lfo.stop(end + 0.01); nodes.push(lfo);
      }
      o.connect(g); o.start(t0); o.stop(end + 0.02); nodes.push(o);
    }
    return nodes;
  }
  function chain(ctx) {
    const master = ctx.createGain(); master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    master.connect(comp); comp.connect(ctx.destination);
    return master;
  }

  // Live playback that follows a playhead (seek / pause safe).
  function LivePlayer(events) {
    let ctx = null, master = null, base = 0, idx = 0;
    const lower = (t) => { let a = 0, b = events.length; while (a < b) { const m = (a + b) >> 1; if (events[m].t < t) a = m + 1; else b = m; } return a; };
    return {
      get ctx() { return ctx; },
      start(audioCtx, songT) {
        this.stop();
        ctx = audioCtx;
        master = chain(ctx);
        base = ctx.currentTime + 0.05 - songT;
        idx = lower(songT);
      },
      time() { return ctx ? ctx.currentTime - base : 0; },
      pump() {
        if (!ctx || !master) return;
        const horizon = ctx.currentTime - base + 0.35;
        while (idx < events.length && events[idx].t < horizon) {
          const e = events[idx++];
          const when = base + e.t;
          if (when >= ctx.currentTime - 0.01) play(ctx, master, e, Math.max(when, ctx.currentTime));
        }
      },
      stop() {
        if (master && ctx) {
          const m = master;
          m.gain.setValueAtTime(m.gain.value, ctx.currentTime);
          m.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
          setTimeout(() => { try { m.disconnect(); } catch (e) { /* already gone */ } }, 120);
        }
        master = null;
      },
    };
  }

  async function renderOffline(events, duration, sampleRate = 44100) {
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const master = chain(ctx);
    for (const e of events) if (e.t < duration) play(ctx, master, e, e.t);
    return ctx.startRendering();
  }

  return { SONGS, SFX, buildEvents, songEvents, LivePlayer, renderOffline, hz };
})();
if (typeof window !== 'undefined') window.AUDIO = AUDIO;
