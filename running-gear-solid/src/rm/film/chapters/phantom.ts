// BOSS: PHANTOM 1:30 (two encounters). Gothic horror: a fog-bound Victorian street at night, gas
// lamps, a churchyard, a canal bridge. The Phantom rises from a grave marked 1:30:00 and runs at
// exactly 1:30 half-marathon pace for the whole race; it is only really visible through PACE GOGGLES.
//
// Every gap on screen comes from the real km splits (Hackney Half, GPS 21.35 km) against a
// 1:30:00 pacer spread over the same distance:
//   2023: STRIDE starts ahead (up to 19 s at km 4); it hunts him down, catches him at ~km 9.5, passes
//         through him and disappears ahead into the fog. 1:35:30. PHANTOM ESCAPED.
//   2024: it leads for 3 km (STRIDE tails it, inside its light), he overtakes at ~km 3.7 and never
//         sees it again: 59 s clear at the line. 1:29:01. It screams and dissolves. SUB 1:30.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SetScene, SetShot } from '../SetScene';
import { Runner, STRIDE_KIT } from '../../char/Runner';
import { metal, box, cyl, Particles, Lamp, haloTex } from '../bosses/kit';
import { pbr } from '../../engine/assets';
import { COL, env, smooth, clamp01, fmt, pace } from '../../hud/Hud';
import { lifeHud, equip, bossHp, prompt, banner, popup, radar, results, itemGet } from '../../hud/game';
import { raceClock, eventTag, stamp } from '../../hud/widgets';
import { Ghost } from '../fx';
import { PHANTOM_2023, PHANTOM_2024 } from '../../../data/activities';
import type { Cue } from '../core';

type V3 = [number, number, number];

/** race data: time at GPS km, and the gap to a 1:30 pacer over the same distance (+ = behind it) */
function raceData(P: typeof PHANTOM_2023) {
  const cum = [0];
  for (const s of P.splits) cum.push(cum[cum.length - 1] + s);
  const full = P.splits.length; // whole km
  const Tat = (km: number) => {
    if (km <= 0) return 0;
    if (km >= P.distanceKm) return P.timeSec;
    if (km >= full) return cum[full] + ((km - full) / (P.distanceKm - full)) * (P.timeSec - cum[full]);
    const k = Math.floor(km);
    return cum[k] + (km - k) * P.splits[k];
  };
  const pacer = 5400 / P.distanceKm;
  const gap = (km: number) => Tat(km) - km * pacer;
  /** first km where the gap changes sign between a and b */
  const cross = (a: number, b: number) => {
    for (let km = a; km < b; km += 0.005) if (Math.sign(gap(km)) !== Math.sign(gap(km + 0.005))) return km + 0.0025;
    return b;
  };
  return { Tat, gap, cross, cum };
}

/** piecewise-linear map from film time to race km */
function kmMap(keys: [number, number][]) {
  return (t: number) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, k0] = keys[i - 1], [t1, k1] = keys[i];
        return k0 + ((t - t0) / (t1 - t0)) * (k1 - k0);
      }
    }
    return keys[keys.length - 1][1];
  };
}

// ---------------------------------------------------------------------------------------------
// the set: a straight cobbled street running to -z; STRIDE's distance s puts him at z = -s

interface Town {
  lamps: { s: number; x: number; lamp: Lamp; pool: THREE.Mesh; on: number }[];
  lights: THREE.PointLight[];
  wisps: Particles;
  moon: THREE.Group;
}

const LAMP_COL = 0xffb060;
/** its grave: x, z, facing (the epitaph looks at the churchyard camera); it rises on the plot in front */
const GRAVE: V3 = [-10.5, 4.5, -0.62];
const RISE = [GRAVE[0] + 1.4 * Math.sin(GRAVE[2]), GRAVE[1] + 1.4 * Math.cos(GRAVE[2])];
const GRAVE_CAM: V3 = [-13.8, 0.5, 9.4];

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

