// FINAL BOSS: THE WALL, stages 3 and 4 (Manchester Marathon, 19.04.2026, km 26 to the line). The
// city becomes a canyon of brick in the rain. At the real crossing (the projection passes 3:00:00,
// just after km 27) the wall erupts from the road and opens its eyes: SUB 3:00:00 - LOST. He throws
// everything at it (X BREAK THROUGH): bricks blow out, and it rebuilds itself. Every real split from
// there is damage (4:57, 5:34, 5:12, 5:31...). OBJECTIVE UPDATED: FINISH. SURVIVAL: KEEP MOVING, HR
// falling (real), the distance counting down. He crosses at 3:20:03 with it still standing.
import * as THREE from 'three';
import { SetScene, SetShot } from '../SetScene';
import { Runner, STRIDE_KIT } from '../../char/Runner';
import { metal, Particles, haloTex } from '../bosses/kit';
import { wallCells } from '../fx';
import { hash } from '../../engine/assets';
import { COL, env, smooth, clamp01, fmt, pace } from '../../hud/Hud';
import { lifeHud, equip, bossHp, prompt, banner, popup } from '../../hud/game';
import { raceClock, targetBlock } from '../../hud/widgets';
import { MANCHESTER as M } from '../../../data/activities';
import type { RunProfile } from '../profile';
import type { Hud } from '../../hud/Hud';
import type { Cue } from '../core';

type V3 = [number, number, number];

