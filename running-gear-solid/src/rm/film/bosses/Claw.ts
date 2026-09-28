// THE CLAW (Highgate hills, 26.11.2023): a buried mechanical hand under Highgate. Each of the five
// climbs is one of its fingers: it tears up out of the road verge as he climbs and curls over him,
// knuckle lamps amber; once the climb is done its lamps go green and it sinks back. At the end the
// whole hand retracts.
import * as THREE from 'three';
import { metal, box, cyl, Lamp, Particles, greeble, smoothstep, clamp01 } from './kit';

const SEG = [7.5, 5.8, 4.2];

export class Finger {
  readonly root = new THREE.Group(); // placed at the socket, +y up, curls towards +z
  private riser = new THREE.Group();
  private joints: THREE.Group[] = [];
  private lamps: Lamp[] = [];
  readonly dust = new Particles({ n: 160, box: [5, 1, 5], vel: [0, 3, 0], life: 2.2, size: 2.4, color: 0x8a7e70, opacity: 0.4, grow: 2, swirl: 2, seed: 91 });
  readonly debris = new Particles({ n: 90, box: [4, 0.5, 4], vel: [0, 9, 0], life: 1.1, size: 0.35, color: 0x2a2826, opacity: 1, swirl: 3, seed: 92 });

  constructor(mats: { plate: THREE.Material; rust: THREE.Material; dark: THREE.Material; chrome: THREE.Material; asphalt: THREE.Material }) {
    const gm = { panel: mats.plate, dark: mats.dark, pipe: mats.chrome };
    this.root.add(this.riser);
    // broken ground around the socket
    const ring = new THREE.Group();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const slab = box(2.4, 0.5, 1.6, mats.asphalt, 2, 0.1);
      slab.position.set(Math.cos(a) * 2.9, 0.2, Math.sin(a) * 2.9);
      slab.rotation.set(Math.sin(k * 3.1) * 0.5, -a, Math.cos(k * 2.3) * 0.4);
      ring.add(slab);
    }
    this.root.add(ring);
    let parent: THREE.Object3D = this.riser;
    let r = 1.55;
    SEG.forEach((len, i) => {
      const j = new THREE.Group();
      parent.add(j);
      this.joints.push(j);
      const knuckle = cyl(r * 1.08, r * 1.08, r * 2.3, mats.dark, 24);
      knuckle.rotation.z = Math.PI / 2;
      j.add(knuckle);
      const bone = box(r * 1.8, len, r * 1.7, i % 2 ? mats.rust : mats.plate);
      bone.position.y = len / 2;
      j.add(bone);
      const g = greeble(r * 1.8, len, r * 1.7, gm, { seed: 60 + i, n: 3, pipes: 1, face: 'back' });
      g.position.y = len / 2;
      j.add(g);
      // hydraulic tendon along the inside of the finger
      const tendon = cyl(0.18, 0.18, len * 0.85, mats.chrome, 10);
      tendon.position.set(0, len / 2, r * 0.95);
      j.add(tendon);
      const lamp = new Lamp(0.32, 0xffa020);
      lamp.group.position.set(0, 0, r * 1.15);
      j.add(lamp.group);
      this.lamps.push(lamp);
      const next = new THREE.Group();
      next.position.y = len;
      j.add(next);
      parent = next;
      r *= 0.8;
    });
    // the claw: a steel talon
    const talon = new THREE.Mesh(new THREE.ConeGeometry(r * 1.1, 3.4, 12), mats.chrome);
    talon.position.y = 1.5;
    talon.rotation.x = 0.35;
    talon.castShadow = true;
    parent.add(talon);
    this.root.add(this.dust.points, this.debris.points);
  }

  /** rise 0..1 (out of the ground), curl 0..1 (over the road), state: 'active' amber | 'done' green | 'off' */
  update(t: number, rise: number, curl: number, state: 'active' | 'done' | 'off') {
    const total = SEG.reduce((a, b) => a + b, 0);
    const r = smoothstep(0, 1, rise);
    this.riser.position.y = -total * 0.95 * (1 - r);
    this.root.visible = rise > 0.001;
    const c = smoothstep(0, 1, curl);
    const tremor = state === 'active' ? Math.sin(t * 17) * 0.01 : 0;
    this.joints.forEach((j, i) => (j.rotation.x = c * [0.35, 0.65, 0.8][i] + tremor));
    const col = state === 'done' ? 0x40ff70 : 0xffa020;
    this.lamps.forEach((l, i) => {
      l.color = col;
      l.level = state === 'off' ? 0 : 0.6 + 0.4 * Math.sin(t * 5 + i);
    });
    const erupting = rise > 0.02 && rise < 0.98 ? 1 : 0;
    this.dust.update(t, erupting ? 1 : 0.1 * r, 0.4);
    this.debris.update(t, erupting, 1);
  }
}

export async function clawMaterials() {
  const [plate, rust, dark, asphalt] = await Promise.all([
    metal('plate', { tint: 0x9aa0a8 }),
    metal('rust', { tint: 0x7a5a4a }),
    metal('plate', { tint: 0x2a2c30, rough: 0.8 }),
    metal('concrete', { tint: 0x4a4a4c }),
  ]);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd4da, metalness: 1, roughness: 0.2 });
  return { plate, rust, dark, chrome, asphalt };
}

export { clamp01 };
