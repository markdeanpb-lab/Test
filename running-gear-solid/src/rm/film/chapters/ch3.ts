// CHAPTER 3 - AMBITION (Apr - Dec 2023)
// Sub 40, the first meeting with the Phantom 1:30, sub 19, the first marathon, the Claw.
import * as THREE from 'three';
import { RaceScene, Info } from '../RaceScene';
import { RunProfile } from '../profile';
import { RICHMOND, CLAW } from '../../../data/activities';
import batterseaJ from '../../../data/gps/battersea-10k.json';
import lordshipJ from '../../../data/gps/lordship-parkrun.json';
import t5000J from '../../../data/gps/finsbury-5000s.json';
import { SKY, chapterCard, logCard, boardCard, fades, trackPath, missionList, llToLocal, steady } from '../common';
import { CodecScene } from '../Codec';
import { Card, grid } from '../Cards';
import { COL, env, smooth, clamp01, Hud } from '../../hud/Hud';
import { raceClock, targetBlock, stamp, eventTag, splitPop } from '../../hud/widgets';
import { funnel, flag } from '../dressing';
import { pbrArrayWall } from './walls';
import { Scene } from '../core';
import { Gate } from '../bosses/Gate';
import { Sentinel } from '../bosses/Sentinel';
import { clawBoss } from './claw';
import { phantomLevel } from './phantom';
import { furnaceLevel } from './furnace';
import { lifeHud, bossHp, prompt, banner } from '../../hud/game';
import { aimAt, mmss } from '../bosses/place';

const HALF = 21097.5;

function kmSplits(h: Hud, race: RaceScene, i: Info, fast = 240) {
  const p = race.o.profile;
  const km = Math.floor(i.d / 1000);
  if (km < 1 || i.finished) return;
  const since = i.T - p.timeAt(km * 1000);
  const split = p.timeAt(km * 1000) - p.timeAt((km - 1) * 1000);
  splitPop(h, { km, split, since, col: split < fast ? COL.green : COL.white });
}

