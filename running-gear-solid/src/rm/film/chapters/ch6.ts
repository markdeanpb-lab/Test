// CHAPTER 6 - RETURN (2025)
// The comeback (and the Hare again), the last Finsbury parkrun, a new home, the ghost of 2023,
// SUB 18 appears, SUB 20 comes back, and EIGHTEEN refuses to fall.
import { RaceScene } from '../RaceScene';
import { RunProfile } from '../profile';
import { PHANTOM_2023 } from '../../../data/activities';
import stAlbansHalfJ from '../../../data/gps/st-albans-half.json';
import festiveJ from '../../../data/gps/striders-festive-5k.json';
import { SKY, chapterCard, logCard, boardCard, fades, trackPath, textCard } from '../common';
import { Card, grid } from '../Cards';
import { COL, env, smooth, clamp01 } from '../../hud/Hud';
import { raceClock, targetBlock, stamp, bossPlate, eventTag } from '../../hud/widgets';
import { funnel, flag, arch } from '../dressing';
import { Ghost, HoloText } from '../fx';
import { Scene } from '../core';

export function ch6(): Scene[] {
  const scenes: Scene[] = [chapterCard('c6-card', 'CHAPTER 6', 'RETURN', '2025')];

  // --- comeback parkrun 21.12.2024: the Hare, one more time
  const cb = RunProfile.fromRuns('comeback-2140');
  let hare: Ghost;
  const hareD = (T: number) => cb.distAt(T) * 1.07 + 2 + Math.max(0, T - 40) * 0.3;
  scenes.push(
    new RaceScene({
      id: 'c6-comeback',
      chapter: 'RETURN',
      arena: 'finsbury',
      profile: cb,
      sky: SKY.winter,
      halfWidth: 2.2,
      field: { count: 150, pack: 4, seed: 61 },
      build: async (race) => {
        funnel(race, race.course.length, 30);
        flag(race, 0, -3.2, '#5c2a86', 'START');
        hare = await Ghost.create(0xf4f8ff, false, 0.3);
        hare.prepare(hareD, -3, 500);
        race.extras.add(hare.runner.root);
      },
      shots: [
        { dur: 6, T: 60, cam: { mode: 'follow', dist: 5, h: 1.7, ang: 8, look: 1.3, ahead: 5 } },
        { dur: 7, T: 1000, cam: { mode: 'follow', dist: 3.3, h: 1.4, ang: 155, look: 1.4 } },
      ],
      pose: (i) => ({ fatigue: i.shot === 1 ? 0.8 : 0 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const op = (i.T > 0 ? 1 : 0) * (1 - smooth(230, 280, i.T));
        hare.opacity = 0.3 * op;
        if (op > 0) hare.pose(race.place(hareD(i.T) * (race.course.length / cb.distance), -0.6), i.T, 5);
        eventTag(h, { name: 'COMEBACK PARKRUN  -  FINSBURY', date: '21.12.2024', t: i.t });
        raceClock(h, { T: i.T, d: i.d, pace: i.T / (i.d / 1000) });
        bossPlate(h, { name: 'THE HARE', sub: 'NEVER FULLY BEATEN', alpha: env(i.t, 0.5, 6, 0.4, 0.4) });
        if (i.shot === 1) {
          h.text('LOG: "WENT FOR A FULL SEND THE FIRST LAP AND THEN BIG REGRETS"', 960, 880, { font: 'mono', size: 26, color: COL.amber, align: 'center', alpha: smooth(1, 1.5, i.shotT), tracking: 2, shadow: true });
          h.text('21:40  -  BACK UNDER 20 A WEEK LATER', 960, 940, { font: 'mono', size: 30, color: COL.white, align: 'center', alpha: smooth(3, 3.5, i.shotT), tracking: 3, shadow: true });
          fades(ctx.r.grade, i.shotT, 7, 0.01, 0.8);
        }
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 13 }, { t: 0, kind: 'music', id: 'hare', dur: 13 }],
    }),
    logCard('c6-plan', [['12 WEEKS TO HACKNEY HALF', "Last time I followed a training plan I got a stress reaction. The time before that I got shingles. What's next"]], { hold: 1.5 }),
  );

  // --- FINAL FINSBURY PARKRUN 01.03.2025, 19:10. The longest quiet scene.
  const ff = RunProfile.fromRuns('final-finsbury-1910');
  scenes.push(
    new RaceScene({
      id: 'c6-final-finsbury',
      arena: 'finsbury',
      profile: ff,
      sky: SKY.misty,
      halfWidth: 2.2,
      field: { count: 170, pack: 3, seed: 62 },
      spectators: [{ s0: 4990, s1: 5230, density: 0.2, sides: [1] }],
      after: 'walk',
      build: (race) => {
        funnel(race, race.course.length, 30);
        flag(race, 0, -3.2, '#5c2a86', 'START');
      },
      shots: [
        { dur: 7, T: -20, cam: { mode: 'follow', dist: 20, h: 8, ang: 150, look: 1 }, cam2: { dist: 16, h: 6 }, grade: { letterbox: 1 } },
        { dur: 6, T: 640, cam: { mode: 'follow', dist: 4.5, h: 1.6, ang: 20, look: 1.3 }, grade: { letterbox: 1 } },
        { dur: 6, T: 900, cam: { mode: 'follow', dist: 12, h: 2.5, ang: 95, look: 1.1, fov: 28 }, grade: { letterbox: 1 } },
        { dur: 10, T: 1140, rate: 0.5, cam: { mode: 'follow', dist: 6.5, h: 1.5, ang: 174, look: 1.3, fov: 32 }, cam2: { dist: 9 }, grade: { letterbox: 1 }, tag: 'line' },
        // the park empties; walking out
        { dur: 12, T: 1165, cam: { mode: 'follow', dist: 24, h: 2.2, ang: -8, look: 1.1, fov: 24, shake: 0.1 }, cam2: { dist: 30 }, grade: { letterbox: 1 }, tag: 'leave' },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud, g = ctx.r.grade;
        g.saturation = 0.7;
        if (i.shot === 0) {
          g.fade = 1 - smooth(0, 2, i.shotT);
          h.caption(['01.03.2025', 'FINSBURY PARK', 'THE LAST ONE'], i.shotT, 1.5, env(i.shotT, 1.2, 7, 0.4, 0.6), 110, 150);
        }
        if (i.tag === 'line' && i.finished) {
          const u = i.T - ff.finish;
          h.text('19:10', 960, 880, { font: 'mono', size: 90, color: COL.white, align: 'center', alpha: smooth(0.3, 1, u), glow: 10, shadow: true });
        }
        if (i.tag === 'leave') {
          h.text('95 PARKRUNS AT FINSBURY', 960, 880, { font: 'mono', size: 36, color: COL.white, align: 'center', alpha: env(i.shotT, 2, 11, 1, 1), tracking: 8, shadow: true });
          h.text('LOG: "THE FINAL ONE BEFORE MOVING TO ST ALBANS"', 960, 940, { font: 'mono', size: 26, color: COL.ui, align: 'center', alpha: env(i.shotT, 3.5, 11, 1, 1), tracking: 3, shadow: true });
          fades(g, i.shotT, 12, 0.01, 2.5);
        }
        void race;
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 41, level: 0.6 }, { t: 1, kind: 'music', id: 'farewell', dur: 40 }],
    }),
  );

  // --- a new home, and the marathon seed
  scenes.push(
    new Card({
      id: 'c6-stalbans',
      dur: 10,
      draw: (t, h) => {
        const a = env(t, 0, 10, 0.5, 0.8);
        grid(h, a * 0.5);
        h.text('NEW BASE OF OPERATIONS', 960, 330, { font: 'mono', size: 28, color: COL.uiDim, align: 'center', alpha: a, tracking: 10 });
        h.text('ST ALBANS', 960, 450, { font: 'head', size: 120, weight: 700, color: COL.white, align: 'center', alpha: a, tracking: 20, glow: 14 });
        h.text('5K PB   18:28', 960, 600, { font: 'mono', size: 44, color: COL.green, align: 'center', alpha: a * smooth(1.5, 2, t), tracking: 4 });
        h.text('27.04.2025  -  SPECTATING THE LONDON MARATHON', 960, 700, { font: 'mono', size: 30, color: COL.ui, align: 'center', alpha: a * smooth(3, 3.5, t), tracking: 3 });
        h.text('( A SEED )', 960, 760, { font: 'mono', size: 26, color: COL.uiDim, align: 'center', alpha: a * smooth(5, 5.5, t), tracking: 8 });
      },
      cues: [{ t: 1.5, kind: 'number-hit' }, { t: 3, kind: 'crowd-far', dur: 5 }],
    }),
  );

  // --- Hackney Half 2025 (1:26:28): running past the place the Phantom overtook in 2023
  const hk25 = new RunProfile([0, 21350], [0, 5188]);
  const g23 = RunProfile.fromSplits(PHANTOM_2023.splits, PHANTOM_2023.distanceKm, PHANTOM_2023.timeSec);
  let past: Ghost;
  scenes.push(
    new RaceScene({
      id: 'c6-hackney25',
      arena: 'hackney',
      profile: hk25,
      sky: SKY.clear,
      halfWidth: 4,
      field: { count: 200, pack: 6, seed: 63 },
      build: async (race) => {
        past = await Ghost.create(0xb8c4ff, false, 0.2);
        past.prepare((T) => (T - 2840) * 3.3, 2830, 2860);
        race.extras.add(past.runner.root);
      },
      shots: [{ dur: 11, T: 2840, rate: 0.8, cam: { mode: 'follow', dist: 6, h: 1.8, ang: 172, look: 1.3, fov: 34 }, cam2: { dist: 11, h: 2.2 } }],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        // the 2023 runner, slowing at this spot: the 2025 runner comes past
        const d23 = i.d + 10 - i.t * 2.1;
        past.opacity = 0.24 * smooth(0.5, 2, i.t) * (1 - smooth(8.5, 10.5, i.t));
        past.pose(race.place(d23 * (race.course.length / hk25.distance), 0.9), i.T, 3.3);
        eventTag(h, { name: 'HACKNEY HALF', date: '2025', t: i.t });
        
        h.text('THE SPOT WHERE THE PHANTOM OVERTOOK IN 2023', 960, 880, { font: 'mono', size: 28, color: COL.ui, align: 'center', alpha: env(i.t, 2.5, 11, 0.6, 0.8), tracking: 3, shadow: true });
        h.text('1:26:28', 960, 950, { font: 'mono', size: 52, color: COL.green, align: 'center', alpha: env(i.t, 5, 11, 0.6, 0.8), glow: 8, shadow: true });
        fades(ctx.r.grade, i.t, 11, 0.6, 1);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 11 }, { t: 0, kind: 'music', id: 'memory', dur: 11 }],
    }),
  );

  const sah = RunProfile.fromGpsProfile(stAlbansHalfJ as any, 5181);
  scenes.push(
    new RaceScene({
      id: 'c6-stalbans-half',
      arena: 'st-albans',
      profile: sah,
      sky: SKY.morning,
      halfWidth: 3,
      field: { count: 120, pack: 4, seed: 64 },
      shots: [{ dur: 8, T: 3000, cam: { mode: 'follow', dist: 5.5, h: 1.7, ang: 70, look: 1.1, fov: 36 }, cam2: { ang: 110 } }],
      pose: () => ({ lean: 0.12, fatigue: 0.4 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        eventTag(h, { name: 'ST ALBANS HALF', date: '08.06.2025', t: i.t });
        h.text('LOG: "BRUTALLY HILLY"', 960, 880, { font: 'mono', size: 32, color: COL.amber, align: 'center', alpha: env(i.t, 1.5, 8, 0.4, 0.6), tracking: 4, shadow: true });
        h.text('1:26:21', 960, 950, { font: 'mono', size: 48, color: COL.white, align: 'center', alpha: env(i.t, 3, 8, 0.4, 0.6), shadow: true });
        fades(ctx.r.grade, i.t, 8, 0.5, 0.8);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 8 }],
    }),
  );

  // --- SUB 18 appears; SUB 20 comes back
  scenes.push(
    logCard('c6-sub18', [['17.06.2025', 'Attempting sub 18 pace']], { hold: 0.8 }),
    boardCard('c6-board-sub18', { dur: 7, op: '4 x 1600 M', objective: 'NEW OBJECTIVE', target: 'SUB 18:00', size: 0.7, sub: '5 KM  -  3:36 /KM', status: '5K PB 18:28   GAP 0:29' }),
    logCard('c6-slump', [
      ['SUMMER 2025', 'Fitness in the dark ages'],
      ['BENCHMARK', 'Benchmark set. Time to get back under 20 mins and beyond.'],
      ['CASSIOBURY', 'Back to sub 20... work to be done still.'],
    ], { title: 'MISSION LOG  -  SUMMER 2025', hold: 1, col: COL.amber }),
    boardCard('c6-board-sub20-again', { dur: 6, op: 'REBUILD', objective: 'OBJECTIVE (AGAIN)', target: 'SUB 20:00', size: 0.3, sub: 'THE FIRST NUMBER, BACK ON THE BOARD', status: 'SMALLER THAN IT USED TO LOOK', statusCol: COL.ui }),
  );

  // --- EIGHTEEN (mini): Striders Festive 5K 16.12.2025. Target 17:59, result 18:19.
  const fest = RunProfile.fromGpsProfile(festiveJ as any, 1099);
  let h18: HoloText;
  scenes.push(
    new RaceScene({
      id: 'c6-eighteen',
      arena: 'st-albans',
      path: (race) => {
        const c = race.arena.data.j.courses[2].gps;
        let x = 0, z = 0;
        for (let k = 0; k < c.length; k += 2) {
          x += c[k];
          z += c[k + 1];
        }
        return trackPath(race.arena.data.j.areas, x / (c.length / 2), z / (c.length / 2), 12, -1.5);
      },
      profile: fest,
      sky: SKY.dusk,
      night: 0.6,
      halfWidth: 1.6,
      field: { count: 40, pack: 3, packSpread: 8, kmin: 0.8, kmax: 1.1, seed: 65 },
      build: (race) => {
        h18 = new HoloText('18:00', 14, { col: '#ff4436' });
        const p = race.place(0, -18);
        h18.group.position.set(p.x, p.y + 8, p.z);
        race.extras.add(h18.group);
      },
      shots: [
        { dur: 5, T: 200, cam: { mode: 'follow', dist: 22, h: 9, ang: 140, look: 1 }, cam2: { dist: 18 } },
        { dur: 5, T: 700, cam: { mode: 'follow', dist: 3.4, h: 1.0, ang: -95 } },
        { dur: 10, T: 1090, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.6, ang: 172, look: 1.6 }, cam2: { dist: 8 } },
      ],
      pose: (i) => ({ fatigue: clamp01((i.d - 3000) / 2000) * 0.5 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        h18.group.lookAt(race.stage!.camera.position);
        h18.intensity(1, i.t, 0.1);
        if (i.shot === 0) eventTag(h, { name: 'STRIDERS FESTIVE 5K', date: '16.12.2025', t: i.shotT });
        bossPlate(h, { name: 'EIGHTEEN', sub: 'MINI BOSS', frac: 1 - clamp01(i.d / fest.distance) * 0.9, alpha: i.finished ? 1 - smooth(1, 2, i.T - fest.finish) : 1 });
        targetBlock(h, { target: 1079, projection: i.finished ? undefined : fest.projection(i.T), result: i.finished ? 1099 : undefined });
        raceClock(h, { T: Math.min(i.T, fest.finish), d: Math.min(i.d, fest.distance), label: `LAP ${Math.min(12, Math.floor(i.d / 417) + 1)} / 12` });
        if (i.finished) {
          const u = i.T - fest.finish;
          h.text('5K PB', 960, 820, { font: 'mono', size: 34, color: COL.green, align: 'center', alpha: smooth(0.5, 1, u), tracking: 8, shadow: true });
          h.text('EIGHTEEN: NOT YET', 960, 890, { font: 'head', size: 54, weight: 700, color: COL.red, align: 'center', alpha: smooth(1.5, 2.1, u), tracking: 10, shadow: true });
        }
        if (i.shot === 2) fades(ctx.r.grade, i.shotT, 10, 0.01, 1);
      },
      cues: [{ t: 0, kind: 'music', id: 'boss-mini', dur: 20 }, { t: 17, kind: 'fail' }],
    }),
    textCard('c6-week1', [{ t: 0.8, text: 'Five days later.', out: 5.5 }, { t: 2.6, text: 'WEEK 1 OF 18', font: 'mono', col: COL.ui, y: 620, size: 44, out: 5.5 }], 6.2),
  );
  void stamp;
  void arch;
  return scenes;
}