async function buildTown(scene: THREE.Scene, o: { s0: number; s1: number; bridge: [number, number]; finish?: number; seed: number }): Promise<Town> {
  const rnd = (() => {
    let x = o.seed * 9301 + 49297;
    return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  })();
  const [cob, pave, brick, slate, stone, mud] = await Promise.all([pbr('cobblestone_floor_08'), pbr('brick_pavement_02'), metal('brick', { tint: 0x6a5a52 }), metal('stone', { tint: 0x55585e }), metal('stone', { tint: 0x8a8a86 }), pbr('brown_mud_leaves_01')]);
  const rep = (t: { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }, u: number, v: number) => {
    for (const k of ['map', 'normalMap', 'roughnessMap'] as const) {
      t[k] = t[k].clone();
      t[k].wrapS = t[k].wrapT = THREE.RepeatWrapping;
      t[k].repeat.set(u, v);
      t[k].needsUpdate = true;
    }
    return t;
  };
  const L = o.s1 - o.s0, zc = -(o.s0 + o.s1) / 2;
  const [b0, b1] = o.bridge;
  const onBridge = (s: number) => s > b0 - 4 && s < b1 + 4;
  // road (wet cobbles) and pavements
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, L).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...rep(cob, 3, L / 3), color: 0x8c8a88, roughness: 0.55 }));
  road.position.set(0, 0, zc);
  road.receiveShadow = true;
  scene.add(road);
  for (const sx of [-1, 1]) {
    const pv = new THREE.Mesh(new THREE.PlaneGeometry(2.6, L).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...rep(pave, 1, L / 2.6), color: 0x77716c, roughness: 0.7 }));
    pv.position.set(sx * 5.8, 0.12, zc);
    pv.receiveShadow = true;
    scene.add(pv);
    const kerb = box(0.25, 0.14, L, stone, 2, 0);
    kerb.position.set(sx * 4.5, 0.07, zc);
    scene.add(kerb);
  }
  // terraces: instanced bodies, roofs, chimneys, windows (a few lit), doors
  const bodyG = box(7, 10, 6, brick, 3, 0).geometry;
  const roofG = new THREE.CylinderGeometry(0.01, 4.6, 3.2, 4, 1).rotateY(Math.PI / 4).scale(1.08, 1, 0.92);
  const chimG = box(0.9, 2.2, 0.9, brick, 2, 0).geometry;
  const winG = new THREE.PlaneGeometry(1.1, 1.8);
  const doorG = new THREE.PlaneGeometry(1.2, 2.4);
  const houses: THREE.Matrix4[] = [], roofs: THREE.Matrix4[] = [], chims: THREE.Matrix4[] = [], winLit: THREE.Matrix4[] = [], winDark: THREE.Matrix4[] = [], doors: THREE.Matrix4[] = [];
  const m4 = (x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));
  for (const side of [-1, 1]) {
    for (let s = o.s0; s < o.s1; s += 6) {
      if (onBridge(s)) continue;
      // the churchyard takes the left side around the start
      if (side < 0 && s > -40 && s < 36) continue;
      const hgt = 8.5 + rnd() * 3, z = -s - 3, x = side * (7.1 + 3.5);
      houses.push(m4(x, hgt / 2, z, 0, 1, hgt / 10, 1));
      roofs.push(m4(x, hgt + 1.6, z, 0, 1, 1, 1));
      if (rnd() < 0.7) chims.push(m4(x + side * 1.5, hgt + 2.4, z + (rnd() - 0.5) * 3));
      for (const fy of [1.6, 4.9, 7.8]) {
        if (fy > hgt - 1.2) continue;
        for (const dz of fy < 2 ? [1.6] : [-1.4, 1.6]) {
          const lit = rnd() < 0.08;
          (lit ? winLit : winDark).push(m4(side * 7.09, fy + 0.9, z + dz, side < 0 ? Math.PI / 2 : -Math.PI / 2));
        }
      }
      doors.push(m4(side * 7.09, 1.3, z - 1.2, side < 0 ? Math.PI / 2 : -Math.PI / 2));
    }
  }
  const inst = (g: THREE.BufferGeometry, m: THREE.Material, list: THREE.Matrix4[], shadow = true) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(g, m, list.length);
    list.forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = shadow;
    im.receiveShadow = true;
    scene.add(im);
  };
  inst(bodyG, brick, houses);
  inst(roofG, new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.7 }), roofs);
  inst(chimG, brick, chims);
  inst(winG, new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.15, metalness: 0.4 }), winDark, false);
  inst(winG, new THREE.MeshStandardMaterial({ color: 0x1a0e04, emissive: 0xff9a40, emissiveIntensity: 0.9, roughness: 0.5 }), winLit, false);
  inst(doorG, new THREE.MeshStandardMaterial({ color: 0x1b1412, roughness: 0.6 }), doors, false);

  // gas lamps, alternating sides every 22 m
  const iron = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.5, metalness: 0.6 });
  const postG = mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.11, 3.6, 10).translate(0, 1.8, 0),
    new THREE.CylinderGeometry(0.2, 0.24, 0.5, 10).translate(0, 0.25, 0),
    new THREE.BoxGeometry(0.62, 0.06, 0.62).translate(0, 3.62, 0),
    new THREE.ConeGeometry(0.42, 0.4, 4).rotateY(Math.PI / 4).translate(0, 4.5, 0),
    new THREE.BoxGeometry(0.9, 0.05, 0.05).translate(0, 3.35, 0),
  ]);
  const glassM = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: LAMP_COL, emissiveIntensity: 0, transparent: true, opacity: 0.85, roughness: 0.2 });
  const poolTex = haloTex();
  const lamps: Town['lamps'] = [];
  let k = 0;
  for (let s = o.s0 + 6; s < o.s1; s += 22, k++) {
    const side = k % 2 ? 1 : -1, x = side * 4.9;
    const post = new THREE.Mesh(postG, iron);
    post.position.set(x, 0, -s);
    post.castShadow = true;
    scene.add(post);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.5), glassM.clone());
    glass.position.set(x, 3.97, -s);
    scene.add(glass);
    const lamp = new Lamp(0.14, LAMP_COL);
    lamp.group.position.set(x, 3.97, -s);
    scene.add(lamp.group);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: poolTex, color: LAMP_COL, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    pool.position.set(x * 0.7, 0.16, -s);
    scene.add(pool);
    (lamp as unknown as { glass: THREE.Mesh }).glass = glass;
    lamps.push({ s, x, lamp, pool, on: 1 });
  }
  // four real lights, handed to the lamps nearest the action each frame
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < 4; i++) {
    const pl = new THREE.PointLight(LAMP_COL, 0, 20, 1.6);
    scene.add(pl);
    lights.push(pl);
  }

  // the churchyard (left of the start): railings, headstones, crosses, dead trees, the church
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(40, 76).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ ...rep(mud, 8, 15), color: 0x6e6a60 }));
  yard.position.set(-27, 0.02, -(-40 + 36) / 2);
  yard.receiveShadow = true;
  scene.add(yard);
  const bars: THREE.Matrix4[] = [];
  for (let z = -36; z < 40; z += 0.28) if (Math.abs(z - 3.4) > 0.8) bars.push(m4(-7.3, 0.85, z));
  inst(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 5), iron, bars, false);
  for (const y of [0.25, 1.55]) {
    const rail = box(0.06, 0.06, 76, iron, 2, 0);
    rail.position.set(-7.3, y, 2);
    scene.add(rail);
  }
  const spikes: THREE.Matrix4[] = bars.map((b) => b.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.92, 0)));
  inst(new THREE.ConeGeometry(0.05, 0.16, 5), iron, spikes, false);
  const stones: THREE.Matrix4[] = [];
  const stoneG = mergeGeometries([new THREE.BoxGeometry(0.75, 1.0, 0.18).translate(0, 0.5, 0), new THREE.CylinderGeometry(0.375, 0.375, 0.18, 14, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 1.0, 0)]);
  for (let row = 0; row < 6; row++) {
    for (let z = -34; z < 34; z += 2.6 + rnd()) {
      const x = -10 - row * 3.2 + (rnd() - 0.5);
      if (x > -14.5 && x < -8.5 && z > 2.5 && z < 10.5) continue; // leave room for its grave (and the camera)
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.25, Math.PI / 2 + (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.25));
      const sc = 0.7 + rnd() * 0.6;
      stones.push(new THREE.Matrix4().compose(new THREE.Vector3(x, -0.05, z), q, new THREE.Vector3(sc, sc, sc)));
    }
  }
  inst(stoneG, stone, stones);
  // the Phantom's grave
  const epitaph = canvasTex(256, 384, (g) => {
    g.fillStyle = '#7d7d78';
    g.fillRect(0, 0, 256, 384);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 256, Math.random() * 384, 2, 2);
    g.fillStyle = '#222';
    g.textAlign = 'center';
    g.font = '700 30px serif';
    g.fillText('HERE LIES', 128, 120);
    g.font = '700 58px serif';
    g.fillText('1:30:00', 128, 200);
    g.font = 'italic 26px serif';
    g.fillText('it never tires', 128, 262);
    g.fillText('it never slows', 128, 296);
  });
  const grave = new THREE.Group();
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.7, 0.25), [stone, stone, stone, stone, new THREE.MeshStandardMaterial({ map: epitaph, roughness: 0.9 }), stone]);
  head.position.y = 0.85;
  head.castShadow = true;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.25, 20, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), stone);
  cap.position.y = 1.7;
  grave.add(head, cap);
  const plot = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1c1712, roughness: 1 }));
  plot.position.set(0, 0.03, 1.4);
  grave.add(plot);
  grave.position.set(GRAVE[0], 0, GRAVE[1]);
  grave.rotation.y = GRAVE[2];
  scene.add(grave);
  // crosses
  const crossG = mergeGeometries([new THREE.BoxGeometry(0.16, 2.2, 0.16).translate(0, 1.1, 0), new THREE.BoxGeometry(0.9, 0.16, 0.16).translate(0, 1.6, 0)]);
  const crosses: THREE.Matrix4[] = [];
  for (let i = 0; i < 9; i++) crosses.push(m4(-12 - rnd() * 16, 0, -30 + rnd() * 60, rnd() * 3, 1, 0.8 + rnd() * 0.6, 1));
  inst(crossG, stone, crosses);
  // dead trees: a trunk and a fan of bare branches
  const bark = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 1 });
  const treeGs: THREE.BufferGeometry[] = [];
  for (const [tx, tz, th] of [[-13, 14, 9], [-22, -14, 11], [-9.5, -24, 8], [-30, 20, 12]] as V3[]) {
    treeGs.push(new THREE.CylinderGeometry(0.18, 0.45, th, 7).translate(tx, th / 2, tz));
    for (let b = 0; b < 9; b++) {
      const len = 2 + rnd() * 3.5, y = th * (0.45 + rnd() * 0.5), a = rnd() * Math.PI * 2, tilt = 0.5 + rnd() * 0.7;
      const g = new THREE.CylinderGeometry(0.03, 0.12, len, 5).translate(0, len / 2, 0);
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tilt * Math.cos(a), 0, tilt * Math.sin(a))));
      g.translate(tx, y, tz);
      treeGs.push(g);
    }
  }
  const trees = new THREE.Mesh(mergeGeometries(treeGs), bark);
  trees.castShadow = true;
  scene.add(trees);
  // the church: nave, tower, spire, and three windows with a faint red glow
  const church = new THREE.Group();
  const nave = box(14, 11, 30, stone, 3, 0.01);
  nave.position.set(-34, 5.5, -2);
  const navRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 9, 7, 4, 1).rotateY(Math.PI / 4).scale(0.8, 1, 1.75), new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.8 }));
  navRoof.position.set(-34, 14.5, -2);
  const tower = box(7, 24, 7, stone, 3, 0.01);
  tower.position.set(-32, 12, 16);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.6, 18, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0x1f2226, roughness: 0.8 }));
  spire.position.set(-32, 33, 16);
  church.add(nave, navRoof, tower, spire);
  const glowWin = new THREE.MeshStandardMaterial({ color: 0x100404, emissive: 0xff3a20, emissiveIntensity: 0.7 });
  for (let i = 0; i < 3; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 4.2), glowWin);
    w.position.set(-26.95, 5.6, -10 + i * 8);
    w.rotation.y = Math.PI / 2;
    church.add(w);
  }
  const clockFace = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), new THREE.MeshStandardMaterial({ color: 0x1a1a14, emissive: 0xf0e0b0, emissiveIntensity: 0.35 }));
  clockFace.position.set(-28.45, 19, 16);
  clockFace.rotation.y = Math.PI / 2;
  church.add(clockFace);
  scene.add(church);

  // the canal bridge: parapets, black water, embankments, a couple of warehouses
  const deck = box(13, 1.6, b1 - b0 + 8, stone, 3, 0);
  deck.position.set(0, -0.8, -(b0 + b1) / 2);
  scene.add(deck);
  for (const sx of [-1, 1]) {
    const par = box(0.55, 1.15, b1 - b0 + 8, stone, 2, 0.05);
    par.position.set(sx * 6.4, 0.58, -(b0 + b1) / 2);
    scene.add(par);
    for (const bz of [b0 - 4, b1 + 4]) {
      const emb = box(60, 4, 1.5, stone, 3, 0);
      emb.position.set(sx * 36.5, -2, -bz);
      scene.add(emb);
    }
    const wh = box(22, 16, 30, brick, 3, 0.01);
    wh.position.set(sx * 34, 5, -(b0 + b1) / 2 - 60);
    scene.add(wh);
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(160, b1 - b0 + 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x05080a, roughness: 0.05, metalness: 0.9 }));
  water.position.set(0, -3.2, -(b0 + b1) / 2);
  scene.add(water);

  // start and finish: wrought-iron arches with hanging signs
  const archAt = (s: number, text: string) => {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const col = cyl(0.14, 0.18, 6, iron, 10);
      col.position.set(sx * 4.3, 3, 0);
      g.add(col);
    }
    const top = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.1, 8, 32, Math.PI), iron);
    top.position.y = 6;
    g.add(top);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1), new THREE.MeshStandardMaterial({ map: canvasTex(512, 128, (c) => {
      c.fillStyle = '#16100c';
      c.fillRect(0, 0, 512, 128);
      c.strokeStyle = '#c9a24a';
      c.lineWidth = 6;
      c.strokeRect(8, 8, 496, 112);
      c.fillStyle = '#e8d8a8';
      c.font = '700 70px serif';
      c.textAlign = 'center';
      c.fillText(text, 256, 90);
    }), emissive: 0xffffff, emissiveIntensity: 0.25, side: THREE.DoubleSide }));
    sign.position.y = 5.2;
    g.add(sign);
    g.position.z = -s;
    scene.add(g);
  };
  archAt(-1.5, 'START');
  if (o.finish !== undefined) archAt(o.finish, 'FINISH');

  // the moon, fog wisps
  const moon = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(14, 40), new THREE.MeshBasicMaterial({ color: 0xdde6f0, fog: false }));
  const mh = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0x9fb4d0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  mh.scale.setScalar(120);
  moon.add(disc, mh);
  scene.add(moon);
  const wisps = new Particles({ n: 90, box: [26, 1.4, 60], vel: [0.6, 0.05, 0.4], life: 9, size: 7, color: 0x9aa6b4, opacity: 0.12, swirl: 0.6, grow: 0.6, seed: o.seed + 3 });
  scene.add(wisps.points);
  return { lamps, lights, wisps, moon };
}

