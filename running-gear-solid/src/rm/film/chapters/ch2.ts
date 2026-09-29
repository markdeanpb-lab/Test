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
import { Lure } from '../bosses/Lure';
import { Scene, Ctx } from '../core';
import { Sentinel } from '../bosses/Sentinel';
import { lifeHud, equip, bossHp, prompt, popup, banner, button } from '../../hud/game';
import { Particles } from '../bosses/kit';
import { continueCard } from '../common';
import { Hinge } from '../bosses/Hinge';
import { hareBoss } from './hare';
import { waterSide, faceCourse, mmss, aimAt } from '../bosses/place';

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
        { who: 'PAUSE', dur: 1 },
        { who: 'TEMPO', text: 'One more thing. Once you draw a line, something comes to hold it.' },
        { who: 'STRIDE', text: 'Hold it?' },
        { who: 'TEMPO', text: "You'll see." },
      ],
    }),
    boardCard('c2-board-sub20', { dur: 8, op: 'FINSBURY PARK', objective: 'PRIMARY OBJECTIVE', target: 'SUB 20:00', size: 1, route: 'finsbury-parkrun', sub: '5 KM  -  4:00 /KM', status: 'CURRENT BEST 21:04   GAP 1:05' }),
  );

  // --- THE HARE (mini boss): 23.04.2022, 21:48 "Went off too fast" - a Wonderland chase
  scenes.push(hareBoss());

  // --- HINGE (major): "Testing the knee", then Hackney Half 22.05.2022, 1:46:30
  const hingeProf = RunProfile.fromSplits(HINGE.splits, HINGE.distanceKm, HINGE.timeSec);
  let hinge: Hinge, hingeStart: THREE.Object3D, hingeSteam: Particles;
  const hingePhase = (km: number) => (km < 5 ? 0 : km < 14 ? 1 : 2);
  scenes.push(
    logCard('c2-log-knee', [['21.05.2022', 'Parkrun - Testing the knee']], { title: 'MISSION LOG', hold: 1 }),
    new CodecScene({
      id: 'c2-codec-knee',
      freq: '140.96',
      tint: 'amber',
      lines: [
        { who: 'LACTATE', text: 'How did it feel?' },
        { who: 'STRIDE', text: 'It held. Mostly.' },
        { who: 'LACTATE', text: "Hackney is tomorrow. If that knee wants to lock, it'll lock late, under the viaduct." },
        { who: 'LACTATE', text: 'Short, quick steps. Keep your cadence up. Never let it grind.' },
        { who: 'STRIDE', text: 'And if it starts to go?' },
        { who: 'LACTATE', text: 'Then you hold it together until the line.' },
      ],
    }),
    new RaceScene({
      id: 'c2-hinge',
      arena: 'hackney',
      profile: hingeProf,
      // the boss level: industrial dusk, steam across the street
      sky: { ...SKY.dusk, fog: 0.006, fogColor: 0x8a5a44, sun: 2.2, sunColor: 0xff9a50 },
      halfWidth: 4,
      field: { count: 260, pack: 8, kmin: 0.8, kmax: 1.2, seed: 23 },
      spectators: [{ s0: 21000, s1: 21400, density: 0.8 }, { s0: 6000, s1: 6200, density: 0.5 }, { s0: 12000, s1: 12150, density: 0.5 }],
      build: async (race) => {
        hingeStart = arch(race, 0, 'HACKNEY HALF', 11);
        arch(race, race.course.length, 'FINISH', 11);
        hinge = await Hinge.create();
        race.extras.add(hinge.root);
        hingeSteam = new Particles({ n: 260, box: [26, 3, 40], vel: [1.5, 2.5, 0], life: 4, size: 5, color: 0xd8c8b8, opacity: 0.25, grow: 2, swirl: 3, seed: 9 });
        race.extras.add(hingeSteam.points);
      },
      shots: [
        { dur: 5, T: -6, cam: { mode: 'follow', dist: 12, h: 5, ang: 160, look: 1 }, cam2: { dist: 9 }, grade: { letterbox: 1 } },
        // it steps over the field: the reveal from under its knee
        { dur: 7, T: 700, cam: { mode: 'follow', dist: 8, h: 1.0, ang: 14, look: 1.4, fov: 52 }, cam2: { dist: 6.5 }, tag: 'boss' },
        { dur: 6, T: 2600, cam: { mode: 'follow', dist: 3.2, h: 0.7, ang: 95, look: 0.7 }, tag: 'knee' },
        // grind: from the side, the machine and the man in one frame, lamps going red
        { dur: 6, T: 4200, cam: { mode: 'follow', dist: 38, h: 44, ang: 200, look: 2, ahead: 6, fov: 40 }, cam2: { dist: 34, h: 40, ang: 190 } },
        { dur: 5, T: 5900, cam: { mode: 'follow', dist: 7.5, h: 0.9, ang: -18, look: 1.4, fov: 52 }, tag: 'boss' },
        { dur: 8, T: 6378, rate: 0.5, cam: { mode: 'follow', dist: 7, h: 1.6, ang: 172 }, cam2: { dist: 9 } },
        // it held: the machine locks straight over the finish, lamps green
        { dur: 5, T: 6392, rate: 0.4, cam: { mode: 'follow', dist: 12, h: 2.2, ang: 0, look: 1.4, fov: 50 }, tag: 'held' },
      ],
      pose: (i) => ({ fatigue: i.d > 14000 ? 0.5 : i.d > 5000 ? 0.2 : 0 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const km = i.d / 1000;
        const ph = hingePhase(km);
        // it walks the course a few metres ahead of him; at the finish it locks straight
        const fin = i.T - hingeProf.finish;
        hingeStart.visible = i.shot === 0;
        hinge.update(i.t, Math.min(i.s, race.course.length) + (i.tag === 'held' ? 16 : 13), (s, off) => race.place(s, off), 0, { phase: ph, held: fin > 0 ? smooth(0.5, 3, fin) : 0, spread: 6.2 });
        if (i.tag === 'boss' || i.tag === 'held') aimAt(race.stage!.camera, hinge.body.position, i.tag === 'held' ? 0.6 : 0.2 + 0.18 * smooth(0, 4, i.shotT));
        if (i.shot === 0) eventTag(h, { name: 'HACKNEY HALF', date: '22.05.2022', t: i.shotT });
        hingeSteam.points.position.set(i.pos.x, i.pos.y + 1.5, i.pos.z);
        hingeSteam.update(i.t, 1, 0.22);
        if (i.shot >= 1 && i.shot <= 4) {
          h.time = i.t;
          raceClock(h, { T: i.T, d: i.d, pace: HINGE.splits[Math.min(20, Math.floor(km))] });
          const hr = HINGE.splitHr![Math.min(20, Math.floor(km))];
          h.text(`HR ${hr}`, 1824, 330, { font: 'mono', size: 34, color: hr >= 186 ? COL.red : COL.ui, align: 'right', shadow: true });
          // the knee is the life gauge: the boss wins if it empties
          const kneeFrac = [0.9, 0.55, 0.3][ph] - 0.05 * Math.max(0, Math.sin(i.t * 2.3));
          lifeHud(h, { life: kneeFrac, stamina: 1 - clamp01(km / 21.1) * 0.8, name: 'STRIDE  -  KNEE' });
          h.text(['CONTROLLED', 'GRIND', 'SEIZE'][ph], 96, 210, { font: 'head', size: 40, weight: 700, color: ph === 2 ? COL.red : ph === 1 ? COL.amber : COL.green, tracking: 6, shadow: true });
          equip(h, { item: 'KNEE SUPPORT', weapon: 'CADENCE', weaponSub: `${[172, 168, 164][ph]} SPM` });
          bossHp(h, { name: 'HINGE', hp: 1 - clamp01(km / 21.1) * 0.9, phase: `KM ${Math.floor(km)}` });
          // mechanic: keep the cadence (a rhythm track of button prompts), dodge the stamps
          const beat = 60 / 84; // two steps per prompt
          const k = Math.floor(i.t / beat), u = (i.t % beat) / beat;
          if (ph < 2) {
            for (let n = 0; n < 5; n++) {
              const x = 960 + (n - u) * 150;
              button(h, (['X', 'O', 'X', 'T', 'X'] as const)[(k + n) % 5], x, 820, n === 0 ? 34 : 26, n === 0 ? 1 : 0.55, n === 0 && u < 0.25 ? 1 : 0);
            }
            h.text('KEEP CADENCE', 960, 760, { font: 'mono', size: 30, color: COL.ui, align: 'center', tracking: 6, shadow: true });
            if (u < 0.25) popup(h, ['PERFECT', 'GOOD', 'PERFECT'][k % 3], 960, 700, u * beat, COL.green, 44);
          } else prompt(h, { b: 'R1', text: 'HOLD FORM', t: i.shotT, hold: clamp01(i.shotT / 4), y: 820 });
          // stamps: the mech's foot comes down beside him
          const stamp1 = i.t % 3.1;
          if (i.tag === 'boss' && stamp1 < 0.8) {
            prompt(h, { b: 'O', text: 'DODGE', t: stamp1, y: 620, ok: stamp1 > 0.4 });
            const c = race.stage!.camera;
            c.position.y += Math.sin(stamp1 * 40) * 0.08 * (1 - stamp1 / 0.8);
          }
          if (i.tag === 'knee') {
            const pulse = 0.5 + 0.5 * Math.sin(i.shotT * 5);
            ctx.r.grade.saturation = 0.6;
            h.text('LOAD TEST', 960, 250, { font: 'mono', size: 36, color: COL.amber, align: 'center', alpha: 0.6 + 0.4 * pulse, tracking: 10, shadow: true });
          }
        }
        if (i.tag === 'held') {
          stamp(h, 'JOINT HELD', { alpha: smooth(0.5, 1.5, i.shotT), size: 110, col: COL.green, sub: '1:46:30', y: 860 });
          fades(ctx.r.grade, i.shotT, 5, 0.01, 1);
        }
        if (i.shot === 5) {
          raceClock(h, { T: Math.min(i.T, hingeProf.finish), hours: true, alpha: 1 - smooth(6, 7, i.shotT) });
          if (i.finished) {
            const a = smooth(0.3, 1, i.T - hingeProf.finish);
            h.text('LOG: "THE KNEE HELD OUT - GREAT ATMOSPHERE"', 960, 900, { font: 'mono', size: 30, color: COL.ui, align: 'center', alpha: a, tracking: 3, shadow: true });
          }
          fades(ctx.r.grade, i.shotT, 8, 0.01, 0.5);
        }
        void race;
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 42 }, { t: 3, kind: 'music', id: 'boss', dur: 31 }, { t: 5, kind: 'boss-intro' }, { t: 32, kind: 'win' }],
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
  let sent0: Sentinel;
  scenes.push(
    new RaceScene({
      id: 'c2-near',
      arena: 'finsbury',
      profile: ret,
      sky: SKY.morning,
      halfWidth: 2.2,
      field: { count: 170, pack: 5, kmin: 0.72, kmax: 1.15, seed: 24 },
      build: async (race) => {
        parkrunDressing(race);
        // the omen: a clock-faced sentinel on the skyline beyond the finish, showing 20:00
        sent0 = await Sentinel.create();
        const L = race.course.length;
        let cx = 0, cz = 0;
        for (let k = 0; k < 40; k++) {
          const q = race.courseAt((k / 40) * L * 0.5);
          cx += q.x / 40;
          cz += q.z / 40;
        }
        sent0.root.position.set(cx, race.arena.heightAt(cx, cz), cz);
        sent0.root.scale.setScalar(1.35);
        race.extras.add(sent0.root);
      },
      shots: [
        { dur: 3.5, T: 300, cam: { mode: 'follow', dist: 4.5, h: 1.5, ang: 30 }, tag: '20:37' },
        { dur: 3.5, T: 800, cam: { mode: 'follow', dist: 3.5, h: 1.0, ang: 110 }, tag: '20:34' },
        { dur: 5, T: 1100, cam: { mode: 'follow', dist: 5, h: 1.6, ang: 160 } },
        { dur: 9, T: 1203, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.4, ang: 172 }, cam2: { dist: 8 } },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        sent0.update(i.t, { wind: 0.2, text: '20:00', look: i.pos, flicker: Math.sin(i.t * 3) > 0.7 ? 0.3 : 0 });
        if (i.shot < 2) aimAt(race.stage!.camera, sent0.root.position.clone().add(new THREE.Vector3(0, 30, 0)), 0.5);
        if (i.shot < 2) {
          const a = env(i.shotT, 0.2, 3.5, 0.3, 0.3);
          h.text('PARKRUN  SUMMER 2022', 960, 780, { font: 'mono', size: 26, color: COL.uiDim, align: 'center', alpha: a, tracking: 10, shadow: true });
          h.text(i.tag!, 960, 900, { font: 'mono', size: 130, color: COL.white, align: 'center', alpha: a, glow: 14, shadow: true });
          targetBlock(h, { target: 1199, alpha: a * 0.9 });
          // a game over of a kind: RETRY?
          const ra = env(i.shotT, 2.1, 3.5, 0.1, 0.2);
          h.text('MISSION FAILED', 960, 420, { font: 'head', size: 64, weight: 700, color: COL.red, align: 'center', alpha: ra, tracking: 14, glow: 10, shadow: true });
          h.text('RETRY?   > YES', 960, 500, { font: 'mono', size: 44, color: COL.white, align: 'center', alpha: ra, tracking: 6, shadow: true });
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
      cues: [{ t: 0, kind: 'amb-park', dur: 21 }, { t: 0.2, kind: 'number-hit' }, { t: 2.1, kind: 'fail' }, { t: 3.3, kind: 'select' }, { t: 3.7, kind: 'number-hit' }, { t: 5.6, kind: 'fail' }, { t: 6.8, kind: 'select' }, { t: 7, kind: 'music', id: 'tension', dur: 14 }, { t: 15, kind: 'fail' }],
    }),
    new CodecScene({
      id: 'c2-codec-sentinel',
      freq: '140.85',
      lines: [
        { who: 'STRIDE', text: 'Twenty thirty-seven. Twenty thirty-four. Twenty fifteen.' },
        { who: 'STRIDE', text: "And every time, there's a clock. Over the finish. It says twenty." },
        { who: 'TEMPO', text: 'The Sentinel.' },
        { who: 'STRIDE', text: "You said something would come to hold the line. That's it?" },
        { who: 'TEMPO', text: 'That is it. It guards twenty minutes. It feeds on seconds.' },
        { who: 'TEMPO', text: 'Every kilometre over four minutes feeds it. Every one under breaks a piece off.' },
        { who: 'STRIDE', text: 'Five hits, then.' },
        { who: 'TEMPO', text: 'Five. Find flat ground and a calm day.' },
      ],
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
  let hare2: Lure;
  const hare2D = (T: number) => rp.distAt(T) + 8 + Math.min(10, T * 0.004) + Math.max(0, T - 3000) * 0.05;
  scenes.push(
    new RaceScene({
      id: 'c2-royalparks',
      arena: 'royal-parks',
      profile: rp,
      sky: SKY.overcast,
      halfWidth: 4,
      field: { count: 240, pack: 6, kmin: 0.85, kmax: 1.15, seed: 26 },
      build: async (race) => {
        hare2 = await Lure.create();
        hare2.rig(-1, (race.o.halfWidth ?? 2.5) + 0.2);
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
  const gust = (t: number) => Math.pow(Math.max(0, Math.sin((t / 4.2) * Math.PI * 2 - 1)), 3);
  const sentHead1 = new THREE.Vector3();
  scenes.push(
    boardCard('c2-board-dz', { dur: 6, op: 'ROYAL VICTORIA DOCK', objective: 'BOSS', target: '20:00', size: 0.8, route: 'victoria-dock', sub: 'DOUBLE ZERO  -  THE MINUTE THAT WOULD NOT BREAK', status: 'WIND WARNING', statusCol: COL.red }),
    new RaceScene({
      id: 'c2-dz1',
      arena: 'victoria-dock',
      profile: dz1,
      sky: { ...SKY.storm, bgIntensity: 0.4, sun: 0.5, fog: 0.007, fogColor: 0x3c4650, env: 0.6 },
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
      pose: (i) => ({ lean: (i.d > 1000 ? 0.08 : 0) + 0.12 * gust(i.t), fatigue: i.d > 2000 ? 0.3 : 0 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        h.time = i.t;
        wind.update(race.stage!.camera.position, i.t);
        // the sentinel's turbines throw gusts across the dock: tuck in behind them
        const gu = gust(i.t);
        (wind.lines.material as THREE.LineBasicMaterial).opacity = 0.18 + 0.35 * gu;
        const cam = race.stage!.camera;
        cam.position.x += Math.sin(i.t * 31) * 0.05 * gu;
        cam.position.y += Math.sin(i.t * 27) * 0.04 * gu;
        if (i.shot >= 1 && i.tag !== 'face' && !i.finished) {
          lifeHud(h, { life: 1, stamina: 1 - 0.7 * clamp01(i.d / 5010) - 0.15 * gu });
          equip(h, { item: 'GPS WATCH', weapon: 'NONE' });
          bossHp(h, { name: 'DOUBLE ZERO', hp: 1 - 0.97 * clamp01(i.d / 5010), phase: 'ROUND 1' });
          // wind gauge
          h.panel(1464, 170, 360, 110, {});
          h.text('WIND', 1488, 212, { font: 'mono', size: 28, color: COL.uiDim, tracking: 5 });
          h.segBar(1488, 232, 312, 22, 0.55 + 0.45 * gu, 12, gu > 0.5 ? COL.red : COL.amber);
          if (gu > 0.3) prompt(h, { b: 'R1', text: 'TUCK IN', t: (i.t % 4.2) - 0.8, hold: clamp01(((i.t % 4.2) - 0.8) / 1.6), y: 800 });
        }
        // its head is the race clock: it counts with him and stops dead on 20:00
        const shown = Math.min(i.T, 1200);
        // gusts come off its turbines: rotors race, wind spikes
        sent1.update(i.t, { wind: 1, text: mmss(Math.max(0, shown)), look: i.pos, flicker: i.finished ? (Math.sin(i.t * 9) > 0 ? 0.4 : 0) : 0 });
        if (i.shot === 0) eventTag(h, { name: 'ROYAL VICTORIA DOCK', date: '18.02.2023', t: i.shotT });
        // flat ground, as ordered. Not a calm day.
        if (i.shot === 1) h.subtitle('Flat ground. So much for a calm day.', env(i.shotT, 0.4, 4.8, 0.3, 0.3), { speaker: 'TEMPO', color: COL.ui });
        if (i.shot >= 1 && i.tag !== 'face') targetBlock(h, { target: 1199, projection: i.finished ? undefined : dz1.projection(i.T), result: i.finished ? 1200 : undefined });
        if (i.shot >= 1 && i.tag !== 'face') raceClock(h, { T: Math.min(i.T, 1200), d: Math.min(i.d, 5010) });
        if (i.shot >= 1 && i.shot < 4) kmSplits(h, race, i);
        if (i.shot === 4 && i.finished) {
          const u = i.T - 1200;
          banner(h, 'TIME UP', u * 2 - 0.2, { col: COL.red, sub: 'DRAW', dur: 1.6 });
          stamp(h, '20:00', { alpha: smooth(1.8, 2.3, u), size: 200, col: COL.red, y: 540 });
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

  scenes.push(continueCard('c2-continue-dz', { title: 'DOUBLE ZERO  -  ROUND 1', line: '20:00. NOT UNDER. EXACTLY.', log: 'LOG: "Close to sub 20 but affected massively by the wind"' }));

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
  let holo2: HoloText, sent2: Sentinel, beam: THREE.Mesh;
  // real km splits (GPS stream): 3:35, 3:56, 3:49, 4:07; a sub-4:00 km is a hit
  const DZ2_KM = [1, 2, 3, 4].map((k) => ({ k, T: dz2.timeAt(k * 1000), split: dz2.timeAt(k * 1000) - dz2.timeAt((k - 1) * 1000) }));
  const dz2Hp = (T: number) => {
    let hp = 1;
    for (const s of DZ2_KM) if (T > s.T) hp -= s.split < 240 ? (240 - s.split) * 0.012 + 0.08 : -0.04;
    return Math.max(0.05, hp) * (T > dz2.finish ? 0 : 1);
  };
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
      sky: SKY.morning,
      halfWidth: 2.2,
      lane: 0.3,
      field: { count: 200, pack: 6, packSpread: 16, kmin: 0.72, kmax: 1.08, seed: 30 },
      spectators: [{ s0: -25, s1: 8, density: 0.4 }, { s0: 4960, s1: 5230, density: 0.25, sides: [1] }],
      build: async (race) => {
        parkrunDressing(race);
        holo2 = new HoloText('20:00', 20, { col: '#ff4436' });
        holo2.group.visible = false;
        race.extras.add(holo2.group);
        // round two: the sentinel stands in the middle of the park, visible from the whole loop
        sent2 = await Sentinel.create();
        const L = race.course.length;
        let cx = 0, cz = 0;
        for (let k = 0; k < 40; k++) {
          const q = race.courseAt((k / 40) * L * 0.5);
          cx += q.x / 40;
          cz += q.z / 40;
        }
        sent2.root.position.set(cx, race.arena.heightAt(cx, cz), cz);
        sent2.root.scale.setScalar(1.35);
        race.extras.add(sent2.root);
        sentHead2.set(cx, sent2.root.position.y + 27 * 1.35, cz);
        const f = { x: cx, y: sent2.root.position.y, z: cz };
        // the laser: every km split under 4:00 is a shot at its armour
        beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        beam.geometry.translate(0, 0.5, 0);
        race.extras.add(beam);
        const sh = race.o.shots;
        const d = sh.findIndex((x) => x.tag === 'defeat');
        const q = race.place(L + 9, -2.5);
        sh[d].cam = { mode: 'fixed', at: [q.x, q.y + 1.9, q.z], fov: 40, target: [sentHead2.x, sentHead2.y - 9, sentHead2.z], shake: 0.2 };
        sh[d].cam2 = { fov: 46, target: [sentHead2.x, sentHead2.y - 14, sentHead2.z] };
        for (let k = 1; k <= 4; k++) kmBoard(race, (k * 1000 * race.course.length) / dz2.distance, String(k));
        for (const km of DZ2_KM) {
          const shot = sh.find((x) => x.tag === 'km' + km.k)!;
          shot.T = km.T - 2.5;
          shot.cam = { ...shot.cam, target: [sentHead2.x, sentHead2.y - 8, sentHead2.z], targetMix: 0.3 };
        }
      },
      shots: [
        { dur: 6, T: -12, cam: { mode: 'follow', dist: 10, h: 3.5, ang: 160, look: 1.2 }, cam2: { dist: 7, h: 2.5 }, grade: { letterbox: 1 } },
        { dur: 4, T: 3, cam: { mode: 'follow', dist: 5, h: 1.2, ang: 150, look: 1.1 } },
        // each km marker: the split is the shot
        ...[0, 1, 2, 3].map((k) => ({ dur: 5, T: 0, cam: { mode: 'follow' as const, dist: 5, h: 1.6, ang: k % 2 ? -25 : 25, look: 2, fov: 52 }, tag: 'km' + (k + 1) })),
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
        if (i.tag?.startsWith('km')) {
          // over his shoulder, the sentinel looming in the frame
          const cam = race.stage!.camera;
          const sp = new THREE.Vector3(sentHead2.x, 0, sentHead2.z);
          const me = i.pos.clone();
          const away = me.clone().sub(sp).setY(0).normalize();
          const side = new THREE.Vector3(-away.z, 0, away.x);
          cam.position.copy(me).addScaledVector(away, 5.5).addScaledVector(side, 1.6).add(new THREE.Vector3(0, 1.5, 0));
          cam.lookAt(me.x * 0.55 + sp.x * 0.45, me.y + 8, me.z * 0.55 + sp.z * 0.45);
          cam.fov = 58;
          cam.updateProjectionMatrix();
        }
        // the split shots
        const shotKm = DZ2_KM.find((k) => i.T > k.T && i.T < k.T + 1.2);
        const bm = beam.material as THREE.MeshBasicMaterial;
        if (shotKm) {
          const hit = shotKm.split < 240;
          const from = new THREE.Vector3();
          race.runner.bone('hand_l').getWorldPosition(from);
          const to = new THREE.Vector3(sentHead2.x, sentHead2.y - (hit ? 6 : 16), sentHead2.z);
          const v = to.clone().sub(from);
          beam.position.copy(from);
          beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
          beam.scale.set(1, v.length(), 1);
          bm.color.setHex(hit ? 0x7fe3ff : 0xff5030);
          bm.opacity = (1 - (i.T - shotKm.T) / 1.2) * (hit ? 1 : 0.6);
        } else bm.opacity = 0;
        if (i.shot >= 1 && i.tag !== 'after' && i.tag !== 'defeat') {
          h.time = i.t;
          const miss = DZ2_KM.find((k) => k.split >= 240 && i.T > k.T && i.T < k.T + 0.6);
          lifeHud(h, { life: 1 - (i.T > DZ2_KM[3].T ? 0.2 : 0), stamina: 1 - clamp01(i.d / dz2.distance) * 0.85, hurt: miss ? 1 : 0 });
          equip(h, { item: 'GPS WATCH', weapon: 'KM SPLITS', weaponSub: '<4:00' });
          bossHp(h, { name: 'DOUBLE ZERO', hp: dz2Hp(i.T), phase: 'ROUND 2', hit: DZ2_KM.some((k) => k.split < 240 && i.T > k.T && i.T < k.T + 0.5) ? 1 : 0, alpha: i.finished ? 1 - smooth(0, 1, fin) : 1 });
          targetBlock(h, { target: 1199, projection: i.finished ? undefined : proj, result: i.finished ? 1165 : undefined });
          if (i.tag?.startsWith('km')) {
            const km = DZ2_KM[Number(i.tag.slice(2)) - 1];
            const since = i.T - km.T;
            if (since > -2.2 && since < 0) prompt(h, { b: 'R1', text: 'SPLIT', t: since + 2.2, hold: (since + 2.2) / 2.2, y: 800 });
            if (since > 0) {
              const hit = km.split < 240;
              popup(h, `KM ${km.k}  ${Math.floor(km.split / 60)}:${String(Math.round(km.split % 60)).padStart(2, '0')}`, 960, 440, since, hit ? COL.cyan : COL.red, 84);
              popup(h, hit ? (km.split < 225 ? 'CRITICAL HIT' : 'HIT') : 'MISS  -  OVER 4:00', 960, 540, since - 0.3, hit ? COL.green : COL.red, 64);
            }
          }
          if (i.tag === 'line' && !i.finished) prompt(h, { b: 'X', text: 'SPRINT', t: i.shotT, mash: true, y: 800 });
        }
        if (i.tag === 'line') {
          g.saturation = 0.9 - 0.3 * smooth(0, 2, fin);
          g.vignette = 0.5;
        }
        if (i.tag === 'defeat') {
          g.saturation = 0.75;
          g.exposure = 0.72;
          g.contrast = 1.15;
          banner(h, 'DOUBLE ZERO', i.shotT - 2.6, { col: COL.white, sub: 'DEFEATED  -  19:25', dur: 4 });
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
