// CHAPTER 1 opening: LOCKDOWN. Day 53 on the sofa, the news on, and the first boss of the game:
// THE DOOR, which fights with excuses. STRIDE beats it with what he finds in the flat.
// (14.05.2020 is the first run on record; outdoor exercise rules in England eased on 13.05.2020.)
import * as THREE from 'three';
import { SetScene, Actor, V3 } from '../SetScene';
import { Stage, Ctx } from '../core';
import { Runner, Kit } from '../../char/Runner';
import { prop } from '../props';
import { pbr } from '../../engine/assets';
import { COL, env, smooth, clamp01 } from '../../hud/Hud';
import { lifeHud, equip, bossHp, prompt, itemGet, alertMark, banner, popup, projectile } from '../../hud/game';
import { Lamp } from '../bosses/kit';
import { Card, grid } from '../Cards';

export const HOME_KIT: Kit = { singlet: 0x7c8088, shorts: 0x3b4466, socks: 0x8a8d92, shoes: 0x8a8d92, hair: 0x2a1d14 };

// ---------------------------------------------------------------- the flat
const W = 3.2, D = 3.0, H = 2.6;
const DOOR_X = -1.7, SOFA: V3 = [1.3, 0, 1.25], DRAWER: V3 = [-2.72, 0, 0.5], CABINET: V3 = [-2.72, 0, -1.7], WINDOW_Z = -0.6;

interface Flat {
  door: THREE.Group; // hinged leaf (rotation.y opens it)
  flap: THREE.Object3D; // letterbox flap
  eye: Lamp;
  gap: THREE.MeshBasicMaterial; // light leaking round the frame
  outside: THREE.MeshBasicMaterial; // doorway light
  doorLight: THREE.PointLight;
  tvTex: THREE.CanvasTexture;
  tvCanvas: HTMLCanvasElement;
  tvLight: THREE.PointLight;
  stride: Runner;
}

