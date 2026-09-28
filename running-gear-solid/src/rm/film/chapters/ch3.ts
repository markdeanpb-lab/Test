// CHAPTER 3 - AMBITION (Apr - Dec 2023)
// Sub 40, the first meeting with the Phantom 1:30, sub 19, the first marathon, the Claw.
import * as THREE from 'three';
import { RaceScene, Info } from '../RaceScene';
import { RunProfile } from '../profile';
import { PHANTOM_2023, RICHMOND, CLAW } from '../../../data/activities';
import batterseaJ from '../../../data/gps/battersea-10k.json';
import lordshipJ from '../../../data/gps/lordship-parkrun.json';
import t5000J from '../../../data/gps/finsbury-5000s.json';
import { SKY, chapterCard, logCard, boardCard, fades, trackPath, missionList, llToLocal, steady } from '../common';
import { CodecScene } from '../Codec';
import { Card, grid } from '../Cards';
import { COL, env, smooth, clamp01, fmt, Hud } from '../../hud/Hud';
import { raceClock, targetBlock, stamp, bossPlate, eventTag, splitPop } from '../../hud/widgets';
import { funnel, flag, arch } from '../dressing';
import { Ghost, HoloText } from '../fx';
import { pbrArrayWall } from './walls';
import { Scene } from '../core';
import { Furnace } from '../bosses/Furnace';
import { waterSide, aimAt } from '../bosses/place';

const HALF = 21097.5;

function kmSplits(h: Hud, race: RaceScene, i: Info, fast = 240) {
  const p = race.o.profile;
  const km = Math.floor(i.d / 1000);
  if (km < 1 || i.finished) return;
  const since = i.T - p.timeAt(km * 1000);
  const split = p.timeAt(km * 1000) - p.timeAt((km - 1) * 1000);
  splitPop(h, { km, split, since, col: split < fast ? COL.green : COL.white });
}

/** the Phantom: a cyan wireframe pacer on exact 1:30:00 pace over the GPS distance */
export function phantomDist(profileDistance: number) {
  return (T: number) => Math.max(0, T) * (profileDistance / 5400);
}

