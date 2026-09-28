// CHAPTER 4 - THE PHANTOM (2024)
// Winter, shingles, doubt, the night before, and the Phantom 1:30 beaten at Hackney (1:29:01).
// Then everything it unlocked, and the next line: Valencia.
import * as THREE from 'three';
import { RaceScene } from '../RaceScene';
import { RunProfile } from '../profile';
import { PHANTOM_2024 } from '../../../data/activities';
import robinJ from '../../../data/gps/robin-hood-half.json';
import { SKY, chapterCard, logCard, boardCard, fades, steady } from '../common';
import { CodecScene } from '../Codec';
import { Card, grid } from '../Cards';
import { COL, env, smooth, clamp01, fmt } from '../../hud/Hud';
import { raceClock, stamp, bossPlate, eventTag } from '../../hud/widgets';
import { funnel, flag, arch } from '../dressing';
import { Ghost } from '../fx';
import { phantomDist } from './ch3';
import { Scene } from '../core';

export function ch4(): Scene[] {
  const scenes: Scene[] = [chapterCard('c4-card', 'CHAPTER 4', 'THE PHANTOM', '2024')];

  scenes.push(
    new Card({
      id: 'c4-winter',
      chapter: 'THE PHANTOM',
      dur: 7,
      draw: (t, h) => {
        const a = env(t, 0, 7, 0.5, 0.7);
        grid(h, a * 0.5);
        h.text('WINTER BLOCK  2024', 960, 380, { font: 'mono', size: 30, color: COL.uiDim, align: 'center', alpha: a, tracking: 10 });
        h.text('LONDON WINTER 10K   39:50', 960, 520, { font: 'mono', size: 52, color: COL.white, align: 'center', alpha: a * smooth(0.6, 1.1, t), tracking: 3 });
        h.text('LONG RUN   27 KM   RAIN', 960, 620, { font: 'mono', size: 52, color: COL.white, align: 'center', alpha: a * smooth(1.4, 1.9, t), tracking: 3 });
      },
      cues: [{ t: 0.6, kind: 'number-hit' }, { t: 1.4, kind: 'number-hit' }],
    }),
    new CodecScene({
      id: 'c4-codec-shingles',
      freq: '140.96',
      tint: 'amber',
      lines: [
        { who: 'LACTATE', text: 'Oak Hill parkrun. Your eye is swollen almost shut, Stride.' },
        { who: 'STRIDE', text: 'Shingles.' },
        { who: 'LACTATE', text: 'Then you rest. The Phantom will still be there in May.' },
      ],
    }),
    logCard('c4-doubt', [['24.04.2024', 'Too ambitious - completely blew up']], { hold: 1.2, col: COL.amber }),
  );

  // --- the day before: an easy shakeout on the course at dusk
  scenes.push(
    new RaceScene({
      id: 'c4-shakeout',
      arena: 'hackney',
      s0: 400,
      profile: steady(120, 40),
      sky: SKY.dusk,
      halfWidth: 3,
      shots: [
        { dur: 7, T: 2, cam: { mode: 'follow', dist: 8, h: 1.8, ang: 200, look: 1.2, fov: 32 }, cam2: { dist: 6 }, grade: { letterbox: 1 } },
        { dur: 6, T: 12, cam: { mode: 'follow', dist: 3, h: 1.2, ang: -100, look: 1.3, fov: 34 }, grade: { letterbox: 1 } },
      ],
      onFrame: (race, i, ctx) => {
        fades(ctx.r.grade, i.t, 13, 1, 1);
        ctx.r.grade.saturation = 0.75;
        ctx.hud.caption(['THE DAY BEFORE', 'LOG: "PRE HACKNEY SHAKE OUT"'], i.t, 1.2, env(i.t, 1, 12, 0.4, 0.6), 110, 150);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-city-quiet', dur: 13 }, { t: 0, kind: 'music', id: 'night', dur: 13 }],
    }),
    new Card({
      id: 'c4-bib',
      dur: 7,
      draw: (t, h) => {
        const a = env(t, 0, 7, 0.6, 0.8);
        // a race bib on a dark table, target written on the back in marker
        const g = h.g;
        g.save();
        g.globalAlpha = a;
        g.translate(960, 520);
        g.rotate(-0.05);
        g.fillStyle = '#e9e6de';
        g.fillRect(-380, -250, 760, 500);
        g.fillStyle = '#c0392b';
        g.fillRect(-380, -250, 760, 70);
        for (const [x, y] of [[-350, -220], [350, -220], [-350, 220], [350, 220]]) {
          g.fillStyle = '#9a9a9a';
          g.beginPath();
          g.arc(x, y, 9, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
        h.text('HACKNEY HALF 2024', 960, 318, { font: 'head', size: 40, weight: 700, color: COL.white, align: 'center', alpha: a, tracking: 8 });
        h.text('STRIDE', 960, 560, { font: 'head', size: 170, weight: 700, color: '#161616', align: 'center', alpha: a, tracking: 10 });
        h.text('1:29:59', 960, 700, { font: 'mono', size: 64, color: '#1d3f6e', align: 'center', alpha: a * smooth(2.5, 3.2, t) });
      },
      cues: [{ t: 2.5, kind: 'marker' }],
    }),
  );

  // --- PHANTOM 1:30, encounter 02: Hackney Half 19.05.2024. This time it is behind.
  const ph2 = RunProfile.fromSplits(PHANTOM_2024.splits, PHANTOM_2024.distanceKm, PHANTOM_2024.timeSec);
  const phD = phantomDist(ph2.distance);
  let phantom: Ghost;
  const lead = (T: number) => ph2.distAt(T) / (ph2.distance / 5400) - T; // seconds ahead of 1:30 pace
  let startArch: THREE.Object3D, finishArch: THREE.Object3D;
  scenes.push(
    new RaceScene({
      id: 'c4-phantom2',
      arena: 'hackney',
      profile: ph2,
      sky: SKY.morning,
      halfWidth: 4,
      field: { count: 260, pack: 8, kmin: 0.85, kmax: 1.2, seed: 41 },
      // start and finish share the same ground: the start arch only exists for the opening shot, and the
      // start-pen barriers are left out so nothing cuts across the finish straight
      spectators: [{ s0: 21100, s1: 21400, density: 0.9 }, { s0: 13000, s1: 13200, density: 0.5 }],
      build: async (race) => {
        startArch = arch(race, 0, 'HACKNEY HALF', 11);
        finishArch = arch(race, race.course.length, 'FINISH', 13);
        phantom = await Ghost.create(0x5ff3ff, true, 0.16);
        race.extras.add(...phantom.pacer('1:30'));
        phantom.camera = race.stage!.camera;
        phantom.prepare(phD, -2, 5600);
        race.extras.add(phantom.runner.root);
      },
      shots: [
        { dur: 5, T: -4, cam: { mode: 'follow', dist: 9, h: 3.5, ang: 160, look: 1.2 }, cam2: { dist: 7 }, grade: { letterbox: 1 } },
        { dur: 6, T: 1250, cam: { mode: 'follow', dist: 6, h: 1.4, ang: 175, look: 1.2, fov: 34 }, tag: 'behind' },
        { dur: 5, T: 2900, cam: { mode: 'follow', dist: 3.4, h: 1.0, ang: 92 } },
        { dur: 6, T: 4500, cam: { mode: 'follow', dist: 9, h: 2.2, ang: 185, look: 1.1, fov: 30 }, tag: 'behind' },
        { dur: 6, T: 5250, cam: { mode: 'follow', dist: 4.2, h: 1.5, ang: 15, look: 1.4, ahead: 30 } },
        // the finish is held
        { dur: 16, T: 5336, rate: 0.35, cam: { mode: 'follow', dist: 5.5, h: 1.8, ang: 10, look: 1.7, ahead: 14, fov: 36 }, cam2: { dist: 7.5, h: 2.2 }, tag: 'line' },
        { dur: 9, T: 5360, rate: 0.2, cam: { mode: 'follow', dist: 4.4, h: 1.6, ang: 150, look: 1.4, side: 1.1 }, tag: 'after' },
      ],
      pose: (i) => ({ fatigue: clamp01((i.d - 16000) / 5000) * 0.4 }),
      onFrame: (race, i, ctx) => {
        startArch.visible = i.shot === 0;
        finishArch.visible = i.shot > 0;
        const h = ctx.hud, g = ctx.r.grade;
        const pd = phD(i.T);
        phantom.opacity = i.T > 0 && pd < ph2.distance && i.tag !== 'after' ? 0.18 : 0;
        phantom.pose(race.place(pd * (race.course.length / ph2.distance), -0.8), i.T, ph2.distance / 5400);
        const ld = lead(i.T);
        if (i.shot === 0) eventTag(h, { name: 'HACKNEY HALF', date: '19.05.2024', t: i.shotT });
        if (i.shot >= 1 && i.tag !== 'after') {
          bossPlate(h, { name: 'PHANTOM 1:30', sub: 'ENCOUNTER 02', col: COL.cyan, frac: 1 - clamp01(i.d / ph2.distance), phase: `KM ${Math.floor(i.d / 1000)}`, alpha: i.finished ? 1 - smooth(0, 1, i.T - ph2.finish) : 1 });
          raceClock(h, { T: Math.min(i.T, ph2.finish), d: Math.min(i.d, ph2.distance), hours: true, pace: PHANTOM_2024.splits[Math.min(20, Math.floor(i.d / 1000))] });
          h.panel(96, 170, 460, 150, { alpha: 0.9, col: COL.cyan });
          h.text('VS PHANTOM 1:30', 120, 212, { font: 'mono', size: 22, color: COL.uiDim, tracking: 5 });
          h.text(ld >= 0 ? `${fmt(ld)} AHEAD` : `${fmt(-ld)} BEHIND`, 120, 280, { font: 'mono', size: 52, color: ld >= 0 ? COL.green : COL.red, glow: 8 });
          if (i.shot === 2) h.text('SPLITS: EVERY KM 4:02 - 4:19', 960, 900, { font: 'mono', size: 32, color: COL.green, align: 'center', tracking: 4, shadow: true });
        }
        if (i.tag === 'line') {
          g.vignette = 0.5;
          if (i.finished) g.saturation = 0.9 - 0.4 * smooth(0, 2, i.T - ph2.finish);
        }
        if (i.tag === 'after') {
          stamp(h, 'SUB 1:30', { alpha: smooth(0.6, 2, i.shotT), size: 170, col: COL.green, y: 520, sub: 'COMPLETE' });
          h.text('1:29:01', 960, 720, { font: 'mono', size: 60, color: COL.white, align: 'center', alpha: smooth(2, 3, i.shotT), glow: 10, shadow: true });
          h.text('PHANTOM DESTROYED', 960, 800, { font: 'mono', size: 30, color: COL.cyan, align: 'center', alpha: smooth(3.2, 4, i.shotT), tracking: 8, shadow: true });
          fades(g, i.shotT, 9, 0.01, 1.4);
        }
      },
      cues: [
        { t: 0, kind: 'amb-crowd', dur: 59 },
        { t: 3, kind: 'music', id: 'phantom2', dur: 31 },
        { t: 34, kind: 'silence', dur: 17 },
        { t: 34, kind: 'heartbeat', dur: 16 },
        { t: 50, kind: 'music', id: 'complete', dur: 9 },
      ],
    }),
  );

  // --- consequence: what the breakthrough unlocked
  scenes.push(
    new Card({
      id: 'c4-unlocked',
      dur: 11,
      draw: (t, h) => {
        const a = env(t, 0, 11, 0.5, 0.8);
        grid(h, a * 0.5);
        h.text('WHAT THE BREAKTHROUGH UNLOCKED', 960, 230, { font: 'mono', size: 30, color: COL.uiDim, align: 'center', alpha: a, tracking: 8 });
        const rows: [string, string][] = [
          ['5K PB  -  1ST IN RACE', '18:46'],
          ['FINSBURY  -  "FINALLY SUB 19 AT FINSBURY"', '18:52'],
          ['BIG HALF', '1:28:45'],
          ['ROBIN HOOD HALF', '1:24:17'],
          ['5K', '18:42'],
        ];
        rows.forEach(([l, v], k) => {
          const ai = a * smooth(0.8 + k * 0.9, 1.3 + k * 0.9, t);
          h.text(l, 360, 360 + k * 110, { font: 'mono', size: 30, color: COL.ui, alpha: ai, tracking: 3 });
          h.text(v, 1560, 364 + k * 110, { font: 'mono', size: 64, color: COL.white, align: 'right', alpha: ai, glow: 8 });
        });
      },
      cues: [0.8, 1.7, 2.6, 3.5, 4.4].map((t) => ({ t, kind: 'number-hit' })),
    }),
  );
  const rh = RunProfile.fromGpsProfile(robinJ as any, 5057);
  scenes.push(
    new RaceScene({
      id: 'c4-robinhood',
      arena: 'robin-hood',
      profile: rh,
      sky: SKY.morning,
      halfWidth: 4,
      field: { count: 200, pack: 6, kmin: 0.85, kmax: 1.15, seed: 42 },
      build: (race) => {
        arch(race, race.course.length, 'FINISH', 11);
      },
      shots: [
        { dur: 5, T: 2500, cam: { mode: 'follow', dist: 3.4, h: 1.0, ang: 92 } },
        { dur: 9, T: 5045, rate: 0.5, cam: { mode: 'follow', dist: 9, h: 1.6, ang: 162, fov: 28 }, cam2: { dist: 11 } },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        eventTag(h, { name: 'ROBIN HOOD HALF  -  NOTTINGHAM', date: '29.09.2024', t: i.t });
        raceClock(h, { T: Math.min(i.T, rh.finish), hours: true, d: Math.min(i.d, rh.distance) });
        if (i.finished) {
          const u = i.T - rh.finish;
          stamp(h, '1:24:17', { alpha: smooth(0.2, 0.8, u), size: 150, col: COL.green, sub: '4:44 FASTER THAN HACKNEY, 19 WEEKS LATER' });
        }
        if (i.shot === 1) fades(ctx.r.grade, i.shotT, 9, 0.01, 1);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 14 }, { t: 0, kind: 'music', id: 'anthem', dur: 14 }],
    }),
    boardCard('c4-board-valencia', { dur: 8, op: 'VALENCIA MARATHON', objective: 'NEXT OBJECTIVE', target: 'VALENCIA', size: 0.55, sub: 'MARATHON  -  DECEMBER 2024', status: 'BUILD IN PROGRESS', statusCol: COL.green }),
    logCard('c4-build', [
      ['LONG RUN 32 KM', 'Brutal'],
      ['LONG RUN', '7-8km of aspirational marathon pace (i.e. too fast)'],
    ], { title: 'MISSION LOG  -  VALENCIA BUILD', hold: 1 }),
  );
  void flag;
  void funnel;
  return scenes;
}