async function buildFlat(st: Stage): Promise<Flat> {
  const s = st.scene;
  s.background = new THREE.Color(0x000000);
  s.fog = null;
  const [floorT, wallT, rugT] = await Promise.all([pbr('laminate_floor_02'), pbr('plastered_wall_02'), pbr('dirty_carpet')]);
  const tile = (t: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }, rx: number, ry: number) => {
    for (const k of ['map', 'normalMap', 'roughnessMap'] as const) {
      t[k] = t[k].clone();
      t[k].repeat.set(rx, ry);
      t[k].needsUpdate = true;
    }
    return t;
  };
  const floorMat = new THREE.MeshStandardMaterial({ ...tile(floorT, 3, 3), roughness: 1 });
  const wallMat = new THREE.MeshStandardMaterial({ ...tile(wallT, 3, 1.2), color: 0xd9d2c4, roughness: 1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * D).rotateX(-Math.PI / 2), floorMat);
  floor.receiveShadow = true;
  s.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, 2 * D).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 1 }));
  ceil.position.y = H;
  s.add(ceil);
  // walls with openings (door in the back wall, window in the right wall), built from strips
  const strip = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    m.castShadow = true;
    s.add(m);
  };
  const dw = 0.98, dh = 2.08;
  // back wall (z = -D), facing +z
  strip(DOOR_X - dw / 2 + W, H, (-W + DOOR_X - dw / 2) / 2, H / 2, -D, 0);
  strip(W - (DOOR_X + dw / 2), H, (DOOR_X + dw / 2 + W) / 2, H / 2, -D, 0);
  strip(dw, H - dh, DOOR_X, dh + (H - dh) / 2, -D, 0);
  // left wall (x = -W) facing +x
  strip(2 * D, H, -W, H / 2, 0, Math.PI / 2);
  // right wall (x = W) facing -x, window 1.5 x 1.3 at z = WINDOW_Z, sill 0.9
  const ww = 1.5, wy0 = 0.9, wy1 = 2.2;
  strip(D + WINDOW_Z - ww / 2, H, W, H / 2, (-D + WINDOW_Z - ww / 2) / 2, -Math.PI / 2);
  strip(D - (WINDOW_Z + ww / 2), H, W, H / 2, (WINDOW_Z + ww / 2 + D) / 2, -Math.PI / 2);
  strip(ww, wy0, W, wy0 / 2, WINDOW_Z, -Math.PI / 2);
  strip(ww, H - wy1, W, wy1 + (H - wy1) / 2, WINDOW_Z, -Math.PI / 2);
  // front wall (z = +D) facing -z
  strip(2 * W, H, 0, H / 2, D, Math.PI);
  // skirting boards
  const skirt = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 });
  for (const [w, x, z, ry] of [[2 * W, 0, -D + 0.01, 0], [2 * D, -W + 0.01, 0, Math.PI / 2], [2 * D, W - 0.01, 0, -Math.PI / 2]] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, 0.02), skirt);
    b.position.set(x, 0.05, z);
    b.rotation.y = ry;
    s.add(b);
  }
  // window: bright day outside (it's a sunny May afternoon), frame and sill
  // the view: a clear May sky over London rooftops
  const vc = document.createElement('canvas');
  vc.width = 512;
  vc.height = 448;
  const vg = vc.getContext('2d')!;
  const sg = vg.createLinearGradient(0, 0, 0, 448);
  sg.addColorStop(0, '#6fa6e0');
  sg.addColorStop(0.7, '#b9d6ef');
  sg.addColorStop(1, '#dfe9f0');
  vg.fillStyle = sg;
  vg.fillRect(0, 0, 512, 448);
  vg.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [cx, cy, r] of [[120, 90, 38], [165, 80, 46], [210, 95, 34], [380, 150, 30], [415, 140, 40]]) {
    vg.beginPath();
    vg.arc(cx, cy, r, 0, Math.PI * 2);
    vg.fill();
  }
  vg.fillStyle = '#5b5550';
  let rx = 0;
  while (rx < 512) {
    const bw = 50 + ((rx * 7919) % 70), bh = 90 + ((rx * 104729) % 120);
    vg.fillRect(rx, 448 - bh, bw, bh);
    vg.fillStyle = '#4a4540';
    vg.fillRect(rx + bw * 0.2, 448 - bh - 20, 14, 20);
    vg.fillStyle = rx % 2 ? '#5b5550' : '#686058';
    rx += bw;
  }
  vg.fillStyle = '#3f6a34';
  vg.beginPath();
  vg.arc(90, 430, 80, 0, Math.PI * 2);
  vg.arc(160, 440, 60, 0, Math.PI * 2);
  vg.fill();
  const viewTex = new THREE.CanvasTexture(vc);
  viewTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(ww, wy1 - wy0), new THREE.MeshBasicMaterial({ map: viewTex, toneMapped: false }));
  sky.position.set(W + 0.12, (wy0 + wy1) / 2, WINDOW_Z);
  sky.rotation.y = -Math.PI / 2;
  s.add(sky);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.4 });
  for (const [w, h, y, z] of [[0.06, wy1 - wy0, (wy0 + wy1) / 2, WINDOW_Z], [ww, 0.06, (wy0 + wy1) / 2, WINDOW_Z], [ww + 0.1, 0.05, wy0, WINDOW_Z]] as const) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, w), frameMat);
    f.position.set(W - 0.02, y, z);
    s.add(f);
  }
  // light: sun through the window (shadowed), soft fill, TV glow
  const sun = new THREE.SpotLight(0xfff0d8, 60, 16, 0.55, 0.6, 1.2);
  sun.position.set(W + 3.5, 3.6, WINDOW_Z + 0.8);
  sun.target.position.set(0.2, 0, 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  s.add(sun, sun.target);
  s.add(new THREE.HemisphereLight(0xdfe6ee, 0x3a3026, 0.55));
  const tvLight = new THREE.PointLight(0x7fb0ff, 2.5, 6, 1.5);
  s.add(tvLight);
  // furniture
  const place = async (name: string, x: number, z: number, ry: number, sc = 1, y = 0) => {
    const o = await prop(name);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.scale.setScalar(sc);
    s.add(o);
    return o;
  };
  const cab = await place('modern_wooden_cabinet', 1.3, -D + 0.28, 0);
  // a flat-screen TV on a stand, on the cabinet
  const cb = new THREE.Box3().setFromObject(cab);
  const tv = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.25, metalness: 0.3 });
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.68, 0.05), black);
  bezel.position.y = 0.42;
  bezel.castShadow = true;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.04), black);
  neck.position.y = 0.05;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.015, 0.2), black);
  tv.add(bezel, neck, foot);
  tv.position.set(1.3, cb.max.y, -D + 0.32);
  s.add(tv);
  tv.updateMatrixWorld(true);
  const tb = new THREE.Box3().setFromObject(bezel);
  const screen = document.createElement('canvas');
  screen.width = 1024;
  screen.height = 576;
  const tvTex = new THREE.CanvasTexture(screen);
  tvTex.colorSpace = THREE.SRGBColorSpace;
  const sw = (tb.max.x - tb.min.x) * 0.95, sh = sw * 0.5625;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: tvTex, toneMapped: false }));
  scr.position.set(1.3, (tb.min.y + tb.max.y) / 2, tb.max.z + 0.002);
  s.add(scr);
  tvLight.position.set(1.3, scr.position.y, tb.max.z + 0.6);
  await Promise.all([
    place('sofa_02', SOFA[0], SOFA[2] + 0.35, Math.PI),
    place('coffee_table_round_01', 1.3, 0.15, 0),
    place('drawer_cabinet', DRAWER[0] - 0.2, DRAWER[2], Math.PI / 2),
    place('vintage_wooden_drawer_01', CABINET[0] - 0.22, CABINET[2], Math.PI / 2),
    place('wooden_bookshelf_worn', -W + 0.22, 1.9, Math.PI / 2),
    place('potted_plant_01', W - 0.4, -D + 0.45, 0),
    place('wall_clock', -W + 0.02, 1.9, Math.PI / 2, 1, 1.9),
    place('rubber_boots', DOOR_X + 0.75, -D + 0.25, 0.4),
    place('modern_ceiling_lamp_01', 0.4, 0.3, 0, 1, H),
  ]);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.7).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...tile(rugT, 1.2, 0.9), color: 0x9a8a7a, roughness: 1 }));
  rug.position.set(1.3, 0.004, 0.3);
  rug.receiveShadow = true;
  s.add(rug);

  // ------------------------------------------------ THE DOOR
  const frame = new THREE.MeshStandardMaterial({ color: 0xefeee8, roughness: 0.45 });
  for (const [w, h, x, y] of [[0.08, dh, DOOR_X - dw / 2 - 0.04, dh / 2], [0.08, dh, DOOR_X + dw / 2 + 0.04, dh / 2], [dw + 0.16, 0.08, DOOR_X, dh + 0.04]] as const) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), frame);
    f.position.set(x, y, -D + 0.02);
    f.castShadow = true;
    s.add(f);
  }
  // the light that leaks round the leaf (red while it's the enemy, white when it opens)
  const gap = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const [w, h, x, y] of [[0.02, dh, DOOR_X - dw / 2 + 0.01, dh / 2], [0.02, dh, DOOR_X + dw / 2 - 0.01, dh / 2], [dw, 0.025, DOOR_X, dh - 0.01], [dw, 0.03, DOOR_X, 0.015]] as const) {
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gap);
    g.position.set(x, y, -D - 0.005);
    s.add(g);
  }
  const outside = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, opacity: 1 });
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), outside);
  hole.position.set(DOOR_X, dh / 2, -D - 0.06);
  s.add(hole);
  const door = new THREE.Group(); // hinge on the left edge
  door.position.set(DOOR_X - dw / 2, 0, -D - 0.02);
  s.add(door);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a0f12, roughness: 0.35, metalness: 0.05 });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.01, dh - 0.01, 0.045), leafMat);
  leaf.position.set(dw / 2, dh / 2, 0);
  leaf.castShadow = leaf.receiveShadow = true;
  door.add(leaf);
  for (const [px, py, pw, ph] of [[0.27, 1.55, 0.3, 0.55], [0.71, 1.55, 0.3, 0.55], [0.27, 0.55, 0.3, 0.7], [0.71, 0.55, 0.3, 0.7]] as const) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.02), leafMat);
    p.position.set(px, py, 0.03);
    door.add(p);
  }
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.25 });
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.01), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  slot.position.set(dw / 2, 1.0, 0.026);
  door.add(slot);
  const flap = new THREE.Group();
  flap.position.set(dw / 2, 1.035, 0.035);
  const flapM = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.012), brass);
  flapM.position.y = -0.04;
  flap.add(flapM);
  door.add(flap);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), brass);
  knob.position.set(dw - 0.1, 1.02, 0.05);
  door.add(knob);
  const knocker = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 24), brass);
  knocker.position.set(dw / 2, 1.42, 0.04);
  door.add(knocker);
  const eye = new Lamp(0.018, 0xff2010);
  eye.group.position.set(dw / 2, 1.58, 0.03);
  door.add(eye.group);
  const doorLight = new THREE.PointLight(0xff2a14, 0, 5, 1.6);
  doorLight.position.set(DOOR_X + 0.3, 1.9, -D + 1.6);
  s.add(doorLight);
  const stride = await Runner.create(HOME_KIT);
  s.add(stride.root);
  return { door, flap, eye, gap, outside, doorLight, tvTex, tvCanvas: screen, tvLight, stride };
}

