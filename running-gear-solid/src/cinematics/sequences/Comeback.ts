import * as THREE from 'three';
import { Sequence, cam, type Cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting } from '../../shaders/ps1';
import { parkSet, pathRibbon } from '../../environments/sets';
import { skyDome, block, ground, tree, lampPost } from '../../environments/props';
import { TEX } from '../../renderer/textures';
import { Runner, stridePhase } from '../../runner/Runner';
import { COMEBACK_LOG } from '../../data/career';
import { drawLogCard } from '../../hud/screens';
import { ramp, rng, easeOutBack, clamp } from '../../core/util';

// COMEBACK (Dec 2024 - Dec 2025): a montage straight from the log. Finsbury
// parkruns, the farewell to Finsbury after 95 parkruns, then PBs in the city
// and on the hills of St Albans.

type SetId = 'park' | 'city' | 'hills';
interface Beat { t0: number; set: SetId; card: number; u0: number; shot: (t: number) => void }

const B = [0, 1.9, 3.6, 5.4, 7.2, 9.0, 11.0, 13];
const CITY = new THREE.Vector3(4000, 0, 0);
const HILLS = new THREE.Vector3(-4000, 0, 0);

export class Comeback extends Sequence {
  park = parkSet(47);
  runner = new Runner('club');
  city!: THREE.CatmullRomCurve3;
  hills!: THREE.CatmullRomCurve3;
  beats: Beat[] = [];
  private sets: Record<SetId, THREE.Group> = { park: new THREE.Group(), city: new THREE.Group(), hills: new THREE.Group() };

  build() {
    this.clearColor.setHex(0xb8c4cc);
    this.group.add(skyDome(0x7890b0, 0xd0d8e0, 0xa8b0a8));
    this.sets.park.add(this.park.group);
    this.group.add(this.sets.park, this.sets.city, this.sets.hills, this.runner.root);
    const r = rng(2412);

    // city: a long straight with terraces and lamp posts
    const cpts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) cpts.push(new THREE.Vector3(CITY.x + Math.sin(i * 0.5) * 6, 0, i * 40 - 200));
    this.city = new THREE.CatmullRomCurve3(cpts);
    const cg = this.sets.city;
    const cgr = ground(800, 800, TEX.asphalt(), [80, 80], 0x8a8a8a, 10);
    cgr.position.set(CITY.x, -0.05, 0);
    cg.add(cgr);
    cg.add(pathRibbon(this.city, 9, TEX.road(), 0xffffff));
    for (let i = 0; i < 40; i++) {
      const z = -200 + i * 10;
      for (const s of [-1, 1]) {
        const h = block(9, 8 + r() * 10, 9, TEX.terrace(), 0xd0c0b0, 4);
        h.position.set(CITY.x + s * 13 + Math.sin(i * 0.125) * 6, 0, z);
        cg.add(h);
      }
      if (i % 3 === 0) {
        const l = lampPost(5.5, 0xffe0b0, 1.2, false);
        l.position.set(CITY.x + 5.4 + Math.sin(i * 0.125) * 6, 0, z);
        l.rotation.y = -Math.PI / 2;
        cg.add(l);
      }
    }