export function ch3(): Scene[] {
  const scenes: Scene[] = [chapterCard('c3-card', 'CHAPTER 3', 'AMBITION', 'APRIL  -  DECEMBER 2023')];

  // --- FORTY (mini): Battersea 10K, 15.04.2023, 39:35
  const bat = RunProfile.fromGpsProfile(batterseaJ as any, 2375);
  let h40: HoloText;
  scenes.push(
    new RaceScene({
      id: 'c3-forty',
      chapter: 'AMBITION',
      arena: 'battersea',
      profile: bat,
      sky: SKY.morning,
      halfWidth: 3,
      field: { count: 160, pack: 6, kmin: 0.8, kmax: 1.1, seed: 31 },
      build: (race) => {
        h40 = new HoloText('40:00', 18, { col: '#ff4436' });
        const f = race.place(race.course.length - 60, 0);
        h40.group.position.set(f.x, f.y + 10, f.z);
        race.extras.add(h40.group);
        arch(race, race.course.length, 'FINISH', 9);
      },
      shots: [
        { dur: 6, T: 300, cam: { mode: 'follow', dist: 30, h: 14, ang: 150, look: 1 }, cam2: { dist: 24 } },
        { dur: 5, T: 1300, cam: { mode: 'follow', dist: 4.5, h: 1.5, ang: 15, look: 1.3, ahead: 10 } },
        { dur: 12, T: 2360, rate: 0.45, cam: { mode: 'follow', dist: 6, h: 1.6, ang: 172, look: 2 }, cam2: { dist: 8.5 } },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        h40.group.lookAt(race.stage!.camera.position);
        h40.intensity(1, i.t, i.d > 9000 ? 0.5 : 0);
        h40.shatter(i.finished ? clamp01((i.T - bat.finish) / 2) : 0);
        if (i.shot === 0) {
          ctx.r.grade.fade = 1 - smooth(0, 1, i.shotT);
          eventTag(h, { name: 'BATTERSEA PARK 10K', date: '15.04.2023', t: i.shotT });
          h.text('BEFORE: 41:37  LONDON WINTER RUN, FEB 2023', 96, 150, { font: 'mono', size: 22, color: COL.uiDim, alpha: env(i.shotT, 1.5, 6, 0.3, 0.4), tracking: 3, shadow: true });
        }
        bossPlate(h, { name: 'FORTY', sub: 'MINI BOSS', frac: 1 - i.d / bat.distance, alpha: i.finished ? 1 - smooth(0, 1, i.T - bat.finish) : 1 });
        targetBlock(h, { target: 2399, projection: i.finished ? undefined : bat.projection(i.T), result: i.finished ? 2375 : undefined });
        raceClock(h, { T: Math.min(i.T, bat.finish), d: Math.min(i.d, bat.distance) });
        if (i.shot === 2 && i.finished) stamp(h, 'SUB 40', { alpha: smooth(1.2, 2, i.T - bat.finish), col: COL.green, sub: 'COMPLETE  -  39:35', size: 130 });
        if (i.shot === 2) fades(ctx.r.grade, i.shotT, 12, 0.01, 1);
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 23, level: 0.4 }, { t: 0, kind: 'music', id: 'boss-mini', dur: 16 }, { t: 15, kind: 'shatter' }, { t: 16, kind: 'win' }],
    }),
  );

  // --- the Phantom is named
  scenes.push(
    new CodecScene({
      id: 'c3-codec-130',
      freq: '140.85',
      lines: [
        { who: 'TEMPO', text: 'Thirty-nine thirty-five. That puts a half marathon in a different place.' },
        { who: 'PAUSE', dur: 1.2 },
        { who: 'TEMPO', text: "You're chasing it again." },
        { who: 'STRIDE', text: '1:30?' },
        { who: 'TEMPO', text: 'You know exactly what I mean.' },
      ],
    }),
    boardCard('c3-board-130', { dur: 8, op: 'HACKNEY HALF', objective: 'PRIMARY OBJECTIVE', target: '1:29:59', size: 0.9, route: 'hackney-half', sub: '21.1 KM  -  4:15 /KM', status: 'HALF PB 1:38:12   GAP 8:13' }),
  );

  // --- PHANTOM 1:30, encounter 01: Hackney Half 21.05.2023, 1:35:30
  const ph1 = RunProfile.fromSplits(PHANTOM_2023.splits, PHANTOM_2023.distanceKm, PHANTOM_2023.timeSec);
  const phD = phantomDist(ph1.distance);
  let phantom: Ghost;
  const delta = (T: number) => T - ph1.distAt(T) / (ph1.distance / 5400); // + = STRIDE behind
  scenes.push(
    new RaceScene({
      id: 'c3-phantom1',
      arena: 'hackney',
      profile: ph1,
      sky: SKY.clear,
      halfWidth: 4,
      field: { count: 260, pack: 8, kmin: 0.85, kmax: 1.2, seed: 32 },
      spectators: [{ s0: -40, s1: 50, density: 0.7 }, { s0: 21150, s1: 21400, density: 0.8 }, { s0: 13000, s1: 13200, density: 0.5 }],
      build: async (race) => {
        arch(race, 0, 'HACKNEY HALF', 11);
        arch(race, race.course.length, 'FINISH', 11);
        phantom = await Ghost.create(0x5ff3ff, true, 0.16);
        phantom.prepare(phD, -2, 6000);
        race.extras.add(phantom.runner.root);
      },
      shots: [
        { dur: 5, T: -4, cam: { mode: 'follow', dist: 10, h: 4, ang: 160, look: 1.2 }, cam2: { dist: 8 }, grade: { letterbox: 1 } },
        { dur: 6, T: 800, cam: { mode: 'follow', dist: 5, h: 1.6, ang: 160, look: 1.2 }, tag: 'ahead' },
        { dur: 6, T: 2140, cam: { mode: 'follow', dist: 7, h: 2, ang: 185, look: 1.2 }, tag: 'ahead' },
        { dur: 10, T: 3170, rate: 0.6, cam: { mode: 'follow', dist: 4, h: 1.3, ang: 70, look: 1.2, ahead: 2 }, cam2: { ang: 30, ahead: 6 }, tag: 'pass' },
        { dur: 5, T: 4300, cam: { mode: 'follow', dist: 4.5, h: 1.7, ang: 12, look: 1.3, ahead: 30 }, tag: 'behind' },
        { dur: 8, T: 5725, rate: 0.6, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 172 }, cam2: { dist: 8 }, tag: 'finish' },
      ],
      pose: (i) => ({ fatigue: clamp01((i.d - 12000) / 8000) * 0.7 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const pd = phD(i.T);
        const pp = race.place(pd * (race.course.length / ph1.distance), -0.8);
        phantom.opacity = i.T > 0 && pd < ph1.distance ? 0.16 : 0;
        phantom.pose(pp, i.T, ph1.distance / 5400);
        const dl = delta(i.T);
        if (i.shot === 0) eventTag(h, { name: 'HACKNEY HALF', date: '21.05.2023', t: i.shotT });
        if (i.shot >= 1 && i.tag !== 'finish') {
          bossPlate(h, { name: 'PHANTOM 1:30', sub: 'ENCOUNTER 01', col: COL.cyan, phase: `KM ${Math.floor(i.d / 1000)}` });
          raceClock(h, { T: i.T, d: i.d, hours: true, pace: PHANTOM_2023.splits[Math.min(20, Math.floor(i.d / 1000))] });
          h.panel(96, 170, 460, 150, { alpha: 0.9, col: COL.cyan });
          h.text('VS PHANTOM 1:30', 120, 212, { font: 'mono', size: 22, color: COL.uiDim, tracking: 5 });
          h.text(dl <= 0 ? `${fmt(-dl)} AHEAD` : `${fmt(dl)} BEHIND`, 120, 280, { font: 'mono', size: 52, color: dl <= 0 ? COL.green : COL.red, glow: 8 });
          h.text(`PROJECTION ${fmt(ph1.projection(i.T), { hours: true })}`, 1824, 330, { font: 'mono', size: 28, color: ph1.projection(i.T) < 5400 ? COL.green : COL.amber, align: 'right', shadow: true });
        }
        if (i.tag === 'pass') h.text('OVERTAKEN', 960, 220, { font: 'head', size: 60, weight: 700, color: COL.red, align: 'center', alpha: smooth(5, 6, i.shotT), tracking: 20, shadow: true });
        if (i.tag === 'finish') {
          raceClock(h, { T: Math.min(i.T, ph1.finish), hours: true });
          if (i.finished) {
            const u = i.T - ph1.finish;
            stamp(h, 'PHANTOM ESCAPED', { alpha: smooth(0.2, 0.8, u), size: 90, col: COL.cyan, sub: '1:35:30' });
            h.text('LOG: "AN AMBITIOUS ATTEMPT AT 1:30 BUT HAPPY WITH 1:35"', 960, 900, { font: 'mono', size: 28, color: COL.ui, align: 'center', alpha: smooth(1.5, 2, u), tracking: 2, shadow: true });
          }
          fades(ctx.r.grade, i.shotT, 8, 0.01, 1);
        }
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 40 }, { t: 3, kind: 'music', id: 'phantom', dur: 34 }, { t: 17, kind: 'phantom-pass' }, { t: 36, kind: 'fail' }],
    }),
  );

  // --- quiet: after Hackney. The number chalked on a wall.
  let wall: THREE.Mesh;
  scenes.push(
    new RaceScene({
      id: 'c3-chalk',
      arena: 'hackney',
      s0: 21252.0,
      profile: steady(1, 100),
      sky: SKY.clear,
      lane: 5.25,
      build: async (race) => {
        const p = race.place(21250, 6.3);
        wall = await pbrArrayWall('1:30:00');
        wall.position.set(p.x, p.y, p.z);
        wall.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI / 2;
        race.extras.add(wall);
      },
      shots: [
        { dur: 5, T: -30, cam: { mode: 'follow', dist: 5, h: 1.3, ang: 250, look: 1.1, fov: 34 }, cam2: { dist: 4.3 }, grade: { letterbox: 1 } },
        { dur: 6, T: -25, cam: { mode: 'follow', dist: 3.2, h: 1.55, ang: 228, look: 1.55, side: -0.5, fov: 32 }, grade: { letterbox: 1 } },
      ],
      pose: () => ({ other: { Idle_Loop: [1, 2] }, fatigue: 1.1 }),
      onFrame: (race, i, ctx) => {
        race.runner.root.rotation.y = wall.rotation.y + Math.PI; // back to the wall
        fades(ctx.r.grade, i.t, 11, 0.8, 1.2);
        ctx.r.grade.saturation = 0.75;
      },
      cues: [{ t: 0, kind: 'amb-city-quiet', dur: 11 }, { t: 0, kind: 'music', id: 'quiet', dur: 11 }],
    }),
  );

  // --- NINETEEN: Lordship 01.07.2023, 19:00 exactly (the Double Zero echo)
  const lord = RunProfile.fromGpsProfile(lordshipJ as any, 1140);
  scenes.push(
    new RaceScene({
      id: 'c3-lordship',
      arena: 'lordship',
      profile: lord,
      sky: SKY.hot,
      halfWidth: 2,
      field: { count: 110, pack: 4, seed: 33 },
      build: (race) => {
        funnel(race, race.course.length, 20);
      },
      shots: [{ dur: 11, T: 1130, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 172 }, cam2: { dist: 8 } }],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        eventTag(h, { name: 'LORDSHIP REC PARKRUN', date: '01.07.2023', t: i.t });
        targetBlock(h, { target: 1139, label: 'NEXT TARGET: SUB 19', projection: i.finished ? undefined : lord.projection(i.T), result: i.finished ? 1140 : undefined });
        raceClock(h, { T: Math.min(i.T, 1140), d: Math.min(i.d, lord.distance) });
        if (i.finished) {
          const u = i.T - 1140;
          stamp(h, '19:00', { alpha: smooth(0.2, 0.7, u), size: 180, col: COL.red });
          h.text('EXACTLY. AGAIN.', 960, 700, { font: 'head', size: 60, weight: 700, color: COL.white, align: 'center', alpha: smooth(1.2, 1.8, u), tracking: 14, shadow: true });
        }
        fades(ctx.r.grade, i.t, 11, 0.5, 1);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 11 }, { t: 5, kind: 'fail-big' }],
    }),
  );

  // --- THE STAG: Golden Stag Mile 14.07.2023, 5:12, 1st in heat (no GPS worth drawing)
  scenes.push(
    new Card({
      id: 'c3-stag',
      dur: 6.5,
      draw: (t, h) => {
        const a = env(t, 0, 6.5, 0.5, 0.7);
        grid(h, a * 0.5);
        h.text('14.07.2023  -  GOLDEN STAG MILE', 960, 380, { font: 'mono', size: 30, color: COL.uiDim, align: 'center', alpha: a, tracking: 6 });
        h.text('THE STAG', 960, 480, { font: 'head', size: 72, weight: 700, color: COL.amber, align: 'center', alpha: a, tracking: 20, glow: 14 });
        h.text('5:12', 960, 650, { font: 'mono', size: 170, color: COL.white, align: 'center', alpha: a * smooth(1, 1.6, t), glow: 18 });
        h.text('1ST IN HEAT', 960, 740, { font: 'mono', size: 40, color: COL.green, align: 'center', alpha: a * smooth(2, 2.6, t), tracking: 10 });
      },
      cues: [{ t: 1, kind: 'number-hit' }, { t: 2, kind: 'win-small' }],
    }),
  );

  // --- SUB 19: Finsbury 5000s, 21.07.2023, 18:55 on the athletics track (12.5 laps)
  const t5 = RunProfile.fromGpsProfile(t5000J as any, 1135);
  scenes.push(
    new RaceScene({
      id: 'c3-5000s',
      arena: 'finsbury',
      path: (race) => {
        const [x, z] = llToLocal(race.arena.data.j.origin, t5000J.track.center[0], t5000J.track.center[1]);
        return trackPath(race.arena.data.j.areas, x, z, 12.5, 1.1);
      },
      profile: t5,
      sky: SKY.dusk,
      halfWidth: 1.4,
      lane: -0.1,
      field: { count: 22, pack: 3, packSpread: 8, kmin: 0.88, kmax: 1.08, seed: 34 },
      spectators: [{ s0: 30, s1: 110, density: 0.35, sides: [-1], off: 6 }],
      shots: [
        { dur: 5, T: -3, cam: { mode: 'follow', dist: 25, h: 10, ang: 130, look: 1 }, cam2: { dist: 20 }, grade: { letterbox: 1 } },
        { dur: 5, T: 300, cam: { mode: 'follow', dist: 3.5, h: 1.0, ang: 90 } },
        { dur: 6, T: 820, cam: { mode: 'follow', dist: 4, h: 1.5, ang: 160, look: 1.4 }, tag: 'brutal' },
        { dur: 12, T: 1125, rate: 0.45, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 172 }, cam2: { dist: 8 }, tag: 'finish' },
      ],
      pose: (i) => ({ fatigue: clamp01((i.d - 3000) / 2000) * 0.6 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const lap = Math.min(13, Math.floor(i.d / 400) + 1);
        if (i.shot === 0) {
          ctx.r.grade.fade = 1 - smooth(0, 1, i.shotT);
          eventTag(h, { name: 'FINSBURY 5000s  -  TRACK', date: '21.07.2023', t: i.shotT });
        }
        if (i.shot > 0) {
          targetBlock(h, { target: 1139, projection: i.finished ? undefined : t5.projection(i.T), result: i.finished ? 1135 : undefined });
          raceClock(h, { T: Math.min(i.T, t5.finish), d: Math.min(i.d, t5.distance), label: `LAP ${lap} / 13` });
        }
        if (i.tag === 'brutal') h.text('LOG: "LAST 2KM WERE ABSOLUTELY BRUTAL"', 960, 900, { font: 'mono', size: 30, color: COL.amber, align: 'center', alpha: env(i.shotT, 1, 6, 0.4, 0.4), tracking: 3, shadow: true });
        if (i.tag === 'finish') {
          if (i.finished) stamp(h, 'SUB 19', { alpha: smooth(0.5, 1.2, i.T - t5.finish), col: COL.green, sub: 'COMPLETE  -  18:55', size: 140 });
          fades(ctx.r.grade, i.shotT, 12, 0.01, 1);
        }
        void race;
      },
      cues: [{ t: 0, kind: 'amb-track', dur: 28 }, { t: 2, kind: 'music', id: 'build', dur: 20 }, { t: 22, kind: 'silence', dur: 2 }, { t: 23.5, kind: 'win' }],
    }),
  );

  // --- the first marathon build and FURNACE: Richmond Runfest Marathon 10.09.2023, 3:55:11
  const ric = RunProfile.fromSplits(RICHMOND.splits, RICHMOND.distanceKm, RICHMOND.timeSec);
  let furnace: Furnace;
  const furnaceSide = (race: RaceScene, s: number) => {
    // the side of the course away from the river, sampled over a stretch so it doesn't flip every frame
    const k = Math.floor(s / 150) * 150;
    return waterSide(race, k + 75, 32);
  };
  scenes.push(
    logCard('c3-longruns', [
      ['LONG RUN 26 KM', '8 weeks to Richmond'],
      ['LONG RUN 28 KM', 'I have become death, destroyer of long runs'],
    ], { title: 'MISSION LOG  -  FIRST MARATHON BUILD', hold: 1 }),
    boardCard('c3-board-richmond', { dur: 7, op: 'RICHMOND RUNFEST MARATHON', objective: 'OBJECTIVE', target: 'FINISH', size: 0.7, route: 'richmond-marathon', sub: '42.2 KM  -  FIRST MARATHON', status: 'FORECAST: HOT', statusCol: COL.red }),
    new RaceScene({
      id: 'c3-furnace',
      arena: 'richmond',
      profile: ric,
      sky: SKY.hot,
      halfWidth: 2.2,
      field: { count: 120, pack: 5, kmin: 0.8, kmax: 1.2, seed: 35 },
      build: async (race) => {
        arch(race, 0, 'RICHMOND', 8);
        furnace = (await Furnace.create()).barge();
        race.extras.add(furnace.root);
        // time the meltdown and evacuation shots to stretches where the course runs beside the river
        const k = ric.distance / race.course.length;
        const riverAt = (d0: number, d1: number) => {
          for (let d = d0; d < d1; d += 50) {
            const s = d / k;
            const wet = Math.max(...[-1, 1].map((sd) => { const p = race.place(s, sd * 34); return race.arena.data.maskAt(p.x, p.z); }));
            if (wet > 0.6) return ric.timeAt(d);
          }
          return null;
        };
        const sh = race.o.shots;
        const m = sh.findIndex((x) => x.tag === 'melt'), e = sh.findIndex((x) => x.tag === 'evac');
        sh[m].T = riverAt(27000, 32000) ?? sh[m].T;
        sh[e].T = riverAt(33500, 40000) ?? sh[e].T;
      },
      shots: [
        { dur: 6, T: 1800, cam: { mode: 'follow', dist: 5, h: 1.6, ang: 20, look: 1.3 }, tag: 'cruise' },
        // halfway: it rolls into view alongside, mouth towards the road
        { dur: 7, T: 6212, cam: { mode: 'follow', dist: 8, h: 1.8, ang: -30, look: 1.4, fov: 52 }, cam2: { dist: 6.5, ang: -38 }, tag: 'half' },
        { dur: 7, T: 8900, cam: { mode: 'follow', dist: 6, h: 1.4, ang: 165, look: 1.4, fov: 52, side: 1.2 }, tag: 'melt' },
        { dur: 6, T: 11800, cam: { mode: 'follow', dist: 36, h: 18, ang: 150, look: 4, fov: 40 }, cam2: { dist: 30, h: 14 }, tag: 'evac' },
        { dur: 9, T: 14100, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 172 }, tag: 'finish' },
      ],
      pose: (i) => ({ fatigue: clamp01((i.d - 20000) / 12000) * 1.0 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud, g = ctx.r.grade;
        const heat = clamp01((i.d - 18000) / 8000);
        // a furnace barge on the Thames pacing him: ahead at halfway, bearing down from behind in the meltdown
        const side = furnaceSide(race, i.s);
        const lead = i.tag === 'half' ? 22 : i.tag === 'cruise' ? 60 : i.tag === 'evac' ? -20 : -12;
        const fp = race.place(Math.min(i.s, race.course.length) + lead, side * 32);
        furnace.root.position.set(fp.x, race.arena.data.waterAt(fp.x, fp.z) - 2.2, fp.z);
        furnace.root.visible = race.arena.data.maskAt(fp.x, fp.z) > 0.5;
        furnace.root.rotation.y = Math.atan2(fp.dx, fp.dz);
        furnace.crucible.rotation.y = side * Math.PI / 2;
        if (furnace.root.visible && (i.tag === 'half' || i.tag === 'melt' || i.tag === 'evac')) aimAt(race.stage!.camera, new THREE.Vector3(fp.x, fp.y + 8, fp.z), i.tag === 'evac' ? 0.45 : 0.35);
        furnace.update(i.t, { heat: 0.25 + 0.75 * heat, siren: i.tag === 'evac' ? 1 : 0, banked: i.finished ? smooth(0, 4, i.T - ric.finish) : 0, travel: i.s });
        g.gain = [1.0 + 0.08 * heat, 0.96, 0.86 - 0.1 * heat];
        g.saturation = 0.85 + 0.1 * heat;
        g.bloom = 0.25 + 0.2 * heat;
        const km = Math.floor(i.d / 1000);
        if (i.tag !== 'finish') {
          eventTag(h, { name: 'RICHMOND RUNFEST MARATHON', date: '10.09.2023', t: i.t });
          raceClock(h, { T: i.T, d: i.d, hours: true, pace: RICHMOND.splits[Math.min(41, km)] });
          const hr = RICHMOND.splitHr![Math.min(RICHMOND.splitHr!.length - 1, km)];
          h.text(`HR ${hr}`, 1824, 330, { font: 'mono', size: 34, color: COL.ui, align: 'right', shadow: true });
          const ph = RICHMOND.phases.find((p) => i.d / 1000 >= p.fromKm && i.d / 1000 < p.toKm);
          bossPlate(h, { name: 'FURNACE', sub: 'THE DAY THE COURSE BURNED', frac: 1 - i.d / ric.distance, phase: ph?.name, col: COL.amber });
        }
        if (i.tag === 'half') h.text('HALFWAY  1:43:32', 960, 900, { font: 'mono', size: 44, color: COL.white, align: 'center', alpha: smooth(0.5, 1, i.shotT), tracking: 4, shadow: true });
        if (i.tag === 'melt') h.text('SPLITS 5:16 > 6:46', 960, 900, { font: 'mono', size: 44, color: COL.red, align: 'center', alpha: smooth(1, 1.5, i.shotT), tracking: 4, shadow: true });
        if (i.tag === 'evac') {
          h.text('RACE BEING STOPPED BEHIND YOU', 960, 800, { font: 'head', size: 50, weight: 700, color: COL.red, align: 'center', alpha: Math.floor(i.shotT * 2) % 2 ? 0.5 : 1, tracking: 8, shadow: true });
          h.text('TOO MANY CASUALTIES', 960, 858, { font: 'mono', size: 30, color: COL.amber, align: 'center', tracking: 6, shadow: true });
        }
        if (i.tag === 'finish') {
          raceClock(h, { T: Math.min(i.T, ric.finish), hours: true, alpha: 1 - smooth(6, 7, i.shotT) });
          if (i.finished) {
            const u = i.T - ric.finish;
            stamp(h, 'SURVIVED', { alpha: smooth(0.2, 0.8, u), size: 120, col: COL.amber, sub: '3:55:11  -  FIRST MARATHON' });
            h.text('RELATIVE EFFORT 739  -  CAREER HIGH', 960, 780, { font: 'mono', size: 30, color: COL.red, align: 'center', alpha: smooth(1.2, 1.7, u), tracking: 4, shadow: true });
            h.text('LOG: "MANAGED TO PASS THROUGH THE END WHEN THEY STARTED TO CANCEL THE RACE DUE TO TOO MANY CASUALTIES"', 960, 900, { font: 'mono', size: 22, color: COL.ui, align: 'center', alpha: smooth(2.2, 2.8, u), tracking: 1, shadow: true });
          }
          fades(g, i.shotT, 9, 0.01, 1.2);
        }
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 33, level: 0.35 }, { t: 0, kind: 'music', id: 'furnace', dur: 24 }, { t: 18, kind: 'siren', dur: 6 }, { t: 25, kind: 'win-grim' }],
    }),
  );

  // --- THE CLAW: Highgate hill repeats 26.11.2023
  const claw = RunProfile.fromSplits(CLAW.splits, CLAW.distanceKm, CLAW.timeSec);
  const fingers = CLAW.phases.filter((p) => p.note && p.name !== 'APPROACH');
  scenes.push(
    new RaceScene({
      id: 'c3-claw',
      arena: 'highgate',
      profile: claw,
      sky: SKY.winter,
      halfWidth: 1.8,
      shots: fingers.map((f, k) => ({
        dur: 4.2,
        T: claw.timeAt(((f.fromKm + f.toKm) / 2) * 1000),
        cam: k % 2 ? { mode: 'follow' as const, dist: 3.5, h: 0.6, ang: k === 3 ? -105 : 105, look: 1.2, fov: 44 } : { mode: 'follow' as const, dist: 4.5, h: 2.4, ang: 20, look: 0.8, ahead: 6 },
        tag: f.name,
      })).concat([{ dur: 7, T: claw.finish - 5, cam: { mode: 'follow', dist: 7, h: 2, ang: 160, look: 1.2 }, tag: 'done' } as any]),
      pose: (i) => ({ lean: i.tag && i.tag !== 'done' ? 0.12 : 0, fatigue: i.tag === 'done' ? 0.6 : 0.3 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        eventTag(h, { name: 'THE CLAW  -  HIGHGATE', date: '26.11.2023', t: i.t });
        // five fingers: each climb lights as it is conquered
        fingers.forEach((f, k) => {
          const done = i.d / 1000 >= f.toKm;
          const on = i.d / 1000 >= f.fromKm && !done;
          const x = 560 + k * 170;
          h.rect(x, 960 - 90, 120, 90, on ? COL.amber : done ? COL.green : COL.uiFaint, on ? 0.9 : 0.6);
          h.text(String(k + 1), x + 60, 945, { font: 'head', size: 50, weight: 700, color: COL.black, align: 'center' });
          h.text(f.name.split(' ')[0], x + 60, 1000, { font: 'mono', size: 16, color: COL.ui, align: 'center', tracking: 1 });
        });
        if (i.tag && i.tag !== 'done') {
          const f = fingers.find((ff) => ff.name === i.tag)!;
          h.text(f.name, 960, 150, { font: 'head', size: 56, weight: 700, color: COL.amber, align: 'center', tracking: 8, shadow: true });
          h.text(f.note, 960, 200, { font: 'mono', size: 28, color: COL.white, align: 'center', tracking: 4, shadow: true });
        }
        if (i.tag === 'done') {
          stamp(h, 'CLAW RETRACTED', { alpha: smooth(1.5, 2.2, i.shotT), size: 90, col: COL.green, sub: '22.3 KM  +445 M' });
          h.text('LOG: "GETTING IT DONE"', 960, 700, { font: 'mono', size: 30, color: COL.ui, align: 'center', alpha: smooth(2.6, 3.2, i.shotT), tracking: 4, shadow: true });
          fades(ctx.r.grade, i.shotT, 7, 0.01, 1);
        }
        if (i.shot === 0) ctx.r.grade.fade = 1 - smooth(0, 0.8, i.shotT);
        void race;
      },
      cues: [{ t: 0, kind: 'music', id: 'claw', dur: 28 }, ...fingers.map((_, k) => ({ t: k * 4.2 + 0.2, kind: 'number-hit' }))],
    }),
  );

  // --- the December Finsbury grind: 19:21, 19:20, 19:18
  const f1918 = RunProfile.fromRuns('finsbury-1918');
  scenes.push(
    new RaceScene({
      id: 'c3-grind',
      arena: 'finsbury',
      profile: f1918,
      sky: SKY.winter,
      halfWidth: 2.2,
      field: { count: 150, pack: 3, packSpread: 6, seed: 36 },
      build: (race) => {
        funnel(race, race.course.length, 30);
        flag(race, 0, -3.2, '#5c2a86', 'START');
      },
      shots: [
        { dur: 5, T: 300, cam: { mode: 'follow', dist: 4.5, h: 1.5, ang: 25 }, tag: '19:21|1 second off matching Finsbury PB' },
        { dur: 6, T: 40, cam: { mode: 'follow', dist: 3.4, h: 1.1, ang: 60, look: 0.9 }, tag: "19:20|without the puddle on first corner would've been 19:18" },
        { dur: 8, T: 1150, rate: 0.6, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 172 }, tag: '19:18|thanks to Joel for pacing' },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const [num, quote] = i.tag!.split('|');
        const a = env(i.shotT, 0.3, race.o.shots[i.shot].dur, 0.3, 0.4);
        h.text('FINSBURY PARK  -  DECEMBER 2023', 960, 760, { font: 'mono', size: 24, color: COL.uiDim, align: 'center', alpha: a, tracking: 8, shadow: true });
        h.text(num, 960, 880, { font: 'mono', size: 120, color: i.shot === 2 ? COL.green : COL.white, align: 'center', alpha: a, glow: 12, shadow: true });
        h.text(`"${quote}"`, 960, 950, { font: 'mono', size: 26, color: COL.ui, align: 'center', alpha: a * smooth(0.8, 1.3, i.shotT), tracking: 1, shadow: true });
        if (i.shot === 2) fades(ctx.r.grade, i.shotT, 8, 0.01, 0.8);
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 19 }, { t: 0.3, kind: 'number-hit' }, { t: 5.3, kind: 'number-hit' }, { t: 11.3, kind: 'number-hit' }],
    }),
  );

  // --- end of 2023: the log and the open line
  scenes.push(
    logCard('c3-log-2023', [['31.12.2023', 'Some big goals achieved this year: Sub 20 & Sub 19 5k, Sub 40 10k, First Marathon. Bring on 2024!']], { hold: 1.5 }),
    missionList('c3-missions', [
      { name: 'SUB 20  5K', status: 'COMPLETE', note: '19:25' },
      { name: 'SUB 19  5K', status: 'COMPLETE', note: '18:55' },
      { name: 'SUB 40  10K', status: 'COMPLETE', note: '39:35' },
      { name: 'FIRST MARATHON', status: 'COMPLETE', note: '3:55:11' },
      { name: 'SUB 1:30  HALF', status: 'OPEN', note: 'BEST 1:35:30' },
    ], 9),
  );
  return scenes;
}
