// THE CLAW: a colossal mechanical hand buried palm-up under Highgate. Its five fingers are the five
// climbs of 26.11.2023. Each finger is a ramp STRIDE has to run UP, from the fingertip on the ground
// to the palm, while the finger curls to throw him off. Beaten fingers go green and retract.
import * as THREE from 'three';
import { metal, box, cyl, Lamp, Particles, greeble, hazard, clamp01 } from './kit';

export const SEGS = [12, 10, 8]; // proximal (palm side) .. distal (tip)
export const REST = [-0.3, -0.12, -0.1]; // joint pitch at rest (negative = down towards the ground)
export const PALM_Y = 12.2;
export const PALM_R = 15;

export class Finger {
  readonly root = new THREE.Group(); // at the palm edge, +z outward along the finger
  readonly joints: THREE.Group[] = [];
  readonly lamps: Lamp[] = [];
  readonly sparks = new Particles({ n: 90, box: [3, 0.4, 3], vel: [0, 6, 0], life: 0.7, size: 0.22, color: 0xffb040, additive: true, swirl: 3, seed: 7 });
  /** extra curl per joint (0 = resting on the hill, 1 = closed over the palm) */
  curl = 0;
  /** 0..1 how far it has sunk back into the ground */
  sink = 0;

  constructor(mats: { a: THREE.Material; b: THREE.Material; dark: THREE.Material; chrome: THREE.Material; haz: THREE.Material }) {
    let parent: THREE.Object3D = this.root;
    let w = 6.2;
    SEGS.forEach((len, i) => {
      const j = new THREE.Group();
      if (i) j.position.z = SEGS[i - 1];
      parent.add(j);
      this.joints.push(j);
      const knuckle = cyl(w * 0.36, w * 0.36, w * 1.02, mats.dark, 28, 3);
      knuckle.rotation.z = Math.PI / 2;
      j.add(knuckle);
      const bone = box(w, 1.8, len, i % 2 ? mats.b : mats.a, 3);
      bone.position.set(0, -0.2, len / 2);
      j.add(bone);
      const plate = greeble(w, 1.8, len, { panel: mats.a, dark: mats.dark, pipe: mats.chrome }, { seed: 30 + i, n: 4, pipes: 1, face: 'left' });
      plate.position.copy(bone.position);
      j.add(plate);
      const plate2 = greeble(w, 1.8, len, { panel: mats.a, dark: mats.dark, pipe: mats.chrome }, { seed: 40 + i, n: 4, pipes: 1, face: 'right' });
      plate2.position.copy(bone.position);
      j.add(plate2);
      // hazard edge strips along the running surface
      for (const sx of [-1, 1]) {
        const e = box(0.35, 0.08, len * 0.94, mats.haz, 1, 0);
        e.position.set((sx * (w - 0.4)) / 2, 0.74, len / 2);
        j.add(e);
      }
      // hydraulic tendons underneath
      const ten = cyl(0.25, 0.25, len * 0.9, mats.chrome, 12);
      ten.rotation.x = Math.PI / 2;
      ten.position.set(0, -1.3, len / 2);
      j.add(ten);
      const lamp = new Lamp(0.28, 0xffa020);
      lamp.group.position.set(0, w * 0.42 + 0.1, 0);
      j.add(lamp.group);
      this.lamps.push(lamp);
      parent = j;
      w *= 0.86;
    });
    // talon
    const talon = new THREE.Mesh(new THREE.ConeGeometry(1.2, 4.5, 16), mats.chrome);
    talon.rotation.x = Math.PI / 2 + 0.5;
    talon.position.set(0, -0.6, SEGS[2] + 1.2);
    talon.castShadow = true;
    this.joints[2].add(talon);
    this.sparks.points.position.set(0, 0, 0);
    this.root.add(this.sparks.points);
    this.apply();
  }

  apply() {
    this.joints.forEach((j, i) => (j.rotation.x = -(REST[i] + this.curl * [0.55, 0.85, 1.0][i])));
  }

  /**
   * World point on the running surface, u = 0 at the fingertip .. 1 at the palm edge.
   * (the chain is walked from the tip back to the base)
   */
  surface(u: number) {
    const total = SEGS[0] + SEGS[1] + SEGS[2];
    let d = (1 - clamp01(u)) * total; // distance from the base
    for (let i = 0; i < 3; i++) {
      if (d <= SEGS[i] || i === 2) {
        const p = new THREE.Vector3(0, 0.8, Math.min(d, SEGS[i]));
        this.root.updateMatrixWorld(true);
        return p.applyMatrix4(this.joints[i].matrixWorld);
      }
      d -= SEGS[i];
    }
    return new THREE.Vector3();
  }

  lampsTo(state: 'wake' | 'done' | 'off', t: number) {
    this.lamps.forEach((l, i) => {
      l.color = state === 'done' ? 0x40ff70 : 0xffa020;
      l.level = state === 'off' ? 0.05 : 0.6 + 0.4 * Math.sin(t * 6 + i);
    });
  }
}

export class Hand {
  readonly root = new THREE.Group();
  readonly fingers: Finger[] = [];
  private eye!: Lamp;

  static async create(bearings: number[]) {
    const h = new Hand();
    await h.build(bearings);
    return h;
  }

  private async build(bearings: number[]) {
    const [a, b, dark, rustT] = await Promise.all([
      metal('plate', { tint: 0x8c939c }),
      metal('rust', { tint: 0x8a6a58 }),
      metal('plate', { tint: 0x2b2e33, rough: 0.8 }),
      metal('rust2', { tint: 0x6a5446 }),
    ]);
    const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 1, roughness: 0.22 });
    const haz = hazard();
    // the palm: a huge riveted dish with a core in the middle
    const palm = cyl(PALM_R, PALM_R + 2, 4, rustT, 48, 6);
    palm.position.y = PALM_Y - 2.2;
    this.root.add(palm);
    const deck = cyl(PALM_R - 1, PALM_R - 1, 0.4, a, 48, 6);
    deck.position.y = PALM_Y - 0.1;
    this.root.add(deck);
    const core = cyl(3.2, 4, 3, dark, 32);
    core.position.y = PALM_Y + 1.4;
    this.root.add(core);
    this.eye = new Lamp(1.2, 0xff3020);
    this.eye.group.position.y = PALM_Y + 3.4;
    this.root.add(this.eye.group);
    bearings.forEach((deg) => {
      const f = new Finger({ a, b, dark, chrome, haz });
      const r = (deg * Math.PI) / 180;
      // bearing: compass degrees from the summit out to the foot of the climb (x east, z south)
      const dx = Math.sin(r), dz = -Math.cos(r);
      f.root.position.set(dx * (PALM_R - 1), PALM_Y - 0.3, dz * (PALM_R - 1));
      f.root.rotation.y = Math.atan2(dx, dz);
      f.apply();
      this.root.add(f.root);
      this.fingers.push(f);
    });
  }

  /** the whole hand rises out of the ground (0 buried .. 1 up) */
  rise = 1;
  update(t: number, awake: number) {
    this.root.position.y = -(1 - this.rise) * 30;
    this.eye.level = awake * (0.6 + 0.4 * Math.sin(t * 3));
    for (const f of this.fingers) {
      f.root.position.y = PALM_Y - 0.3 - f.sink * 26;
      f.apply();
    }
  }
}