    // hills: rolling road up to the cathedral
    const hpts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) hpts.push(new THREE.Vector3(HILLS.x + Math.sin(i * 0.7) * 18, 7 * Math.sin(i * 0.45) + i * 0.8, i * 36 - 200));
    this.hills = new THREE.CatmullRomCurve3(hpts);
    const hg = this.sets.hills;
    const hgr = ground(1200, 1200, TEX.grass(), [120, 120], 0xb0b890, 40);
    hgr.position.set(HILLS.x, -0.4, 0);
    hg.add(hgr);
    // embankments under the road so it never floats
    for (let i = 0; i <= 60; i++) {
      const p = this.hills.getPointAt(i / 60);
      if (p.y < 0.6) continue;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), (hgr.material as THREE.Material));
      m.scale.set(26, p.y + 0.2, 14);
      m.position.set(p.x, -0.4, p.z);
      hg.add(m);
    }
    hg.add(pathRibbon(this.hills, 7, TEX.road(), 0xffffff));
    for (let i = 0; i < 90; i++) {
      const u = r();
      const p = this.hills.getPointAt(u);
      const s = r() < 0.5 ? -1 : 1;
      const t = tree(6 + r() * 7, i);
      t.position.set(p.x + s * (9 + r() * 30), -0.4, p.z + (r() - 0.5) * 10);
      hg.add(t);
    }
    // the cathedral on the hill
    const cat = new THREE.Group();
    const nave = block(14, 16, 80, TEX.brick(), 0xc8a890, 4);
    cat.add(nave);
    const tower = block(15, 40, 15, TEX.brick(), 0xc8a890, 4);
    tower.position.z = 10;
    cat.add(tower);
    const trans = block(50, 14, 12, TEX.brick(), 0xc0a088, 4);
    trans.position.z = 10;
    cat.add(trans);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 9, 80, 4, 1), (nave.material as THREE.Material));
    roof.rotation.x = Math.PI / 2;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 0.55);
    roof.position.y = 18;
    cat.add(roof);
    cat.position.set(HILLS.x - 70, 8, 330);
    cat.rotation.y = 0.5;
    hg.add(cat);

    // beats: [set, card, starting u]
    const defs: [SetId, number][] = [['park', 0], ['park', 1], ['park', 2], ['city', 3], ['city', 4], ['hills', 5], ['hills', 6]];
    const camA: [Cam, Cam][] = [
      [cam(-1.4, 1.6, -4.6, 0, 1.3, 4, 52), cam(-1.0, 1.5, -3.8, 0, 1.3, 4, 50)],
      [cam(3.4, 0.7, 5.5, 0, 1.2, 0, 42), cam(2.6, 0.8, 4.4, 0, 1.3, 0, 40)],
      [cam(5, 2.2, 7, -2, 1.5, -6, 44), cam(6, 2.6, 9, -2, 1.5, -8, 44)],
      [cam(0, 1.5, 7, 0, 1.3, 0, 38), cam(0, 1.4, 5.6, 0, 1.3, 0, 36)],
      [cam(-6, 2, 1, 0, 1.4, 2, 46), cam(-6, 2, 3, 0, 1.4, 3, 46)],
      [cam(-3, 1.0, 6, 0, 2, -2, 50), cam(-2.6, 1.2, 5, 0, 2, -2, 50)],
      [cam(-2, 2.4, -6, 0, 3, 30, 48), cam(-1.6, 2.2, -4.8, 0, 3, 30, 48)],
    ];
    const u0s = [0.1, 0.35, 0.02, 0.2, 0.5, 0.35, 0.62];
    defs.forEach(([set, card], i) => {
      const beat: Beat = { t0: B[i], set, card, u0: u0s[i], shot: () => {} };
      this.beats.push(beat);
      this.shot(B[i], B[i + 1] - B[i], camA[i][0], camA[i][1], 'sine.inOut', (t, c) => this.follow(t, c));
    });
  }

  beatAt(t: number) {
    let b = this.beats[0];
    for (const x of this.beats) if (t >= x.t0) b = x;
    return b;
  }

  curveOf(set: SetId) {
    return set === 'park' ? this.park.curve : set === 'city' ? this.city : this.hills;
  }

  /** runner u along the beat's path */
  uAt(t: number) {
    const b = this.beatAt(t);
    const c = this.curveOf(b.set);
    const speed = b.set === 'hills' ? 3.6 : 4.4; // m/s
    return (b.u0 + ((t - b.t0) * speed) / c.getLength()) % 1;
  }

  frame(t: number) {
    const c = this.curveOf(this.beatAt(t).set);
    const u = this.uAt(t);
    const p = c.getPointAt(u);
    const d = c.getTangentAt(u);
    return { p, yaw: Math.atan2(d.x, d.z) };
  }

  follow(t: number, c: Cam) {
    const { p, yaw } = this.frame(t);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const [cx, cz] = [c.x * cs + c.z * sn, -c.x * sn + c.z * cs];
    const [tx, tz] = [c.tx * cs + c.tz * sn, -c.tx * sn + c.tz * cs];
    c.x = p.x + cx;
    c.z = p.z + cz;
    c.y += p.y;
    c.tx = p.x + tx;
    c.tz = p.z + tz;
    c.ty += p.y;
  }

  update(t: number, fx: FX) {
    const b = this.beatAt(t);
    this.sets.park.visible = b.set === 'park';
    this.sets.city.visible = b.set === 'city';
    this.sets.hills.visible = b.set === 'hills';
    const winter = b.set === 'park' && b.card < 2;
    applyLighting({
      fog: winter ? 0xc8d0d8 : 0xc8ccc8,
      fogNear: 40,
      fogFar: b.set === 'hills' ? 420 : 240,
      lightDir: [-0.4, -1, -0.3],
      light: winter ? 0xe0e8f8 : 0xfff2dc,
      lightI: 0.9,
      sky: 0x90a8c8,
      ground: 0x505848,
      ambient: 0x181818,
    });
    this.clearColor.setHex(winter ? 0xc8d0d8 : 0xc8ccc8);
    const { p, yaw } = this.frame(t);
    this.runner.root.position.copy(p);
    this.runner.root.rotation.y = yaw;
    this.runner.pose({ mode: 'run', phase: stridePhase(t * 4.4, 2.6), speed: 0.85, fatigue: b.set === 'hills' ? 0.25 : 0, limp: 0, breath: t });
    fx.tint = winter ? [0.95, 1, 1.08] : [1.04, 1.0, 0.95];
    fx.sat = 1.05;
    // hard cuts get a single-frame flash between sets
    const cut = this.beats.some((x) => x.t0 > 0 && t >= x.t0 && t < x.t0 + 0.07 && this.beatAt(x.t0 - 0.01).set !== x.set);
    fx.flash = cut ? 0.6 : 0;
    fx.fade = t < 0.25 ? 1 - t / 0.25 : t > 12.7 ? (t - 12.7) / 0.3 : 0;
  }

  drawUI(ui: UI, t: number) {
    const b = this.beatAt(t);
    const i = this.beats.indexOf(b);
    const dur = B[i + 1] - B[i];
    ui.letterbox(1);
    ui.text('MISSION 08 // COMEBACK', 24, 22, { scale: 2, color: COL.amber, alpha: ramp(t, 0.1, 0.4) });
    drawLogCard(ui, COMEBACK_LOG[b.card], t - b.t0 - 0.1, dur - 0.1, 24, 48, 440);
    // PB tracker: 5K and half marathon records as they fall
    const pb5 = t >= B[6] + 0.5 ? '18:19' : t >= B[3] + 0.5 ? '18:28' : '18:42';
    const pbH = '1:24:17';
    const flash5 = (t >= B[3] + 0.5 && t < B[3] + 1.3) || (t >= B[6] + 0.5 && t < B[6] + 1.3);
    ui.rect(730, 62, 210, 64, '#000', 0.6);
    ui.text('5K PB', 742, 72, { scale: 2, color: COL.grey });
    const pop = flash5 ? easeOutBack(clamp(((t - (t >= B[6] ? B[6] : B[3])) - 0.5) / 0.3)) : 1;
    ui.text(pb5, 928, 68, { scale: flash5 ? 2 + Math.round(pop) : 3, color: flash5 ? COL.green : COL.white, align: 'right' });
    ui.text('HALF PB', 742, 100, { scale: 2, color: COL.grey });
    ui.text(pbH, 928, 98, { scale: 2, color: COL.white, align: 'right' });
    if (flash5) ui.text('^ NEW RECORD', 835, 132, { scale: 2, color: COL.green, align: 'center' });
  }
}