/** the TV: rolling news, lockdown day 53 */
function drawNews(c: HTMLCanvasElement, t: number) {
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 1024, 576);
  grd.addColorStop(0, '#0a2748');
  grd.addColorStop(1, '#123e6b');
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 576);
  // studio: a desk and a silhouette presenter
  g.fillStyle = 'rgba(255,255,255,0.06)';
  for (let i = 0; i < 12; i++) g.fillRect(i * 90 + ((t * 20) % 90), 0, 3, 576);
  g.fillStyle = '#0b1a2c';
  g.beginPath();
  g.ellipse(640, 250, 62, 78, 0, 0, Math.PI * 2);
  g.fill();
  g.fillRect(540, 320, 200, 200);
  g.fillStyle = '#1d4f86';
  g.fillRect(0, 400, 1024, 176);
  // lower third
  g.fillStyle = '#c8102e';
  g.fillRect(40, 392, 250, 56);
  g.fillStyle = '#fff';
  g.font = '700 38px Rajdhani';
  g.fillText('BREAKING', 64, 434);
  g.fillStyle = '#ffffff';
  g.fillRect(40, 448, 944, 74);
  g.fillStyle = '#0a1a2a';
  g.font = '700 50px Rajdhani';
  g.fillText('CORONAVIRUS: LOCKDOWN DAY 53', 64, 502);
  // ticker
  g.fillStyle = '#0a0a0a';
  g.fillRect(0, 522, 1024, 54);
  g.fillStyle = '#ffd24a';
  g.font = '600 36px Rajdhani';
  const tick = 'ENGLAND: UNLIMITED OUTDOOR EXERCISE ALLOWED FROM 13 MAY   -   STAY ALERT   -   KEEP 2 METRES APART   -   ';
  const x = 1024 - ((t * 140) % (g.measureText(tick).width + 1024));
  g.fillText(tick + tick, x, 560);
  g.fillStyle = '#fff';
  g.font = '700 30px Share Tech Mono';
  g.fillText('LIVE', 930, 50);
  g.fillStyle = '#e02020';
  g.beginPath();
  g.arc(912, 40, 9, 0, Math.PI * 2);
  g.fill();
}

