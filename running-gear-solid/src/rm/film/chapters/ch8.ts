// CHAPTER 8 - THE WALL. Manchester Marathon, 19.04.2026. Real km splits and HR.
// Stage 1 THE MACHINE (0-21) - Stage 2 FRICTION (21-27) - Stage 3 THE WALL (27-35) -
// Stage 4 SURVIVAL (35-42.4). Then: I AM STILL STANDING.
import * as THREE from 'three';
import { RaceScene, Info, Shot } from '../RaceScene';
import { wallBoss } from './wall';
import { MANCHESTER } from '../../../data/activities';
import { SKY, fades } from '../common';
import { COL, env, smooth, clamp01, fmt, pace, Hud } from '../../hud/Hud';
import { raceClock, stamp, eventTag, splitPop, targetBlock } from '../../hud/widgets';
import { arch } from '../dressing';
import { lifeHud, equip, bossHp } from '../../hud/game';
import { BrickWall, wallCells } from '../fx';
import { pbr } from '../../engine/assets';
import { manchesterProfile } from './prologue';
import { Scene, Ctx, Cue } from '../core';
import { Card, grid } from '../Cards';

const MARATHON = 42195;
const TARGET = 10800;

export function ch8(): Scene[] {
  const prof = manchesterProfile();
  /** projection over the official distance from the watch's elapsed time (as the watch shows it) */
  const proj = (T: number) => {
    const d = prof.distAt(T);
    return d > 200 ? (T / d) * MARATHON : NaN;
  };
  // when the projection first crosses 3:00:00
  let Tx = 0;
  for (let T = 5000; T < 9000; T += 1) if (proj(T) >= TARGET) {
    Tx = T;
    break;
  }
  const dX = prof.distAt(Tx);
  const stage = (km: number) => (km < 21.1 ? 0 : km < 27 ? 1 : km < 35 ? 2 : 3);
  const STAGE = ['THE MACHINE', 'FRICTION', 'THE WALL', 'SURVIVAL'];

  let wall: BrickWall, ghostWall: BrickWall, endWall: BrickWall;
  let wallPos = new THREE.Vector3();
  const split = (km: number) => MANCHESTER.splits[Math.min(MANCHESTER.splits.length - 1, Math.max(0, km))];
  const hr = (km: number) => MANCHESTER.splitHr![Math.min(MANCHESTER.splitHr!.length - 1, Math.max(0, km))];

  const hud = (race: RaceScene, i: Info, ctx: Ctx) => {
    const h = ctx.hud;
    const km = i.d / 1000;
    const st = stage(km);
    const p = proj(i.T);
    const lost = i.T >= Tx;
    if (i.finished) return;
    // survival: the target is gone; only the distance remaining
    if (st === 3) {
      h.text('DISTANCE REMAINING', 960, 120, { font: 'mono', size: 24, color: COL.uiDim, align: 'center', tracking: 8, shadow: true });
      h.text(`${((prof.distance - i.d) / 1000).toFixed(2)} KM`, 960, 200, { font: 'mono', size: 80, color: COL.white, align: 'center', glow: 10, shadow: true });
      raceClock(h, { T: i.T, hours: true, alpha: 0.5 });
      return;
    }
    raceClock(h, { T: i.T, d: i.d, hours: true, pace: split(Math.floor(km)) });
    h.text(`HR ${hr(Math.floor(km))}`, 1824, 330, { font: 'mono', size: 34, color: COL.ui, align: 'right', shadow: true });
    // game HUD: LIFE, the Achilles as a status ailment from the gun, the pace locked in
    lifeHud(h, { life: 0.9 - 0.1 * clamp01((km - 21) / 6), stamina: 1 - 0.5 * clamp01((km - 10) / 20) });
    h.text('STATUS', 96, 250, { font: 'mono', size: 26, color: COL.uiDim, tracking: 4 });
    h.text('ACHILLES', 250, 250, { font: 'mono', size: 30, color: COL.amber, alpha: 0.7 + 0.3 * Math.sin(i.t * 4), tracking: 4 });
    equip(h, { item: 'GELS', weapon: '3:00 PACE', weaponSub: 'LOCKED' });
    if (!lost) targetBlock(h, { target: TARGET - 1, projection: p, hours: true, y: 360 });
    else {
      // the target greys out
      const u = i.T - Tx;
      targetBlock(h, { target: TARGET - 1, projection: p, hours: true, alpha: 1 - smooth(20, 40, u), y: 360 });
      h.text('SUB 3:00:00  -  LOST', 116, 470, { font: 'mono', size: 32, color: COL.red, alpha: smooth(0, 1, u) * (Math.floor(i.t * 2) % 2 ? 0.6 : 1), tracking: 3, shadow: true });
    }
    bossHp(h, { name: 'THE WALL', hp: 1, sub: `STAGE ${st + 1}  -  ${STAGE[st]}  -  ${st === 0 ? 'NOT YET VISIBLE' : 'SOMEWHERE AHEAD'}`, col: st >= 1 ? COL.amber : COL.uiDim, alpha: 0.85 });
    // km split pop
    const k = Math.floor(km);
    if (k >= 1) splitPop(h, { km: k, split: split(k - 1), since: i.T - prof.timeAt(k * 1000), col: split(k - 1) > 256 ? COL.red : COL.white });
  };

  const mk = (id: string, shots: Shot[], cues: Cue[]) => new RaceScene({
    id,
    chapter: 'THE WALL',
    arena: 'manchester',
    profile: prof,
    sky: SKY.morning,
    halfWidth: 5.5,
    lane: 0.6,
    field: { count: 300, pack: 10, packSpread: 18, kmin: 0.8, kmax: 1.3, seed: 81 },
    spectators: [
      { s0: -40, s1: 30, density: 0.7 },
      { s0: 20900, s1: 21300, density: 0.6 },
      { s0: 27600, s1: 28100, density: 0.35 },
      { s0: 41900, s1: 42500, density: 0.9 },
    ],
    build: async (race) => {
      arch(race, 0, 'START', 13);
      arch(race, race.course.length, 'FINISH', 13);
      const tex = await pbr('concrete_wall_003');
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, normalMap: tex.normalMap });
      // THE WALL rises across the road ~60 m ahead of where the projection crosses
      const s = (dX + 70) * (race.course.length / prof.distance);
      const p = race.place(s, 0);
      wall = new BrickWall(mat, wallCells(12, 5.6));
      wall.mesh.scale.setScalar(2.6);
      wall.mesh.position.set(p.x, p.y, p.z);
      wall.mesh.rotation.y = Math.atan2(p.dx, p.dz);
      wallPos = new THREE.Vector3(p.x, p.y, p.z);
      // a heat-haze ghost of it, far down the road during FRICTION
      const gm = new THREE.MeshStandardMaterial({ color: 0xc0b0a0, transparent: true, opacity: 0.12, depthWrite: false });
      ghostWall = new BrickWall(gm, wallCells(12, 5.6));
      ghostWall.mesh.scale.setScalar(2.6);
      const gp = race.place((25000 + 900) * (race.course.length / prof.distance), 0);
      ghostWall.mesh.position.set(gp.x, gp.y, gp.z);
      ghostWall.mesh.rotation.y = Math.atan2(gp.dx, gp.dz);
      // and one standing behind the finish (still standing, like the runner)
      endWall = new BrickWall(mat, wallCells(12, 5.6));
      endWall.mesh.scale.setScalar(2.6);
      const ep = race.place(race.course.length - 70, 0);
      endWall.mesh.position.set(ep.x, ep.y, ep.z);
      endWall.mesh.rotation.y = Math.atan2(ep.dx, ep.dz);
      race.extras.add(wall.mesh, ghostWall.mesh, endWall.mesh);
      // shots keyed to the crossing
      const sh = race.o.shots;
      for (const x of sh) if (x.tag === 'cross') x.T = Tx - 3;
    },
    shots,
    after: 'stop',
    pose: (i) => {
      const km = i.d / 1000;
      if (i.tag === 'standing') {
        // doubled over, then slowly upright
        const u = smooth(6, 15, i.shotT);
        return { other: { Idle_Loop: [1, i.T * 0.3] }, fatigue: 2.2 * (1 - u) + 0.3, locoWeight: 0 };
      }
      return { fatigue: km < 21 ? 0.05 : km < 27 ? 0.3 : km < 35 ? 1.0 : 1.3, lean: km > 27 ? 0.05 : 0 };
    },
    onFrame: (race, i, ctx) => {
      const h = ctx.hud, g = ctx.r.grade;
      const km = i.d / 1000;
      const st = stage(km);
      // wall timeline
      const since = i.T - Tx;
      wall.set(since > 0 ? since * 2.4 : -1, since > 0 ? 0.02 : 0);
      // it never stops coming: once risen it looms a fixed distance down the road
      const wp = race.place(i.s + Math.max(40, (dX + 70) * (race.course.length / prof.distance) - i.s), 0);
      wall.mesh.position.set(wp.x, wp.y, wp.z);
      wall.mesh.rotation.y = Math.atan2(wp.dx, wp.dz);
      ghostWall.mesh.visible = st === 1;
      endWall.set(i.finished ? 100 : -1);
      endWall.mesh.visible = i.finished;
      wall.mesh.visible = i.T > Tx - 1 && km < 36;
      // grade: warm and clean for the machine, drained for the wall, grey for survival
      if (st >= 2) {
        g.saturation = 0.55;
        g.contrast = 1.14;
        g.vignette = 0.55;
        g.ca = 0.0016;
      }
      if (st === 3) g.saturation = 0.35;
      if (i.tag === 'start') eventTag(h, { name: 'MANCHESTER MARATHON', date: '19.04.2026', t: i.shotT });
      if (i.tag !== 'standing' && i.tag !== 'line') hud(race, i, ctx);
      if (i.tag === 'half') h.text('HALFWAY  1:29:39', 960, 900, { font: 'mono', size: 48, color: COL.green, align: 'center', alpha: smooth(1.5, 2.2, i.shotT), tracking: 4, glow: 8, shadow: true });
      if (i.tag === 'friction' && i.shot === 6) h.text('SPLITS 4:12 > 4:42', 960, 330, { font: 'mono', size: 40, color: COL.amber, align: 'center', alpha: smooth(1, 1.5, i.shotT), tracking: 4, shadow: true });
      if (i.tag === 'cross') {
        g.flash = Math.max(0, 0.35 - Math.abs(since) * 0.4) * (since > 0 ? 1 : 0);
        if (since > 0) h.text('THE WALL', 960, 250, { font: 'head', size: 110, weight: 700, color: COL.red, align: 'center', alpha: smooth(0.5, 1.5, since) * (1 - smooth(7, 9, since)), tracking: 30, glow: 20, glitch: 0.5 * (1 - smooth(0, 3, since)), shadow: true });
      }
      if (i.tag === 'grind') h.text(i.shot === 8 ? 'SPLITS 4:57  5:34  5:12  5:31' : 'KM 30 - 34', 960, 900, { font: 'mono', size: 40, color: COL.red, align: 'center', alpha: smooth(1, 1.5, i.shotT), tracking: 4, shadow: true });
      if (i.tag === 'survive' && i.shot === 10) h.text('CAN YOU FINISH?', 960, 900, { font: 'head', size: 56, weight: 700, color: COL.white, align: 'center', alpha: env(i.shotT, 1.5, 7, 0.6, 0.6), tracking: 14, shadow: true });
      if (i.tag === 'line') {
        g.saturation = 0.35;
        if (i.finished) h.text('3:20:03', 960, 880, { font: 'mono', size: 90, color: COL.white, align: 'center', alpha: smooth(0.3, 1.2, i.T - prof.finish), glow: 10, shadow: true });
      }
      if (i.tag === 'standing') {
        g.saturation = 0.4 + 0.3 * smooth(8, 18, i.shotT);
        g.letterbox = 1;
        h.text('I AM STILL STANDING', 960, 900, { font: 'head', size: 70, weight: 700, color: COL.white, align: 'center', alpha: env(i.shotT, 10, 22, 2, 1.5), tracking: 22, glow: 12, shadow: true });
        fades(g, i.shotT, 22, 0.01, 1.5);
      }
      void wallPos;
    },
    cues,
  });

  const pen = mk('c8-wall', [
      { dur: 6, T: -8, cam: { mode: 'follow', dist: 14, h: 5, ang: 165, look: 1.2 }, cam2: { dist: 10 }, grade: { letterbox: 1 }, tag: 'start' },
      { dur: 5, T: 700, cam: { mode: 'follow', dist: 4.5, h: 1.6, ang: 18, look: 1.3 } },
      { dur: 5, T: 2500, cam: { mode: 'follow', dist: 3.3, h: 0.9, ang: 92 } },
      { dur: 6, T: 3900, cam: { mode: 'follow', dist: 40, h: 22, ang: 150, look: 0, fov: 36 }, cam2: { dist: 32 } },
      { dur: 8, T: 5372, rate: 0.7, cam: { mode: 'follow', dist: 5.5, h: 1.6, ang: 168, look: 1.4 }, tag: 'half' },
      { dur: 6, T: 6000, cam: { mode: 'follow', dist: 5, h: 1.7, ang: 12, look: 1.6, ahead: 60, fov: 32 }, tag: 'friction' },
      { dur: 7, T: 6600, cam: { mode: 'follow', dist: 3.4, h: 1.4, ang: 150, look: 1.5 }, tag: 'friction' },
  ], [
    { t: 0, kind: 'amb-crowd', dur: 43, level: 0.7 },
    { t: 0, kind: 'music', id: 'machine', dur: 30 },
    { t: 30, kind: 'music', id: 'friction', dur: 13 },
  ]);
  const standing = mk('c8-standing', [
      { dur: 22, T: 12010, rate: 1, cam: { mode: 'follow', dist: 5, h: 1.3, ang: 165, look: 1.1, fov: 30, shake: 0.2 }, cam2: { dist: 8.5, h: 1.8 }, tag: 'standing' },
  ], [
    { t: 0, kind: 'silence', dur: 22 },
    { t: 3, kind: 'breath', dur: 18 },
  ]);

  const result = new Card({
    id: 'c8-result',
    dur: 13,
    draw: (t, h: Hud) => {
      const a = env(t, 0, 13, 0.8, 1.2);
      grid(h, a * 0.5);
      h.text('MANCHESTER MARATHON  -  19.04.2026', 960, 260, { font: 'mono', size: 28, color: COL.uiDim, align: 'center', alpha: a, tracking: 6 });
      h.text('3:20:03', 960, 420, { font: 'mono', size: 140, color: COL.white, align: 'center', alpha: a * smooth(0.5, 1.2, t), glow: 14 });
      h.text('MARATHON PB   -35:08', 960, 520, { font: 'mono', size: 40, color: COL.green, align: 'center', alpha: a * smooth(1.5, 2, t), tracking: 4 });
      h.text('SUB 3:00:00   NOT ACHIEVED', 960, 600, { font: 'mono', size: 40, color: COL.red, align: 'center', alpha: a * smooth(2.5, 3, t), tracking: 4 });
      const q = '"The Wall Won. Didn\'t have it in me physically and mentally for sub 3. But now I know."';
      h.wrap(h.type(q, t, 4, 30), 1300, { font: 'body', size: 44, weight: 600 }).forEach((ln, k) => h.text(ln, 960, 740 + k * 56, { font: 'body', size: 44, weight: 600, color: COL.white, align: 'center', alpha: a }));
    },
    cues: [{ t: 0.5, kind: 'number-hit' }, { t: 2.5, kind: 'fail' }],
  });
  void fmt;
  void pace;
  void stamp;
  return [pen, wallBoss(prof, Tx), standing, result];
}
