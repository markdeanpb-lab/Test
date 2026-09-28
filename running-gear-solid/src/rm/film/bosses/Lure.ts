// THE HARE (impatience): a greyhound-track lure. A white hare on a boom arm, driven by a trolley along
// the verge, always a little too fast. "Started too fast", "went off too fast", "full send then big
// regrets", "big blow up after 10k": the thing he keeps chasing. Same API as the old Ghost pacer.
import * as THREE from 'three';
import { metal, box, cyl, Lamp, Particles, hazard } from './kit';

export class Lure {
  readonly root = new THREE.Group();
  /** compatibility with Ghost (chapters add runner.root) */
  readonly runner = { root: this.root };
  private hare = new THREE.Group();
  private boom = new THREE.Group();
  private trolley = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private eyes: Lamp[] = [];
  private strobe!: Lamp;
  private legs: THREE.Mesh[] = [];
  private arm!: THREE.Mesh;
  private post!: THREE.Mesh;
  readonly dust = new Particles({ n: 120, box: [0.8, 0.2, 0.8], vel: [0, 1.2, -4], life: 1, size: 0.5, color: 0xb0a898, opacity: 0.35, grow: 2, seed: 17 });
  private reach = 3.2;
  private side = 1;

  static async create() {
    const l = new Lure();
    await l.build();
    return l;
  }

  private async build() {
    const [plate, dark] = await Promise.all([metal('plate', { tint: 0xb0b6be }), metal('plate', { tint: 0x2a2c30, rough: 0.8 })]);
    const fur = new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.95 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd0d6dc, metalness: 1, roughness: 0.2 });
    // the hare, in a stretched gallop, ~1.1 m long
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), fur);
    body.scale.set(1, 0.8, 1.7);
    body.castShadow = true;
    this.hare.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), fur);
    head.scale.set(0.9, 0.9, 1.3);
    head.position.set(0, 0.22, 0.6);
    head.castShadow = true;
    this.hare.add(head);
    for (const x of [-0.07, 0.07]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), fur);
      ear.scale.set(1, 4.8, 0.5);
      ear.position.set(x, 0.52, 0.48);
      ear.rotation.x = -0.6;
      this.hare.add(ear);
      const eye = new Lamp(0.05, 0xff2010);
      eye.group.position.set(x * 1.9, 0.27, 0.8);
      this.hare.add(eye.group);
      this.eyes.push(eye);
    }
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), fur);
    tail.position.set(0, 0.12, -0.6);
    this.hare.add(tail);
    for (const [x, z, fwd] of [[-0.14, 0.35, 1], [0.14, 0.35, 1], [-0.16, -0.4, -1], [0.16, -0.4, -1]] as const) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.42, 4, 8), fur);
      leg.position.set(x, -0.28, z);
      leg.rotation.x = fwd * 0.9;
      this.hare.add(leg);
      this.legs.push(leg);
    }
    // a steel collar where the arm clamps on
    const clamp = cyl(0.12, 0.12, 0.3, chrome, 12);
    clamp.rotation.z = Math.PI / 2;
    clamp.position.set(0.3, 0.05, 0);
    this.hare.add(clamp);
    this.hare.scale.setScalar(2.1);
    this.root.add(this.hare);
    // boom arm out to the verge, post down to the trolley
    this.root.add(this.boom);
    this.arm = box(1, 0.12, 0.12, chrome, 1, 0.2);
    this.boom.add(this.arm);
    this.post = box(0.16, 1, 0.16, plate, 1, 0.2);
    this.boom.add(this.post);
    const cart = box(1.3, 0.5, 1.8, dark);
    cart.position.y = 0.45;
    this.trolley.add(cart);
    const stripe = box(1.32, 0.12, 1.82, hazard());
    stripe.position.y = 0.62;
    this.trolley.add(stripe);
    for (const [x, z] of [[-0.55, -0.65], [0.55, -0.65], [-0.55, 0.65], [0.55, 0.65]] as const) {
      const w = cyl(0.2, 0.2, 0.14, plate, 14);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.2, z);
      this.trolley.add(w);
      this.wheels.push(w);
    }
    this.strobe = new Lamp(0.09, 0xffb020);
    this.strobe.group.position.set(0, 0.85, 0.5);
    this.trolley.add(this.strobe.group);
    this.boom.add(this.trolley);
    this.dust.points.position.set(0, 0.1, -0.6);
    this.trolley.add(this.dust.points);
  }

  /** no phase track needed (API compatibility) */
  prepare(_d: (T: number) => number, _a: number, _b: number) {}

  set opacity(v: number) {
    this.root.visible = v > 0.01;
  }

  /** which side of the road the trolley runs on (+1 right) and how far the arm reaches */
  rig(side: number, reach = 3.2) {
    this.side = side;
    this.reach = reach;
  }

  pose(pos: { x: number; y: number; z: number; dx: number; dz: number }, T: number, speed: number) {
    const yaw = Math.atan2(pos.dx, pos.dz);
    this.root.position.set(pos.x, pos.y, pos.z);
    this.root.rotation.y = yaw;
    // the hare "runs": a bounding gait
    const ph = T * Math.max(2, speed) * 1.1;
    this.hare.position.y = 2.3 + Math.abs(Math.sin(ph)) * 0.2;
    this.hare.rotation.x = Math.sin(ph) * 0.12;
    this.legs.forEach((l, k) => (l.rotation.x = (k < 2 ? 1 : -1) * (0.6 + 0.5 * Math.sin(ph + (k < 2 ? 0 : Math.PI)))));
    // arm towards the verge: local -x is the course's right-hand side
    const sx = -this.side * this.reach;
    this.arm.scale.x = this.reach;
    this.arm.position.set(sx / 2 + 0.3 * Math.sign(sx), 2.4, 0);
    this.post.scale.y = 2.4;
    this.post.position.set(sx, 1.2 + 0.2, 0);
    this.trolley.position.set(sx, -0.1, -0.2);
    this.wheels.forEach((w) => (w.rotation.x = T * speed * 5));
    this.eyes.forEach((e) => (e.level = 0.9));
    this.strobe.level = Math.sin(T * 12) > 0.3 ? 1 : 0.05;
    this.dust.update(T, 1, 0.35);
  }
}
