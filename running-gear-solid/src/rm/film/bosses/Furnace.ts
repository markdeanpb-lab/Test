// FURNACE (Richmond Runfest Marathon 2023): a blast furnace on caterpillar tracks that paces the
// course beside him. The heat of the day is its breath: the mouth glows hotter through the race,
// its stacks pour smoke, embers blow across the road. When the race is stopped its sirens turn; at
// the finish ("survived") it banks down.
import * as THREE from 'three';
import { metal, box, cyl, Lamp, Particles, hazard, greeble, clamp01 } from './kit';

export class Furnace {
  readonly root = new THREE.Group();
  private mouthMat: THREE.MeshStandardMaterial;
  private glow: THREE.PointLight;
  private sirens: Lamp[] = [];
  private sirenRig = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private tracks: THREE.Object3D[] = [];
  private hull?: THREE.Mesh;
  /** the tower + mouth; rotate so the mouth faces the course */
  readonly crucible = new THREE.Group();
  readonly embers = new Particles({ n: 420, box: [10, 6, 16], vel: [-4, 5, 0], life: 3.2, size: 0.28, color: 0xff8a30, additive: true, swirl: 2, seed: 71 });
  readonly smoke: Particles[] = [];
  readonly haze = new Particles({ n: 140, box: [8, 2, 10], vel: [0, 4, 0], life: 2, size: 3.2, color: 0xffb070, opacity: 0.08, grow: 1.5, seed: 72 });

  static async create() {
    const f = new Furnace();
    await f.build();
    return f;
  }
  private constructor() {
    this.mouthMat = new THREE.MeshStandardMaterial({ color: 0x1a0500, emissive: 0xff5a10, emissiveIntensity: 2, roughness: 0.9 });
    this.glow = new THREE.PointLight(0xff6a20, 0, 60, 1.6);
  }