export function ch3(): Scene[] {
  const scenes: Scene[] = [chapterCard('c3-card', 'CHAPTER 3', 'AMBITION', 'APRIL  -  DECEMBER 2023')];

  // --- FORTY (mini): Battersea 10K, 15.04.2023, 39:35
  const bat = RunProfile.fromGpsProfile(batterseaJ as any, 2375);
  let gate40: Gate;
  scenes.push(
    new RaceScene({
      id: 'c3-forty',
      chapter: 'AMBITION',
      arena: 'battersea',
      profile: bat,
      // the boss level: a castle gatehouse at dusk
      sky: { ...SKY.dusk, fog: 0.004, fogColor: 0x5a4a58 },
      halfWidth: 3,
      field: { count: 160, pack: 6, kmin: 0.8, kmax: 1.1, seed: 31 },
      build: async (race) => {
        gate40 = await Gate.create(2 * 3 + 0.6);
        const f = race.place(race.course.length, 0);
        gate40.root.position.set(f.x, f.y, f.z);
        gate40.root.rotation.y = Math.atan2(f.dx, f.dz);
        race.extras.add(gate40.root);
      },
      shots: [
        { dur: 6, T: 300, cam: { mode: 'follow', dist: 30, h: 14, ang: 150, look: 1 }, cam2: { dist: 24 } },
        { dur: 5, T: 1300, cam: { mode: 'follow', dist: 4.5, h: 1.5, ang: 15, look: 1.3, ahead: 10 } },
        // the gate: from ahead, the clock counting and the grille coming down; he goes under at 39:35
        { dur: 7, T: 2352, rate: 0.9, cam: { mode: 'follow', dist: 7, h: 2.0, ang: 8, look: 3.5, ahead: 40, fov: 30 }, cam2: { dist: 6, fov: 34 }, tag: 'gate' },
        { dur: 12, T: 2373, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.7, ang: 12, look: 2.2, ahead: 4, fov: 46 }, cam2: { dist: 5 }, tag: 'under' },
      ],
      pose: (i) => {
        const o: Record<string, [number, number]> = {};
        if (!i.finished && i.T > bat.finish - 0.9) o.Slide_Loop = [1, 0.3];
        else if (i.finished && i.T < bat.finish + 0.5) o.Slide_Exit = [1, i.T - bat.finish];
        return Object.keys(o).length ? { other: o, locoWeight: 0 } : {};
      },
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const fin = bat.finish;
        // the grille drops towards 40:00; he slides under it at 39:35
        const drop = i.T < fin ? 0.82 * smooth(fin - 26, fin, i.T) : 0.82 + 0.18 * smooth(fin + 0.8, fin + 2.2, i.T);
        gate40.update(i.t, { drop, text: mmss(i.T), slam: smooth(fin + 2.1, fin + 3.2, i.T) });
        if (i.shot === 0) {
          ctx.r.grade.fade = 1 - smooth(0, 1, i.shotT);
          eventTag(h, { name: 'BATTERSEA PARK 10K', date: '15.04.2023', t: i.shotT });
          h.text('BEFORE: 41:37  LONDON WINTER RUN, FEB 2023', 96, 150, { font: 'mono', size: 22, color: COL.uiDim, alpha: env(i.shotT, 1.5, 6, 0.3, 0.4), tracking: 3, shadow: true });
        }
        bossHp(h, { name: 'FORTY', hp: 1 - i.d / bat.distance, sub: 'THE GATE CLOSES AT 40:00', alpha: i.finished ? 1 - smooth(0, 1, i.T - bat.finish) : i.shot >= 1 ? 1 : 0 });
        targetBlock(h, { target: 2399, projection: i.finished ? undefined : bat.projection(i.T), result: i.finished ? 2375 : undefined });
        raceClock(h, { T: Math.min(i.T, bat.finish), d: Math.min(i.d, bat.distance) });
        if (!i.finished && i.T > fin - 3) prompt(h, { b: 'O', text: 'SLIDE', t: i.T - fin + 3, y: 800, ok: i.T > fin - 0.6 });
        if (i.shot >= 1 && !i.finished) {
          h.time = i.t;
          lifeHud(h, { life: 1, stamina: 1 - clamp01(i.d / bat.distance) * 0.85 });
        }
        if (i.tag === 'under' && i.finished) banner(h, 'SUB 40', i.T - bat.finish - 2.4, { col: COL.green, sub: 'COMPLETE  -  39:35', dur: 5 });
        if (i.tag === 'under') fades(ctx.r.grade, i.shotT, 12, 0.01, 1);
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 30, level: 0.4 }, { t: 0, kind: 'music', id: 'boss-mini', dur: 22 }, { t: 11, kind: 'alert' }, { t: 26.2, kind: 'wall-rise' }, { t: 27, kind: 'win' }],
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

  // --- PHANTOM 1:30, encounter 01: Hackney Half 21.05.2023, 1:35:30 (its own level: the ghost town)
  scenes.push(phantomLevel(1));

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
  let sent19: Sentinel;
  scenes.push(
    new RaceScene({
      id: 'c3-lordship',
      arena: 'lordship',
      profile: lord,
      sky: SKY.hot,
      halfWidth: 2,
      field: { count: 110, pack: 4, seed: 33 },
      build: async (race) => {
        funnel(race, race.course.length, 20);
        // the clock sentinel is back, a new number on its face: the Double Zero echo
        sent19 = await Sentinel.create();
        const f = race.place(race.course.length + 40, 10);
        sent19.root.position.set(f.x, race.arena.heightAt(f.x, f.z), f.z);
        sent19.root.rotation.y = Math.atan2(-f.dx - f.dz * 0.5, -f.dz + f.dx * 0.5);
        sent19.root.scale.setScalar(0.8);
        race.extras.add(sent19.root);
      },
      shots: [
        // it reads his memory card; the screen goes to VIDEO 1; he switches controller port
        { dur: 7.5, T: 330, cam: { mode: 'follow', dist: 5.5, h: 1.6, ang: 12, look: 3, ahead: 10, fov: 46 }, tag: 'read' },
        { dur: 2.4, T: 560, cam: { mode: 'follow', dist: 4, h: 1.4, ang: 150 }, tag: 'video' },
        { dur: 3.6, T: 700, cam: { mode: 'follow', dist: 3.4, h: 1.0, ang: 95 }, tag: 'port' },
        { dur: 7, T: 1118, rate: 0.8, cam: { mode: 'follow', dist: 6, h: 1.3, ang: 10, look: 2.5, ahead: 8, fov: 50 }, cam2: { dist: 5 } },
        { dur: 11, T: 1137, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 172 }, cam2: { dist: 8 } },
      ],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        sent19.update(i.t, { wind: 0.2, text: mmss(Math.min(i.T, 1140)), look: i.pos, flicker: 0 });
        if (i.tag === 'read' || i.shot === 3) aimAt(race.stage!.camera, sent19.root.position.clone().add(new THREE.Vector3(0, 18, 0)), 0.35);
        eventTag(h, { name: 'LORDSHIP REC PARKRUN', date: '01.07.2023', t: i.t });
        bossHp(h, { name: 'NINETEEN', hp: i.finished ? 1 : 1 - clamp01(i.d / lord.distance) * 0.9, sub: i.tag === 'read' ? 'IT IS READING YOUR MEMORY CARD' : 'MIND GAMES', alpha: env(i.t, 0.5, 29.5, 0.5, 0.5) * (i.tag === 'video' ? 0 : 1) });
        if (i.tag === 'read') {
          // Psycho Mantis, more or less: everything it says is on the card
          const lines = ['I SEE... A MEMORY CARD.', '20:00. EXACTLY. THEN 20:07.', '21:48. YOU WENT OFF TOO FAST.', 'YOU ALWAYS DO.'];
          lines.forEach((ln, k) => {
            const t0 = 0.6 + k * 1.6;
            h.text(h.type(ln, i.shotT, t0, 26), 960, 380 + k * 70, { font: 'mono', size: 46, color: COL.red, align: 'center', alpha: env(i.shotT, t0, 7.3, 0.1, 0.3), tracking: 4, glow: 10, shadow: true });
          });
        }
        if (i.tag === 'video') {
          // the fake input switch
          h.rect(0, 0, 1920, 1080, '#000', 1);
          h.text('VIDEO 1', 120, 130, { font: 'mono', size: 64, color: '#3eff5a', alpha: Math.floor(i.shotT * 3) % 3 ? 1 : 0.7, tracking: 6 });
        }
        if (i.tag === 'port') {
          prompt(h, { b: 'S', text: 'SWITCH TO CONTROLLER PORT 2', t: i.shotT, ok: i.shotT > 1.4, y: 780 });
          if (i.shotT > 1.6) h.text("IT CAN'T READ YOU NOW", 960, 420, { font: 'head', size: 64, weight: 700, color: COL.green, align: 'center', alpha: smooth(1.6, 2, i.shotT), tracking: 12, shadow: true });
        }
        if (i.tag !== 'video' && i.tag !== 'read') targetBlock(h, { target: 1139, label: 'NEXT TARGET: SUB 19', projection: i.finished ? undefined : lord.projection(i.T), result: i.finished ? 1140 : undefined });
        if (i.tag !== 'video') raceClock(h, { T: Math.min(i.T, 1140), d: Math.min(i.d, lord.distance) });
        if (i.finished) {
          const u = i.T - 1140;
          stamp(h, '19:00', { alpha: smooth(0.2, 0.7, u), size: 180, col: COL.red });
          h.text('EXACTLY. AGAIN.', 960, 700, { font: 'head', size: 60, weight: 700, color: COL.white, align: 'center', alpha: smooth(1.2, 1.8, u), tracking: 14, shadow: true });
        }
        fades(ctx.r.grade, i.t, 30.5, 0.5, 1);
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 7.5 }, { t: 0.4, kind: 'boss-intro' }, { t: 0.5, kind: 'music', id: 'haunt', dur: 7 }, { t: 7.5, kind: 'silence', dur: 2.4 }, { t: 7.5, kind: 'cctv', dur: 2.4 }, { t: 9.9, kind: 'amb-park', dur: 20.6 }, { t: 11.3, kind: 'select' }, { t: 11.5, kind: 'win-small' }, { t: 26.5, kind: 'fail-big' }],
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
  scenes.push(
    logCard('c3-longruns', [
      ['LONG RUN 26 KM', '8 weeks to Richmond'],
      ['LONG RUN 28 KM', 'I have become death, destroyer of long runs'],
    ], { title: 'MISSION LOG  -  FIRST MARATHON BUILD', hold: 1 }),
    boardCard('c3-board-richmond', { dur: 7, op: 'RICHMOND RUNFEST MARATHON', objective: 'OBJECTIVE', target: 'FINISH', size: 0.7, route: 'richmond-marathon', sub: '42.2 KM  -  FIRST MARATHON', status: 'FORECAST: HOT', statusCol: COL.red }),
    furnaceLevel(),
  );

  // --- THE CLAW: Highgate hills 26.11.2023 (boss level)
  scenes.push(clawBoss());

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