/** 3D point -> 1080p screen */
function toScreen(p: THREE.Vector3, cam: THREE.Camera) {
  // the camera may have been moved this frame (after the renderer last updated it)
  cam.updateMatrixWorld();
  const v = p.clone().project(cam);
  return [(v.x + 1) * 960, (1 - v.y) * 540] as const;
}

// ---------------------------------------------------------------- scenes
export function lockdownScenes() {
  let FA: Flat, FB: Flat;
  let actorA: Actor, actorB: Actor;
  const SIT: V3 = [SOFA[0], 0.12, SOFA[2] - 0.05];
  const kitHome = () => {
    FA.stride.materials.Shorts.color.setHex(HOME_KIT.shorts);
    FA.stride.materials.Shoes.color.setHex(HOME_KIT.shoes);
  };

  // A: the establishing cutscene
  const flat = new SetScene({
    id: 'c1-flat',

    shots: [
      { dur: 6, p0: [2.9, 1.75, 2.85], p1: [2.55, 1.6, 2.6], l0: [0.4, 0.9, -1.6], fov: 50, tag: 'wide' },
      { dur: 5.5, p0: [1.3, 1.1, -1.25], p1: [1.3, 1.08, -1.6], l0: [1.3, 1.02, -2.9], fov: 44, tag: 'tv' },
      { dur: 6, p0: [1.25, 1.02, -1.2], p1: [1.28, 1.0, -0.2], l0: [1.3, 0.95, 1.3], fov: 32, tag: 'face' },
      { dur: 7, p0: [0.55, 1.3, 2.3], p1: [0.5, 1.28, 2.0], l0: [-1.7, 1.05, -3], fov: 34, tag: 'door' },
    ],
    build: async (st) => {
      FA = await buildFlat(st);
      actorA = new Actor(FA.stride, [{ t0: 0, t1: 30, clip: 'Sitting_Idle_Loop', loop: true, from: SIT, yaw: Math.PI }]);
    },
    frame: (t, ctx, i) => {
      const h = ctx.hud, g = ctx.r.grade;
      kitHome();
      actorA.update(t, { fatigue: 0.4 });
      drawNews(FA.tvCanvas, t);
      FA.tvTex.needsUpdate = true;
      FA.tvLight.intensity = 2 + Math.sin(t * 7) * 0.6 + Math.sin(t * 13) * 0.3;
      FA.door.rotation.y = 0;
      FA.outside.opacity = 0;
      // the door: a faint red line round the frame in the last shot
      const menace = i.tag === 'door' ? smooth(1, 5, i.shotT) : 0;
      FA.gap.opacity = menace * 0.8;
      FA.eye.level = menace;
      FA.doorLight.intensity = menace * 1.5;
      g.saturation = 0.7;
      g.contrast = 1.05;
      g.gain = [0.96, 0.98, 1.04];
      if (t < 1.2) g.fade = 1 - smooth(0, 1.2, t);
      if (i.tag === 'wide') h.caption(['14.05.2020', 'LONDON', 'LOCKDOWN - DAY 53'], t, 1, env(t, 0.8, 6, 0.3, 0.4));
      if (i.tag === 'face') h.subtitle('...', env(i.shotT, 2, 5, 0.3, 0.3), { speaker: 'STRIDE' });
      if (i.tag === 'door') {
        g.vignette = 0.45;
        g.gain = [1.02, 0.94, 0.94];
      }
    },
    cues: [
      { t: 0, kind: 'amb-city-quiet', dur: 24 },
      { t: 0, kind: 'tv-news', dur: 17 },
      { t: 17.5, kind: 'drone-low', dur: 7 },
      { t: 22.5, kind: 'codec-ring', dur: 2 },
    ],
  });

  // B: THE DOOR
  const S0 = SIT, UP: V3 = [SOFA[0], 0, SOFA[2] - 0.4], MID: V3 = [-0.6, 0, -0.9], FACE: V3 = [DOOR_X + 0.1, 0, -1.9];
  const DR: V3 = [DRAWER[0] + 0.6, 0, DRAWER[2]], CB: V3 = [CABINET[0] + 0.6, 0, CABINET[2]], WIN: V3 = [W - 0.9, 0, WINDOW_Z];
  const HANDLE: V3 = [DOOR_X + 0.2, 0, -D + 0.5];
  // timeline (s)
  const T = { up: 0.5, walk: 2.4, wake: 5.5, intro: 7.2, a1: 10.8, hit1: 11.9, s1: 13.4, get1: 16.4, a2: 18.5, hit2: 19.6, s2: 21, get2: 24.3, a3: 26.2, look: 27.6, rain: 29, a4: 31, hit4: 33.2, mash: 35, open: 40.5, done: 42.5, end: 48 };
  const doorFight = new SetScene({
    id: 'c1-door',

    shots: [
      { dur: T.walk, p0: [2.6, 1.5, 2.6], p1: [2.4, 1.45, 2.4], l0: [1.1, 0.9, 0.6], fov: 44 },
      { dur: T.wake - T.walk, p0: [2.2, 1.6, 2.4], p1: [0.9, 1.55, 1.3], l0: [-1.2, 1.0, -2.2], fov: 44 },
      // the door wakes: low and close
      { dur: T.intro - T.wake, p0: [-1.2, 0.5, -1.4], p1: [-1.35, 0.45, -1.7], l0: [DOOR_X, 1.25, -3], fov: 46, tag: 'wake' },
      { dur: T.a1 - T.intro, p0: [-1.0, 0.3, -1.3], p1: [-1.3, 0.35, -1.6], l0: [DOOR_X, 1.35, -3], fov: 50, tag: 'intro' },
      // fight camera: behind STRIDE, the door in frame
      { dur: T.s1 - T.a1, p0: [0.9, 1.7, 0.9], l0: [-1.4, 0.95, -2.4], fov: 48, tag: 'fight' },
      { dur: T.a2 - T.s1, p0: [-0.4, 1.6, 1.6], p1: [-0.8, 1.5, 1.6], l0: [-2.4, 0.8, 0.2], fov: 48, tag: 'search1' },
      { dur: T.s2 - T.a2, p0: [0.9, 1.7, 0.9], l0: [-1.4, 0.95, -2.4], fov: 48, tag: 'fight' },
      { dur: T.a3 - T.s2, p0: [-0.2, 1.6, 0.3], p1: [-0.5, 1.5, 0.2], l0: [-2.6, 0.9, -1.7], fov: 48, tag: 'search2' },
      { dur: T.look - T.a3, p0: [0.9, 1.7, 0.9], l0: [-1.4, 0.95, -2.4], fov: 48, tag: 'fight' },
      { dur: T.a4 - T.look, p0: [1.0, 1.55, 0.9], p1: [1.3, 1.5, 0.6], l0: [W, 1.5, WINDOW_Z], fov: 44, tag: 'window' },
      { dur: T.mash - T.a4, p0: [0.6, 1.3, 0.2], p1: [0.5, 1.2, 0.0], l0: [-1.6, 1.1, -2.6], fov: 44, tag: 'tomorrow' },
      { dur: T.open - T.mash, p0: [0.3, 1.25, -1.2], p1: [0.1, 1.2, -1.6], l0: [DOOR_X, 1.1, -2.9], fov: 50, shake: 1.2, tag: 'mash' },
      { dur: T.end - T.open, p0: [0.4, 1.3, 0.6], p1: [0.2, 1.25, 0.2], l0: [DOOR_X, 1.2, -3], fov: 46, tag: 'open' },
    ],
    build: async (st) => {
      FB = await buildFlat(st);
      actorB = new Actor(FB.stride, [
        { t0: 0, t1: T.up, clip: 'Sitting_Idle_Loop', loop: true, from: S0, yaw: Math.PI },
        { t0: T.up, t1: T.walk - 0.6, clip: 'Sitting_Exit', from: S0, to: UP, yaw: Math.PI },
        { t0: T.walk - 0.6, t1: T.wake, clip: 'walk', from: UP, to: MID },
        { t0: T.wake, t1: T.hit1, clip: 'Idle_Loop', loop: true, from: MID, yaw: Math.atan2(DOOR_X - MID[0], -D - MID[2]) },
        { t0: T.hit1, t1: T.hit1 + 0.8, clip: 'Hit_Knockback', from: MID, to: [MID[0] + 0.35, 0, MID[2] + 0.45], yaw: Math.atan2(DOOR_X - MID[0], -D - MID[2]) },
        { t0: T.s1, t1: T.s1 + 1.3, clip: 'walk', from: [MID[0] + 0.35, 0, MID[2] + 0.45], to: DR },
        { t0: T.s1 + 1.3, t1: T.get1 + 1.4, clip: 'Chest_Open', from: DR, yaw: -Math.PI / 2 },
        { t0: T.get1 + 1.4, t1: T.a2 + 0.2, clip: 'walk', from: DR, to: MID },
        { t0: T.a2 + 0.2, t1: T.hit2, clip: 'Idle_Loop', loop: true, from: MID, yaw: Math.atan2(DOOR_X - MID[0], -D - MID[2]) },
        { t0: T.hit2, t1: T.hit2 + 0.8, clip: 'Hit_Chest', from: MID, yaw: Math.atan2(DOOR_X - MID[0], -D - MID[2]) },
        { t0: T.s2, t1: T.s2 + 1.2, clip: 'walk', from: MID, to: CB },
        { t0: T.s2 + 1.2, t1: T.get2 + 1.3, clip: 'PickUp_Table', from: CB, yaw: -Math.PI / 2, rate: 0.6 },
        { t0: T.get2 + 1.3, t1: T.a3 + 0.4, clip: 'walk', from: CB, to: MID },
        { t0: T.a3 + 0.4, t1: T.look, clip: 'Idle_Loop', loop: true, from: MID, yaw: Math.atan2(DOOR_X - MID[0], -D - MID[2]) },
        { t0: T.look, t1: T.look + 1.6, clip: 'walk', from: MID, to: WIN },
        { t0: T.look + 1.6, t1: T.a4, clip: 'Idle_Loop', loop: true, from: WIN, yaw: Math.PI / 2 },
        { t0: T.a4, t1: T.hit4, clip: 'walk', from: WIN, to: FACE },
        { t0: T.hit4, t1: T.hit4 + 1.2, clip: 'Hit_Knockback', from: FACE, to: [FACE[0] + 0.3, 0, FACE[2] + 0.4], yaw: Math.PI },
        { t0: T.hit4 + 1.2, t1: T.mash, clip: 'Idle_No_Loop', loop: true, from: [FACE[0] + 0.3, 0, FACE[2] + 0.4], yaw: Math.PI },
        { t0: T.mash, t1: T.mash + 1.4, clip: 'walk', from: [FACE[0] + 0.3, 0, FACE[2] + 0.4], to: HANDLE },
        { t0: T.mash + 1.4, t1: T.open, clip: 'Push_Loop', loop: true, from: HANDLE, yaw: Math.PI },
        { t0: T.open, t1: T.end, clip: 'Idle_Loop', loop: true, from: HANDLE, yaw: Math.PI },
      ]);
    },
    frame: (t, ctx, i) => {
      const h = ctx.hud, g = ctx.r.grade;
      const cam = ctx.r.camera as THREE.PerspectiveCamera;
      actorB.update(t);
      drawNews(FB.tvCanvas, t + 24);
      FB.tvTex.needsUpdate = true;
      FB.tvLight.intensity = 1.6 + Math.sin(t * 7) * 0.5;
      // kit: shorts from the drawer, trainers from the cabinet
      FB.stride.materials.Shorts.color.setHex(t > T.get1 ? 0x17181c : HOME_KIT.shorts);
      FB.stride.materials.Shoes.color.setHex(t > T.get2 ? 0xe4e2dc : HOME_KIT.shoes);
      FB.stride.materials.Socks.color.setHex(t > T.get2 ? 0xeeeeea : HOME_KIT.socks);
      // the door's state
      const awake = smooth(T.wake, T.wake + 1, t);
      const hp = 1 - 0.28 * smooth(T.get1, T.get1 + 0.4, t) - 0.27 * smooth(T.get2, T.get2 + 0.4, t) - 0.2 * smooth(T.rain, T.rain + 0.4, t) - 0.25 * smooth(T.mash + 1.4, T.open, t);
      const rage = (t > T.a4 && t < T.open ? 1 : 0.4) * awake;
      const shaking = t > T.mash + 1.4 && t < T.open ? 1 : t > T.hit4 - 1 && t < T.hit4 ? 0.5 : 0;
      const openU = smooth(T.open, T.open + 1.2, t);
      FB.door.rotation.set(0, -openU * 1.9 + Math.sin(t * 43) * 0.012 * shaking, Math.sin(t * 37) * 0.004 * shaking);
      const fire = [T.a1, T.a2, T.a3, T.a4].some((a) => t > a && t < a + 1.1);
      FB.flap.rotation.x = fire ? -0.9 * Math.abs(Math.sin(t * 18)) : -0.1 * Math.abs(Math.sin(t * 3)) * awake;
      FB.eye.level = t > T.open ? 0 : awake * (0.7 + 0.3 * Math.sin(t * 5));
      FB.gap.color.setHex(t > T.open - 0.2 ? 0xffffff : 0xff3020);
      FB.gap.opacity = t > T.open - 0.2 ? 1 : awake * (0.5 + 0.4 * rage);
      FB.doorLight.color.setHex(t > T.open ? 0xfff4e0 : 0xff2a14);
      FB.doorLight.intensity = t > T.open ? 12 * openU : awake * (0.5 + 1.0 * rage);
      FB.outside.opacity = 1;
      g.saturation = 0.8 - 0.35 * smooth(T.hit4, T.hit4 + 0.5, t) * (1 - smooth(T.mash + 2, T.open, t));
      g.vignette = 0.3 + 0.3 * rage;
      g.exposure = 1 + 1.4 * smooth(T.open + 0.2, T.open + 2.5, t);
      g.bloom = 0.3 + 1.2 * openU;
      g.fade = t < 0.6 ? 1 - smooth(0, 0.6, t) : 0;
      if (t > T.end - 1.2) {
        g.flash = smooth(T.end - 1.2, T.end - 0.1, t);
      }
      // life: excuses hurt
      const life = 1 - 0.25 * smooth(T.hit1, T.hit1 + 0.2, t) - 0.25 * smooth(T.hit2, T.hit2 + 0.2, t) - 0.38 * smooth(T.hit4, T.hit4 + 0.2, t) + 0.3 * smooth(T.open, T.open + 1.5, t);
      const hurt = Math.max(...[T.hit1, T.hit2, T.hit4].map((x) => (t > x && t < x + 0.6 ? 1 - (t - x) / 0.6 : 0)));
      const hudA = smooth(T.up, T.up + 0.6, t) * (i.tag === 'wake' || i.tag === 'intro' ? 0 : 1) * (1 - smooth(T.done + 2, T.done + 3, t));
      h.time = t;
      lifeHud(h, { life, stamina: 1, alpha: hudA, hurt });
      equip(h, { item: t > T.get2 ? 'OLD TRAINERS' : t > T.get1 ? 'OLD SHORTS' : 'NONE', weapon: 'NONE', alpha: hudA });
      if (hudA > 0 && t < T.wake) h.text('OBJECTIVE: GO OUTSIDE', 960, 220, { font: 'head', size: 44, weight: 700, color: COL.ui, align: 'center', alpha: env(t, T.up + 0.4, T.wake, 0.3, 0.3), tracking: 8, shadow: true });
      // the alert and the boss intro
      const stridePos = FB.stride.root.position.clone().add(new THREE.Vector3(0, 2.0, 0));
      if (t > T.wake && t < T.intro) {
        const [sx, sy] = toScreen(new THREE.Vector3(DOOR_X, 1.9, -D), cam);
        alertMark(h, sx, sy, t - T.wake - 0.3);
      }
      if (i.tag === 'intro') {
        const u = i.shotT;
        h.rect(0, 0, 1920, 1080, 'rgba(60,0,0,0.25)', smooth(0, 0.3, u));
        h.text('THE DOOR', 1760, 820, { font: 'head', size: 170, weight: 700, color: COL.white, align: 'right', alpha: smooth(0.4, 0.8, u), tracking: 22, glow: 16, shadow: true });
        h.text('THE LAST EXCUSE', 1760, 900, { font: 'mono', size: 44, color: COL.red, align: 'right', alpha: smooth(1, 1.4, u), tracking: 12, shadow: true });
      }
      bossHp(h, { name: 'THE DOOR', hp, sub: t < T.open ? 'WEAK POINT: ITS EXCUSES' : undefined, alpha: hudA * smooth(T.intro, T.intro + 0.5, t) * (1 - smooth(T.open + 1, T.open + 2, t)), hit: Math.max(...[T.get1, T.get2, T.rain].map((x) => (t > x && t < x + 0.5 ? 1 - (t - x) / 0.5 : 0)), shaking * 0.6) });
      // attacks: excuses fired through the letterbox
      const mouth = toScreen(new THREE.Vector3(DOOR_X, 1.0, -D + 0.05), cam);
      const target = toScreen(stridePos.clone().add(new THREE.Vector3(0, -0.6, 0)), cam);
      const shoot = (s: string, t0: number, hitAt: number, size = 1) => {
        const u = (t - t0) / (hitAt - t0);
        if (u > 0 && u < 1.2) {
          projectile(h, s, mouth[0], mouth[1], target[0], target[1], u);
          if (size > 1 && u > 0 && u < 1) h.rect(0, 0, 1920, 1080, 'rgba(120,0,0,0.12)', 1);
        }
      };
      shoot('NO SHORTS.', T.a1, T.hit1);
      shoot('NO RUNNING SHOES.', T.a2, T.hit2);
      shoot('IT MIGHT RAIN.', T.a3, T.a3 + 1.1);
      shoot('TOMORROW.', T.a4 + 0.4, T.hit4, 2);
      for (const [x, s, c] of [[T.hit1, '-25', COL.red], [T.hit2, '-25', COL.red], [T.hit4, '-38', COL.red]] as const) if (t > x) popup(h, s, target[0] + 90, target[1] - 40, t - x, c);
      // counters
      if (t > T.s1 - 0.4 && t < T.get1) prompt(h, { b: 'T', text: 'SEARCH', t: t - (T.s1 - 0.4), y: 780 });
      if (t > T.get1) itemGet(h, 'OLD SHORTS', t - T.get1, 'Bottom drawer. They will do.');
      if (t > T.get1 && t < T.get1 + 1.4) popup(h, 'COUNTERED', 960, 520, t - T.get1, COL.green, 70);
      if (t > T.s2 - 0.4 && t < T.get2) prompt(h, { b: 'T', text: 'SEARCH', t: t - (T.s2 - 0.4), y: 780 });
      if (t > T.get2) itemGet(h, 'OLD TRAINERS', t - T.get2, 'Not running shoes. They will do.');
      if (t > T.get2 && t < T.get2 + 1.4) popup(h, 'COUNTERED', 960, 520, t - T.get2, COL.green, 70);
      if (t > T.look - 0.3 && t < T.rain) prompt(h, { b: 'O', text: 'LOOK OUTSIDE', t: t - (T.look - 0.3), y: 780 });
      if (t > T.rain && t < T.a4) h.text("IT'S NOT RAINING.", 960, 540, { font: 'head', size: 90, weight: 700, color: COL.green, align: 'center', alpha: env(t, T.rain, T.a4, 0.2, 0.3), tracking: 10, glow: 12, shadow: true });
      if (t > T.hit4 && t < T.mash) {
        // LIFE critical: the codec cuts in
        h.text('TEMPO: Stride! Not tomorrow.', 960, 1000, { font: 'body', size: 50, weight: 600, color: COL.white, align: 'center', alpha: env(t, T.hit4 + 0.5, T.mash, 0.2, 0.2), shadow: true });
      }
      if (t > T.mash && t < T.open) prompt(h, { b: 'X', text: 'NOW.', t: t - T.mash, mash: true, y: 800 });
      if (t > T.open) banner(h, 'THE DOOR', t - T.open - 0.6, { col: COL.white, sub: 'DEFEATED', dur: 3.2 });
      if (t > T.done + 1.2) h.text('OBJECTIVE COMPLETE: GO OUTSIDE', 960, 560, { font: 'head', size: 60, weight: 700, color: '#10202a', align: 'center', alpha: env(t, T.done + 1.2, T.end, 0.3, 0.3), tracking: 8 });
      void clamp01;
    },
    cues: [
      { t: 0, kind: 'amb-city-quiet', dur: 48 },
      { t: T.wake + 0.3, kind: 'alert' },
      { t: T.intro, kind: 'boss-intro' },
      { t: T.intro + 1, kind: 'music', id: 'door', dur: T.open - T.intro },
      ...[T.a1, T.a2, T.a3, T.a4 + 0.4].map((x) => ({ t: x, kind: 'letterbox' })),
      ...[T.hit1, T.hit2, T.hit4].map((x) => ({ t: x, kind: 'hit-dmg' })),
      { t: T.s1 - 0.4, kind: 'select' },
      { t: T.get1, kind: 'item-get' },
      { t: T.s2 - 0.4, kind: 'select' },
      { t: T.get2, kind: 'item-get' },
      { t: T.rain, kind: 'countered' },
      { t: T.hit4 + 0.2, kind: 'heartbeat', dur: T.mash - T.hit4 },
      { t: T.mash, kind: 'mash', dur: T.open - T.mash },
      { t: T.open, kind: 'door-open' },
      { t: T.open + 0.8, kind: 'win' },
    ],
  });
  return [flat, doorFight];
}

