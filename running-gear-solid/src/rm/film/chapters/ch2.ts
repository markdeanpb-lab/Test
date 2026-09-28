// CHAPTER 2 - 20:XX (Jan 2022 - Mar 2023)
// The number appears, looks ridiculous, gets closer, stops at exactly 20:00, then breaks.
import * as THREE from 'three';
import { RaceScene, Info } from '../RaceScene';
import { RunProfile } from '../profile';
import { HINGE, DOUBLE_ZERO_R1 } from '../../../data/activities';
import fins from '../../../data/gps/finsbury-parkrun.json';
import gnrJ from '../../../data/gps/great-north-run.json';
import rpJ from '../../../data/gps/royal-parks-half.json';
import viennaJ from '../../../data/gps/vienna-parkrun.json';
import { SKY, chapterCard, logCard, boardCard, steady, fades } from '../common';
import { CodecScene } from '../Codec';
import { VRScene } from '../VRScene';
import { COL, env, smooth, clamp01, fmt, pace, Hud } from '../../hud/Hud';
import { raceClock, targetBlock, stamp, bossPlate, eventTag, splitPop } from '../../hud/widgets';
import { funnel, flag, arch, archBridge, kmBoard } from '../dressing';
import { Ghost, HoloText, Streaks } from '../fx';
import { prop, shoesProp, binProp, WatchFace } from '../props';
import { Scene, Ctx } from '../core';
import { Sentinel } from '../bosses/Sentinel';
import { waterSide, faceCourse, mmss } from '../bosses/place';

const parkrunDressing = (race: RaceScene) => {
  funnel(race, race.course.length, 30);
  flag(race, 0, -3.2, '#5c2a86', 'START');
};

/** show the km split as each kilometre ticks over */
function kmSplits(h: Hud, race: RaceScene, i: Info, alpha = 1) {
  const p = race.o.profile;
  const km = Math.floor(i.d / 1000);
  if (km < 1 || i.finished) return;
  const since = i.T - p.timeAt(km * 1000);
  const split = p.timeAt(km * 1000) - p.timeAt((km - 1) * 1000);
  splitPop(h, { km, split, since, alpha, col: split < 240 ? COL.green : COL.white });
}