/** point the four real lights at the lit lamps nearest z; lamp states drawn */
function lightTown(town: Town, t: number, sFocus: number) {
  const near = town.lamps.filter((l) => l.on > 0.02).sort((a, b) => Math.abs(a.s - sFocus - 8) - Math.abs(b.s - sFocus - 8));
  town.lights.forEach((pl, i) => {
    const l = near[i];
    if (!l) return void (pl.intensity = 0);
    pl.position.set(l.x * 0.9, 3.8, -l.s);
    pl.intensity = 26 * l.on;
  });
  for (const l of town.lamps) {
    const flick = 0.93 + 0.07 * Math.sin(t * 23 + l.s) * Math.sin(t * 7.3 + l.s * 0.3);
    l.lamp.level = l.on * flick * 0.8;
    (l.pool.material as THREE.MeshBasicMaterial).opacity = 0.32 * l.on * flick;
    ((l.lamp as unknown as { glass: THREE.Mesh }).glass.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6 * l.on * flick;
  }
  town.wisps.update(t, 1);
}

/** a lamp dying: a few fast flickers, then out */
const dying = (u: number) => (u <= 0 ? 1 : u >= 0.6 ? 0 : [1, 0.1, 0.8, 0, 0.5, 0.05, 0][Math.floor(u * 11.6)] ?? 0);
/** a lamp igniting: flares past full, then settles */
const igniting = (u: number) => (u <= 0 ? 0 : u >= 0.5 ? 1 : [0.3, 0, 0.7, 1.6, 1.3][Math.floor(u * 10)] ?? 1);

// ---------------------------------------------------------------------------------------------

export function phantomLevel(enc: 1 | 2) {
  const P = enc === 1 ? PHANTOM_2023 : PHANTOM_2024;
  const R = raceData(P);
  const X_S = 0.9, X_G = -0.9;
  const V = 4.3; // on-screen running speed (m/s)
  let stride: Runner, ghost: Ghost, town: Town, glight: THREE.PointLight, mist: Particles, ash: Particles, dust: Particles;
  let eyes: THREE.Sprite[] = [];

  // --- timeline (film seconds) and film-time -> race-km
  const contactKm = enc === 1 ? R.cross(5, 12) : R.cross(2.5, 6);
  const T = enc === 1
    ? { est: 0, grave: 6, rise: 7.2, name: 9.6, go: 13.4, goggles: 14.4, hunt: 16, gain: 26, ots: 34, pass: 38, contact: 40.2, away: 43, jam: 46, lost: 48, res: 49.5, end: 58 }
    : { est: 0, grave: 6, rise: 7, name: 9, go: 12.4, goggles: 13.2, hunt: 15, gain: 24, ots: 30, pass: 24, contact: 27, away: 40, jam: 99, lost: 99, res: 53, end: 62 };
  const km = enc === 1
    ? kmMap([[T.go, 0], [T.gain, 8], [T.ots, 9.2], [T.pass, contactKm - 0.08], [T.contact, contactKm], [T.away, contactKm + 0.2], [T.res, 13.5]])
    : kmMap([[T.go, 0], [T.pass, contactKm - 0.35], [T.contact, contactKm], [T.ots, 4.4], [T.away, 16], [46, P.distanceKm], [T.end, P.distanceKm]]);
  const FIN_T = enc === 2 ? 46 : 999; // film time STRIDE crosses the line
  // slow motion around the pass
  const rate = (t: number) => 1 - 0.72 * env(t, T.pass + (enc === 1 ? 0.6 : 1.5), T.contact + (enc === 1 ? 2.4 : 1.8), 0.5, 0.6) - (enc === 2 ? 0.55 * env(t, FIN_T - 1.2, FIN_T + 4, 0.8, 1) : 0);
  const N = 3000, dt = T.end / N, TAU = new Float64Array(N + 1);
  for (let i = 1; i <= N; i++) TAU[i] = TAU[i - 1] + rate(i * dt) * dt;
  const tau = (t: number) => {
    const f = Math.min(N, Math.max(0, t / dt)), i = Math.min(N - 1, Math.floor(f));
    return TAU[i] + (TAU[i + 1] - TAU[i]) * (f - i);
  };
  const S = (t: number) => (t < T.go ? 0 : (tau(t) - tau(T.go)) * V);
  const sEnd = S(T.end);
  const sFin = enc === 2 ? S(FIN_T) : undefined;
  const BRIDGE: [number, number] = enc === 1 ? [S(T.ots) - 10, S(T.ots) + 20] : [S(T.ots) + 20, S(T.ots) + 50];
  /** the ghost's distance: STRIDE's plus the real gap, scaled so the fog can hold it */
  const gapSec = (t: number) => R.gap(km(t));
  // (in 2024's last shots it is held closer, at the edge of the fog, so its end can be seen)
  const gapM = (t: number) => Math.max(enc === 1 ? -45 : t >= T.away ? -24 : -40, Math.min(90, gapSec(t) * 2.3));
  const ghostS = (t: number) => (t < T.go ? 0 : S(t) + gapM(t) * smooth(T.go, T.go + 2.5, t) + (enc === 2 ? 3 * (1 - smooth(T.go, T.go + 2.5, t)) : 0));
  const dissolve = (t: number) => (enc === 2 ? smooth(FIN_T + 0.6, FIN_T + 3.4, t) : 0);

  const shots: SetShot[] = (enc === 1
    ? [['est', T.grave], ['grave', T.go], ['go', T.hunt], ['front', T.gain], ['side', T.ots], ['ots', T.pass], ['pass', T.away], ['away', T.res], ['res', T.end]]
    : [['est', T.grave], ['grave', T.go], ['go', T.hunt], ['tail', T.pass], ['overtake', T.ots], ['front', T.away], ['grim', 44], ['finish', 50.5], ['after', T.end]]
  ).map(([tag, t1], i, a) => ({ dur: (t1 as number) - (i ? (a[i - 1][1] as number) : 0), p0: [0, 0, 0] as V3, l0: [0, 0, -1] as V3, tag: tag as string }));

  // the furthest ahead of 1:30 he ever got (whole km, from the splits)
  let bk = 1;
  for (let k = 1; k <= 12; k++) if (R.gap(k) < R.gap(bk)) bk = k;
  const best = `${Math.round(-R.gap(bk))} S AHEAD  (KM ${bk})`;
  const say = (h: import('../../hud/Hud').Hud, t: number, t0: number, t1: number, who: string, text: string) => {
    if (t < t0 || t > t1) return;
    const a = env(t, t0, t1, 0.25, 0.3);
    h.text(`${who}:  ${text}`, 960, 862, { font: 'body', size: 48, weight: 600, color: COL.white, align: 'center', alpha: a, shadow: true });
  };

  const cues: Cue[] = enc === 1
    ? [
        { t: 0, kind: 'wind', dur: T.end },
        { t: 0.5, kind: 'music', id: 'haunt', dur: T.go - 0.5 },
        { t: 2, kind: 'toll' },
        { t: T.rise, kind: 'toll' },
        { t: T.rise + 0.4, kind: 'grave-rise' },
        { t: T.name, kind: 'boss-intro' },
        { t: T.go, kind: 'gun' },
        { t: T.go + 0.2, kind: 'music', id: 'phantom', dur: T.gain - T.go },
        { t: T.goggles + 0.5, kind: 'goggles' },
        { t: T.gain, kind: 'music', id: 'hunted', dur: T.contact - T.gain },
        { t: T.gain, kind: 'heartbeat', dur: T.contact - T.gain + 1 },
        { t: T.contact - 0.3, kind: 'phantom-pass' },
        { t: T.contact, kind: 'hit-dmg' },
        { t: T.jam, kind: 'cctv', dur: 3 },
        { t: T.lost, kind: 'fail' },
        { t: T.res, kind: 'result' },
      ]
    : [
        { t: 0, kind: 'wind', dur: T.end },
        { t: 0.5, kind: 'music', id: 'haunt', dur: T.go - 0.5 },
        { t: T.rise, kind: 'toll' },
        { t: T.rise + 0.4, kind: 'grave-rise' },
        { t: T.name, kind: 'boss-intro' },
        { t: T.go, kind: 'gun' },
        { t: T.go + 0.2, kind: 'music', id: 'phantom2', dur: FIN_T - T.go - 1 },
        { t: T.goggles + 0.5, kind: 'goggles' },
        { t: T.contact - 0.4, kind: 'phantom-pass' },
        { t: T.contact + 0.6, kind: 'win-small' },
        { t: FIN_T - 1, kind: 'silence', dur: 6 },
        { t: FIN_T - 1, kind: 'heartbeat', dur: 3 },
        { t: FIN_T + 0.7, kind: 'scream' },
        { t: FIN_T + 5, kind: 'music', id: 'complete', dur: 7 },
        { t: T.res, kind: 'result' },
      ];

  return new SetScene({
    id: enc === 1 ? 'c3-phantom1' : 'c4-phantom2',
    sky: { hdri: 'qwantani_night_puresky', sun: 0.35, sunColor: 0x9fb4ff, env: 0.22, fog: 0.03, fogColor: 0x171d26, bgIntensity: 0.25, shadowSize: 40 },
    shots,
    build: async (st) => {
      const s = st.scene;
      town = await buildTown(s, { s0: -60, s1: sEnd + 120, bridge: BRIDGE, finish: sFin, seed: enc * 17 });
      town.moon.position.set(-60, 110, -sEnd - 260);
      town.moon.lookAt(0, 0, 0);
      stride = await Runner.create(STRIDE_KIT);
      s.add(stride.root);
      ghost = await Ghost.create(0x5ff3ff, true, 0.2);
      s.add(...ghost.pacer('1:30'));
      ghost.camera = st.camera;
      s.add(ghost.runner.root);
      ghost.runner.root.scale.setScalar(1.08);
      glight = new THREE.PointLight(0x5ff3ff, 0, 16, 1.5);
      s.add(glight);
      mist = new Particles({ n: 120, box: [1.0, 1.6, 1.0], vel: [0, 0.7, 1.4], life: 1.3, size: 0.45, color: 0x5ff3ff, opacity: 0.2, additive: true, swirl: 1.5, grow: 1.2, seed: 91 });
      s.add(mist.points);
      ash = new Particles({ n: 500, box: [1.4, 2, 1.4], vel: [0.5, 2.6, 0.5], life: 2.5, size: 0.28, color: 0x9ff8ff, opacity: 1, additive: true, swirl: 3, seed: 92 });
      s.add(ash.points);
      dust = new Particles({ n: 160, box: [1.6, 0.3, 2.4], vel: [0, 1.4, 0], life: 1.8, size: 1.1, color: 0x6a6258, opacity: 0.5, grow: 1.5, seed: 93 });
      dust.points.position.set(RISE[0], 0.1, RISE[1]);
      s.add(dust.points);
      const headB = ghost.runner.bone('Head');
      eyes = [-0.035, 0.035].map((x) => {
        const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        e.scale.setScalar(0.12);
        e.position.set(x, 0.09, 0.09);
        headB?.add(e);
        return e;
      });
    },
    frame: (t, ctx, info) => {
      const h = ctx.hud, g = ctx.r.grade;
      h.time = t;
      const cam = ctx.r.camera as THREE.PerspectiveCamera;
      const tg = info.tag!, u = info.shotT / shots[info.shot].dur;
      const s = S(t), z = -s, ta = tau(t);
      const K = km(t), gp = gapSec(t);
      const finished = enc === 2 && t >= FIN_T;
      const raceT = finished ? P.timeSec : R.Tat(K);

      // --- cameras
      const set = (p: V3, l: V3, fov: number) => {
        cam.position.set(...p);
        cam.lookAt(...l);
        cam.fov = fov;
      };
      const e = (a: number, b: number) => a + (b - a) * (u * u * (3 - 2 * u));
      switch (tg) {
        case 'est':
          set([e(4, 2.2), e(15, 1.7), e(30, 6.5)], [e(0, X_S), e(1, 1.3), e(-40, 0)], 42);
          break;
        case 'grave':
          // low among the headstones: the street and STRIDE beyond, then onto the thing on the plot
          set([e(GRAVE_CAM[0], GRAVE_CAM[0] + 0.4), e(GRAVE_CAM[1], 0.75), e(GRAVE_CAM[2], GRAVE_CAM[2] - 0.6)], [e(-4, RISE[0]), e(1.2, 1.55), e(-2, RISE[1])], 36);
          break;
        case 'go':
          set([X_S + 0.7, 1.55, z + 4.6], [X_S - 0.2, 1.25, z - 8], 46);
          break;
        case 'front':
          set([X_S - 0.8 + Math.sin(t * 0.3) * 0.4, 1.45, z - 5.8], [X_S - 0.3, 1.15, z + 9], enc === 1 ? 40 : 38);
          break;
        case 'side':
          // telephoto from ahead: STRIDE, and the Phantom closing behind him
          set([X_S + 3.2, 1.3, z - 9], [X_S - 0.8, 1.2, z + 6], 30);
          break;
        case 'ots':
          set([X_S + 0.55, 1.72, z - 1.5], [X_S - 0.6, 1.35, z + 6], 52);
          break;
        case 'pass':
          set([X_S + 4.4, 1.2, z - 0.4 - u * 1.2], [X_S - 0.2, 1.15, z - 0.2], 40);
          break;
        case 'away':
        case 'tail':
          set([X_S + 0.7, 1.75, z + 4.4], [X_S - 0.6, 1.3, z - 12], 44);
          break;
        case 'overtake':
          set([X_S + 4, 1.3, z + 0.6], [X_S - 0.5, 1.1, z - 0.8], 38);
          break;
        case 'grim':
          set([X_S - 1.2, 1.1, z - 7.5], [X_S, 1.3, z + 16], 34);
          break;
        case 'finish':
        case 'after': {
          const zf = -sFin!;
          set([1.8, 1.35, zf - 9 - (tg === 'after' ? u * 2 : 0)], [0.6, 1.5, zf + 5], tg === 'after' ? 34 : 40);
          break;
        }
        case 'res':
          set([X_S + 0.7, 1.75, z + 4.4], [X_S - 0.6, 1.3, z - 12], 44);
          break;
      }
      cam.updateProjectionMatrix();

      // --- STRIDE
      stride.root.position.set(X_S, 0, z);
      stride.root.rotation.y = Math.PI;
      const fat = enc === 1 ? 0.25 + 0.6 * smooth(T.contact, T.res, t) : finished ? 0.5 : 0.15;
      if (t < T.go) stride.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] } });
      else if (enc === 2 && t > FIN_T + 2.5) {
        // past the line he slows to a walk and stops
        const s2 = S(FIN_T + 2.5), w = t - FIN_T - 2.5, walkD = 1.1 * Math.min(w, 2.5) - (w > 2.5 ? 0 : 0);
        stride.root.position.z = -(s2 + walkD);
        if (w < 2.5) stride.pose({ phase: (s2 + walkD) / stride.strideAt(1.1), speed: 1.1, fatigue: 0.6 });
        else stride.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] }, fatigue: 0.6 });
      } else stride.pose({ phase: s / stride.strideAt(V), speed: V * smooth(T.go, T.go + 1, t) + 0.1, fatigue: fat, lean: 0.06 });

      // --- the Phantom
      const rise = smooth(T.rise, T.rise + 2.2, t);
      const gs = ghostS(t);
      const gx = enc === 1 ? X_G + (X_S - X_G) * (1 - Math.min(1, Math.abs(gapM(t)) / 5)) : X_G;
      const goggles = smooth(T.goggles + 0.4, T.goggles + 0.9, t) * (enc === 1 ? 1 - smooth(T.lost, T.lost + 1, t) : 1 - smooth(FIN_T - 1, FIN_T, t));
      let gpos: { x: number; y: number; z: number; dx: number; dz: number };
      if (t < T.go) {
        const up = -1.9 * (1 - rise);
        gpos = { x: RISE[0], y: up, z: RISE[1], dx: 0, dz: 1 };
      } else {
        // it steps over the railings onto the road over the first seconds
        const w = smooth(T.go, T.go + 1.6, t);
        gpos = { x: RISE[0] + (gx - RISE[0]) * w, y: 0, z: RISE[1] + (-gs - RISE[1]) * w, dx: 0, dz: -1 };
      }
      ghost.pose(gpos, ta, V);
      if (t < T.go) {
        ghost.runner.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] } });
        // it rises facing us, then turns its head to STRIDE on the start line
        const face = Math.atan2(GRAVE_CAM[0] - gpos.x, GRAVE_CAM[2] - gpos.z), look = Math.atan2(X_S - gpos.x, 0 - gpos.z);
        const k = smooth(T.name - 0.6, T.name + 0.9, t);
        ghost.runner.root.rotation.y = face + (look - face) * k;
      }
      // visibility: a faint shape by eye, bright through the goggles; the fog swallows it at range
      const camDist = cam.position.distanceTo(new THREE.Vector3(gpos.x, 1, gpos.z));
      const fogFade = 1 - smooth(22, 70, camDist) * 0.85;
      const flick = enc === 2 && t > T.away ? 0.6 + 0.4 * Math.abs(Math.sin(t * 17) * Math.sin(t * 5.3)) : 1;
      const base = t < T.rise ? 0 : (0.07 + 0.2 * goggles + (t < T.go ? 0.08 * rise : 0)) * fogFade * flick * (1 - dissolve(t));
      ghost.opacity = base;
      eyes.forEach((e) => ((e.material as THREE.SpriteMaterial).opacity = Math.min(1, base * 5) * (enc === 1 ? 1 : 1 - smooth(T.contact, T.contact + 2, t) * 0.6)));
      glight.position.set(gpos.x, 1.8, gpos.z);
      glight.intensity = 14 * Math.min(1, base * 4) * (t < T.rise ? 0 : 1);
      mist.points.position.set(gpos.x, 1, gpos.z);
      mist.update(ta, base > 0.01 && dissolve(t) < 1 ? 1 : 0, 0.2 * Math.min(1, camDist / 10));
      ash.points.position.set(gpos.x, 0.6, gpos.z);
      ash.update(ta, dissolve(t) > 0 && dissolve(t) < 0.95 ? 1 : 0);
      dust.update(t, env(t, T.rise, T.rise + 2.5, 0.2, 0.6));

      // --- lamps: in 2023 it snuffs them out as it passes; in 2024 they flare as he reaches them
      for (const l of town.lamps) {
        if (enc === 1) {
          // only after it starts gaining: a lamp dies when the Phantom passes it
          let out = 1;
          if (t > T.gain) {
            for (let tt = T.gain; tt <= t; tt += 0.1) {
              if (ghostS(tt) >= l.s - 1) {
                out = dying((t - tt) / 1.2);
                break;
              }
            }
          }
          l.on = out;
        } else {
          let on = t < T.go ? (l.s < 8 ? 1 : 0) : 0;
          if (t >= T.go) {
            if (l.s < 8) on = 1;
            else for (let tt = T.go; tt <= t; tt += 0.1) if (S(tt) + 14 >= l.s) { on = igniting((t - tt) / 1.0); break; }
          }
          l.on = on;
        }
      }
      lightTown(town, ta, s);
      town.wisps.points.position.set(0, 0.8, cam.position.z - 20);


      // --- grade: night; PACE GOGGLES view (green, scanlines); frost at the pass; dawn at the end
      const frost = enc === 1 ? env(t, T.contact - 0.2, T.contact + 2.6, 0.15, 1.2) : 0;
      const dawn = enc === 2 ? smooth(T.away, FIN_T + 3, t) : 0;
      const gv = goggles * (enc === 1 ? 1 : 1 - smooth(T.contact + 1.5, T.contact + 3, t));
      g.exposure = 1.05 + 0.25 * dawn;
      g.saturation = 0.75 - 0.55 * gv - 0.35 * frost + 0.25 * dawn;
      g.gain = [1 - 0.35 * gv - 0.15 * frost + 0.12 * dawn, 1 + 0.25 * gv, 1 - 0.3 * gv + 0.15 * frost - 0.05 * dawn];
      g.lift = [0.0, 0.01 + 0.02 * gv, 0.025];
      g.scan = 0.35 * gv;
      g.grain = 0.05 + 0.08 * gv;
      g.vignette = 0.5 + 0.25 * (enc === 1 ? env(t, T.gain, T.contact + 1, 1, 0.5) : 0);
      g.ca = 0.003 * gv + 0.012 * frost;
      g.bloom = 0.3;
      g.flash = enc === 1 ? 0.3 * env(t, T.contact - 0.05, T.contact + 0.5, 0.05, 0.4) : 0.18 * env(t, FIN_T + 0.6, FIN_T + 2, 0.1, 1);
      g.letterbox = t < T.go ? 1 : enc === 2 && t > FIN_T ? smooth(FIN_T, FIN_T + 1, t) : 0;
      g.fade = t < 0.8 ? 1 - smooth(0, 0.8, t) : t > T.end - 0.8 ? smooth(T.end - 0.8, T.end, t) : 0;
      if (enc === 2) {
        // dawn lifts the fog colour and the moonlight
        const fog = (info.self.stage!.scene.fog as THREE.FogExp2 | null);
        if (fog) {
          fog.color.setRGB(0.09 + 0.3 * dawn, 0.11 + 0.26 * dawn, 0.15 + 0.22 * dawn);
          fog.density = 0.03 - 0.012 * dawn;
        }
      }

      // --- the boss introduction
      if (t > T.name && t < T.go) {
        const a = env(t, T.name, T.go - 0.2, 0.3, 0.4);
        h.text(enc === 1 ? 'ENCOUNTER 01' : 'ENCOUNTER 02', 1780, 640, { font: 'mono', size: 34, color: COL.cyan, align: 'right', alpha: a, tracking: 10 });
        h.text('PHANTOM 1:30', 1780, 760, { font: 'head', size: 130 * (1 + 0.15 * (1 - smooth(T.name, T.name + 0.3, t))), weight: 700, color: COL.white, align: 'right', alpha: a, tracking: 10, glow: 20 });
        h.text(enc === 1 ? 'Runs at exactly 1:30 pace. Never tires. Never slows.' : 'It has waited a year.', 1780, 840, { font: 'body', size: 44, weight: 500, color: COL.ui, align: 'right', alpha: a * smooth(T.name + 0.8, T.name + 1.3, t) });
      }
      if (t < T.grave) eventTag(h, { name: 'HACKNEY HALF', date: P.date, t });

      // --- gameplay HUD
      const hud = t > T.go + 0.3 && t < (enc === 1 ? T.res : FIN_T + 1.5) ? smooth(T.go + 0.3, T.go + 0.8, t) * (enc === 2 ? 1 - smooth(FIN_T + 0.5, FIN_T + 1.5, t) : 1) : 0;
      if (hud > 0) {
        const life = enc === 1 ? 1 - 0.35 * smooth(T.contact, T.contact + 0.3, t) - 0.25 * smooth(T.away, T.res, t) : 1;
        lifeHud(h, { life, stamina: enc === 1 ? 1 - 0.55 * smooth(T.gain, T.res, t) : 0.9 - 0.25 * smooth(T.away, FIN_T, t), alpha: hud, hurt: enc === 1 && t > T.contact && t < T.contact + 0.8 ? 1 : 0 });
        const gogOn = t > T.goggles + 0.4;
        equip(h, { item: gogOn && goggles > 0.5 ? 'PACE GOGGLES' : 'NONE', itemSub: gogOn && goggles > 0.5 ? 'ON' : '', weapon: enc === 1 ? 'HOPE' : 'EVEN PACE', weaponSub: enc === 1 ? 'WEAK' : '4:02 - 4:19', alpha: hud });
        raceClock(h, { T: raceT, d: K * 1000, hours: true, pace: P.splits[Math.min(P.splits.length - 1, Math.floor(K))], alpha: hud });
        // the gap to the Phantom, from the real splits
        const ahead = gp <= 0;
        const pa = hud * smooth(T.goggles + 3.7, T.goggles + 4.2, t);
        h.panel(96, 250, 520, 150, { alpha: pa * 0.9, col: COL.cyan });
        h.text('PHANTOM 1:30', 124, 296, { font: 'mono', size: 32, color: COL.cyan, alpha: pa, tracking: 5 });
        h.text(Math.abs(gp) < 0.5 ? 'LEVEL' : `${Math.abs(gp) < 60 ? Math.round(Math.abs(gp)) + ' S' : fmt(Math.abs(gp))} ${ahead ? 'AHEAD' : 'BEHIND'}`, 124, 368, { font: 'mono', size: 56, color: ahead ? COL.green : COL.red, alpha: pa, glow: 8 });
        // radar: the Phantom as a blip on the street
        const jam = enc === 1 ? smooth(T.jam, T.jam + 1, t) : 0;
        radar(h, { y: 250, pts: [[0, 70], [0, -90]], enemies: jam > 0.9 ? [] : [[-3, Math.max(-85, Math.min(60, -gapM(t) * 1.1)), COL.cyan]], alpha: hud, jam });
        const hp = enc === 1 ? 1 : clamp01(1 - Math.max(0, -gp) / 59);
        bossHp(h, { name: 'PHANTOM 1:30', hp, sub: enc === 1 ? 'CANNOT BE DAMAGED' : 'EVERY SECOND UNDER 1:30 PACE', alpha: hud, col: COL.cyan, hit: enc === 2 && t > T.contact ? 1 : 0 });
      }

      // --- beats
      if (t > T.goggles && t < T.goggles + 1.2) prompt(h, { b: 'L1', text: 'PACE GOGGLES', t: t - T.goggles, ok: t > T.goggles + 0.5, y: 760 });
      if (t > T.goggles + 0.6) itemGet(h, 'PACE GOGGLES', t - T.goggles - 0.6, 'it can only be seen at pace');
      if (enc === 1) {
        say(h, t, T.hunt + 1.5, T.hunt + 5, 'TEMPO', "It's behind you. Keep it there.");
        if (t > T.hunt + 5.5 && t < T.gain) h.text('STAY AHEAD', 960, 200, { font: 'head', size: 60, weight: 700, color: COL.green, align: 'center', alpha: env(t, T.hunt + 5.5, T.gain, 0.3, 0.3), tracking: 16, shadow: true });
        if (t > T.gain && t < T.contact) {
          h.text("IT'S GAINING", 960, 200, { font: 'head', size: 72, weight: 700, color: COL.red, align: 'center', alpha: 0.55 + 0.45 * Math.sin(t * 9), tracking: 18, glow: 12, shadow: true });
          h.text(`SPLIT  ${pace(P.splits[Math.min(20, Math.floor(K))])} /KM   (1:30 = ${pace(5400 / P.distanceKm)})`, 960, 290, { font: 'mono', size: 38, color: COL.red, align: 'center', alpha: 0.9, tracking: 3, shadow: true });
        }
        say(h, t, T.gain + 1.5, T.gain + 5, 'TEMPO', "Don't look back, Stride.");
        if (t > T.ots && t < T.contact) prompt(h, { b: 'X', text: 'RUN', t: t - T.ots, mash: true, y: 780 });
        if (t > T.contact) banner(h, 'OVERTAKEN', t - T.contact, { col: COL.red, sub: `KM ${K.toFixed(1)}  -  IT PASSED STRAIGHT THROUGH YOU`, dur: 3 });
        if (t > T.away + 0.5 && t < T.lost) say(h, t, T.away + 0.5, T.lost - 0.2, 'TEMPO', "I've lost it. It's in the fog.");
        if (t > T.lost && t < T.res) h.text('SIGNAL LOST', 960, 480, { font: 'head', size: 90, weight: 700, color: COL.cyan, align: 'center', alpha: env(t, T.lost, T.res, 0.1, 0.3), tracking: 24, glow: 14, shadow: true });
        if (t > T.res) {
          results(h, t - T.res, {
            title: 'PHANTOM ESCAPED',
            rows: [
              ['FINISH', '1:35:30'],
              ['TARGET', '1:29:59'],
              ['BEST GAP', best],
              ['CAUGHT', `KM ${contactKm.toFixed(1)}`],
              ['HEART RATE', `${P.hrAvg} AVG`],
            ],
          });
          h.text('LOG: "AN AMBITIOUS ATTEMPT AT 1:30 BUT HAPPY WITH 1:35"', 960, 800, { font: 'mono', size: 34, color: COL.amber, align: 'center', alpha: smooth(T.res + 2.6, T.res + 3.2, t) * (1 - smooth(T.end - 0.8, T.end, t)), tracking: 2 });
          h.text('THE PHANTOM WILL RETURN', 960, 900, { font: 'head', size: 44, weight: 700, color: COL.cyan, align: 'center', alpha: smooth(T.res + 4.2, T.res + 4.8, t) * (1 - smooth(T.end - 0.8, T.end, t)), tracking: 14, glow: 8 });
        }
      } else {
        if (t > T.hunt && t < T.pass) {
          say(h, t, T.hunt + 0.5, T.hunt + 4.5, 'TEMPO', 'Stay in its light. Not yet.');
          h.text('TAIL THE PHANTOM', 960, 200, { font: 'head', size: 60, weight: 700, color: COL.cyan, align: 'center', alpha: env(t, T.hunt, T.pass, 0.3, 0.3), tracking: 16, shadow: true });
          h.text('IN ITS LIGHT', 960, 262, { font: 'mono', size: 36, color: COL.green, align: 'center', alpha: env(t, T.hunt + 1, T.pass, 0.3, 0.3) * (0.7 + 0.3 * Math.sin(t * 5)), tracking: 8 });
        }
        if (t > T.pass - 0.4 && t < T.contact + 0.4) {
          say(h, t, T.pass - 0.2, T.pass + 1.4, 'TEMPO', 'Now.');
          prompt(h, { b: 'R1', text: 'OVERTAKE', t: t - T.pass + 0.4, hold: clamp01((t - T.pass) / (T.contact - T.pass)), ok: t > T.contact - 0.1, y: 780 });
        }
        if (t > T.contact) banner(h, 'PHANTOM OVERTAKEN', t - T.contact, { col: COL.green, sub: `KM ${K.toFixed(1)}  -  IT NEVER CAUGHT HIM AGAIN`, dur: 3.2 });
        // every km split lands as a hit: seconds taken out of it
        if (t > T.ots && t < FIN_T) {
          const k = Math.floor(K);
          for (const kk of [k, k - 1]) {
            if (kk < 4 || kk > 20) continue;
            const tk = kmInv(kk);
            const since = t - tk;
            if (since < 0 || since > 1.4) continue;
            const d = R.gap(kk) - R.gap(kk - 1);
            popup(h, `${pace(P.splits[kk - 1])}   ${d <= 0 ? '-' : '+'}${Math.abs(d).toFixed(0)} S`, 1340, 620, since, d <= 0 ? COL.green : COL.amber, 50);
          }
        }
        if (t > T.away && t < FIN_T - 1) h.text('IT CANNOT KEEP UP', 960, 200, { font: 'head', size: 60, weight: 700, color: COL.green, align: 'center', alpha: env(t, T.away, FIN_T - 1, 0.3, 0.3), tracking: 16, shadow: true });
        if (t > FIN_T + 3.2 && t < T.res) {
          const a = env(t, FIN_T + 3.2, T.res, 0.4, 0.4);
          stamp(h, 'SUB 1:30', { alpha: a, size: 170, col: COL.green, y: 470, sub: 'COMPLETE' });
          h.text('1:29:01', 960, 660, { font: 'mono', size: 70, color: COL.white, align: 'center', alpha: a * smooth(FIN_T + 3.8, FIN_T + 4.4, t), glow: 10, shadow: true });
          h.text('PHANTOM DESTROYED', 960, 750, { font: 'head', size: 48, weight: 700, color: COL.cyan, align: 'center', alpha: a * smooth(FIN_T + 4.6, FIN_T + 5.2, t), tracking: 14, glow: 8, shadow: true });
        }
        if (t > T.res) {
          results(h, t - T.res, {
            title: 'MISSION COMPLETE',
            rows: [
              ['FINISH', '1:29:01'],
              ['MARGIN', `${5400 - P.timeSec} S UNDER 1:30`],
              ['SPLITS', 'EVERY KM 4:02 - 4:19'],
              ['HEART RATE', `${P.hrAvg} AVG`],
            ],
            codename: 'METRONOME',
            rank: 'It never caught him again.',
            alpha: 1 - smooth(T.end - 0.8, T.end, t),
          });
        }
      }
    },
    cues,
  });

  /** film time at which race km k is reached (enc 2 only, after the overtake) */
  function kmInv(k: number) {
    let lo = T.go, hi = FIN_T;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (km(mid) < k) lo = mid;
      else hi = mid;
    }
    return lo;
  }
}
