// BOSS: FURNACE (Richmond Runfest Marathon, 10.09.2023, 3:55:11 - the first marathon). Volcanic hell:
// a basalt towpath beside a river of lava. The Furnace (a blast furnace on a barge) rises out of the
// lava at km 20 and the heat takes over: a HEAT gauge replaces stamina, driven by the real slowdown
// (splits 4:40s to 6:46 at km 31). Water stations are pickups (O DRINK). It cannot be beaten: from
// km 31 the race is being stopped behind him ("they started to cancel the race due to too many
// casualties") and the path collapses into the lava at his heels. He gets out.
import * as THREE from 'three';
import { SetScene, SetShot } from '../SetScene';
import { Runner, STRIDE_KIT } from '../../char/Runner';
import { randomKit } from '../../char/Crowd';
import { metal, box, Particles, Lamp } from '../bosses/kit';
import { Furnace } from '../bosses/Furnace';
import { pbr } from '../../engine/assets';
import { COL, env, smooth, clamp01, pace } from '../../hud/Hud';
import { lifeHud, equip, bossHp, prompt, banner, popup, itemGet, alertMark, results } from '../../hud/game';
import { raceClock, eventTag } from '../../hud/widgets';
import { toScreen } from './door';
import { RICHMOND as R } from '../../../data/activities';
import type { Cue } from '../core';
import type { Hud } from '../../hud/Hud';

type V3 = [number, number, number];

const CUM = [0];
for (const s of R.splits) CUM.push(CUM[CUM.length - 1] + s);
const Tat = (km: number) => {
  if (km <= 0) return 0;
  if (km >= R.distanceKm) return R.timeSec;
  const n = R.splits.length;
  if (km >= n) return CUM[n] + ((km - n) / (R.distanceKm - n)) * (R.timeSec - CUM[n]);
  const k = Math.floor(km);
  return CUM[k] + (km - k) * R.splits[k];
};
const splitAt = (km: number) => R.splits[Math.min(R.splits.length - 1, Math.max(0, Math.floor(km)))];
/** the HEAT gauge: how far the real pace has fallen from the opening 4:50/km (6:46 = full) */
const heatAt = (km: number) => clamp01((splitAt(km) - 285) / (406 - 285)) * 0.8 + 0.12 + 0.08 * clamp01(km / 20);

function lavaTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1a0400';
  g.fillRect(0, 0, S, S);
  // glowing channels between dark crust plates
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 40;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const hot = rnd();
    grd.addColorStop(0, hot > 0.7 ? 'rgba(255,230,120,0.9)' : 'rgba(255,110,20,0.55)');
    grd.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(20,6,2,${0.5 + rnd() * 0.4})`;
    g.beginPath();
    const x = rnd() * S, y = rnd() * S, r = 10 + rnd() * 36;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, rr = r * (0.6 + rnd() * 0.5);
      k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function furnaceLevel() {
  // film time -> race km; on-screen speed follows the real slowdown
  const T = { est: 0, cruise: 6, wake: 13, melt: 19, water1: 22.5, blob1: 25.5, water2: 28.5, blob2: 31, crit: 31.5, evac: 34, fin: 47, res: 52.5, end: 61 };
  const KEYS: [number, number][] = [[T.cruise, 0], [T.wake, 20], [T.melt, 21], [T.evac, 31], [T.fin, R.distanceKm], [T.end, R.distanceKm]];
  const km = (t: number) => {
    if (t <= KEYS[0][0]) return 0;
    for (let i = 1; i < KEYS.length; i++) if (t <= KEYS[i][0]) return KEYS[i - 1][1] + ((t - KEYS[i - 1][0]) / (KEYS[i][0] - KEYS[i - 1][0])) * (KEYS[i][1] - KEYS[i - 1][1]);
    return R.distanceKm;
  };
  const vAt = (t: number) => (t < T.cruise ? 4.4 : t > T.fin + 1.5 ? Math.max(0, 3.2 - (t - T.fin - 1.5) * 1.4) : (4.4 * 285) / splitAt(km(t)));
  const N = 3000, dt = T.end / N, SS = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) SS[i] = SS[i - 1] + vAt(i * dt) * dt;
  const S = (t: number) => {
    const f = Math.min(N, Math.max(0, t / dt)), i = Math.min(N - 1, Math.floor(f));
    return SS[i] + (SS[i + 1] - SS[i]) * (f - i);
  };
  const sFin = S(T.fin);
  const X_S = 0.4;
  /** the collapse front chasing him in the evacuation (distance behind him) */
  const front = (t: number) => (t < T.evac ? -1e9 : S(t) - (38 - 30 * smooth(T.evac, T.evac + 9, t) + 22 * smooth(T.fin, T.fin + 3, t)));
  /** lava blobs: launch, land (film s), landing point along the path */
  const BLOBS = [{ t0: T.blob1 - 1.6, t1: T.blob1, x: -1.2, ds: 6 }, { t0: T.blob2 - 1.6, t1: T.blob2, x: 1.4, ds: 7 }];
  for (const b of BLOBS) (b as { s?: number }).s = S(b.t1) + b.ds;
  const WATER = [T.water1, T.water2].map((tt) => S(tt + 0.6));
  // dodge: he swerves away from each blob
  const dodgeX = (t: number) => X_S + BLOBS.reduce((a, b) => a + (b.x > 0 ? -1.3 : 1.1) * env(t, b.t1 - 1.1, b.t1 + 0.9, 0.4, 0.6), 0);
  // the Furnace's position along the river, relative to him: ahead as it wakes, level in the melt, then behind
  const furnaceRel = (t: number) => 40 - 25 * smooth(T.wake, T.melt, t) - 10 * smooth(T.melt, T.evac, t) - 45 * smooth(T.evac, T.fin, t);
  const rise = (t: number) => smooth(T.wake + 0.3, T.wake + 4, t);

  let stride: Runner, others: Runner[] = [], furnace: Furnace;
  let st0: { skyDome?: THREE.Mesh } | null = null;
  let path: THREE.InstancedMesh, lava: THREE.Mesh, lavaTex: THREE.Texture, embers: Particles, ash: Particles, splash: Particles[] = [], blobs: THREE.Mesh[] = [];
  let gate: THREE.Group, gateSign: THREE.MeshStandardMaterial, stopTex: THREE.Texture, finTex: THREE.Texture, glows: THREE.PointLight[] = [];
  const SEG = 3, SEG0 = -40, NSEG = Math.ceil((sFin + 90 - SEG0) / SEG);

  const shots: SetShot[] = ([['est', T.cruise], ['cruise', T.wake], ['wake', T.melt], ['melt', T.blob1 + 1], ['water', T.blob2 - 1.8], ['blob', T.evac], ['evac', 41], ['behind', T.fin - 1.5], ['finish', T.res], ['res', T.end]] as [string, number][]).map(([tag, t1], i, a) => ({ dur: t1 - (i ? a[i - 1][1] : 0), p0: [0, 0, 0] as V3, l0: [0, 0, -1] as V3, tag }));

  const say = (h: Hud, t: number, t0: number, t1: number, who: string, text: string) => {
    if (t < t0 || t > t1) return;
    h.text(`${who}:  ${text}`, 960, 862, { font: 'body', size: 48, weight: 600, color: COL.white, align: 'center', alpha: env(t, t0, t1, 0.25, 0.3), shadow: true });
  };

  const cues: Cue[] = [
    { t: 0, kind: 'lava', dur: T.end },
    { t: 0.3, kind: 'music', id: 'dread', dur: T.wake },
    { t: T.cruise, kind: 'breath', dur: 7 },
    { t: T.wake, kind: 'alert' },
    { t: T.wake + 0.4, kind: 'grave-rise' },
    { t: T.wake + 2.6, kind: 'boss-intro' },
    { t: T.melt, kind: 'music', id: 'furnace', dur: T.evac - T.melt },
    { t: T.water1 + 0.5, kind: 'item-get' },
    { t: T.water2 + 0.5, kind: 'item-get' },
    { t: BLOBS[0].t1, kind: 'boom' },
    { t: BLOBS[1].t1, kind: 'boom' },
    { t: T.crit, kind: 'heartbeat', dur: T.fin - T.crit },
    { t: T.evac, kind: 'siren', dur: T.fin - T.evac },
    { t: T.evac, kind: 'music', id: 'hunted', dur: T.fin - T.evac },
    { t: T.evac + 1, kind: 'rumble', dur: T.fin - T.evac + 3 },
    { t: T.fin, kind: 'win-grim' },
    { t: T.fin + 1.2, kind: 'boom' },
    { t: T.res, kind: 'result' },
  ];

  return new SetScene({
    id: 'c3-furnace',
    sky: { hdri: 'industrial_sunset_puresky', sun: 1.2, sunColor: 0xff6a30, env: 0.45, fog: 0.02, fogColor: 0x5a1c0a, bgIntensity: 0.18, shadowSize: 40 },
    shots,
    build: async (st) => {
      st0 = st as unknown as { skyDome?: THREE.Mesh };
      const s = st.scene;
      const [rock, trail] = await Promise.all([metal('rock', { tint: 0x3a3230 }), pbr('rocky_trail')]);
      for (const k of ['map', 'normalMap', 'roughnessMap'] as const) {
        trail[k] = trail[k].clone();
        trail[k].wrapS = trail[k].wrapT = THREE.RepeatWrapping;
        trail[k].needsUpdate = true;
      }
      // the towpath: basalt slabs (instanced so they can fall into the lava one by one)
      const slabG = box(5.2, 1.4, SEG - 0.08, rock, 2, 0.04).geometry;
      path = new THREE.InstancedMesh(slabG, new THREE.MeshStandardMaterial({ ...trail, color: 0x6a5a52, roughness: 0.9 }), NSEG);
      path.receiveShadow = path.castShadow = true;
      path.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      s.add(path);
      // the lava river (left) and a lava plain beyond the rocks (right)
      lavaTex = lavaTexture();
      lavaTex.repeat.set(6, 30);
      const lavaM = new THREE.MeshStandardMaterial({ color: 0x120300, emissive: 0xffffff, emissiveMap: lavaTex, emissiveIntensity: 2.2, roughness: 0.9, map: lavaTex });
      lava = new THREE.Mesh(new THREE.PlaneGeometry(260, sFin + 400).rotateX(-Math.PI / 2), lavaM);
      lava.position.set(-40, -0.9, -(sFin + 400) / 2 + 100);
      s.add(lava);
      // black rock banks on the right: boulders and a ridge
      const bould: THREE.Matrix4[] = [];
      let seed = 3;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let z = 60; z > -sFin - 200; z -= 4) {
        for (let k = 0; k < 3; k++) {
          const sc = 1.2 + rnd() * 3.5 + k * 1.5;
          bould.push(new THREE.Matrix4().compose(new THREE.Vector3(4.8 + k * 4 + rnd() * 3, -0.5 + sc * 0.3, z + rnd() * 3), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)), new THREE.Vector3(sc, sc * (0.6 + rnd() * 0.5), sc)));
        }
      }
      const bm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), rock, bould.length);
      bould.forEach((m, i) => bm.setMatrixAt(i, m));
      bm.castShadow = bm.receiveShadow = true;
      s.add(bm);
      const ridge = box(40, 26, sFin + 400, rock, 6, 0.01);
      ridge.position.set(38, 6, -(sFin + 400) / 2 + 100);
      ridge.rotation.z = 0.35;
      s.add(ridge);
      // obsidian spires on the far side of the river
      const spires: THREE.Matrix4[] = [];
      for (let z = 40; z > -sFin - 250; z -= 11) spires.push(new THREE.Matrix4().compose(new THREE.Vector3(-70 - rnd() * 40, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * 3, (rnd() - 0.5) * 0.3)), new THREE.Vector3(3 + rnd() * 4, 20 + rnd() * 35, 3 + rnd() * 4)));
      const sp = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0), rock, spires.length);
      spires.forEach((m, i) => sp.setMatrixAt(i, m));
      s.add(sp);
      // a smoke-choked sky: a gradient dome that matches the fog at the horizon
      const skyTex = canvasTex(8, 256, (g) => {
        const grd = g.createLinearGradient(0, 0, 0, 256);
        grd.addColorStop(0, '#070203');
        grd.addColorStop(0.35, '#1c0705');
        grd.addColorStop(0.47, '#4a1609');
        grd.addColorStop(0.5, '#5a1c0a');
        grd.addColorStop(1, '#5a1c0a');
        g.fillStyle = grd;
        g.fillRect(0, 0, 8, 256);
      });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
      dome.renderOrder = -1;
      (st as unknown as { skyDome?: THREE.Mesh }).skyDome = dome;
      s.add(dome);
      // warm light off the lava
      const hemi = new THREE.HemisphereLight(0x2a1a14, 0xff5a10, 0.8);
      s.add(hemi);
      for (let i = 0; i < 3; i++) {
        const pl = new THREE.PointLight(0xff6a20, 0, 26, 1.5);
        s.add(pl);
        glows.push(pl);
      }
      // water stations: a stone table, a barrel of glowing water, a sign
      const waterSign = canvasTex(256, 96, (g) => {
        g.fillStyle = '#081a24';
        g.fillRect(0, 0, 256, 96);
        g.strokeStyle = '#5ff3ff';
        g.lineWidth = 5;
        g.strokeRect(4, 4, 248, 88);
        g.fillStyle = '#bff8ff';
        g.font = '700 58px sans-serif';
        g.textAlign = 'center';
        g.fillText('WATER', 128, 68);
      });
      for (const ws of WATER) {
        const tb = box(1.8, 2.4, 2.8, rock, 1, 0.05);
        tb.position.set(3.4, 0.1, -ws);
        s.add(tb);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1, 18), new THREE.MeshStandardMaterial({ color: 0x0a2a38, emissive: 0x2ad8ff, emissiveIntensity: 0.9, roughness: 0.2 }));
        barrel.position.set(3.4, 1.8, -ws - 0.5);
        s.add(barrel);
        const cup = new Lamp(0.2, 0x5ff3ff);
        cup.level = 0.7;
        cup.group.position.set(3.2, 1.45, -ws + 0.6);
        s.add(cup.group);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshStandardMaterial({ map: waterSign, emissive: 0xffffff, emissiveMap: waterSign, emissiveIntensity: 0.9 }));
        sign.position.set(3.4, 3.0, -ws);
        sign.rotation.y = -Math.PI / 2 + 0.5;
        s.add(sign);
        const wl = new THREE.PointLight(0x5ff3ff, 8, 8, 1.6);
        wl.position.set(3.2, 1.8, -ws);
        s.add(wl);
      }
      // the finish gate: two basalt pillars and a lintel with a sign that turns to RACE STOPPED
      gate = new THREE.Group();
      for (const sx of [-1, 1]) {
        const p = box(1.4, 7, 1.4, rock, 2, 0.06);
        p.position.set(sx * 3.4, 3.5, 0);
        gate.add(p);
        const fire = new Particles({ n: 50, box: [0.5, 0.2, 0.5], vel: [0, 2.4, 0], life: 0.7, size: 0.8, color: 0xff8a30, additive: true, swirl: 1, grow: -0.6, seed: 40 + sx });
        fire.points.position.set(sx * 3.4, 7.3, 0);
        gate.add(fire.points);
        splash.push(fire);
      }
      const lintel = box(8.6, 1.3, 1.6, rock, 2, 0.05);
      lintel.position.y = 7.3;
      gate.add(lintel);
      finTex = canvasTex(512, 128, (g) => {
        g.fillStyle = '#140804';
        g.fillRect(0, 0, 512, 128);
        g.fillStyle = '#ffd9a0';
        g.font = '700 86px sans-serif';
        g.textAlign = 'center';
        g.fillText('FINISH', 256, 96);
      });
      stopTex = canvasTex(512, 128, (g) => {
        g.fillStyle = '#300404';
        g.fillRect(0, 0, 512, 128);
        g.fillStyle = '#ff4030';
        g.font = '700 70px sans-serif';
        g.textAlign = 'center';
        g.fillText('RACE STOPPED', 256, 90);
      });
      gateSign = new THREE.MeshStandardMaterial({ map: finTex, emissive: 0xffffff, emissiveMap: finTex, emissiveIntensity: 0.9 });
      // one face each way, so it reads from both sides
      for (const ry of [0, Math.PI]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 1.35), gateSign);
        sign.position.set(0, 5.8, ry ? -0.02 : 0.02);
        sign.rotation.y = ry;
        gate.add(sign);
      }
      gate.position.set(0.3, 0, -sFin);
      s.add(gate);
      // the Furnace on its barge, in the lava
      furnace = (await Furnace.create()).barge();
      furnace.root.scale.setScalar(1.35);
      furnace.root.rotation.y = Math.PI; // bow downstream (-z); the crucible turns to face the path
      furnace.crucible.rotation.y = -Math.PI / 2;
      s.add(furnace.root);
      // lava blobs and their splashes
      for (let i = 0; i < BLOBS.length; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshStandardMaterial({ color: 0x200500, emissive: 0xff7a20, emissiveIntensity: 3.5 }));
        s.add(b);
        blobs.push(b);
        const sp2 = new Particles({ n: 160, box: [1.4, 0.3, 1.4], vel: [0, 7, 0], life: 1.1, size: 0.35, color: 0xffa040, additive: true, swirl: 5, seed: 60 + i });
        s.add(sp2.points);
        splash.push(sp2);
      }
      embers = new Particles({ n: 500, box: [40, 12, 60], vel: [1.5, 2.2, 0.5], life: 5, size: 0.14, color: 0xff9a40, additive: true, swirl: 2.5, seed: 21 });
      ash = new Particles({ n: 300, box: [30, 14, 50], vel: [0.4, -0.9, 0.2], life: 7, size: 0.1, color: 0x8a8480, opacity: 0.7, swirl: 1, seed: 22 });
      s.add(embers.points, ash.points);
      // STRIDE and three other runners
      stride = await Runner.create(STRIDE_KIT);
      s.add(stride.root);
      for (let k = 0; k < 3; k++) {
        const rk = randomKit(k * 11 + 5);
        const r = await Runner.create({ singlet: rk.top, shorts: rk.shorts, socks: 0xeeeeea, shoes: rk.shoes, hair: rk.hair, skin: rk.skin }, k % 2 ? 'runner_f.glb' : 'runner_m2.glb');
        others.push(r);
        s.add(r.root);
      }
    },
    frame: (t, ctx, info) => {
      const h = ctx.hud, g = ctx.r.grade;
      h.time = t;
      const cam = ctx.r.camera as THREE.PerspectiveCamera;
      const tg = info.tag!, u = info.shotT / shots[info.shot].dur;
      const s = S(t), z = -s, K = km(t), v = vAt(t);
      const heat = t < T.cruise ? 0.12 : Math.min(1, heatAt(K) - 0.3 * env(t, T.water1 + 0.5, T.water1 + 3.5, 0.3, 2) - 0.3 * env(t, T.water2 + 0.5, T.water2 + 3.5, 0.3, 2));
      const done = t >= T.fin;
      const x = dodgeX(t);

      // --- cameras first (the path and particles follow the camera)
      const set = (p: V3, l: V3, fov: number) => {
        cam.position.set(...p);
        cam.lookAt(...l);
        cam.fov = fov;
      };
      const e = (a: number, b: number) => a + (b - a) * (u * u * (3 - 2 * u));
      const fz = z - furnaceRel(t);
      const FX = -26;
      switch (tg) {
        case 'est':
          set([e(-14, -4), e(16, 3), e(18, 8)], [e(-20, 0), e(6, 1.5), e(-40, z - 4)], 44);
          break;
        case 'cruise':
          set([x + 4.2, 1.5, z - 1.5 + u], [x - 1, 1.2, z + 1.5], 40);
          break;
        case 'wake':
          // over his shoulder to the river: the Furnace breaks the surface
          set([x + 1.2, 1.8, z + 4.5], [FX, 10 + 8 * rise(t), fz], e(38, 44));
          break;
        case 'melt':
        case 'blob':
          set([x + 0.9, 1.9, z + 5], [x - 1.4, 1.5, z - 10], 50);
          break;
        case 'water':
          // from over the lava: STRIDE, and the water station beyond him
          set([x - 3.4, 1.5, z - 4.5], [x + 0.8, 1.3, z + 1], 42);
          break;
        case 'evac':
          // from ahead, looking back: the path falling into the lava behind him
          set([x - 0.6, 1.6, z - 6.5], [x, 1.2, z + 10], 46);
          break;
        case 'behind':
          set([x + 2.5, 3.2, z + 9], [x - 2, 2, z - 20], 46);
          break;
        case 'finish':
        case 'res': {
          const zf = -sFin;
          set([2.4, 1.6, zf - 11], [0, 2.2, zf + 6], 42);
          break;
        }
      }
      cam.updateProjectionMatrix();

      // --- STRIDE (and the field, who fall away in the heat)
      stride.root.position.set(x, 0.7, z);
      stride.root.rotation.y = Math.PI;
      const fat = 0.1 + 0.9 * smooth(T.melt, T.evac, t) + (done ? 0.3 : 0);
      if (done && v < 0.4) stride.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] }, fatigue: 1 });
      else stride.pose({ phase: s / stride.strideAt(Math.max(1.2, v)), speed: Math.max(1.2, v), fatigue: fat });
      others.forEach((r, k) => {
        const lag = t < T.melt ? 0 : (t - T.melt) * (0.8 + k * 0.5);
        const od = s - 4 - k * 3.2 - lag;
        const walk = t > T.melt + 4 + k * 2;
        r.root.position.set(k === 1 ? 1.6 : -1 + k * 0.5, 0.7, -od);
        r.root.rotation.y = Math.PI;
        r.root.visible = t < T.evac && od > front(t);
        const sp = walk ? 1.4 : v;
        r.pose({ phase: od / r.strideAt(sp), speed: sp, fatigue: walk ? 1 : 0.4 });
      });

      // --- the path: slabs behind the collapse front drop into the lava, with a burst
      const fr = front(t);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
      for (let i = 0; i < NSEG; i++) {
        const ss = SEG0 + i * SEG + SEG / 2;
        let y = 0, tilt = 0;
        if (ss < fr) {
          const since = (fr - ss) / 7; // metres behind the front -> seconds-ish
          y = -3.5 * clamp01(since * since);
          tilt = 0.6 * clamp01(since) * (i % 2 ? 1 : -1);
        }
        q.setFromEuler(new THREE.Euler(tilt * 0.4, 0, tilt));
        m.compose(new THREE.Vector3(0, y, -ss), q, sc);
        path.setMatrixAt(i, m);
      }
      path.instanceMatrix.needsUpdate = true;
      lavaTex.offset.set(t * 0.006, -t * 0.02);
      (lava.material as THREE.MeshStandardMaterial).emissiveIntensity = 2 + 0.9 * heat;

      // --- the Furnace: dormant under the lava, rises at km 20, sirens in the evacuation, banks down after
      const fr1 = rise(t);
      furnace.root.position.set(FX, -34 * (1 - fr1) - 1.5, fz);
      furnace.root.visible = fr1 > 0.01 || t < T.wake;
      if (t < T.wake) furnace.root.position.y = -34;
      furnace.update(t, { heat: 0.3 + 0.7 * heat, siren: t > T.evac && !done ? 1 : 0, banked: done ? smooth(T.fin, T.fin + 5, t) : 0, travel: s });
      // blobs: lobbed from the mouth, splash on the path
      BLOBS.forEach((b, i) => {
        const bs = (b as { s?: number }).s!;
        const k = (t - b.t0) / (b.t1 - b.t0);
        const mouth = new THREE.Vector3(FX + 7, 17, fz);
        const land = new THREE.Vector3(b.x, 0.8, -bs);
        blobs[i].visible = k > 0 && k < 1;
        if (blobs[i].visible) blobs[i].position.lerpVectors(mouth, land, k).setY(mouth.y + (land.y - mouth.y) * k + Math.sin(k * Math.PI) * 14);
        splash[2 + i].points.position.copy(land);
        splash[2 + i].update(t - b.t1, k >= 1 && t < b.t1 + 1.2 ? 1 : 0);
      });
      splash[0].update(t, 1);
      splash[1].update(t, 1);
      // the sign turns to RACE STOPPED just after he is through
      const stopped = t > T.fin + 1.2;
      if ((gateSign.map === stopTex) !== stopped) {
        gateSign.map = gateSign.emissiveMap = stopped ? stopTex : finTex;
        gateSign.needsUpdate = true;
      }
      // lava light pools near the camera
      glows.forEach((pl, i) => {
        pl.position.set(-5, 1.5, cam.position.z - 6 - i * 14);
        pl.intensity = 30 + 20 * heat + 8 * Math.sin(t * 5 + i);
      });
      (st0!.skyDome as THREE.Mesh).position.copy(cam.position);
      embers.points.position.set(cam.position.x, 4, cam.position.z - 22);
      embers.update(t, 0.4 + 0.6 * heat, 1);
      ash.points.position.set(cam.position.x, 6, cam.position.z - 20);
      ash.update(t, 1, 0.6);

      // --- grade: heat shimmer, tunnel vision in the meltdown
      g.exposure = 1.0;
      g.saturation = 1.0 - 0.3 * smooth(T.evac, T.fin, t);
      g.contrast = 1.12;
      g.gain = [1.05 + 0.1 * heat, 0.95 - 0.05 * heat, 0.85 - 0.15 * heat];
      g.vignette = 0.45 + 0.4 * smooth(0.6, 1, heat) * (done ? 0.3 : 1);
      g.ca = 0.002 + 0.006 * smooth(0.6, 1, heat);
      g.bloom = 0.35;
      g.grain = 0.05;
      g.flash = 0.35 * BLOBS.reduce((a, b) => a + env(t, b.t1, b.t1 + 0.5, 0.02, 0.4), 0);
      g.letterbox = t < T.cruise || (t > T.wake && t < T.melt) ? 1 : 0;
      g.fade = t < 0.8 ? 1 - smooth(0, 0.8, t) : t > T.end - 0.8 ? smooth(T.end - 0.8, T.end, t) : 0;
      if (tg === 'blob' || tg === 'melt') {
        for (const b of BLOBS) if (t > b.t1 && t < b.t1 + 0.6) cam.position.y += Math.sin(t * 70) * 0.06 * (1 - (t - b.t1) / 0.6);
      }

      // --- HUD
      if (t < T.cruise) eventTag(h, { name: 'RICHMOND RUNFEST MARATHON', date: R.date, t });
      if (tg === 'cruise' && u < 0.5) h.text('FIRST MARATHON  -  42.2 KM', 960, 360, { font: 'head', size: 56, weight: 700, color: COL.white, align: 'center', alpha: env(info.shotT, 0.3, 3.3, 0.3, 0.4), tracking: 12, shadow: true });
      if (t > T.wake + 2.6 && t < T.melt) {
        const a = env(t, T.wake + 2.6, T.melt - 0.1, 0.3, 0.4);
        h.text('KM 20', 1780, 640, { font: 'mono', size: 34, color: COL.amber, align: 'right', alpha: a, tracking: 10 });
        h.text('FURNACE', 1780, 760, { font: 'head', size: 140 * (1 + 0.15 * (1 - smooth(T.wake + 2.6, T.wake + 2.9, t))), weight: 700, color: COL.white, align: 'right', alpha: a, tracking: 12, glow: 20 });
        h.text('The day the course burned.', 1780, 840, { font: 'body', size: 44, weight: 500, color: COL.ui, align: 'right', alpha: a * smooth(T.wake + 3.4, T.wake + 3.9, t) });
      }
      const hud = t > T.cruise + 0.3 && !(t > T.wake && t < T.melt) && t < T.fin + 1 ? smooth(T.cruise + 0.3, T.cruise + 0.8, t) * (1 - smooth(T.fin, T.fin + 1, t)) : 0;
      if (hud > 0) {
        lifeHud(h, { life: 1 - 0.45 * smooth(T.melt, T.fin, t), alpha: hud, hurt: BLOBS.some((b) => t > b.t1 && t < b.t1 + 0.5) ? 0.6 : 0 });
        // HEAT replaces STAMINA
        const hx = 96, hy = 158;
        h.text('HEAT', hx, hy + 18, { font: 'mono', size: 28, color: heat > 0.75 ? COL.red : COL.amber, alpha: hud, tracking: 4, shadow: true });
        h.rect(hx + 90, hy - 4, 440, 26, 'rgba(0,0,0,0.6)', hud);
        const hc = heat > 0.75 ? COL.red : heat > 0.5 ? '#ff7a20' : COL.amber;
        h.rect(hx + 92, hy - 2, 436 * heat, 22, hc, hud * (heat > 0.75 ? 0.65 + 0.35 * Math.sin(t * 12) : 1));
        h.stroke(hx + 90, hy - 4, 440, 26, COL.ui, 2, hud);
        raceClock(h, { T: Tat(K), d: K * 1000, hours: true, pace: splitAt(K), alpha: hud, col: splitAt(K) > 330 ? COL.red : undefined });
        equip(h, { item: t > T.water1 + 0.5 ? 'WATER' : 'NONE', itemSub: t > T.water2 + 0.5 ? 'x2' : t > T.water1 + 0.5 ? 'x1' : '', weapon: 'LEGS', weaponSub: t > T.evac ? 'FAILING' : '', alpha: hud });
        if (t > T.melt) bossHp(h, { name: 'FURNACE', hp: 1, sub: t > T.evac ? 'CANNOT BE BEATEN  -  ESCAPE' : 'THE HEAT', alpha: hud, col: '#ff7a20' });
        h.text(t < T.wake ? 'CRUISE' : t < T.evac ? 'MELTDOWN' : 'EVACUATION', 96, 262, { font: 'head', size: 40, weight: 700, color: t < T.wake ? COL.green : t < T.evac ? COL.amber : COL.red, alpha: hud, tracking: 6, shadow: true });
      }
      if (t > T.cruise + 3.6 && t < T.wake) say(h, t, T.cruise + 3.6, T.wake - 0.2, 'TEMPO', 'Halfway comes later than you think.');
      if (t > T.melt && t < T.water1 - 0.6) h.text('HEAT RISING', 960, 200, { font: 'head', size: 60, weight: 700, color: '#ff7a20', align: 'center', alpha: env(t, T.melt, T.water1 - 0.6, 0.3, 0.3), tracking: 16, shadow: true });
      for (const tw of [T.water1, T.water2]) {
        if (t > tw - 0.9 && t < tw + 0.6) prompt(h, { b: 'O', text: 'DRINK', t: t - tw + 0.9, ok: t > tw, y: 780 });
        if (t > tw + 0.5) itemGet(h, 'WATER', t - tw - 0.5, 'heat down');
      }
      BLOBS.forEach((b) => {
        const bs = (b as { s?: number }).s!;
        if (t > b.t0 && t < b.t1) {
          const [sx, sy] = toScreen(new THREE.Vector3(b.x, 2.5, -bs), cam);
          alertMark(h, sx, sy, t - b.t0);
          if (t > b.t0 + 0.3) prompt(h, { b: 'X', text: 'DODGE', t: t - b.t0 - 0.3, ok: t > b.t1 - 0.8, y: 780 });
        }
        if (t > b.t1 && t < b.t1 + 1.4) popup(h, 'MISS', 1260, 560, t - b.t1, COL.green, 60);
      });
      if (t > T.crit && t < T.evac) h.text('HEAT CRITICAL', 960, 200, { font: 'head', size: 72, weight: 700, color: COL.red, align: 'center', alpha: 0.55 + 0.45 * Math.sin(t * 10), tracking: 16, glow: 12, shadow: true });
      if (t > T.melt + 1.5 && t < T.evac) h.text(`SPLIT  ${pace(splitAt(K))} /KM`, 960, 290, { font: 'mono', size: 38, color: splitAt(K) > 330 ? COL.red : COL.amber, align: 'center', alpha: 0.9 * env(t, T.melt + 1.5, T.evac, 0.3, 0.3), tracking: 3, shadow: true });
      if (t > T.evac) {
        if (t < T.evac + 3.2) banner(h, 'RACE BEING STOPPED', t - T.evac, { col: COL.red, sub: 'EVACUATE THE COURSE', dur: 3.2 });
        say(h, t, T.evac + 3.4, T.evac + 7.2, 'TEMPO', "They're stopping it behind you. Don't stop.");
        if (t > T.evac + 3.4 && t < T.fin) h.text('OBJECTIVE:  REACH THE FINISH', 1060, 200, { font: 'head', size: 42, weight: 700, color: COL.amber, align: 'center', alpha: env(t, T.evac + 3.4, T.fin, 0.3, 0.3), tracking: 6, shadow: true });
        if (t > T.evac + 7.5 && t < T.fin) h.text(`COURSE COLLAPSING  ${Math.max(0, Math.round(s - front(t)))} M BEHIND`, 1060, 290, { font: 'mono', size: 36, color: COL.red, align: 'center', alpha: 0.7 + 0.3 * Math.sin(t * 8), tracking: 4, shadow: true });
      }
      if (t > T.fin + 1.4 && t < T.res) h.text('ESCAPED', 960, 480, { font: 'head', size: 130, weight: 700, color: COL.amber, align: 'center', alpha: env(t, T.fin + 1.4, T.res, 0.2, 0.4), tracking: 30, glow: 16, shadow: true });
      if (t > T.res) {
        results(h, t - T.res, {
          title: 'MISSION COMPLETE',
          rows: [
            ['FINISH', '3:55:11'],
            ['KM 21', '1:43:32'],
            ['SLOWEST KM', `${pace(Math.max(...R.splits))}  (KM ${R.splits.indexOf(Math.max(...R.splits)) + 1})`],
            ['RELATIVE EFFORT', `${R.relativeEffort}`],
          ],
          codename: 'SALAMANDER',
          rank: '"That was really hard."',
          alpha: 1 - smooth(T.end - 0.8, T.end, t),
        });
      }
    },
    cues,
  });
}