  private async build() {
    const [brick, rust, plate, dark, grate] = await Promise.all([
      metal('brick', { tint: 0x9a6a58 }),
      metal('rust', { tint: 0x7a5a4a }),
      metal('plate', { tint: 0x8a8e94 }),
      metal('plate', { tint: 0x2e3034, rough: 0.8 }),
      metal('grate', { tint: 0x5a4a40 }),
    ]);
    const gm = { panel: rust, dark, pipe: plate };
    // tracks
    for (const side of [-1, 1]) {
      const tr = box(3.2, 3, 22, dark, 1.5, 0.25);
      tr.position.set(side * 7, 1.5, 0);
      this.root.add(tr);
      this.tracks.push(tr);
      for (let k = 0; k < 7; k++) {
        const w = cyl(1.3, 1.3, 3.4, plate, 20);
        w.rotation.z = Math.PI / 2;
        w.position.set(side * 7, 1.4, -9 + k * 3);
        this.root.add(w);
        this.wheels.push(w);
        this.tracks.push(w);
      }
    }
    // hull
    const hull = box(13, 5, 20, rust);
    this.hull = hull;
    hull.position.y = 5.2;
    this.root.add(hull);
    for (const [face, seed] of [['left', 3], ['right', 4], ['back', 5]] as const) {
      const g = greeble(13, 5, 20, gm, { seed, face, n: 7, pipes: 2 });
      g.position.y = 5.2;
      this.root.add(g);
    }
    const band = box(13.2, 0.6, 20.2, hazard());
    band.position.y = 7.9;
    this.root.add(band);
    // the furnace: a brick-lined crucible tower with a grated mouth facing forward (+z)
    this.root.add(this.crucible);
    const tower = cyl(5.2, 6.2, 11, brick, 32, 3);
    tower.position.set(0, 13.5, -1);
    this.crucible.add(tower);
    for (const y of [9.2, 13.5, 17.8]) {
      const hoop = cyl(6.35 - (y - 9) * 0.09, 6.35 - (y - 9) * 0.09, 0.6, dark, 32);
      hoop.position.set(0, y, -1);
      this.crucible.add(hoop);
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.3, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), rust);
    dome.position.set(0, 19, -1);
    dome.castShadow = true;
    this.crucible.add(dome);
    const mouthFrame = box(6.2, 5.2, 1.4, dark);
    mouthFrame.position.set(0, 12.5, 4.9);
    this.crucible.add(mouthFrame);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), this.mouthMat);
    mouth.position.set(0, 12.5, 5.61);
    this.crucible.add(mouth);
    const bars = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const b = cyl(0.14, 0.14, 4.2, dark, 8);
      b.position.set(-2.1 + k * 0.84, 12.5, 5.75);
      bars.add(b);
    }
    this.crucible.add(bars);
    const grill = box(5.6, 0.5, 1.2, grate);
    grill.position.set(0, 10.1, 5.4);
    this.crucible.add(grill);
    this.glow.position.set(0, 12.5, 8);
    this.crucible.add(this.glow);
    // stacks
    for (const [x, z, h] of [[-3.8, -7, 16], [3.2, -8, 13]] as const) {
      const st = cyl(1.1, 1.4, h, brick, 20, 2);
      st.position.set(x, 7.7 + h / 2, z);
      this.root.add(st);
      const lip = cyl(1.4, 1.3, 0.6, dark, 20);
      lip.position.set(x, 7.7 + h, z);
      this.root.add(lip);
      const sm = new Particles({ n: 160, box: [1.5, 1, 1.5], vel: [-3, 9, 0], life: 4.5, size: 3.5, color: 0x3a3634, opacity: 0.5, grow: 3, swirl: 2, seed: 80 + x });
      sm.points.position.set(x, 8.2 + h, z);
      this.root.add(sm.points);
      this.smoke.push(sm);
    }
    // siren lamps on a rotating rig
    this.sirenRig.position.set(0, 24.6, -1);
    this.root.add(this.sirenRig);
    for (let k = 0; k < 2; k++) {
      const l = new Lamp(0.55, 0xff2010);
      l.group.position.set(k ? 1 : -1, 0, 0);
      this.sirenRig.add(l.group);
      this.sirens.push(l);
    }
    const mast = cyl(0.2, 0.3, 2, dark, 10);
    mast.position.set(0, 23.5, -1);
    this.root.add(mast);
    this.embers.points.position.set(-6, 14, 4);
    this.haze.points.position.set(0, 14, 7);
    this.root.add(this.embers.points, this.haze.points);
  }

  /** float it: a furnace barge (tracks hidden, hull runs down below the waterline) */
  barge() {
    this.tracks.forEach((o) => (o.visible = false));
    const hull = this.hull;
    if (hull) {
      const keel = new THREE.Mesh(new THREE.BoxGeometry(14.5, 4, 24), hull.material);
      keel.position.y = 1.2;
      keel.castShadow = keel.receiveShadow = true;
      this.root.add(keel);
    }
    return this;
  }

  /** heat 0..1, siren 0..1, banked 0..1 (cooled at the finish); travel = metres driven (wheel spin) */
  update(t: number, o: { heat: number; siren?: number; banked?: number; travel?: number }) {
    const b = clamp01(o.banked ?? 0);
    const heat = clamp01(o.heat) * (1 - b * 0.85);
    const flick = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3);
    this.mouthMat.emissiveIntensity = (1.2 + heat * 5) * flick;
    this.mouthMat.emissive.setHSL(0.03 + 0.04 * (1 - heat), 1, 0.5);
    this.glow.intensity = (60 + heat * 420) * flick;
    this.embers.update(t, 0.15 + heat * 0.85, 1);
    this.haze.update(t, heat, 0.06 + heat * 0.08);
    this.smoke.forEach((s) => s.update(t, 1, 0.3 + heat * 0.35 - b * 0.2));
    const sr = clamp01(o.siren ?? 0);
    this.sirenRig.rotation.y = t * 6;
    this.sirens.forEach((l) => (l.level = sr));
    this.wheels.forEach((w) => (w.rotation.x = (o.travel ?? 0) / 1.3));
  }
}