/** a wall of instanced bricks that rises, is blown open at impact points, and rebuilds itself */
class BossWall {
  readonly root = new THREE.Group();
  readonly mesh: THREE.InstancedMesh;
  private cells: { x: number; y: number; d: number; r: number }[] = [];
  private m = new THREE.Matrix4();
  eyes: THREE.Mesh[] = [];
  eyeGlow: THREE.Sprite[] = [];
  constructor(w: number, h: number, scale: number) {
    const cells = wallCells(w, h, 0.02);
    const g = new THREE.BoxGeometry(0.43 * scale, 0.19 * scale, 0.4 * scale);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.mesh = new THREE.InstancedMesh(g, mat, cells.length);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    const col = new THREE.Color(), pal = [0x8b4a36, 0x7a3f2e, 0x9a5a40, 0x6e3a2c, 0xa06848, 0x5f3428, 0x8e6a4e];
    cells.forEach((c, i) => {
      this.cells.push({ x: c.x * scale, y: c.y * scale, d: c.delay, r: hash(i, 3) });
      col.setHex(pal[Math.floor(hash(i, 11) * pal.length)]).multiplyScalar(0.7 + 0.5 * hash(i, 12));
      this.mesh.setColorAt(i, col);
    });
    this.root.add(this.mesh);
    // eyes: two slits of red light set into the brickwork
    for (const x of [-5.5, 5.5]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      e.position.set(x, h * scale * 0.68, 0.55 * scale);
      this.root.add(e);
      this.eyes.push(e);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xff3010, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      s.scale.set(9, 4, 1);
      s.position.copy(e.position).add(new THREE.Vector3(0, 0, 0.3));
      this.root.add(s);
      this.eyeGlow.push(s);
    }
  }
  /** rise: seconds since it began rising; hits: [time since impact, x, y] */
  set(rise: number, hits: [number, number, number][], shake: number, t: number) {
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
    this.cells.forEach((c, i) => {
      const k = clamp01((rise - c.d) / 0.35);
      const up = 1 - Math.pow(1 - k, 3);
      let x = c.x, y = c.y - (1 - up) * 6, z = 0;
      e.set(0, 0, 0);
      for (const [dt, hx, hy] of hits) {
        const dist = Math.hypot(c.x - hx, c.y - hy);
        if (dist > 5.5 || dt < 0) continue;
        // blown out towards the runner (+z), then flown back into place
        const out = dt < 0.9 ? Math.sin(Math.min(1, dt / 0.9) * Math.PI * 0.5) : Math.max(0, 1 - (dt - 0.9) / 1.3);
        const f = out * (1 - dist / 5.5) * (0.6 + 0.8 * c.r);
        x += (c.x - hx) * f * 0.8;
        y += (c.y - hy) * f * 0.6 + f * 2;
        z += f * 9;
        e.set(f * 3 * c.r, f * 2, f * 4 * (c.r - 0.5));
      }
      if (shake) x += Math.sin(t * 40 + i) * shake * 0.05;
      v.set(x, y, z);
      q.setFromEuler(e);
      s.setScalar(k > 0 ? 1 : 0.0001);
      this.m.compose(v, q, s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export function wallBoss(prof: RunProfile, Tx: number) {
  const TARGET = 10800;
  const kmX = prof.distAt(Tx) / 1000;
  const T = { rise: 4.5, name: 6.8, lost: 10.5, fight: 13, regen: 21.5, obj: 24.5, surv: 27, fin: 45, end: 54 };
  const HITS = [14, 15.2, 16.3, 17.3, 18.2, 19, 19.7, 20.3];
  // film time -> race km
  const KEYS: [number, number][] = [[0, 26.3], [T.lost, kmX], [T.regen, 30], [T.surv, 35], [T.fin, M.distanceKm], [T.end, M.distanceKm]];
  const km = (t: number) => {
    for (let i = 1; i < KEYS.length; i++) if (t <= KEYS[i][0]) return KEYS[i - 1][1] + ((t - KEYS[i - 1][0]) / (KEYS[i][0] - KEYS[i - 1][0])) * (KEYS[i][1] - KEYS[i - 1][1]);
    return M.distanceKm;
  };
  const raceT = (t: number) => (t >= T.fin ? M.timeSec : prof.timeAt(km(t) * 1000));
  const split = (k: number) => M.splits[Math.min(M.splits.length - 1, Math.max(0, Math.floor(k)))];
  const hr = (k: number) => M.splitHr![Math.min(M.splitHr!.length - 1, Math.max(0, Math.floor(k)))];
  // on screen: running pace follows the real splits
  const vAt = (t: number) => (t > T.fin + 1.2 ? Math.max(0, 3.1 - (t - T.fin - 1.2) * 1.2) : (4.3 * 252) / split(km(t))) * (t > T.fin - 1 && t < T.fin + 3 ? 0.45 : 1);
  const N = 3000, dt = T.end / N, SS = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) SS[i] = SS[i - 1] + vAt(i * dt) * dt;
  const S = (t: number) => {
    const f = Math.min(N, Math.max(0, t / dt)), i = Math.min(N - 1, Math.floor(f));
    return SS[i] + (SS[i + 1] - SS[i]) * (f - i);
  };
  const sFin = S(T.fin);
  /** the wall: always ahead; close enough to fight, then held off down the road; behind the finish at the end */
  const wallS = (t: number) => (t > T.fin - 6 ? sFin + 26 : S(t) + (t < T.fight ? 48 - 20 * smooth(T.rise, T.fight, t) : t < T.regen ? 22 : 22 + 14 * smooth(T.regen, T.surv, t)));
  const X_S = 0.6;

  let stride: Runner, wall: BossWall, rain: Particles, dust: Particles, orbs: THREE.Sprite[] = [], gantry: THREE.Group;
  const shots: SetShot[] = ([['in', T.rise], ['rise', T.fight], ['fight', T.regen], ['regen', T.surv], ['surv1', 35], ['surv2', 41], ['fin', T.end]] as [string, number][]).map(([tag, t1], i, a) => ({ dur: t1 - (i ? a[i - 1][1] : 0), p0: [0, 0, 0] as V3, l0: [0, 0, -1] as V3, tag }));

  const cues: Cue[] = [
    { t: 0, kind: 'rain', dur: T.end },
    { t: 0, kind: 'music', id: 'friction', dur: T.rise },
    { t: 3, kind: 'rumble', dur: 4 },
    { t: T.rise, kind: 'wall-rise', dur: 5 },
    { t: T.name, kind: 'boss-intro' },
    { t: T.name, kind: 'music', id: 'wall', dur: T.surv - T.name },
    { t: T.lost, kind: 'shatter' },
    { t: T.lost + 0.2, kind: 'fail-big' },
    { t: T.fight, kind: 'mash', dur: HITS[HITS.length - 1] - T.fight + 0.5 },
    ...HITS.map((t) => ({ t, kind: 'bricks' })),
    { t: T.regen, kind: 'wall-rise', dur: 2.5 },
    { t: T.obj, kind: 'alert' },
    { t: T.surv, kind: 'music', id: 'survival', dur: T.fin - T.surv },
    { t: T.surv, kind: 'heartbeat', dur: T.fin - T.surv + 2 },
    { t: T.surv, kind: 'breath', dur: T.fin - T.surv },
    { t: T.fin - 1, kind: 'silence', dur: 5 },
    { t: T.fin, kind: 'crowd-far', dur: 6 },
    { t: T.fin + 2.5, kind: 'win-grim' },
  ];

  const say = (h: Hud, t: number, t0: number, t1: number, who: string, text: string) => {
    if (t < t0 || t > t1) return;
    h.text(`${who}:  ${text}`, 960, 862, { font: 'body', size: 48, weight: 600, color: COL.white, align: 'center', alpha: env(t, t0, t1, 0.25, 0.3), shadow: true });
  };

  return new SetScene({
    id: 'c8-wallboss',
    chapter: 'THE WALL',
    sky: { hdri: 'kloofendal_overcast_puresky', sun: 0.4, env: 0.7, fog: 0.018, fogColor: 0x4a4644, bgIntensity: 0.4, shadowSize: 40 },
    shots,
    build: async (st) => {
      const s = st.scene;
      const [asph, brick, stone] = await Promise.all([metal('concrete', { tint: 0x3a3a3c, rough: 0.35 }), metal('brick', { tint: 0x7a5a50 }), metal('concrete', { tint: 0x6a6a6a })]);
      const L = sFin + 200;
      // the road (wet), and the city folding into brick canyon walls on both sides
      const road = new THREE.Mesh(new THREE.PlaneGeometry(14, L).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.25, metalness: 0.2, map: (asph as THREE.MeshStandardMaterial).map, normalMap: (asph as THREE.MeshStandardMaterial).normalMap }));
      road.position.set(0, 0, -L / 2 + 60);
      road.receiveShadow = true;
      s.add(road);
      const segG = new THREE.BoxGeometry(6, 1, 12);
      const bld: THREE.Matrix4[] = [];
      for (const side of [-1, 1]) {
        for (let z = 60; z > -L; z -= 12) {
          const hh = 18 + hash(z, side) * 30;
          const lean = 0.05 + 0.1 * hash(z, side, 2);
          bld.push(new THREE.Matrix4().compose(new THREE.Vector3(side * (10 + hash(z, side, 3) * 2), hh / 2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -side * lean)), new THREE.Vector3(1, hh, 1)));
        }
      }
      const bm = new THREE.InstancedMesh(segG, brick, bld.length);
      bld.forEach((m, i) => bm.setMatrixAt(i, m));
      bm.castShadow = bm.receiveShadow = true;
      s.add(bm);
      // kerbs and painted line
      for (const sx of [-1, 1]) {
        const k = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, L), stone);
        k.position.set(sx * 7, 0.07, -L / 2 + 60);
        s.add(k);
      }
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, L).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a8a80 }));
      line.position.set(-2.5, 0.01, -L / 2 + 60);
      s.add(line);
      // THE WALL
      wall = new BossWall(8, 4.4, 5);
      s.add(wall.root);
      // the finish gantry
      gantry = new THREE.Group();
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 6, 0.5), stone);
        p.position.set(sx * 6.5, 3, 0);
        gantry.add(p);
      }
      const c = document.createElement('canvas');
      c.width = 1024;
      c.height = 128;
      const cg = c.getContext('2d')!;
      cg.fillStyle = '#101418';
      cg.fillRect(0, 0, 1024, 128);
      cg.fillStyle = '#e8e8e8';
      cg.font = '700 90px sans-serif';
      cg.textAlign = 'center';
      cg.fillText('FINISH', 512, 100);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      for (const ry of [0, Math.PI]) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 1.7), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5 }));
        b.position.set(0, 5.6, ry ? -0.02 : 0.02);
        b.rotation.y = ry;
        gantry.add(b);
      }
      gantry.position.z = -sFin;
      s.add(gantry);
      // effort: glowing orbs thrown at it
      for (let i = 0; i < HITS.length; i++) {
        const o = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0x7fdcff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        o.scale.setScalar(2.2);
        s.add(o);
        orbs.push(o);
      }
      rain = new Particles({ n: 900, box: [30, 18, 40], vel: [0.5, -14, 1], life: 1.2, size: 0.05, color: 0xc8d4e0, opacity: 0.55, seed: 31 });
      dust = new Particles({ n: 260, box: [30, 2, 3], vel: [0, 3, -3], life: 2.5, size: 1.6, color: 0x6a5a50, opacity: 0.45, grow: 2, seed: 32 });
      s.add(rain.points, dust.points);
      stride = await Runner.create(STRIDE_KIT);
      s.add(stride.root);
    },
    frame: (t, ctx, info) => {
      const h = ctx.hud, g = ctx.r.grade;
      h.time = t;
      const cam = ctx.r.camera as THREE.PerspectiveCamera;
      const tg = info.tag!, u = info.shotT / shots[info.shot].dur;
      const s = S(t), z = -s, K = km(t), RT = raceT(t), v = vAt(t);
      const done = t >= T.fin;
      stride.root.position.set(X_S, 0, z);
      stride.root.rotation.y = Math.PI;
      const fat = 0.3 + 1.0 * smooth(T.lost, T.surv, t) + 0.3 * smooth(T.surv, T.fin, t);
      if (done && v < 0.3) stride.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t * 0.3] }, fatigue: 2 });
      else stride.pose({ phase: s / stride.strideAt(Math.max(1.2, v)), speed: Math.max(1.2, v), fatigue: fat });
      // the wall
      const ws = wallS(t), wz = -ws;
      wall.root.position.set(0, 0, wz);
      const hits: [number, number, number][] = HITS.map((ht, i) => [t - ht, (i % 2 ? 1 : -1) * (2 + (i * 1.7) % 7), 4 + (i * 2.3) % 9]);
      wall.set(t - T.rise, hits, t > T.rise && t < T.lost ? 1 - smooth(T.rise, T.lost, t) : 0, t);
      const eyesOpen = smooth(T.name - 0.3, T.name + 0.4, t) * (0.75 + 0.25 * Math.sin(t * 3));
      wall.eyes.forEach((e) => {
        (e.material as THREE.MeshBasicMaterial).opacity = eyesOpen;
        e.scale.y = 0.2 + 0.8 * eyesOpen;
      });
      wall.eyeGlow.forEach((e) => ((e.material as THREE.SpriteMaterial).opacity = eyesOpen * 0.8));
      // orbs fly from him to the wall
      orbs.forEach((o, i) => {
        const k = (t - (HITS[i] - 0.45)) / 0.45;
        o.visible = k > 0 && k < 1;
        if (!o.visible) return;
        const [, hx, hy] = hits[i];
        o.position.set(X_S + (hx - X_S) * k, 1.3 + (hy - 1.3) * k, z - 1 + (wz + 1 - (z - 1)) * k);
      });
      dust.points.position.set(0, 0.5, wz + 2);
      dust.update(t, (t > T.rise && t < T.lost + 1) || (t > T.regen && t < T.regen + 2) ? 1 : 0);
      rain.points.position.set(cam.position.x, 8, cam.position.z - 12);
      rain.update(t, 1);
      gantry.visible = t > T.surv;

      // cameras
      const set = (p: V3, l: V3, fov: number) => {
        cam.position.set(...p);
        cam.lookAt(...l);
        cam.fov = fov;
      };
      const e2 = (a: number, b: number) => a + (b - a) * (u * u * (3 - 2 * u));
      switch (tg) {
        case 'in':
          set([X_S + 0.8, 1.5, z + 4.5], [X_S - 0.4, 1.6, z - 20], 48);
          break;
        case 'rise':
          set([X_S + e2(2, 1.2), e2(0.5, 0.8), z + 5], [0, e2(4, 11), wz], e2(42, 52));
          break;
        case 'fight':
          set([X_S + 1.2, 1.9, z + 4.2], [-0.5, 5.5, wz], 54);
          break;
        case 'regen':
          set([X_S - 3.5, 2.5, z - 4], [0, 7, wz], 40);
          break;
        case 'surv1':
          set([X_S - 0.4, 1.5, z - 5.2], [X_S, 1.2, z + 6], 42);
          break;
        case 'surv2':
          set([X_S + 4.2, 0.8, z - 2.5], [X_S - 0.6, 1.1, z + 1.5], 34);
          break;
        case 'fin':
          // behind him: the finish, and the wall still standing beyond it
          set([X_S + 1.4, 1.7, -sFin + 10 - u * 1.5], [0, 5.5, -sFin - 26], 56);
          break;
      }
      const quake = (t > 3 && t < T.lost) ? 0.05 : 0;
      const hitShake = HITS.reduce((a, ht) => a + env(t, ht, ht + 0.35, 0.02, 0.3) * 0.04, 0);
      cam.position.y += Math.sin(t * 50) * (quake + hitShake);
      cam.updateProjectionMatrix();

      // grade: drained, then grey survival with tunnel vision
      const surv = smooth(T.surv - 1, T.surv + 3, t);
      g.saturation = 0.7 - 0.25 * smooth(T.lost, T.lost + 2, t) - 0.2 * surv + 0.2 * smooth(T.fin, T.fin + 4, t);
      g.contrast = 1.15;
      g.vignette = 0.5 + 0.45 * surv * (1 - smooth(T.fin, T.fin + 3, t));
      g.ca = 0.002 + 0.006 * surv;
      g.flash = 0.4 * env(t, T.lost, T.lost + 0.6, 0.05, 0.5);
      g.letterbox = t > T.rise && t < T.fight ? 1 : t > T.fin ? smooth(T.fin, T.fin + 1, t) : 0;
      g.fade = t < 0.8 ? 1 - smooth(0, 0.8, t) : t > T.end - 1 ? smooth(T.end - 1, T.end, t) : 0;

      // HUD
      if (t > T.name && t < T.lost - 0.3) {
        const a = env(t, T.name, T.lost - 0.3, 0.3, 0.3);
        h.text('FINAL BOSS', 1780, 640, { font: 'mono', size: 34, color: COL.red, align: 'right', alpha: a, tracking: 10 });
        h.text('THE WALL', 1780, 760, { font: 'head', size: 140 * (1 + 0.15 * (1 - smooth(T.name, T.name + 0.3, t))), weight: 700, color: COL.white, align: 'right', alpha: a, tracking: 14, glow: 20 });
        h.text('It was always going to be here.', 1780, 840, { font: 'body', size: 44, weight: 500, color: COL.ui, align: 'right', alpha: a * smooth(T.name + 0.8, T.name + 1.3, t) });
      }
      const hud = (t < T.rise ? smooth(0.6, 1.1, t) : t > T.fight - 0.5 ? smooth(T.fight - 0.5, T.fight, t) : 0) * (1 - smooth(T.fin - 0.5, T.fin + 0.3, t));
      if (hud > 0) {
        const life = t < T.lost ? 0.8 : 0.8 - 0.55 * smooth(T.lost, T.regen, t) - 0.2 * smooth(T.surv, T.fin, t);
        lifeHud(h, { life, stamina: Math.max(0.03, 0.6 - 0.6 * smooth(T.lost, T.surv, t)), alpha: hud, hurt: t > T.fight && t < T.regen && Math.floor(K) !== Math.floor(km(t - 0.25)) ? 1 : 0 });
        h.text('STATUS', 96, 250, { font: 'mono', size: 26, color: COL.uiDim, alpha: hud, tracking: 4 });
        h.text('ACHILLES', 250, 250, { font: 'mono', size: 30, color: COL.amber, alpha: hud * (0.7 + 0.3 * Math.sin(t * 4)), tracking: 4 });
        const lost = t > T.lost;
        equip(h, { item: 'GELS', weapon: lost ? 'WILL' : '3:00 PACE', weaponSub: lost ? '' : 'LOCKED', alpha: hud });
        if (t < T.surv) {
          raceClock(h, { T: RT, d: K * 1000, hours: true, pace: split(K), alpha: hud, col: split(K) > 257 ? COL.red : undefined });
          h.text(`HR ${hr(K)}`, 1824, 340, { font: 'mono', size: 34, color: COL.ui, align: 'right', alpha: hud, shadow: true });
          const p = (RT / (K * 1000)) * 42195;
          targetBlock(h, { target: TARGET - 1, projection: p, hours: true, alpha: hud * (lost ? 1 - smooth(T.lost + 2, T.lost + 4, t) : 1), y: 360 });
        } else {
          // survival: only the distance left, and the heart rate dropping with him
          h.text('DISTANCE REMAINING', 960, 110, { font: 'mono', size: 30, color: COL.uiDim, align: 'center', alpha: hud, tracking: 8, shadow: true });
          h.text(`${Math.max(0, M.distanceKm - K).toFixed(2)} KM`, 960, 200, { font: 'mono', size: 90, color: COL.white, align: 'center', alpha: hud, glow: 10, shadow: true });
          raceClock(h, { T: RT, hours: true, alpha: hud * 0.6 });
          h.text(`HR ${hr(K)}`, 1824, 250, { font: 'mono', size: 34, color: COL.red, align: 'right', alpha: hud, shadow: true });
        }
        if (t > T.fight - 0.5) {
          const regen = smooth(T.regen - 0.2, T.regen + 2, t);
          const dmg = HITS.reduce((a, ht) => a + (t > ht ? 0.07 : 0), 0);
          bossHp(h, { name: 'THE WALL', hp: Math.min(1, 1 - dmg * (1 - regen)), sub: t < T.regen ? 'SUB 3:00:00 IS BEHIND IT' : 'IT CANNOT BE BROKEN', alpha: hud, col: COL.red, hit: HITS.some((ht) => t > ht && t < ht + 0.3) ? 1 : 0 });
        }
      }
      if (t > T.lost) banner(h, 'SUB 3:00:00  -  LOST', t - T.lost, { col: COL.red, sub: `KM ${kmX.toFixed(1)}  -  PROJECTION ${fmt(TARGET + 1, { hours: true })}`, dur: 2.6 });
      if (t > T.fight - 0.3 && t < HITS[HITS.length - 1] + 0.4) prompt(h, { b: 'X', text: 'BREAK THROUGH', t: t - T.fight + 0.3, mash: true, y: 780 });
      HITS.forEach((ht, i) => {
        if (t > ht && t < ht + 1.4) popup(h, i % 3 === 2 ? 'CRITICAL HIT' : 'HIT', 1200 + (i % 2) * 180, 460 - (i % 3) * 40, t - ht, COL.amber, 54);
      });
      // the real splits land on him as damage
      if (t > T.lost && t < T.surv) {
        for (let k = Math.ceil(kmX); k <= 35; k++) {
          const tk = (() => {
            let lo = 0, hi = T.fin;
            for (let n = 0; n < 30; n++) {
              const mid = (lo + hi) / 2;
              if (km(mid) < k) lo = mid;
              else hi = mid;
            }
            return lo;
          })();
          if (t > tk && t < tk + 1.6) popup(h, `KM ${k}  ${pace(split(k - 1))}`, 480, 640, t - tk, COL.red, 50);
        }
      }
      if (t > T.regen && t < T.obj) h.text('IT CANNOT BE BROKEN', 960, 460, { font: 'head', size: 80, weight: 700, color: COL.red, align: 'center', alpha: env(t, T.regen + 0.4, T.obj, 0.3, 0.3), tracking: 16, glow: 12, shadow: true });
      if (t > T.obj) banner(h, 'OBJECTIVE UPDATED', t - T.obj, { col: COL.amber, sub: 'FINISH', dur: 2.6 });
      say(h, t, T.surv + 0.5, T.surv + 4.5, 'TEMPO', "Forget the number. Get to the line.");
      if (t > T.surv + 5 && t < T.fin - 1) prompt(h, { b: 'X', text: 'KEEP MOVING', t: t - T.surv - 5, mash: true, y: 780 });
      if (t > T.fin) {
        h.text('3:20:03', 960, 820, { font: 'mono', size: 110, color: COL.white, align: 'center', alpha: smooth(T.fin + 0.3, T.fin + 1, t), glow: 12, shadow: true });
        h.text('THE WALL WON', 960, 930, { font: 'head', size: 60, weight: 700, color: COL.red, align: 'center', alpha: smooth(T.fin + 2.5, T.fin + 3.2, t), tracking: 20, glow: 10, shadow: true });
      }
    },
    cues,
  });
}