export function ch2(): Scene[] {
  const scenes: Scene[] = [chapterCard('c2-card', 'CHAPTER 2', '20:XX', 'JANUARY 2022  -  MARCH 2023')];

  // --- the numbers tumble (parkrun results through early 2022)
  const tumble = ['23:52', '22:11', '21:53', '21:30', '21:04'];
  scenes.push(
    new RaceScene({
      id: 'c2-tumble',
      chapter: '20:XX',
      arena: 'finsbury',
      profile: RunProfile.fromRuns('pb-2104'),
      sky: SKY.misty,
      halfWidth: 2.2,
      field: { count: 150, pack: 5, kmin: 0.72, kmax: 1.2, seed: 21 },
      build: parkrunDressing,
      shots: [
        { dur: 3.2, T: 120, cam: { mode: 'follow', dist: 5, h: 1.6, ang: 20, look: 1.2 } },
        { dur: 3.2, T: 420, cam: { mode: 'follow', dist: 3.5, h: 0.8, ang: 100 } },
        { dur: 3.2, T: 700, cam: { mode: 'follow', dist: 14, h: 7, ang: 200, look: 0.6 } },
        { dur: 3.2, T: 1000, cam: { mode: 'follow', dist: 4, h: 1.4, ang: 165 } },
        { dur: 7, T: 1255, rate: 0.6, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 170, look: 1.2 }, cam2: { dist: 8 } },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        ctx.r.grade.saturation = 0.8;
        if (i.shot === 0) ctx.r.grade.fade = 1 - smooth(0, 0.8, i.shotT);
        const n = tumble[i.shot];
        const a = smooth(0.3, 0.7, i.shotT) * (i.shot < 4 ? 1 - smooth(2.8, 3.2, i.shotT) : 1 - smooth(6.3, 7, i.shotT));
        h.text('PARKRUN  2022', 960, 780, { font: 'mono', size: 26, color: COL.uiDim, align: 'center', alpha: a, tracking: 10, shadow: true });
        h.text(n, 960, 900, { font: 'mono', size: 130, color: i.shot === 4 ? COL.green : COL.white, align: 'center', alpha: a, glow: 16, shadow: true });
        if (i.shot === 4) h.text('LOG 16.04.2022: "PARKRUN PB 21:04"', 960, 970, { font: 'mono', size: 26, color: COL.ui, align: 'center', alpha: a * smooth(1.5, 2, i.shotT), tracking: 3, shadow: true });
        void race;
      },
      cues: [{ t: 0, kind: 'music', id: 'build', dur: 19.8 }, ...[0.4, 3.6, 6.8, 10.0, 13.2].map((t) => ({ t, kind: 'number-hit' }))],
    }),
  );

  // --- first half marathon, solo; the old shoes retired beside a bin
  let shoes: THREE.Object3D, bin: THREE.Object3D;
  scenes.push(
    new RaceScene({
      id: 'c2-shoes',
      arena: 'finsbury',
      s0: 700,
      profile: steady(60, 45),
      sky: SKY.overcast,
      kit: { singlet: 0x1d3f6e, shorts: 0x141417, socks: 0xe6e6e0, shoes: 0x2b2b2e, hair: 0x2a1d14 },
      build: async (race) => {
        const p = race.place(700 - 4, 2.6);
        shoes = await shoesProp(0xff5a1f, 0.55);
        shoes.position.set(p.x, p.y, p.z);
        shoes.rotation.y = Math.atan2(p.dx, p.dz) + 2.2;
        bin = binProp();
        const b = race.place(700 - 4.9, 3.1);
        bin.position.set(b.x, b.y, b.z);
        race.extras.add(shoes, bin);
      },
      shots: [{ dur: 11, T: 2, rate: 1, cam: { mode: 'fixed', at: { s: -7.5, off: 1.6, h: 0.45 }, fov: 32, shake: 0.1 } }],
      onFrame: (race, i, ctx) => {
        const cam = race.stage!.camera;
        cam.lookAt(shoes.position.x, shoes.position.y + 0.25, shoes.position.z);
        const g = ctx.r.grade;
        g.letterbox = 1;
        g.saturation = 0.7;
        fades(g, i.t, 11, 1.2, 1.2);
        ctx.hud.caption(['31.03.2022', 'FIRST HALF MARATHON  -  SOLO  -  1:51:17', 'LOG: "RETIRING MY RUNNING SHOES"'], i.t, 1.5, env(i.t, 1.2, 10.4, 0.4, 0.6), 110, 150);
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 11, level: 0.5 }],
    }),
  );

  // --- SUB 20 is spoken for the first time
  scenes.push(
    new CodecScene({
      id: 'c2-codec-sub20',
      freq: '140.85',
      lines: [
        { who: 'TEMPO', text: 'Twenty-one oh four.' },
        { who: 'STRIDE', text: 'Parkrun PB.' },
        { who: 'TEMPO', text: 'Now take sixty-five seconds off it.' },
        { who: 'PAUSE', dur: 1.4 },
        { who: 'TEMPO', text: 'Four minutes a kilometre. For five of them.' },
        { who: 'STRIDE', text: 'Sub twenty.' },
      ],
    }),
    boardCard('c2-board-sub20', { dur: 8, op: 'FINSBURY PARK', objective: 'PRIMARY OBJECTIVE', target: 'SUB 20:00', size: 1, route: 'finsbury-parkrun', sub: '5 KM  -  4:00 /KM', status: 'CURRENT BEST 21:04   GAP 1:05' }),
  );

  // --- THE HARE (mini boss): 23.04.2022, 21:48 "Went off too fast"
  let hare: Ghost;
  const hareProf = RunProfile.fromRuns('hare-2148');
  const hareD = (T: number) => hareProf.distAt(T) * 1.08 + 3 + Math.max(0, T - 60) * 0.35;
  scenes.push(
    new RaceScene({
      id: 'c2-hare',
      arena: 'finsbury',
      profile: hareProf,
      sky: SKY.morning,
      halfWidth: 2.2,
      field: { count: 170, pack: 4, kmin: 0.72, kmax: 1.15, seed: 22 },
      build: async (race) => {
        parkrunDressing(race);
        hare = await Ghost.create(0xf4f8ff, false, 0.3);
        hare.prepare(hareD, -5, 400);
        race.extras.add(hare.runner.root);
      },
      shots: [
        { dur: 4, T: -3, cam: { mode: 'follow', dist: 6, h: 1.8, ang: 160, look: 1.1 }, grade: { letterbox: 1 } },
        { dur: 5, T: 25, cam: { mode: 'follow', dist: 5, h: 1.7, ang: 8, look: 1.3, ahead: 3 } },
        { dur: 5, T: 150, cam: { mode: 'follow', dist: 4, h: 1.0, ang: 70, look: 1.1, ahead: 2 } },
        { dur: 5, T: 255, cam: { mode: 'follow', dist: 6, h: 2.2, ang: 15, look: 1.2, ahead: 6 } },
        { dur: 5, T: 900, cam: { mode: 'follow', dist: 3.2, h: 1.4, ang: 150, look: 1.4 } },
        { dur: 7, T: 1300, rate: 0.8, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 170 } },
      ],
      pose: (i) => (i.shot === 4 ? { fatigue: 0.6 } : {}),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        // the hare: STRIDE's own impatience, sprinting out ahead and vanishing
        const hd = hareD(i.T);
        const hp = race.place(hd * (race.course.length / hareProf.distance), -0.6);
        const op = (i.T > 0 ? 1 : 0) * (1 - smooth(270, 320, i.T));
        hare.opacity = 0.32 * op;
        if (op > 0) hare.pose(hp, i.T, (hareD(i.T + 0.5) - hareD(i.T - 0.5)));
        if (i.shot === 0) eventTag(h, { name: 'FINSBURY PARK', date: '23.04.2022', t: i.shotT });
        bossPlate(h, { name: 'THE HARE', sub: 'IMPATIENCE', alpha: env(i.t, 4.3, 19, 0.5, 0.5) });
        if (i.shot >= 1 && i.shot <= 4) {
          raceClock(h, { T: i.T, d: i.d, pace: i.T / (i.d / 1000) });
          kmSplits(h, race, i);
        }
        if (i.shot === 5) {
          raceClock(h, { T: Math.min(i.T, hareProf.finish), d: Math.min(i.d, hareProf.distance), alpha: 1 - smooth(4, 5, i.shotT) });
          if (i.finished) {
            targetBlock(h, { target: 1264, result: 1308, label: 'PERSONAL BEST', alpha: smooth(0, 0.5, i.T - hareProf.finish) });
            h.text('LOG: "WENT OFF TOO FAST"', 960, 900, { font: 'mono', size: 34, color: COL.amber, align: 'center', alpha: smooth(1, 1.5, i.T - hareProf.finish), tracking: 3, shadow: true });
          }
          fades(ctx.r.grade, i.shotT, 7, 0.01, 0.8);
        }
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 31 }, { t: 4, kind: 'music', id: 'hare', dur: 20 }, { t: 9, kind: 'hare-laugh' }, { t: 24, kind: 'fail' }],
    }),
  );

  // --- HINGE (major): "Testing the knee", then Hackney Half 22.05.2022, 1:46:30
  const hingeProf = RunProfile.fromSplits(HINGE.splits, HINGE.distanceKm, HINGE.timeSec);
  const hingePhase = (km: number) => (km < 5 ? 0 : km < 14 ? 1 : 2);
  scenes.push(
    logCard('c2-log-knee', [['21.05.2022', 'Parkrun - Testing the knee']], { title: 'MISSION LOG', hold: 1 }),
    new RaceScene({
      id: 'c2-hinge',
      arena: 'hackney',
      profile: hingeProf,
      sky: SKY.clear,
      halfWidth: 4,
      field: { count: 260, pack: 8, kmin: 0.8, kmax: 1.2, seed: 23 },
      spectators: [{ s0: -40, s1: 60, density: 0.7 }, { s0: 21000, s1: 21400, density: 0.8 }, { s0: 6000, s1: 6200, density: 0.5 }, { s0: 12000, s1: 12150, density: 0.5 }],
      build: (race) => {
        arch(race, 0, 'HACKNEY HALF', 11);
        arch(race, race.course.length, 'FINISH', 11);
      },
      shots: [
        { dur: 5, T: -6, cam: { mode: 'follow', dist: 12, h: 5, ang: 160, look: 1 }, cam2: { dist: 9 }, grade: { letterbox: 1 } },
        { dur: 5, T: 700, cam: { mode: 'follow', dist: 4.5, h: 1.5, ang: 20, look: 1.2 } },
        { dur: 6, T: 2600, cam: { mode: 'follow', dist: 3.2, h: 0.7, ang: 95, look: 0.7 }, tag: 'knee' },
        { dur: 5, T: 4200, cam: { mode: 'follow', dist: 5, h: 2.2, ang: 190, look: 1.2 } },
        { dur: 5, T: 5900, cam: { mode: 'follow', dist: 3.4, h: 1.3, ang: 150, look: 1.3 } },
        { dur: 8, T: 6378, rate: 0.5, cam: { mode: 'follow', dist: 7, h: 1.6, ang: 172 }, cam2: { dist: 9 } },
      ],
      pose: (i) => ({ fatigue: i.d > 14000 ? 0.5 : i.d > 5000 ? 0.2 : 0 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const km = i.d / 1000;
        const ph = hingePhase(km);
        if (i.shot === 0) eventTag(h, { name: 'HACKNEY HALF', date: '22.05.2022', t: i.shotT });
        if (i.shot >= 1 && i.shot <= 4) {
          raceClock(h, { T: i.T, d: i.d, pace: HINGE.splits[Math.min(20, Math.floor(km))] });
          const hr = HINGE.splitHr![Math.min(20, Math.floor(km))];
          h.text(`HR ${hr}`, 1824, 330, { font: 'mono', size: 34, color: hr >= 186 ? COL.red : COL.ui, align: 'right', shadow: true });
          // knee integrity: a game gauge, not a measurement
          const kneeFrac = [0.9, 0.55, 0.3][ph];
          h.panel(96, 170, 420, 130, { alpha: 0.9 });
          h.text('KNEE', 120, 212, { font: 'mono', size: 22, color: COL.uiDim, tracking: 6 });
          h.segBar(120, 232, 370, 18, kneeFrac, 20, ph === 2 ? COL.red : ph === 1 ? COL.amber : COL.ui);
          h.text(['CONTROLLED', 'GRIND', 'SEIZE'][ph], 120, 285, { font: 'head', size: 30, weight: 700, color: ph === 2 ? COL.red : COL.white, tracking: 4 });
          bossPlate(h, { name: 'HINGE', sub: 'THE JOINT THAT WOULD NOT HOLD', frac: [0.95, 0.6, 0.3][ph], phase: `KM ${Math.floor(km)}` });
          if (i.tag === 'knee') {
            // x-ray pulse over the knee
            const pulse = 0.5 + 0.5 * Math.sin(i.shotT * 5);
            ctx.r.grade.saturation = 0.6;
            h.text('LOAD TEST', 960, 200, { font: 'mono', size: 30, color: COL.amber, align: 'center', alpha: 0.6 + 0.4 * pulse, tracking: 10, shadow: true });
          }
        }
        if (i.shot === 5) {
          raceClock(h, { T: Math.min(i.T, hingeProf.finish), hours: true, alpha: 1 - smooth(6, 7, i.shotT) });
          if (i.finished) {
            const a = smooth(0.3, 1, i.T - hingeProf.finish);
            stamp(h, 'JOINT HELD', { alpha: a, size: 110, col: COL.green, sub: '1:46:30' });
            h.text('LOG: "THE KNEE HELD OUT - GREAT ATMOSPHERE"', 960, 900, { font: 'mono', size: 30, color: COL.ui, align: 'center', alpha: a, tracking: 3, shadow: true });
          }
          fades(ctx.r.grade, i.shotT, 8, 0.01, 1);
        }
        void race;
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 34 }, { t: 3, kind: 'music', id: 'boss', dur: 28 }, { t: 5, kind: 'boss-intro' }, { t: 29, kind: 'win' }],
    }),
  );

  // --- VR training: 6 x 1 km at ~4:00 /km (sub-20 pace in pieces)
  const vrSpeed = (t: number) => {
    const c = t % 6.5;
    return c < 4.7 ? 4.17 : c < 5 ? 4.17 * (1 - (c - 4.7) / 0.3) : c < 6.2 ? 0 : 4.17 * ((c - 6.2) / 0.3);
  };
  scenes.push(
    new VRScene({
      id: 'c2-vr',
      speed: vrSpeed,
      shots: [
        { dur: 6.5, cam: { mode: 'follow', dist: 5, h: 1.6, ang: 30, look: 1.1 }, cam2: { ang: 60 } },
        { dur: 6.5, cam: { mode: 'follow', dist: 3.2, h: 0.9, ang: 95, look: 1.0 } },
        { dur: 6.5, cam: { mode: 'follow', dist: 12, h: 8, ang: 160, look: 0.8 }, cam2: { ang: 200 } },
      ],
      onFrame: (t, ctx, info) => {
        const h = ctx.hud;
        const rep = Math.floor(t / 6.5) + 1;
        h.text('VR TRAINING', 96, 90, { font: 'mono', size: 30, color: COL.ui, tracking: 8, glow: 8 });
        h.text('SUMMER 2022   6 x 1 KM', 96, 130, { font: 'mono', size: 24, color: COL.uiDim, tracking: 4 });
        h.text(`REP ${rep} / 6`, 1824, 110, { font: 'mono', size: 64, color: COL.white, align: 'right', glow: 10 });
        h.text('TARGET  4:00 /KM', 1824, 160, { font: 'mono', size: 28, color: COL.green, align: 'right', tracking: 3 });
        h.text('= SUB 20 PACE, REHEARSED IN PIECES', 1824, 200, { font: 'mono', size: 22, color: COL.uiDim, align: 'right', tracking: 3 });
        if (info.speed < 0.5) h.text('RECOVER', 960, 540, { font: 'head', size: 60, weight: 700, color: COL.amber, align: 'center', tracking: 20, alpha: 0.8 });
        fades(ctx.r.grade, t, 19.5, 0.6, 0.8);
      },
      cues: [{ t: 0, kind: 'music', id: 'vr', dur: 19.5 }],
    }),
  );

  // --- near misses: 20:37, 20:34, then 20:15 at the Return of Finsbury Parkrun
  const ret = RunProfile.fromRuns('return-2015');
  scenes.push(
    new RaceScene({
      id: 'c2-near',
      arena: 'finsbury',
      profile: ret,
      sky: SKY.morning,
      halfWidth: 2.2,
      field: { count: 170, pack: 5, kmin: 0.72, kmax: 1.15, seed: 24 },
      build: parkrunDressing,
      shots: [
        { dur: 3.5, T: 300, cam: { mode: 'follow', dist: 4.5, h: 1.5, ang: 30 }, tag: '20:37' },
        { dur: 3.5, T: 800, cam: { mode: 'follow', dist: 3.5, h: 1.0, ang: 110 }, tag: '20:34' },
        { dur: 5, T: 1100, cam: { mode: 'follow', dist: 5, h: 1.6, ang: 160 } },
        { dur: 9, T: 1203, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.4, ang: 172 }, cam2: { dist: 8 } },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        if (i.shot < 2) {
          const a = env(i.shotT, 0.2, 3.5, 0.3, 0.3);
          h.text('PARKRUN  SUMMER 2022', 960, 780, { font: 'mono', size: 26, color: COL.uiDim, align: 'center', alpha: a, tracking: 10, shadow: true });
          h.text(i.tag!, 960, 900, { font: 'mono', size: 130, color: COL.white, align: 'center', alpha: a, glow: 14, shadow: true });
          targetBlock(h, { target: 1199, alpha: a * 0.9 });
        }
        if (i.shot >= 2) {
          eventTag(h, { name: 'LOG: "RETURN OF FINSBURY PARKRUN"', date: '27.08.2022', t: i.t - 7 });
          targetBlock(h, { target: 1199, projection: i.finished ? undefined : ret.projection(i.T), result: i.finished ? 1215 : undefined });
          raceClock(h, { T: Math.min(i.T, ret.finish), d: Math.min(i.d, ret.distance), alpha: i.shot === 3 ? 1 - smooth(7, 8, i.shotT) : 1 });
        }
        if (i.shot === 3 && i.finished) h.text('SIXTEEN SECONDS.', 960, 900, { font: 'head', size: 64, weight: 700, color: COL.amber, align: 'center', alpha: smooth(1.2, 2, i.T - ret.finish), tracking: 12, shadow: true });
        if (i.shot === 3) fades(ctx.r.grade, i.shotT, 9, 0.01, 0.9);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 21 }, { t: 0.2, kind: 'number-hit' }, { t: 3.7, kind: 'number-hit' }, { t: 7, kind: 'music', id: 'tension', dur: 14 }, { t: 15, kind: 'fail' }],
    }),
  );

  // --- Great North Run, 11.09.2022: the Tyne Bridge
  const gnr = RunProfile.fromGpsProfile(gnrJ as any, 5892);
  let tyne: { s0: number; s1: number } = { s0: 0, s1: 0 };
  scenes.push(
    new RaceScene({
      id: 'c2-gnr',
      arena: 'gnr',
      noAutoBridge: true,
      profile: gnr,
      sky: SKY.clear,
      halfWidth: 5,
      field: { count: 300, pack: 10, kmin: 0.85, kmax: 1.15, seed: 25 },
      build: (race) => {
        // find the river crossing in the first 4 km
        let a = -1, b = -1;
        for (let s = 500; s < 4000; s += 2) {
          const q = race.courseAt(s);
          const wet = race.arena.data.maskAt(q.x, q.z) > 0.2;
          if (wet && a < 0) a = s;
          if (wet) b = s;
        }
        tyne = { s0: a - 25, s1: b + 25 };
        race.o.deck = archBridge(race, tyne.s0, tyne.s1, { rise: 42, col: 0x3d6b45, width: 16 });
        // time the shots to the crossing
        const k = gnr.distance / race.course.length;
        const sh = race.o.shots;
        sh[0].T = gnr.timeAt((tyne.s0 + 40) * k);
        sh[0].cam = { mode: 'fixed', at: { s: (tyne.s0 + (tyne.s1 - tyne.s0) / 2) * k, off: -150, h: 12 }, look: 20, fov: 42, shake: 0.1 };
        sh[0].cam2 = { fov: 36 };
        sh[1].T = gnr.timeAt((tyne.s0 + 55) * k);
        sh[2].T = gnr.timeAt((tyne.s0 + 95) * k);
      },
      shots: [
        { dur: 7, T: 560, cam: { mode: 'follow', dist: 60, h: 30, ang: 120, look: 0, fov: 40, shake: 0.1 }, cam2: { dist: 50, ang: 140 }, grade: { letterbox: 1 } },
        { dur: 5, T: 600, cam: { mode: 'follow', dist: 5, h: 1.6, ang: 160, look: 1.8 } },
        { dur: 6, T: 640, cam: { mode: 'follow', dist: 4, h: 1.1, ang: 80, look: 1.2 } },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        if (i.shot === 0) {
          ctx.r.grade.fade = 1 - smooth(0, 1.2, i.shotT);
          h.caption(['11.09.2022', 'GREAT NORTH RUN', 'THE TYNE BRIDGE'], i.shotT, 0.8, env(i.shotT, 0.6, 7, 0.4, 0.5), 110, 150);
        }
        if (i.shot > 0) raceClock(h, { T: i.T, d: i.d, hours: true });
        if (i.shot === 2) {
          const a = smooth(2, 3, i.shotT);
          h.text('FINISH  1:38:12', 960, 900, { font: 'mono', size: 44, color: COL.white, align: 'center', alpha: a, tracking: 6, shadow: true });
          fades(ctx.r.grade, i.shotT, 6, 0.01, 0.9);
        }
        void race;
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 18, level: 0.8 }, { t: 0, kind: 'music', id: 'anthem', dur: 18 }],
    }),
  );

  // --- THE HARE returns: Royal Parks Half 09.10.2022, 1:39:57
  const rp = RunProfile.fromGpsProfile(rpJ as any, 5997);
  let hare2: Ghost;
  const hare2D = (T: number) => rp.distAt(T) + Math.min(60, T * 0.03) - Math.max(0, T - 3000) * 0.05;
  scenes.push(
    new RaceScene({
      id: 'c2-royalparks',
      arena: 'royal-parks',
      profile: rp,
      sky: SKY.overcast,
      halfWidth: 4,
      field: { count: 240, pack: 6, kmin: 0.85, kmax: 1.15, seed: 26 },
      build: async (race) => {
        hare2 = await Ghost.create(0xf4f8ff, false, 0.3);
        hare2.prepare(hare2D, 0, 6000);
        race.extras.add(hare2.runner.root);
      },
      shots: [
        { dur: 6, T: 1500, cam: { mode: 'follow', dist: 6, h: 1.8, ang: 10, look: 1.3, ahead: 8 } },
        { dur: 6, T: 2900, cam: { mode: 'follow', dist: 4, h: 1.2, ang: 75, look: 1.2, ahead: 4 } },
        { dur: 7, T: 5100, cam: { mode: 'follow', dist: 3.5, h: 1.4, ang: 155, look: 1.4 } },
      ],
      pose: (i) => ({ fatigue: i.d > 12000 ? 0.7 : 0 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const op = 1 - smooth(3200, 3500, i.T);
        hare2.opacity = 0.3 * op;
        if (op > 0) hare2.pose(race.place(hare2D(i.T) * (race.course.length / rp.distance), -0.7), i.T, rp.speedAt(i.T));
        eventTag(h, { name: 'ROYAL PARKS HALF', date: '09.10.2022', t: i.t });
        raceClock(h, { T: i.T, d: i.d, hours: true, pace: rp.timeAt(Math.ceil(i.d / 1000) * 1000) - rp.timeAt(Math.floor(i.d / 1000) * 1000) });
        bossPlate(h, { name: 'THE HARE', sub: 'IT CAME BACK', alpha: env(i.t, 0.5, 12, 0.5, 0.5) });
        if (i.shot === 2) {
          h.text('LOG: "A STRONG FIRST 10K WHICH I PAID FOR IN THE BUSINESS END"', 960, 900, { font: 'mono', size: 28, color: COL.amber, align: 'center', alpha: smooth(1.5, 2.2, i.shotT), tracking: 2, shadow: true });
          h.text('1:39:57', 960, 960, { font: 'mono', size: 40, color: COL.white, align: 'center', alpha: smooth(2.5, 3, i.shotT), shadow: true });
          fades(ctx.r.grade, i.shotT, 7, 0.01, 0.9);
        }
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 19, level: 0.6 }, { t: 0, kind: 'music', id: 'hare', dur: 19 }],
    }),
  );

  // --- Vienna, 05.11.2022: rain, a foreign park, "Almost a sub 20" (20:05)
  const vi = RunProfile.fromGpsProfile(viennaJ as any, 1205);
  let rain: Streaks;
  let holo: HoloText;
  scenes.push(
    new RaceScene({
      id: 'c2-vienna',
      arena: 'vienna',
      profile: vi,
      sky: SKY.grey,
      wet: 1,
      halfWidth: 2,
      field: { count: 60, pack: 3, kmin: 0.75, kmax: 1.1, seed: 27 },
      build: (race) => {
        rain = new Streaks({ n: 5000 });
        holo = new HoloText('20:00', 16, { col: '#ff5a44' });
        const f = race.place(race.course.length, 0);
        holo.group.position.set(f.x + f.dx * 25, f.y + 9, f.z + f.dz * 25);
        holo.group.rotation.y = Math.atan2(f.dx, f.dz) + Math.PI;
        race.extras.add(rain.lines, holo.group);
        funnel(race, race.course.length, 20);
      },
      shots: [
        { dur: 6, T: 400, cam: { mode: 'follow', dist: 5, h: 1.6, ang: 25, look: 1.2 }, grade: { letterbox: 1 } },
        { dur: 5, T: 900, cam: { mode: 'follow', dist: 3.5, h: 0.8, ang: 100 } },
        { dur: 9, T: 1195, rate: 0.6, cam: { mode: 'follow', dist: 6, h: 1.8, ang: 175, look: 3 }, cam2: { dist: 8 } },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud, g = ctx.r.grade;
        rain.update(race.stage!.camera.position, i.t);
        g.saturation = 0.55;
        g.contrast = 1.1;
        holo.intensity(0.5, i.t, 0.3);
        if (i.shot === 0) {
          g.fade = 1 - smooth(0, 1, i.shotT);
          h.caption(['05.11.2022', 'VIENNA  -  DONAUPARK', 'RAIN'], i.shotT, 0.8, env(i.shotT, 0.6, 6, 0.4, 0.5), 110, 150);
        }
        targetBlock(h, { target: 1199, projection: i.finished ? undefined : vi.projection(i.T), result: i.finished ? 1205 : undefined, alpha: i.shot > 0 ? 1 : 0 });
        if (i.shot === 2) {
          raceClock(h, { T: Math.min(i.T, vi.finish), d: Math.min(i.d, vi.distance) });
          h.text('LOG: "ALMOST A SUB 20"', 960, 900, { font: 'mono', size: 36, color: COL.amber, align: 'center', alpha: smooth(0.8, 1.4, i.T - vi.finish), tracking: 4, shadow: true });
          fades(g, i.shotT, 9, 0.01, 1);
        }
      },
      cues: [{ t: 0, kind: 'rain', dur: 20 }, { t: 0, kind: 'music', id: 'tension', dur: 20 }, { t: 14, kind: 'fail' }],
    }),
    logCard('c2-winter', [
      ['WINTER', 'Swain\'s Lane aka Pains Lane'],
      ['PARKRUN 20:21', 'the one where everything aches'],
    ], { title: 'MISSION LOG  -  WINTER 2022/23', hold: 1 }),
  );

  // --- DOUBLE ZERO round 1: Royal Victoria Dock 18.02.2023, 20:00 exactly, wind
  const dz1 = RunProfile.fromSplits(DOUBLE_ZERO_R1.splits, DOUBLE_ZERO_R1.distanceKm, 1200);
  let wind: Streaks, holo1: HoloText, sent1: Sentinel;
  const sentHead1 = new THREE.Vector3();
  scenes.push(
    boardCard('c2-board-dz', { dur: 6, op: 'ROYAL VICTORIA DOCK', objective: 'BOSS', target: '20:00', size: 0.8, route: 'victoria-dock', sub: 'DOUBLE ZERO  -  THE MINUTE THAT WOULD NOT BREAK', status: 'WIND WARNING', statusCol: COL.red }),
    new RaceScene({
      id: 'c2-dz1',
      arena: 'victoria-dock',
      profile: dz1,
      sky: SKY.storm,
      halfWidth: 3,
      field: { count: 140, pack: 5, kmin: 0.75, kmax: 1.12, seed: 28 },
      build: async (race) => {
        wind = new Streaks({ n: 2600, vel: [16, -0.4, 5], len: 0.08, opacity: 0.22, color: 0xdfe6ea });
        holo1 = new HoloText('20:00', 22, { col: '#ff4436' });
        holo1.group.visible = false;
        race.extras.add(wind.lines, holo1.group);
        funnel(race, race.course.length, 20);
        // the sentinel stands in the dock beside the course, a third of the way round
        sent1 = await Sentinel.create();
        const sS = race.course.length * 0.34;
        const side = waterSide(race, sS, 26);
        const f = race.place(sS, side * 26);
        sent1.root.position.set(f.x, race.arena.heightAt(f.x, f.z) - 1.5, f.z);
        // three-quarters towards the oncoming field
        sent1.root.rotation.y = Math.atan2(side * f.dz * 0.8 - f.dx, -side * f.dx * 0.8 - f.dz);
        race.extras.add(sent1.root);
        sentHead1.set(f.x, f.y + 26, f.z);
        // reveal: the field runs beneath it; later a low shot up at its clock
        const sh = race.o.shots;
        const k = dz1.distance / race.course.length;
        sh[0].T = dz1.timeAt((sS - 70) * k);
        sh[0].cam = { mode: 'follow', dist: 7, h: 1.1, ang: 12, look: 1.6, fov: 38, target: [sentHead1.x, sentHead1.y - 6, sentHead1.z], targetMix: 0.25, shake: 0.3 };
        sh[0].cam2 = { dist: 6, targetMix: 0.75 };
        sh[3].T = dz1.timeAt((sS - 25) * k);
        sh[3].cam = { mode: 'fixed', at: { s: (sS - 22) * k, off: -side * 3.5, h: 0.9 }, fov: 44, target: [sentHead1.x, sentHead1.y - 9, sentHead1.z], shake: 0.3 };
        sh[3].cam2 = { fov: 40, target: [sentHead1.x, sentHead1.y - 4, sentHead1.z] };
        sh[3].grade = { exposure: 0.7 };
        // after the line: its face, frozen on 20:00
        const fc = new THREE.Vector3(f.x, 0, f.z).add(new THREE.Vector3(Math.sin(sent1.root.rotation.y), 0, Math.cos(sent1.root.rotation.y)).multiplyScalar(16));
        sh[5].cam = { mode: 'fixed', at: [fc.x, sentHead1.y - 3, fc.z], fov: 34, target: [sentHead1.x, sentHead1.y - 0.4, sentHead1.z], shake: 0.15 };
        sh[5].cam2 = { fov: 30 };
      },
      shots: [
        { dur: 7, T: 100, cam: { mode: 'follow', dist: 30, h: 12, ang: 140, look: 2, fov: 40 }, cam2: { dist: 24 } },
        { dur: 5, T: 260, cam: { mode: 'follow', dist: 4, h: 1.5, ang: 12, look: 1.3, ahead: 20 } },
        { dur: 5, T: 560, cam: { mode: 'follow', dist: 3.2, h: 0.9, ang: 95 } },
        { dur: 5, T: 900, cam: { mode: 'follow', dist: 4, h: 1.4, ang: -125, look: 1.4 } },
        { dur: 12, T: 1188, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.6, ang: 175, look: 1.6 }, cam2: { dist: 9 } },
        { dur: 5, T: 1206, rate: 0.3, cam: { mode: 'follow' }, tag: 'face' },
      ],
      pose: (i) => ({ lean: i.d > 1000 ? 0.08 : 0, fatigue: i.d > 2000 ? 0.3 : 0 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        wind.update(race.stage!.camera.position, i.t);
        // its head is the race clock: it counts with him and stops dead on 20:00
        const shown = Math.min(i.T, 1200);
        sent1.update(i.t, { wind: 1, text: mmss(Math.max(0, shown)), look: i.pos, flicker: i.finished ? (Math.sin(i.t * 9) > 0 ? 0.4 : 0) : 0 });
        if (i.shot === 0) eventTag(h, { name: 'ROYAL VICTORIA DOCK', date: '18.02.2023', t: i.shotT });
        if (i.tag !== 'face') bossPlate(h, { name: 'DOUBLE ZERO', sub: 'ROUND 1', frac: 1 - i.d / 5010, alpha: env(i.t, 1, 20, 0.5, 0.5) });
        if (i.tag !== 'face') targetBlock(h, { target: 1199, projection: i.finished ? undefined : dz1.projection(i.T), result: i.finished ? 1200 : undefined });
        if (i.shot >= 1 && i.tag !== 'face') raceClock(h, { T: Math.min(i.T, 1200), d: Math.min(i.d, 5010) });
        if (i.shot >= 1 && i.shot < 4) kmSplits(h, race, i);
        if (i.shot === 4 && i.finished) {
          const u = i.T - 1200;
          stamp(h, '20:00', { alpha: smooth(0.2, 0.8, u), size: 200, col: COL.red, y: 540 });
          h.text('NOT UNDER.', 960, 680, { font: 'head', size: 64, weight: 700, color: COL.white, align: 'center', alpha: smooth(1.3, 1.8, u), tracking: 16, shadow: true });
          h.text('EXACTLY.', 960, 760, { font: 'head', size: 64, weight: 700, color: COL.red, align: 'center', alpha: smooth(2.3, 2.8, u), tracking: 16, shadow: true });
          h.text('LOG: "CLOSE TO SUB 20 BUT AFFECTED MASSIVELY BY THE WIND"', 960, 900, { font: 'mono', size: 26, color: COL.uiDim, align: 'center', alpha: smooth(3.5, 4, u), tracking: 2, shadow: true });
        }
        if (i.shot === 4) fades(ctx.r.grade, i.shotT, 12, 0.01, 0.6);
        if (i.tag === 'face') fades(ctx.r.grade, i.shotT, 5, 0.4, 1.2);
      },
      cues: [{ t: 0, kind: 'wind', dur: 37 }, { t: 0.6, kind: 'boss-intro' }, { t: 0, kind: 'music', id: 'boss', dur: 22 }, { t: 22, kind: 'silence', dur: 2 }, { t: 23.5, kind: 'fail-big' }],
    }),
  );

  // --- between rounds: 11.03.2023, 20:07, a Finsbury PB and still not enough
  const p2007 = RunProfile.fromRuns('pb-2007');
  scenes.push(
    new RaceScene({
      id: 'c2-2007',
      arena: 'finsbury',
      profile: p2007,
      sky: SKY.grey,
      halfWidth: 2.2,
      field: { count: 150, pack: 4, seed: 29 },
      build: parkrunDressing,
      shots: [{ dur: 8, T: 1200, rate: 0.6, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 172 }, cam2: { dist: 8 } }],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        eventTag(h, { name: 'FINSBURY PARK', date: '11.03.2023', t: i.t });
        targetBlock(h, { target: 1199, result: i.finished ? 1207 : undefined, projection: i.finished ? undefined : p2007.projection(i.T) });
        if (i.finished) {
          h.text('LOG: "NEW PB"', 960, 850, { font: 'mono', size: 34, color: COL.green, align: 'center', alpha: smooth(0.5, 1, i.T - 1207), tracking: 4, shadow: true });
          h.text('STILL NOT UNDER', 960, 920, { font: 'head', size: 54, weight: 700, color: COL.amber, align: 'center', alpha: smooth(1.8, 2.4, i.T - 1207), tracking: 12, shadow: true });
        }
        fades(ctx.r.grade, i.t, 8, 0.5, 0.8);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 8 }],
    }),
  );

  // --- DOUBLE ZERO round 2: Finsbury 18.03.2023, 19:25. The payoff.
  const dz2 = RunProfile.fromStream(fins as any, 1165);
  let holo2: HoloText, sent2: Sentinel;
  const sentHead2 = new THREE.Vector3();
  scenes.push(
    new CodecScene({
      id: 'c2-codec-dz2',
      freq: '140.85',
      ring: false,
      lines: [
        { who: 'TEMPO', text: 'Twenty-oh-seven last week.' },
        { who: 'STRIDE', text: 'Twenty exactly the week before.' },
        { who: 'TEMPO', text: 'Then you know where the line is.' },
      ],
    }),
    new RaceScene({
      id: 'c2-dz2',
      arena: 'finsbury',
      profile: dz2,
      sky: SKY.sunrise,
      halfWidth: 2.2,
      lane: 0.3,
      field: { count: 200, pack: 6, packSpread: 16, kmin: 0.72, kmax: 1.08, seed: 30 },
      spectators: [{ s0: -25, s1: 8, density: 0.4 }, { s0: 4960, s1: 5230, density: 0.25, sides: [1] }],
      build: async (race) => {
        parkrunDressing(race);
        holo2 = new HoloText('20:00', 20, { col: '#ff4436' });
        holo2.group.visible = false;
        race.extras.add(holo2.group);
        // round two: the sentinel waits past the finish, on the grass
        sent2 = await Sentinel.create();
        const L = race.course.length;
        const f = race.place(L + 46, 14);
        sent2.root.position.set(f.x, race.arena.heightAt(f.x, f.z), f.z);
        sent2.root.rotation.y = Math.atan2(-f.dx - f.dz * 0.6, -f.dz + f.dx * 0.6);
        race.extras.add(sent2.root);
        sentHead2.set(f.x, f.y + 27, f.z);
        const sh = race.o.shots;
        const d = sh.findIndex((x) => x.tag === 'defeat');
        const q = race.place(L + 9, -2.5);
        sh[d].cam = { mode: 'fixed', at: [q.x, q.y + 1.9, q.z], fov: 40, target: [sentHead2.x, sentHead2.y - 9, sentHead2.z], shake: 0.2 };
        sh[d].cam2 = { fov: 46, target: [sentHead2.x, sentHead2.y - 14, sentHead2.z] };
        for (let k = 1; k <= 4; k++) kmBoard(race, (k * 1000 * race.course.length) / dz2.distance, String(k));
      },
      shots: [
        { dur: 6, T: -12, cam: { mode: 'follow', dist: 10, h: 3.5, ang: 160, look: 1.2 }, cam2: { dist: 7, h: 2.5 }, grade: { letterbox: 1 } },
        { dur: 4, T: 3, cam: { mode: 'follow', dist: 5, h: 1.2, ang: 150, look: 1.1 } },
        { dur: 5, T: 205, cam: { mode: 'follow', dist: 4.2, h: 1.6, ang: 15, look: 1.3 }, tag: 'km1' },
        { dur: 5, T: 560, cam: { mode: 'follow', dist: 3.3, h: 0.9, ang: 92 } },
        { dur: 5, T: 820, cam: { mode: 'follow', dist: 18, h: 9, ang: 200, look: 0.6 } },
        { dur: 5, T: 1040, cam: { mode: 'follow', dist: 3.4, h: 1.4, ang: 160, look: 1.5 } },
        // the last 90 seconds, stretched
        { dur: 5, T: 1100, cam: { mode: 'follow', dist: 6, h: 1.7, ang: 172, look: 2.4 }, cam2: { dist: 7.5, h: 1.5 }, tag: 'run-in' },
        { dur: 5, T: 1126, cam: { mode: 'follow', dist: 3.4, h: 1.0, ang: 100, look: 1.2 }, tag: 'run-in' },
        { dur: 5, T: 1146, cam: { mode: 'follow', dist: 4, h: 1.5, ang: 15, look: 1.4, ahead: 20 }, tag: 'run-in' },
        { dur: 16, T: 1160.5, rate: 0.4, cam: { mode: 'follow', dist: 7, h: 1.5, ang: 178, look: 1.5, fov: 32 }, cam2: { dist: 10, fov: 30 }, tag: 'line' },
        // the clock boss breaks: 19:25 on its face, the digits blow out, it folds at the knees
        { dur: 7, T: 1167, rate: 0.5, cam: { mode: 'follow' }, tag: 'defeat' },
        { dur: 8, T: 1175, rate: 0.2, cam: { mode: 'follow', dist: 4, h: 1.7, ang: 150, look: 1.4 }, tag: 'after' },
      ],
      pose: (i) => ({ fatigue: i.d > 4200 ? 0.35 : 0, lean: i.tag === 'line' ? 0.06 : 0 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud, g = ctx.r.grade;
        const proj = dz2.projection(i.T);
        const fin = i.T - dz2.finish;
        // the clock boss counts with him; it flickers once the projection drops under 20:00; it breaks at the line
        const under = proj < 1199.5 ? 1 : 0;
        const dT = i.tag === 'defeat' ? i.shotT : 0;
        sent2.update(i.t, {
          wind: 0.25,
          text: mmss(Math.min(i.T, dz2.finish)),
          col: i.finished ? '#ff3a20' : undefined,
          look: i.pos,
          flicker: under * clamp01((i.d - 4000) / 900) * 0.8,
          shatter: i.tag === 'defeat' ? smooth(0.6, 2.6, dT) : i.tag === 'after' ? 1 : 0,
          kneel: i.tag === 'defeat' ? smooth(1.8, 6, dT) : i.tag === 'after' ? 1 : 0,
        });
        if (i.shot === 0) eventTag(h, { name: 'FINSBURY PARK', date: '18.03.2023', t: i.shotT });
        if (i.shot >= 1 && i.tag !== 'after' && i.tag !== 'defeat') {
          bossPlate(h, { name: 'DOUBLE ZERO', sub: 'ROUND 2', frac: 1 - clamp01(i.d / dz2.distance), alpha: i.finished ? 1 - smooth(0, 1, fin) : 1 });
          targetBlock(h, { target: 1199, projection: i.finished ? undefined : proj, result: i.finished ? 1165 : undefined });
          raceClock(h, { T: Math.min(i.T, dz2.finish), d: Math.min(i.d, dz2.distance) });
          if (i.tag !== 'line') kmSplits(h, race, i);
        }
        if (i.tag === 'line') {
          g.saturation = 0.9 - 0.3 * smooth(0, 2, fin);
          g.vignette = 0.5;
        }
        if (i.tag === 'defeat') {
          g.saturation = 0.75;
          g.exposure = 0.72;
          g.contrast = 1.15;
          bossPlate(h, { name: 'DOUBLE ZERO', sub: 'DEFEATED', frac: 0, alpha: smooth(2.5, 3.5, i.shotT) });
        }
        if (i.tag === 'after') {
          const a = smooth(0.5, 2, i.shotT);
          stamp(h, 'SUB 20', { alpha: a, size: 170, col: COL.green, y: 520, sub: 'COMPLETE' });
          h.text('19:25', 960, 720, { font: 'mono', size: 60, color: COL.white, align: 'center', alpha: smooth(2, 3, i.shotT), glow: 10, shadow: true });
          fades(g, i.shotT, 8, 0.01, 1.2);
        }
      },
      cues: [
        { t: 0, kind: 'amb-park', dur: 76 },
        { t: 6, kind: 'music', id: 'dz2', dur: 43 },
        { t: 49, kind: 'silence', dur: 12 },
        { t: 49, kind: 'heartbeat', dur: 12 },
        { t: 61.3, kind: 'shatter' },
        { t: 62.5, kind: 'wall-rise' },
        { t: 68, kind: 'music', id: 'complete', dur: 8 },
      ],
    }),
  );

  // --- reaction: the bench by the lake; the watch; the next number
  let bench: THREE.Object3D, wf: WatchFace;
  scenes.push(
    new RaceScene({
      id: 'c2-bench',
      arena: 'finsbury',
      s0: 2370,
      profile: steady(1, 1000),
      sky: SKY.sunrise,
      lane: 3.5,
      build: async (race) => {
        bench = await prop('painted_wooden_bench');
        const p = race.place(2370, 3.5);
        bench.position.set(p.x, p.y, p.z);
        bench.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI / 2;
        race.extras.add(bench);
        wf = new WatchFace(race.runner);
        wf.draw('19:25', 'PB');
      },
      shots: [
        { dur: 8, T: -20, cam: { mode: 'follow', dist: 9, h: 2, ang: -110, look: 0.8, fov: 30 }, cam2: { dist: 7.5 }, grade: { letterbox: 1 } },
        { dur: 10, T: -12, cam: { mode: 'follow', dist: 2.2, h: 1.2, ang: -60, look: 1.0, fov: 30 }, grade: { letterbox: 1 } },
      ],
      pose: () => ({ other: { Sitting_Idle_Loop: [1, 3] }, post: (r) => r.root.position.y += 0.02 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud, g = ctx.r.grade;
        // sit on the seat: the sitting clip puts the hips behind the root, so step the root forward
        const yaw = bench.rotation.y;
        const off = 0.35;
        race.runner.root.rotation.y = yaw;
        race.runner.root.position.set(bench.position.x + Math.sin(yaw) * off, bench.position.y, bench.position.z + Math.cos(yaw) * off);
        g.saturation = 0.85;
        if (i.shot === 0) g.fade = 1 - smooth(0, 1.5, i.shotT);
        if (i.shot === 1) {
          h.subtitle('What now?', env(i.shotT, 2, 5.5, 0.3, 0.4), { speaker: 'TEMPO', color: COL.ui });
          h.subtitle('Nineteen.', env(i.shotT, 6, 9.5, 0.3, 0.5), { speaker: 'STRIDE' });
          fades(g, i.shotT, 10, 0.01, 1.2);
        }
      },
      cues: [{ t: 0, kind: 'amb-lake', dur: 18 }, { t: 2, kind: 'music', id: 'quiet', dur: 16 }, { t: 10, kind: 'codec-blip' }, { t: 14, kind: 'codec-blip' }],
    }),
  );
  void pace;
  void fmt;
  return scenes;
}
export type { Ctx };