/** Mission briefing card: operation, objective and intel, typed on over a tactical grid */
export function briefing(id: string, o: { op: string; objective: string; intel: string[]; enemy?: string; dur?: number }) {
  const dur = o.dur ?? 8;
  return new Card({
    id,
    dur,
    draw: (t, h) => {
      const a = env(t, 0, dur, 0.4, 0.6);
      grid(h, a * 0.6);
      h.text('MISSION BRIEFING', 180, 220, { font: 'mono', size: 36, color: COL.uiDim, alpha: a, tracking: 10 });
      h.text('OPERATION', 180, 320, { font: 'mono', size: 32, color: COL.ui, alpha: a, tracking: 6 });
      h.text(h.type(o.op, t, 0.4, 24), 180, 400, { font: 'head', size: 92, weight: 700, color: COL.white, alpha: a, tracking: 10, glow: 8 });
      h.text('OBJECTIVE', 180, 500, { font: 'mono', size: 32, color: COL.ui, alpha: a * smooth(1.2, 1.5, t), tracking: 6 });
      h.text(h.type(o.objective, t, 1.4, 24), 180, 570, { font: 'head', size: 64, weight: 700, color: COL.amber, alpha: a, tracking: 6 });
      o.intel.forEach((l, i) => h.text(h.type('- ' + l, t, 2.6 + i * 0.9, 34), 180, 670 + i * 60, { font: 'body', size: 44, weight: 600, color: COL.white, alpha: a }));
      if (o.enemy) {
        h.text('ENEMY', 1740, 320, { font: 'mono', size: 32, color: COL.red, align: 'right', alpha: a * smooth(4, 4.3, t), tracking: 6 });
        h.text(o.enemy, 1740, 400, { font: 'head', size: 72, weight: 700, color: COL.red, align: 'right', alpha: a * smooth(4.3, 4.8, t), tracking: 8, glow: 10 });
      }
    },
    cues: [{ t: 0.4, kind: 'type', dur: 1 }, { t: 1.4, kind: 'type', dur: 1 }, { t: 2.6, kind: 'type', dur: 2 }, ...(o.enemy ? [{ t: 4.3, kind: 'alert' }] : [])],
  });
}

export { toScreen };
