// The score. Original tunes written as note strings, turned into one flat list of timed events and played
// through WebAudio: pulse / triangle / noise chip voices plus bell, pad and nylon-guitar voices, with a
// shared reverb. One leitmotif (the stranger's advice) threads through the film. The same event list plays
// live in the page and renders offline (OfflineAudioContext) for the video, so the two sound identical.
'use strict';
const AUDIO = (() => {
  const SEMI = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const hz = (n) => { const m = /^([A-G][#b]?)(-?\d)$/.exec(n); if (!m) throw new Error(`bad note ${n}`); return 440 * Math.pow(2, (SEMI[m[1]] + (Number(m[2]) - 4) * 12 - 9) / 12); };
  const CHORD = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], sus: [0, 5, 7], sus2: [0, 2, 7], add9: [0, 4, 7, 14], dim: [0, 3, 6] };
  const chordNotes = (name, oct = 4) => {
    const m = /^([A-G][#b]?)(.*)$/.exec(name);
    const base = hz(m[1] + oct);
    return CHORD[m[2]].map((s) => base * Math.pow(2, s / 12));
  };

  // ---------- the leitmotif: "IF YOU CAN'T TALK, / YOU'RE GOING TOO FAST." ----------
  // [note, eighth, length]; phrase one is the question (over A minor), phrase two the answer (G to C).
  const MOTIF = [['E5', 0, 1], ['E5', 1, 1], ['G5', 2, 1], ['A5', 3, 4], ['G5', 8, 1], ['E5', 9, 1], ['D5', 10, 1], ['E5', 11, 1], ['C5', 12, 4]];
  const MOTIF_HARM = ['C5', 'C5', 'E5', 'E5', 'D5', 'C5', 'B4', 'C5', 'G4'];

  // ---------- songs ----------
  // Tokens are eighth notes: note, '-' holds, '.' rests, '|' marks bars (8 per bar). Chords: one or more per
  // bar. Drums: 16 sixteenths per bar – k kick, s snare, h hat, o open hat, t tom, c castanets.
  // Each song is a function of the cue's options so one cue can have several moods.
  const T = (n, w, v, x = {}) => ({ n, w, v, ...x });
  const SONGS = {
    dawn: (o) => o.resolve ? {
      bpm: 66, chords: 'F | G | C | C', cs: [{ style: 'pad', w: 'pad', v: 0.05, oct: 3, rv: 0.6 }],
      tracks: [T('F1 - - - - - - - | G1 - - - - - - - | C2 - - - - - - - | C2 - - - - - - -', 'tri', 0.2)],
      motif: { at: 12, from: 4, to: 9, w: 'bell', v: 0.12 },
    } : {
      bpm: 66, chords: 'Csus2 | Am7 | Fmaj7 | Gsus', cs: [{ style: 'pad', w: 'pad', v: 0.045, oct: 3, rv: 0.6 }],
      tracks: [T('C2 - - - - - - - | A1 - - - - - - - | F1 - - - - - - - | G1 - - - - - - -', 'tri', 0.18)],
      motif: { at: 8, from: 0, to: 4, w: 'bell', v: 0.11 },
    },
    title: () => ({
      bpm: 80, chords: 'C | Fmaj7 C', cs: [{ style: 'pad', w: 'pad', v: 0.05, oct: 3, rv: 0.6 }],
      tracks: [T('C5 G5 C6 E6 - - - - | D6 - - - C6 - - -', 'bell', 0.09, { rv: 0.6 }), T('C2 - - - - - - - | F1 - - - C2 - - -', 'tri', 0.25)],
      drums: 'k...............|................', dv: 1.4,
    }),
    student: () => ({
      bpm: 88, chords: 'Fmaj7 | Em7 | Dm7 | Cmaj7', cs: [{ style: 'arp8', w: 'gtr', v: 0.05, oct: 4, rv: 0.3 }],
      tracks: [
        T('A5 - - G5 - E5 - - | G5 - - - - - . . | F5 - - E5 - C5 - - | E5 - - - - - . .', 'p25', 0.06, { vib: true, rv: 0.35 }),
        T('F2 . . F2 . . C3 . | E2 . . E2 . . B2 . | D2 . . D2 . . A2 . | C2 . . C2 . . G2 .', 'tri', 0.24),
      ],
      drums: 'k.....h.s.....h.', dv: 0.5,
    }),
    parkrun: () => ({
      bpm: 150, chords: 'C | G | Am | F | C | G | F | G', cs: [{ style: 'arp16', w: 'p12', v: 0.032 }],
      tracks: [
        T('C5 - E5 G5 - E5 G5 A5 | G5 - - D5 - G5 F5 E5 | E5 - A5 C6 - B5 A5 G5 | A5 - - F5 - E5 F5 G5 | C6 - B5 C6 - G5 E5 G5 | B5 - A5 B5 - G5 D5 G5 | A5 G5 F5 A5 C6 - A5 F5 | G5 - - - D5 E5 F5 G5', 'p25', 0.1, { vib: true, rv: 0.15 }),
        T('C3 C4 C3 C4 C3 C4 G2 B2 | G2 G3 G2 G3 G2 G3 D3 B2 | A2 A3 A2 A3 A2 A3 E3 G3 | F2 F3 F2 F3 F2 F3 C3 E3 | C3 C4 C3 C4 C3 C4 E3 C3 | G2 G3 G2 G3 G2 G3 B2 D3 | F2 F3 F2 F3 A2 A3 C3 A2 | G2 G3 G2 G3 G2 D3 G2 B2', 'tri', 0.28),
      ],
      drums: 'k.h.s.h.k.khs.h.',
    }),
    dust: () => ({
      bpm: 72, chords: 'Am | G | F | E', cs: [{ style: 'pad', w: 'pad', v: 0.03, oct: 3, rv: 0.6 }],
      tracks: [
        T('A5 . E5 . C6 . E5 . | G5 . D5 . B5 . D5 . | F5 . C5 . A5 . C5 . | E5 . B4 . G#5 - - -', 'bell', 0.055, { rv: 0.6 }),
        T('A1 - - - - - - - | G1 - - - - - - - | F1 - - - - - - - | E1 - - - - - - -', 'tri', 0.18),
      ],
    }),
    lonely: (o) => o.lift ? {
      bpm: 104, chords: 'C | G | Am | F', cs: [{ style: 'arp16', w: 'gtr', v: 0.045, rv: 0.3 }],
      tracks: [
        T('E5 - - D5 - C5 - G5 | G5 - - - D5 - - - | C5 - - B4 - C5 - E5 | A5 - - G5 - E5 - D5', 'p25', 0.085, { vib: true, rv: 0.3 }),
        T('C2 . C3 . C2 . C3 . | G1 . G2 . G1 . G2 . | A1 . A2 . A1 . A2 . | F1 . F2 . F1 . F2 .', 'tri', 0.26),
      ],
      drums: 'k...h.h.s...h.hh', dv: 0.8,
    } : {
      bpm: 80, chords: 'C | G | Am | F', cs: [{ style: 'arp8', w: 'gtr', v: 0.055, rv: 0.45 }, { style: 'pad', w: 'pad', v: 0.02, oct: 3, rv: 0.6 }],
      tracks: [
        T('E5 - - - - - . . | D5 - - - - - . . | C5 - - - - - . . | A4 - - - - - . .', 'bell', 0.05, { rv: 0.6 }),
        T('C2 - - - - - - - | G1 - - - - - - - | A1 - - - - - - - | F1 - - - - - - -', 'tri', 0.18),
      ],
    },
    rise: (o) => ({
      bpm: 118, chords: 'D | A | Bm | G', cs: o.soft ? [{ style: 'arp8', w: 'gtr', v: 0.05, rv: 0.4 }, { style: 'pad', w: 'pad', v: 0.025, oct: 3, rv: 0.6 }] : [{ style: 'arp16', w: 'p12', v: 0.03 }, { style: 'pad', w: 'pad', v: 0.02, oct: 3 }],
      tracks: [
        T('F#5 - - A5 - - D6 - | C#6 - - A5 - - E5 - | D5 - - F#5 - - B5 - | A5 - G5 - F#5 - E5 -', o.soft ? 'bell' : 'p25', o.soft ? 0.07 : 0.09, { vib: true, rv: 0.35 }),
        T('D2 . D3 . D2 . D3 . | A1 . A2 . A1 . A2 . | B1 . B2 . B1 . B2 . | G1 . G2 . G1 . G2 .', 'tri', o.soft ? 0.2 : 0.27),
      ],
      drums: o.soft ? '' : 'k...h...s...h.h.',
    }),
    knee: () => ({
      bpm: 72, chords: 'Dm | Bb | Gm | A', cs: [{ style: 'pad', w: 'pad', v: 0.045, oct: 3, rv: 0.5 }],
      tracks: [
        T('A5 - - - - - - - | F5 - - - - - - - | D5 - - - G5 - - - | C#5 - - - - - - -', 'p12', 0.05, { vib: true, rv: 0.5 }),
        T('D2 D2 D2 D2 D2 D2 D2 D2 | Bb1 Bb1 Bb1 Bb1 Bb1 Bb1 Bb1 Bb1 | G1 G1 G1 G1 G1 G1 G1 G1 | A1 A1 A1 A1 A1 A1 A1 A1', 'tri', 0.16, { gate: 0.5 }),
      ],
      drums: 'k.......k.......', dv: 0.6,
    }),
    race: (o) => ({
      bpm: 156, chords: 'G | D | Em | C', cs: [{ style: 'arp16', w: 'p12', v: 0.034 }],
      tracks: [
        T('B5 - D6 - B5 A5 G5 - | A5 - - - F#5 - D5 - | G5 - B5 - E6 - D6 B5 | C6 - B5 - A5 - G5 A5', 'p25', 0.1, { vib: true, rv: 0.15 }),
        ...(o.big ? [T('B4 - D5 - B4 A4 G4 - | A4 - - - F#4 - D4 - | G4 - B4 - E5 - D5 B4 | C5 - B4 - A4 - G4 A4', 'p50', 0.04)] : []),
        T('G2 G3 G2 G3 G2 G3 G2 G3 | D2 D3 D2 D3 D2 D3 D2 D3 | E2 E3 E2 E3 E2 E3 E2 E3 | C2 C3 C2 C3 C2 C3 D2 D3', 'tri', 0.28),
      ],
      drums: o.big ? 'k.hsk.hsk.hsk.ss' : 'k.h.s.h.k.khs.h.',
    }),
    chase: () => ({
      bpm: 132, chords: 'D | A | Bm | G | D | A | Bm | G', cs: [{ style: 'arp16', w: 'p12', v: 0.032 }],
      tracks: [
        T('D5 - F#5 - A5 - - F#5 | E5 - - C#5 - E5 A5 - | F#5 - - D5 - B4 D5 F#5 | G5 - F#5 - E5 - D5 E5 | D5 - F#5 - A5 - D6 - | C#6 - - A5 - E5 A5 - | B5 - A5 - F#5 - D5 F#5 | G5 - - A5 - - - -', 'p25', 0.1, { vib: true, rv: 0.15 }),
        T('D2 D3 D2 D3 D2 D3 D2 D3 | A1 A2 A1 A2 A1 A2 A1 A2 | B1 B2 B1 B2 B1 B2 B1 B2 | G1 G2 G1 G2 A1 A2 A1 A2 | D2 D3 D2 D3 D2 D3 D2 D3 | A1 A2 A1 A2 A1 A2 A1 A2 | B1 B2 B1 B2 G1 G2 G1 G2 | G1 G2 G1 G2 A1 A2 C#2 E2', 'tri', 0.28),
      ],
      drums: 'k.h.s.hkk.h.s.hs',
    }),
    approach: () => ({
      bpm: 120, chords: 'Em | C | G | D', cs: [{ style: 'arp16', w: 'p12', v: 0.036, rv: 0.2 }, { style: 'pad', w: 'pad', v: 0.025, oct: 3 }],
      tracks: [
        T('B5 - - - - - - - | C6 - - - - - - - | D6 - - - B5 - - - | A5 - - - F#5 - - -', 'p25', 0.08, { vib: true, rv: 0.4 }),
        T('E2 E2 E3 E2 E2 E2 E3 E2 | C2 C2 C3 C2 C2 C2 C3 C2 | G1 G1 G2 G1 G1 G1 G2 G1 | D2 D2 D3 D2 D2 D2 D3 D2', 'tri', 0.26, { gate: 0.6 }),
      ],
      drums: 'k...k...k...k.h.',
    }),
    ordeal: (o) => o.calm ? {
      bpm: 60, chords: 'G | D | Em | C', cs: [{ style: 'pad', w: 'pad', v: 0.045, oct: 3, rv: 0.7 }],
      tracks: [T('B5 . . . . . . . | A5 . . . . . . . | G5 . . . . . . . | E5 . . . . . . .', 'bell', 0.07, { rv: 0.7 }), T('G1 - - - - - - - | D2 - - - - - - - | E2 - - - - - - - | C2 - - - - - - -', 'tri', 0.18)],
    } : o.push ? {
      bpm: 100, chords: 'Bm | G | D | A', cs: [{ style: 'arp16', w: 'p12', v: 0.034 }, { style: 'pad', w: 'pad', v: 0.025, oct: 3 }],
      tracks: [
        T('F#5 - - - D5 - - - | B4 - - - D5 - G5 - | F#5 - - - A5 - - - | E5 - - - C#5 - - -', 'p25', 0.09, { vib: true, rv: 0.3 }),
        T('B1 B1 B2 B1 B1 B1 B2 B1 | G1 G1 G2 G1 G1 G1 G2 G1 | D2 D2 D3 D2 D2 D2 D3 D2 | A1 A1 A2 A1 A1 A1 A2 A1', 'tri', 0.26, { gate: 0.6 }),
      ],
      drums: 'k...s...k.k.s...',
    } : {
      bpm: 64, chords: 'Bm | C | Bm | C', cs: [{ style: 'pad', w: 'pad', v: 0.05, oct: 3, rv: 0.5 }],
      tracks: [
        T('D5 - - - C#5 - - - | E5 - - - - - - - | D5 - - - B4 - - - | C5 - - - - - - -', 'p12', 0.045, { vib: true, rv: 0.6 }),
        T('F#6 F#6 F#6 F#6 F#6 F#6 F#6 F#6 | G6 G6 G6 G6 G6 G6 G6 G6 | F#6 F#6 F#6 F#6 F#6 F#6 F#6 F#6 | G6 G6 G6 G6 G6 G6 G6 G6', 'p12', 0.012, { gate: 0.4, rv: 0.6 }),
        T('B1 - - - - - - - | C2 - - - - - - - | B1 - - - - - - - | C2 - - - - - - -', 'tri', 0.2),
      ],
    },
    triumph: (o) => o.soft ? {
      bpm: 84, chords: 'C | G | Am | F', cs: [{ style: 'pad', w: 'pad', v: 0.045, oct: 3, rv: 0.6 }, { style: 'arp8', w: 'gtr', v: 0.035, rv: 0.4 }],
      tracks: [T('E5 - E5 G5 A5 - - - | G5 - - - D5 - - - | C5 - - - E5 - A5 - | G5 - - - - - . .', 'bell', 0.08, { rv: 0.6 }), T('C2 - - - - - - - | G1 - - - - - - - | A1 - - - - - - - | F1 - - - - - - -', 'tri', 0.2)],
    } : {
      bpm: 120, chords: 'C | G | Am | F', cs: [{ style: 'arp16', w: 'p12', v: 0.034 }, { style: 'pad', w: 'pad', v: 0.025, oct: 3, rv: 0.4 }],
      tracks: [
        T('E5 - E5 G5 A5 - C6 - | B5 - G5 - D5 - G5 - | A5 - C6 - E6 - D6 C6 | C6 - - - A5 - G5 -', 'p25', 0.1, { vib: true, rv: 0.3 }),
        ...(o.big ? [T('E6 - E6 G6 A6 - C7 - | B6 - G6 - D6 - G6 - | A6 - C7 - E7 - D7 C7 | C7 - - - A6 - G6 -', 'bell', 0.035, { rv: 0.4 })] : []),
        T('C2 . C3 . C2 . C3 . | G1 . G2 . G1 . G2 . | A1 . A2 . A1 . A2 . | F1 . F2 . F1 . F2 .', 'tri', 0.28),
      ],
      drums: o.big ? 'k.hsk.h.s.hkk.ss' : 'k.h.s.h.k.h.s.hs',
    },
    xmas: () => ({
      bpm: 160, chords: 'C | C | C | C | F | C | D7 | G7', cs: [{ style: 'arp16', w: 'p12', v: 0.03 }],
      tracks: [
        T('E5 - E5 - E5 - - - | E5 - E5 - E5 - - - | E5 - G5 - C5 - - D5 | E5 - - - - - . . | F5 - F5 - F5 - - F5 | F5 - E5 - E5 - E5 E5 | E5 - D5 - D5 - E5 - | D5 - - - G5 - - -', 'bell', 0.09, { rv: 0.3 }),
        T('C3 . G2 . C3 . G2 . | C3 . G2 . C3 . G2 . | C3 . E3 . F3 . G3 . | C3 . G2 . C3 . E3 . | F2 . C3 . F2 . C3 . | C3 . G2 . C3 . G2 . | D3 . A2 . D3 . A2 . | G2 . D3 . G2 . B2 .', 'tri', 0.28),
      ],
      drums: 'k.h.s.h.k.h.s.hh',
    }),
    fall_build: () => ({
      bpm: 136, accel: 0.1, chords: 'Am | Am | F | E', cs: [{ style: 'arp16', w: 'p12', v: 0.038 }],
      tracks: [
        T('A1 A2 A1 A2 A1 A2 A1 A2 | A1 A2 A1 A2 A1 A2 A1 A2 | F1 F2 F1 F2 F1 F2 F1 F2 | E1 E2 E1 E2 E1 E2 G#1 B1', 'tri', 0.28),
        T('E5 - - - - - - - | E5 - - - F5 - - - | F5 - - - - - - - | E5 - - - G#5 - - -', 'p25', 0.06, { vib: true }),
      ],
      drums: 'k.h.k.h.k.h.k.hh',
    }),
    fall: () => ({
      bpm: 76, chords: 'Am | F | C | E', cs: [{ style: 'pad', w: 'pad', v: 0.04, oct: 3, rv: 0.6 }, { style: 'arp8', w: 'gtr', v: 0.035, rv: 0.5 }],
      tracks: [
        T('A4 - - - C5 - B4 A4 | F4 - - - A4 - G4 F4 | E4 - - G4 C5 - B4 A4 | G#4 - - - B4 - - -', 'bell', 0.08, { rv: 0.6 }),
        T('A1 - - - - - - - | F1 - - - - - - - | C2 - - - - - - - | E1 - - - - - - -', 'tri', 0.2),
      ],
    }),
    valencia: () => ({
      bpm: 116, chords: 'Am | G | F | E', cs: [{ style: 'strum', w: 'gtr', v: 0.045, oct: 3, pat: 'x.x.xx.x', rv: 0.25 }],
      tracks: [
        T('C6 - B5 A5 B5 - A5 G5 | B5 - A5 G5 A5 - G5 F5 | A5 - G5 F5 G5 - F5 E5 | G#5 - - - E5 - - -', 'gtr', 0.09, { rv: 0.3 }),
        T('A2 . E2 . A2 . E2 . | G2 . D2 . G2 . D2 . | F2 . C2 . F2 . C2 . | E2 . B1 . E2 . G#2 .', 'tri', 0.26),
      ],
      drums: 'c.cck.c.c.cck.c.',
    }),
    comeback: (o) => o.lift ? {
      bpm: 100, chords: 'Bm | G | D | A', cs: [{ style: 'arp16', w: 'p12', v: 0.034 }, { style: 'pad', w: 'pad', v: 0.025, oct: 3, rv: 0.4 }],
      tracks: [
        T('F#5 - - - E5 - D5 - | D5 - - - B4 - - - | A4 - D5 - F#5 - A5 - | G5 - - - F#5 - E5 -', 'p25', 0.1, { vib: true, rv: 0.3 }),
        T('B1 . B2 . B1 . B2 . | G1 . G2 . G1 . G2 . | D2 . D3 . D2 . D3 . | A1 . A2 . A1 . A2 .', 'tri', 0.28),
      ],
      drums: 'k...s...k.k.s...',
    } : {
      bpm: 100, chords: 'Bm | G | D | A', cs: [{ style: 'arp8', w: 'gtr', v: 0.05, rv: 0.4 }],
      tracks: [T('F#5 - - - E5 - D5 - | D5 - - - B4 - - - | A4 - D5 - F#5 - A5 - | G5 - - - F#5 - E5 -', 'bell', 0.06, { rv: 0.5 }), T('B1 - - - - - - - | G1 - - - - - - - | D2 - - - - - - - | A1 - - - - - - -', 'tri', 0.2)],
    },
    boss: (o) => ({
      bpm: o.slow ? 96 : 168, chords: 'Em | Em | C | B | Em | G | C | B', cs: [{ style: 'arp16', w: 'p12', v: 0.03 }],
      tracks: [
        T('E5 - - B4 E5 - G5 F#5 | E5 - D5 - B4 - - - | C5 - E5 - G5 - E5 C5 | B4 - D#5 - F#5 - B5 - | E5 - - B4 E5 - G5 A5 | B5 - A5 - G5 - F#5 - | G5 - E5 - C5 - E5 G5 | F#5 - - - D#5 - B4 -', 'p25', 0.1, { vib: true, rv: 0.2 }),
        T('E2 E3 E2 E3 E2 E3 E2 E3 | E2 E3 E2 E3 D2 D3 D2 D3 | C2 C3 C2 C3 C2 C3 C2 C3 | B1 B2 B1 B2 B1 B2 D#2 F#2 | E2 E3 E2 E3 E2 E3 E2 E3 | G2 G3 G2 G3 D2 D3 D2 D3 | C2 C3 C2 C3 A1 A2 A1 A2 | B1 B2 B1 B2 B1 B2 B1 B2', 'tri', 0.28),
      ],
      drums: o.slow ? 'k.......s.......' : 'k.hkk.h.s.hkk.s.',
    }),
    comic: () => ({
      bpm: 132, chords: 'C | G7 | C | G7', cs: [{ style: 'stab', w: 'p50', v: 0.03, oct: 4 }],
      tracks: [
        T('E5 . G5 . C6 . G5 . | F5 . G5 . B5 . G5 . | E5 . G5 . C6 . E6 . | D6 . B5 . G5 . . .', 'p50', 0.08, { gate: 0.5 }),
        T('C3 . G2 . C3 . G2 . | G2 . D3 . G2 . B2 . | C3 . G2 . C3 . E3 . | G2 . B2 . D3 . G2 .', 'tri', 0.3, { gate: 0.6 }),
      ],
      drums: 'k...s...k...s...',
    }),
    warm: () => ({
      bpm: 100, chords: 'D | Em | G | A | D | G | Em | A', cs: [{ style: 'arp8', w: 'gtr', v: 0.045, rv: 0.4 }, { style: 'pad', w: 'pad', v: 0.02, oct: 3, rv: 0.5 }],
      tracks: [
        T('A5 - B5 A5 G5 - E5 - | D5 - E5 G5 A5 - - - | B5 - A5 G5 E5 - G5 - | A5 - - - D6 - B5 - | A5 - G5 E5 D5 - E5 G5 | A5 - B5 - A5 - - - | G5 - E5 D5 B4 - D5 - | E5 - - - . . . .', 'bell', 0.08, { rv: 0.45 }),
        T('D3 . A2 . D3 . A2 . | E3 . B2 . E3 . B2 . | G2 . D3 . G2 . D3 . | A2 . E3 . A2 . E3 . | D3 . A2 . D3 . A2 . | G2 . D3 . G2 . D3 . | E3 . B2 . E3 . B2 . | A2 . E3 . A2 . . .', 'tri', 0.24),
      ],
      drums: 'k.......h...k...', dv: 0.6,
    }),
    finale: () => ({
      bpm: 138, chords: 'C | G | Am | Em | F | C | Dm G | C', cs: [{ style: 'arp16', w: 'p12', v: 0.034 }, { style: 'pad', w: 'pad', v: 0.03, oct: 3, rv: 0.4 }],
      tracks: [
        T('E5 - E5 - G5 - A5 - | G5 - E5 - D5 - E5 - | C5 - - - E5 - A5 - | G5 - - - - - - - | A5 - C6 - F5 - A5 - | G5 - E5 - C6 - G5 - | F5 - A5 - D6 - B5 - | C6 - - - - - - -', 'p25', 0.1, { vib: true, rv: 0.3 }),
        T('E6 - E6 - G6 - A6 - | G6 - E6 - D6 - E6 - | C6 - - - E6 - A6 - | G6 - - - - - - - | A6 - C7 - F6 - A6 - | G6 - E6 - C7 - G6 - | F6 - A6 - D7 - B6 - | C7 - - - - - - -', 'bell', 0.035, { rv: 0.4 }),
        T('C2 C3 C2 C3 C2 C3 C2 C3 | G1 G2 G1 G2 G1 G2 G1 G2 | A1 A2 A1 A2 A1 A2 A1 A2 | E2 E3 E2 E3 E2 E3 E2 E3 | F1 F2 F1 F2 F1 F2 F1 F2 | C2 C3 C2 C3 C2 C3 C2 C3 | D2 D3 D2 D3 G1 G2 G1 G2 | C2 C3 C2 C3 C2 C3 C2 C3', 'tri', 0.28),
      ],
      drums: 'k.h.s.h.k.khs.hs',
    }),
    credits: () => ({
      bpm: 132, chords: 'C | G | Am | F | C | G | F | C', cs: [{ style: 'arp16', w: 'p12', v: 0.03 }],
      tracks: [
        T('C5 - E5 G5 - E5 G5 A5 | G5 - - D5 - G5 F5 E5 | E5 - A5 C6 - B5 A5 G5 | A5 - - F5 - E5 F5 G5 | C6 - B5 C6 - G5 E5 G5 | B5 - A5 B5 - G5 D5 G5 | A5 G5 F5 A5 C6 - A5 F5 | C6 - - - - - . .', 'p25', 0.1, { vib: true, rv: 0.2 }),
        T('C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | A2 . E3 . A2 . E3 . | F2 . C3 . F2 . C3 . | C3 . G3 . C3 . G3 . | G2 . D3 . G2 . D3 . | F2 . C3 . F2 . C3 . | C3 . G2 . C3 . . .', 'tri', 0.26),
      ],
      drums: 'k...h...s...h.h.',
    }),
  };

  function parseTrack(str) {
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

  const ev = (t, d, w, f, v, extra) => Object.assign({ t, d, w, f, v }, extra || {});
  function drumEvents(ch, t, vol = 1) {
    if (ch === 'k') return [ev(t, 0.14, 'kick', 150, 0.5 * vol)];
    if (ch === 's') return [ev(t, 0.16, 'snare', 0, 0.2 * vol, { rv: 0.15 })];
    if (ch === 'h') return [ev(t, 0.03, 'hat', 0, 0.06 * vol)];
    if (ch === 'o') return [ev(t, 0.14, 'hat', 0, 0.07 * vol)];
    if (ch === 't') return [ev(t, 0.2, 'kick', 260, 0.3 * vol)];
    if (ch === 'c') return [ev(t, 0.035, 'cast', 0, 0.12 * vol, { pan: 0.3 })];
    return [];
  }

  // Events for one song definition from t0 to t1 (relative times first, then shifted).
  function songEvents(def, T0, T1, opts = {}) {
    const span = T1 - T0;
    const accel = def.accel || 0;
    // raw time u maps to real time ln(1 + a·u)/a, so a > 0 speeds the music up as it goes
    const warp = accel ? (u) => Math.log(1 + accel * u) / accel : (u) => u;
    const rawEnd = accel ? (Math.exp(accel * span) - 1) / accel : span;
    const e8 = 30 / (opts.bpm || def.bpm);
    const tracks = (def.tracks || []).map((tr) => ({ ...tr, P: parseTrack(tr.n) }));
    const bars = def.chords ? def.chords.split('|').map((b) => b.trim().split(/\s+/)) : [];
    const loopE = Math.max(bars.length * 8, ...tracks.map((tr) => tr.P.eighths), 8);
    const out = [];
    const vol = opts.vol === undefined ? 1 : opts.vol;
    const push = (u, d, w, f, v, x) => { if (u < rawEnd - 0.02) out.push(ev(u, Math.min(d, rawEnd - u), w, f, v * vol, x)); };
    for (let base = 0; base < rawEnd; base += loopE * e8) {
      for (const tr of tracks) {
        for (const n of tr.P.notes) {
          const f = hz(n.note) * Math.pow(2, tr.oct || 0);
          push(base + n.i * e8, n.len * e8 * (tr.gate || 0.92), tr.w, f, tr.v, { vib: tr.vib, rv: tr.rv, pan: tr.pan, pluck: tr.pluck });
        }
      }
      bars.forEach((chs, b) => {
        const bt = base + b * 8 * e8, seg = 8 / chs.length;
        for (const cs of def.cs || []) {
          chs.forEach((ch, ci) => {
            const notes = chordNotes(ch, cs.oct || 4), s0 = bt + ci * seg * e8;
            const x = { rv: cs.rv, pan: cs.pan };
            if (cs.style === 'pad') notes.forEach((f) => push(s0, seg * e8, cs.w, f, cs.v, x));
            else if (cs.style === 'arp16' || cs.style === 'arp8') {
              const step = cs.style === 'arp16' ? 0.5 : 1;
              for (let k = 0; k * step < seg; k++) push(s0 + k * step * e8, step * e8 * 0.85, cs.w, notes[k % notes.length] * (k % 8 >= 4 && cs.style === 'arp16' ? 2 : 1), cs.v, { ...x, pluck: true });
            } else if (cs.style === 'strum') {
              for (let k = 0; k < seg; k++) if ((cs.pat || 'x.x.x.x.')[(ci * seg + k) % 8] === 'x') notes.forEach((f, j) => push(s0 + k * e8 + j * 0.014, e8 * 1.6, cs.w, f, cs.v * (k % 2 ? 0.7 : 1), x));
            } else if (cs.style === 'stab') {
              for (let k = 1; k < seg; k += 2) notes.forEach((f) => push(s0 + k * e8, e8 * 0.4, cs.w, f, cs.v, { ...x, pluck: true }));
            }
          });
        }
        if (def.drums) {
          const pats = def.drums.split('|'), pat = pats[b % pats.length];
          for (let k = 0; k < 16; k++) { const u = bt + k * (e8 / 2); if (u < rawEnd - 0.02) out.push(...drumEvents(pat[k], u, (def.dv || 1) * vol)); }
        }
      });
    }
    if (def.motif) out.push(...motifEvents(0, rawEnd, { ...def.motif, bpm: opts.bpm || def.bpm, bare: true, vol }));
    for (const e of out) { const a = warp(e.t), b = warp(e.t + e.d); e.t = T0 + a; e.d = b - a; }
    return out;
  }

  // The leitmotif on its own: bell over a soft pad; opts.from/to pick the phrase, fit squeezes it into
  // the time available, full adds harmony and bass, low drops an octave.
  function motifEvents(T0, T1, o = {}) {
    const from = o.from || 0, to = o.to === undefined ? (o.partial || MOTIF.length) : o.to;
    const notes = MOTIF.slice(from, to), harm = MOTIF_HARM.slice(from, to);
    const first = notes[0][1], lastStart = notes[notes.length - 1][1] - first;
    let e8 = 30 / (o.bpm || 76);
    const lead = o.bare ? (o.at || 0) * e8 : 0.15;
    if (o.fit && lastStart > 0) e8 = Math.min(e8, (T1 - T0 - lead - 0.3) / lastStart);
    const vol = o.vol === undefined ? 1 : o.vol, oct = o.low ? 0.5 : 1;
    const out = [];
    notes.forEach(([n, i, len], k) => {
      const t = T0 + lead + (i - first) * e8;
      if (t >= T1 - 0.05) return;
      out.push(ev(t, Math.max(0.9, len * e8 * 1.6), o.w || 'bell', hz(n) * oct, (o.v || 0.13) * vol, { rv: 0.6 }));
      if (!o.bare) out.push(ev(t, len * e8 * 0.9, 'p12', hz(n) * oct * 0.5, 0.025 * vol, { vib: true, rv: 0.4 }));
      if (o.full) out.push(ev(t, len * e8 * 0.95, 'p25', hz(harm[k]) * oct * 0.5, 0.035 * vol, { vib: true, rv: 0.4, pan: 0.25 }));
    });
    if (!o.bare) {
      // pad: A minor under the question, G then C under the answer
      const seg = (a, b, ch) => { const s = T0 + lead + (a - first) * e8, e = Math.min(T1, T0 + lead + (b - first) * e8); if (e > s) chordNotes(ch, 3).forEach((f) => out.push(ev(Math.max(T0, s), e - Math.max(T0, s), 'pad', f * oct, 0.04 * vol, { rv: 0.6 }))); };
      if (from < 4) seg(Math.min(first, 0) - 0.4, to <= 4 ? 1e3 : 8, 'Am7');
      if (to > 4) { seg(Math.max(8, first) - (first >= 8 ? 0.4 : 0), 12, 'G'); seg(12, 1e3, 'C'); }
      if (o.full) {
        if (from < 4) out.push(ev(T0 + lead, 8 * e8, 'tri', hz('A2') * oct, 0.2 * vol));
        if (to > 4) { out.push(ev(T0 + lead + (8 - first) * e8, 4 * e8, 'tri', hz('G2') * oct, 0.2 * vol)); out.push(ev(T0 + lead + (12 - first) * e8, 8 * e8, 'tri', hz('C2') * oct, 0.2 * vol)); }
      }
    }
    return out;
  }

  const N = hz;
  const SFX = {
    coin: (t) => [ev(t, 0.06, 'p25', N('B5'), 0.1), ev(t + 0.06, 0.28, 'p25', N('E6'), 0.1, { pluck: true, rv: 0.3 })],
    pb: (t) => [ev(t, 0.05, 'p25', N('E6'), 0.09), ev(t + 0.05, 0.05, 'p25', N('G6'), 0.09), ev(t + 0.1, 0.4, 'bell', N('C7'), 0.08, { rv: 0.4 })],
    tick: (t) => [ev(t, 0.03, 'p12', N('C7'), 0.06)],
    beep: (t) => [ev(t, 0.14, 'p50', N('A4'), 0.1, { rv: 0.3 })],
    go: (t) => [ev(t, 0.4, 'p50', N('A5'), 0.11, { rv: 0.3 })],
    whoosh: (t) => [ev(t, 0.4, 'noise', 0, 0.12, { hp: 1800, sweep: true })],
    cheer: (t) => [ev(t, 2.2, 'noise', 0, 0.1, { bp: 1300, swell: true, rv: 0.3 }), ev(t + 0.2, 1.8, 'noise', 0, 0.06, { bp: 2400, swell: true })],
    boom: (t) => [ev(t, 0.8, 'noise', 0, 0.3, { lp: 400, rv: 0.5 }), ev(t, 0.7, 'tri', 120, 0.4, { f2: 30 })],
    thud: (t) => [ev(t, 0.18, 'kick', 110, 0.5)],
    fanfare: (t) => {
      const seq = [['G4', 0], ['C5', 1], ['E5', 2], ['G5', 3], ['C6', 4], ['E6', 6], ['G6', 7]];
      const o = seq.map(([n, i]) => ev(t + i * 0.09, i === 7 ? 0.8 : 0.09, 'p25', N(n), 0.1, i === 7 ? { vib: true, rv: 0.4 } : null));
      o.push(ev(t + 0.63, 0.9, 'pad', N('C5'), 0.05, { rv: 0.5 }), ev(t + 0.63, 0.9, 'pad', N('E5'), 0.05, { rv: 0.5 }), ev(t + 0.63, 0.8, 'tri', N('C3'), 0.3));
      return o;
    },
    alarm: (t) => { const o = []; for (let k = 0; k < 12; k++) o.push(ev(t + k * 0.13, 0.07, 'p50', k % 2 ? N('A6') : N('E6'), 0.07)); return o; },
    buzz: (t) => { const o = []; for (let k = 0; k < 4; k++) o.push(ev(t + k * 0.12, 0.09, 'p50', 58, 0.12)); return o; },
    crack: (t) => [ev(t, 0.09, 'noise', 0, 0.4, { hp: 900 }), ev(t, 0.5, 'p50', 330, 0.12, { f2: 60 }), ev(t, 0.6, 'kick', 90, 0.5)],
    clink: (t) => [ev(t, 0.7, 'bell', N('E7'), 0.07, { rv: 0.5 }), ev(t + 0.04, 0.7, 'bell', N('B6'), 0.06, { rv: 0.5 })],
    tear: (t) => [ev(t, 0.28, 'noise', 0, 0.1, { hp: 2200, sweep: true })],
    door: (t) => [ev(t, 0.7, 'p12', 190, 0.04, { f2: 150, vib: true }), ev(t + 0.1, 0.9, 'noise', 0, 0.05, { lp: 1200, swell: true })],
    megaphone: (t) => [0, 0.34, 0.7, 1.0, 1.36].map((dt, k) => ev(t + dt, 0.26, 'p50', [420, 470, 400, 450, 380][k], 0.05, { vib: true })),
  };

  // ---------- ambience beds ----------
  const R = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  function ambEvents(name, t0, t1, lvl = 1) {
    const o = [];
    let k = 0;
    if (name === 'wind') for (let t = t0; t < t1; t += 1.4, k++) o.push(ev(t, Math.min(3, t1 - t + 0.4), 'noise', 0, 0.045 * lvl * (0.6 + 0.8 * R(k, 1)), { lp: 350 + 350 * R(k, 2), swell: true, pan: R(k, 3) - 0.5 }));
    if (name === 'crowd') for (let t = t0; t < t1; t += 0.8, k++) o.push(ev(t, Math.min(1.8, t1 - t + 0.3), 'noise', 0, 0.05 * lvl, { bp: 600 + 500 * R(k, 4), swell: true, pan: R(k, 5) - 0.5 }));
    if (name === 'rain') for (let t = t0; t < t1; t += 0.9, k++) { o.push(ev(t, Math.min(2, t1 - t + 0.3), 'noise', 0, 0.022 * lvl, { bp: 3800 + 800 * R(k, 5), swell: true })); if (R(k, 6) > 0.6) o.push(ev(t + 0.4, 0.05, 'sine', 1800 + 900 * R(k, 7), 0.012 * lvl, { rv: 0.4 })); }
    if (name === 'birds') for (let t = t0 + 0.3; t < t1 - 0.3; t += 0.6 + R(k, 8) * 1.4, k++) { const f = 2600 + R(k, 9) * 1800, n = 1 + Math.floor(R(k, 10) * 3); for (let j = 0; j < n; j++) o.push(ev(t + j * 0.09, 0.06, 'sine', f, 0.03 * lvl, { f2: f * (1.2 + R(k + j, 11) * 0.4), pan: R(k, 12) - 0.5 })); }
    if (name === 'heart') for (let t = t0 + 0.1; t < t1; t += 0.82) { o.push(ev(t, 0.14, 'kick', 70, 0.42 * lvl)); o.push(ev(t + 0.2, 0.12, 'kick', 58, 0.28 * lvl)); }
    if (name === 'clock') for (let t = t0 + 0.2; t < t1; t += 0.5, k++) o.push(ev(t, 0.025, 'p12', k % 2 ? N('G6') : N('C7'), 0.035 * lvl));
    return o;
  }

  // cues: [{t, name, opts} | {t, sfx}], ambs: [{t, name, level}] – each music cue and ambience bed lasts
  // until the next one; 'none' is silence. A cue with opts.cut ends the one before it abruptly.
  function buildEvents(cues, ambs, duration) {
    const out = [];
    const music = cues.filter((c) => c.name).sort((a, b) => a.t - b.t);
    const segs = [];
    for (const c of music) {
      const last = segs[segs.length - 1];
      if (last && last.name === c.name && JSON.stringify(last.opts) === JSON.stringify(c.opts)) continue;
      segs.push({ ...c });
    }
    segs.forEach((c, i) => {
      const next = segs[i + 1], t1 = next ? next.t : duration;
      if (c.name === 'none' || t1 - c.t < 0.1) return;
      const ev0 = c.name === 'motif' ? motifEvents(c.t, t1, c.opts) : songEvents(SONGS[c.name](c.opts || {}), c.t, t1, c.opts);
      const fade = next && next.opts && next.opts.cut ? 0.05 : !next ? 2.5 : c.name === 'motif' ? 0.3 : 0.9;
      const fin = (c.opts && c.opts.fadeIn) || 0;
      for (const e of ev0) {
        const r = t1 - e.t; if (r < fade) e.v *= Math.max(0, r / fade);
        if (fin && e.t - c.t < fin) e.v *= (e.t - c.t) / fin;
        if (e.t + e.d > t1 && e.w !== 'bell') e.d = Math.max(0.02, t1 - e.t); // bells ring on over the cut
        if (next && next.opts && next.opts.cut) e.rel = 0.04;
        if (e.v > 0.0005) out.push(e);
      }
    });
    for (const c of cues) if (c.sfx && SFX[c.sfx]) out.push(...SFX[c.sfx](c.t));
    const beds = [...ambs].sort((a, b) => a.t - b.t);
    beds.forEach((a, i) => { const t1 = i + 1 < beds.length ? beds[i + 1].t : duration; if (a.name !== 'none') out.push(...ambEvents(a.name, a.t, t1, a.level)); });
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
  function osc(ctx, V, w, f, when, stop, dest) {
    const o = ctx.createOscillator();
    if (w === 'tri') o.type = 'triangle'; else if (w === 'sine') o.type = 'sine'; else o.setPeriodicWave(V[w] || V.p25);
    o.frequency.setValueAtTime(f, when);
    o.connect(dest); o.start(when); o.stop(stop);
    return o;
  }
  function play(ctx, bus, e, when) {
    const V = setup(ctx);
    const g = ctx.createGain();
    let out = g;
    if (e.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, e.pan)); g.connect(p); out = p; }
    out.connect(bus.dry);
    if (e.rv && bus.wet) { const s = ctx.createGain(); s.gain.value = e.rv; out.connect(s); s.connect(bus.wet); }
    const end = when + e.d, gain = g.gain;
    const rel = e.w === 'pad' ? (e.rel || 0.6) : 0;
    gain.setValueAtTime(0, when);
    if (e.swell) {
      gain.linearRampToValueAtTime(e.v, when + e.d * 0.4);
      gain.linearRampToValueAtTime(0, end);
    } else if (e.w === 'pad') {
      const a = Math.min(0.35, e.d * 0.4);
      gain.linearRampToValueAtTime(e.v, when + a);
      gain.setValueAtTime(e.v, Math.max(when + a, end));
      gain.linearRampToValueAtTime(0, end + rel);
    } else if (e.pluck || e.w === 'bell' || e.w === 'gtr' || e.w === 'kick' || e.w === 'snare' || e.w === 'hat' || e.w === 'noise' || e.w === 'cast') {
      gain.linearRampToValueAtTime(e.v, when + 0.004);
      gain.exponentialRampToValueAtTime(0.0006, end);
    } else {
      gain.linearRampToValueAtTime(e.v, when + 0.006);
      gain.setValueAtTime(e.v, Math.max(when + 0.006, end - Math.min(0.04, e.d * 0.3)));
      gain.linearRampToValueAtTime(0, end);
    }
    const stop = end + rel + 0.02;
    if (e.w === 'kick') {
      const o = osc(ctx, V, 'sine', e.f, when, stop, g);
      o.frequency.exponentialRampToValueAtTime(38, end);
    } else if (e.w === 'snare' || e.w === 'hat' || e.w === 'noise' || e.w === 'cast') {
      const src = ctx.createBufferSource(); src.buffer = V.noise; src.loop = true;
      const f = ctx.createBiquadFilter();
      if (e.w === 'hat') { f.type = 'highpass'; f.frequency.value = 7000; }
      else if (e.w === 'snare') { f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7; }
      else if (e.w === 'cast') { f.type = 'bandpass'; f.frequency.value = 3400; f.Q.value = 3; }
      else if (e.lp) { f.type = 'lowpass'; f.frequency.value = e.lp; }
      else if (e.bp) { f.type = 'bandpass'; f.frequency.value = e.bp; f.Q.value = 0.5; }
      else { f.type = 'highpass'; f.frequency.value = e.hp || 1000; if (e.sweep) f.frequency.exponentialRampToValueAtTime((e.hp || 1000) * 3, end); }
      src.connect(f); f.connect(g);
      src.start(when, (e.t * 7.31) % 0.9); src.stop(stop);
      if (e.w === 'snare') {
        const og = ctx.createGain(); og.gain.value = 0.6; og.connect(g);
        const o = osc(ctx, V, 'tri', 190, when, stop, og); o.frequency.exponentialRampToValueAtTime(110, end);
      }
    } else if (e.w === 'bell') {
      osc(ctx, V, 'sine', e.f, when, stop, g);
      const hg = ctx.createGain(); hg.gain.setValueAtTime(0.35, when); hg.gain.exponentialRampToValueAtTime(0.01, when + Math.min(0.5, e.d)); hg.connect(g);
      osc(ctx, V, 'sine', e.f * 3.01, when, stop, hg);
      const tg = ctx.createGain(); tg.gain.value = 0.25; tg.connect(g);
      osc(ctx, V, 'tri', e.f * 2, when, stop, tg);
    } else if (e.w === 'pad') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.connect(g);
      for (const c of [-7, 7]) { const o = osc(ctx, V, 'p50', e.f, when, stop, lp); o.detune.value = c; }
    } else if (e.w === 'gtr') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, when); lp.frequency.exponentialRampToValueAtTime(700, end); lp.connect(g);
      osc(ctx, V, 'p25', e.f, when, stop, lp);
      const tg = ctx.createGain(); tg.gain.value = 0.5; tg.connect(g); osc(ctx, V, 'tri', e.f, when, stop, tg);
    } else {
      const t0 = when + (e.delay || 0);
      const o = osc(ctx, V, e.w, e.f, t0, stop, g);
      if (e.f2) o.frequency.exponentialRampToValueAtTime(e.f2, end);
      if (e.vib && e.d > 0.25) {
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
        const lg = ctx.createGain(); lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(e.f * 0.012, when + Math.min(0.3, e.d));
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(when); lfo.stop(stop);
      }
    }
  }
  // Master bus with a small hall: a deterministic noise impulse so live and offline renders match.
  function chain(ctx) {
    const master = ctx.createGain(); master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    master.connect(comp); comp.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch); let seed = 777 + ch * 999, lp = 0;
      for (let i = 0; i < len; i++) { seed = (Math.imul(seed, 1103515245) + 12345) | 0; const n = ((seed >>> 8) & 0xffff) / 32768 - 1; lp += (n - lp) * 0.35; d[i] = lp * Math.pow(1 - i / len, 3.2) * (i < ctx.sampleRate * 0.015 ? 0 : 1); }
    }
    const verb = ctx.createConvolver(); verb.normalize = true; verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    verb.connect(wet); wet.connect(master);
    return { dry: master, wet: verb, master };
  }

  // Live playback that follows a playhead (seek / pause safe).
  function LivePlayer(events) {
    let ctx = null, bus = null, base = 0, idx = 0;
    const lower = (t) => { let a = 0, b = events.length; while (a < b) { const m = (a + b) >> 1; if (events[m].t < t) a = m + 1; else b = m; } return a; };
    return {
      get ctx() { return ctx; },
      start(audioCtx, songT) {
        this.stop();
        ctx = audioCtx;
        bus = chain(ctx);
        base = ctx.currentTime + 0.05 - songT;
        // pick up long notes (pads, beds) that began just before the playhead
        idx = lower(songT - 2);
        while (idx < events.length && events[idx].t < songT && events[idx].t + events[idx].d < songT + 0.2) idx++;
      },
      time() { return ctx ? ctx.currentTime - base : 0; },
      pump() {
        if (!ctx || !bus) return;
        const horizon = ctx.currentTime - base + 0.35;
        while (idx < events.length && events[idx].t < horizon) {
          const e = events[idx++];
          const when = base + e.t;
          if (when >= ctx.currentTime - 0.01) play(ctx, bus, e, Math.max(when, ctx.currentTime));
          else if (when + e.d > ctx.currentTime + 0.2) play(ctx, bus, { ...e, d: when + e.d - ctx.currentTime, v: e.v * 0.8 }, ctx.currentTime);
        }
      },
      stop() {
        if (bus && ctx) {
          const m = bus.master;
          m.gain.setValueAtTime(m.gain.value, ctx.currentTime);
          m.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
          setTimeout(() => { try { m.disconnect(); } catch (e) { /* already gone */ } }, 120);
        }
        bus = null;
      },
    };
  }

  // Offline render for the video. Notes are created just in time (the context suspends every couple of
  // seconds) because every node scheduled up front costs processing time until it plays.
  async function renderOffline(events, duration, sampleRate = 44100) {
    const ctx = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
    const bus = chain(ctx);
    const step = 2;
    let idx = 0;
    const schedule = (until) => { while (idx < events.length && events[idx].t < until) { const e = events[idx++]; if (e.t < duration) play(ctx, bus, e, Math.max(e.t, ctx.currentTime)); } };
    schedule(step + 0.5);
    for (let t = step; t < duration; t += step) ctx.suspend(t).then(() => { schedule(t + step + 0.5); ctx.resume(); });
    return ctx.startRendering();
  }

  return { SONGS, SFX, MOTIF, buildEvents, songEvents, motifEvents, LivePlayer, renderOffline, hz };
})();
if (typeof window !== 'undefined') window.AUDIO = AUDIO;
