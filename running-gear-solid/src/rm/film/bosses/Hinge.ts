// HINGE (Hackney Half 2022): a colossal rusted knee joint walking the course on two hydraulic legs.
// It keeps pace with the field. Its three warning lamps follow the knee through the race (controlled,
// grind, seize); at the finish ("the knee held out") it locks straight, lamps green, and vents.
import * as THREE from 'three';
import { metal, box, cyl, Piston, Lamp, Particles, hazard, greeble, clamp01, smoothstep } from './kit';

type Place = (s: number, off: number) => { x: number; y: number; z: number; dx: number; dz: number };

const L1 = 8.5, L2 = 8.5; // thigh, shin
const HIP = 14.5; // body height above ground
const STRIDE = 11; // metres per full gait cycle

export class Hinge {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private drum = new THREE.Group();
  private legs: { thigh: THREE.Group; shin: THREE.Group; foot: THREE.Group; piston: Piston; side: number }[] = [];
  private lamps: Lamp[] = [];
  readonly steam = new Particles({ n: 220, box: [1.2, 0.5, 1.2], vel: [0, 7, 0], life: 2.4, size: 1.4, color: 0xd8dce0, opacity: 0.5, grow: 3, swirl: 1.2, seed: 13 });
  readonly sparks: Particles[] = [];

  static async create() {
    const h = new Hinge();
    await h.build();
    return h;
  }

  private async build() {
    const [rust, rust2, plate, dark, grate] = await Promise.all([
      metal('rust', { tint: 0x8a6a58 }),
      metal('rust2', { tint: 0x9a7a66 }),
      metal('plate', { tint: 0x8a8e94 }),
      metal('plate', { tint: 0x3a3d42, rough: 0.8 }),
      metal('grate'),
    ]);
    const gm = { panel: rust2, dark, pipe: plate };
    this.root.add(this.body);
    this.body.add(this.drum);
    // the knee: a huge horizontal drum with bolted end caps and a kneecap plate
    const main = cyl(3.2, 3.2, 7.5, rust, 36);
    main.rotation.z = Math.PI / 2;
    this.drum.add(main);
    for (const x of [-3.9, 3.9]) {
      const cap = cyl(3.5, 3.5, 0.5, dark, 36);
      cap.rotation.z = Math.PI / 2;
      cap.position.x = x;
      this.drum.add(cap);
      const hub = cyl(1.2, 1.4, 0.8, plate, 24);
      hub.rotation.z = Math.PI / 2;
      hub.position.x = x * 1.08;
      this.drum.add(hub);
      // bolt ring
      const bolt = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 8), plate, 16);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        bolt.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(x * 1.035, Math.cos(a) * 2.8, Math.sin(a) * 2.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2)), new THREE.Vector3(1, 1, 1)));
      }
      this.drum.add(bolt);
    }
    const kneecap = box(5.4, 4.6, 1.2, rust2);
    kneecap.position.set(0, 0.6, 3.2);
    kneecap.rotation.x = -0.25;
    this.drum.add(kneecap);
    const kg = greeble(5.4, 4.6, 1.2, gm, { seed: 5, n: 4, pipes: 1 });
    kg.position.copy(kneecap.position);
    kg.rotation.x = -0.25;
    this.drum.add(kg);
    const stripe = box(7.6, 0.6, 0.2, hazard());
    stripe.position.set(0, -2.1, 3.05);
    this.drum.add(stripe);
    // warning lamps across the kneecap: its eyes
    for (let k = 0; k < 3; k++) {
      const l = new Lamp(0.45, 0xff9020);
      l.group.position.set((k - 1) * 1.7, 2.1, 3.95);
      this.drum.add(l.group);
      this.lamps.push(l);
    }
    // exhaust stack on top
    const stack = cyl(0.55, 0.7, 3.4, dark, 16);
    stack.position.set(-2, 4.2, -1);
    this.drum.add(stack);
    this.steam.points.position.set(-2, 6, -1);
    this.drum.add(this.steam.points);
    const vent = box(2.4, 1.4, 0.2, grate);
    vent.position.set(1.8, 1.8, -3.2);
    this.drum.add(vent);
    // legs (reverse-jointed like a bird: the knee points backwards)
    for (const side of [-1, 1]) {
      const thigh = new THREE.Group();
      const tb = box(1.5, L1, 1.8, rust2);
      tb.position.y = -L1 / 2;
      thigh.add(tb);
      const tg = greeble(1.5, L1, 1.8, gm, { seed: 20 + side, n: 3, pipes: 1, face: side < 0 ? 'left' : 'right' });
      tg.position.y = -L1 / 2;
      thigh.add(tg);
      const shin = new THREE.Group();
      const sb = box(1.2, L2, 1.4, rust);
      sb.position.y = -L2 / 2;
      shin.add(sb);
      const joint = cyl(1.1, 1.1, 1.9, dark, 20);
      joint.rotation.z = Math.PI / 2;
      shin.add(joint);
      const foot = new THREE.Group();
      const fb = box(3.2, 0.9, 4.6, plate);
      fb.position.set(0, 0.45, 0.6);
      foot.add(fb);
      const fh = box(3.3, 0.3, 1.1, hazard());
      fh.position.set(0, 0.95, 2.4);
      foot.add(fh);
      const p = new Piston(0.4, 4, dark);
      this.root.add(thigh, shin, foot, p.group);
      this.legs.push({ thigh, shin, foot, piston: p, side });
      const sp = new Particles({ n: 120, box: [2.5, 0.2, 2.5], vel: [0, 5, 0], life: 0.7, size: 0.16, color: 0xffb040, additive: true, swirl: 4, seed: 40 + side });
      this.root.add(sp.points);
      this.sparks.push(sp);
    }
  }

  /**
   * s: distance of the body along the course (m); place: course placement; t: film time;
   * phase: 0 controlled, 1 grind, 2 seize; held 0..1: the lock-up at the finish.
   */
  update(t: number, s: number, place: Place, off: number, o: { phase?: number; held?: number; moving?: number; spread?: number } = {}) {
    const spread = o.spread ?? 3.4;
    const held = smoothstep(0, 1, clamp01(o.held ?? 0));
    const ph = o.phase ?? 0;
    const bodyP = place(s, off);
    const cyc = s / STRIDE;
    const feet: THREE.Vector3[] = [];
    const lift: number[] = [];
    for (let i = 0; i < 2; i++) {
      const c = cyc + i * 0.5;
      const n = Math.floor(c), u = c - n;
      const plant = (k: number) => (k + 0.5 - i * 0.5) * STRIDE + STRIDE * 0.35; // course s of footfall k
      let fs: number, up = 0;
      if (u < 0.62) fs = plant(n);
      else {
        const w = (u - 0.62) / 0.38;
        const e = w * w * (3 - 2 * w);
        fs = plant(n) + (plant(n + 1) - plant(n)) * e;
        up = Math.sin(w * Math.PI) * 3.2;
      }
      // when it locks up, both feet come to rest level beneath it
      fs = fs + (s - fs + (i - 0.5) * 1.2) * held;
      up *= 1 - held;
      const fp = place(fs, off + (i ? spread : -spread));
      feet.push(new THREE.Vector3(fp.x, fp.y + up, fp.z));
      lift.push(up);
    }
    const bob = Math.abs(Math.sin(cyc * Math.PI * 2)) * 0.6 * (1 - held);
    const grind = ph >= 1 ? Math.sin(t * 23) * 0.04 * ph : 0;
    this.body.position.set(bodyP.x, bodyP.y + HIP - bob + held * 1.5, bodyP.z);
    const yaw = Math.atan2(bodyP.dx, bodyP.dz);
    // it faces him, backing up the course ahead of him
    this.body.rotation.set(grind, yaw + Math.PI, grind * 0.5);
    this.body.updateMatrixWorld(true);
    // legs: 2-bone IK in the vertical plane through hip and foot, knees bending backwards
    const fwd = new THREE.Vector3(-bodyP.dx, 0, -bodyP.dz); // the way it faces
    this.legs.forEach((L, i) => {
      const hip = new THREE.Vector3(L.side * 3.2, -0.6, -0.6).applyMatrix4(this.body.matrixWorld);
      const foot = feet[i];
      const d = foot.clone().sub(hip);
      const dist = Math.min(L1 + L2 - 0.05, d.length());
      const a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
      const hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const dir = d.clone().normalize();
      const bend = fwd.clone().multiplyScalar(-1).sub(dir.clone().multiplyScalar(dir.dot(fwd) * -1)).normalize(); // backwards, perpendicular to hip->foot
      const knee = hip.clone().add(dir.clone().multiplyScalar(a)).add(bend.multiplyScalar(hh));
      const orient = (g: THREE.Group, from: THREE.Vector3, to: THREE.Vector3) => {
        g.position.copy(from);
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
        // keep the leg's width across the body
        const q = new THREE.Quaternion().setFromAxisAngle(to.clone().sub(from).normalize(), 0);
        g.quaternion.premultiply(q);
      };
      orient(L.thigh, hip, knee);
      orient(L.shin, knee, foot);
      L.foot.position.copy(foot);
      L.foot.rotation.set(0, yaw + Math.PI, 0);
      // piston from hip front to mid-shin
      const pa = hip.clone().add(new THREE.Vector3(0, -1.2, 0)).add(fwd.clone().multiplyScalar(1.1));
      const pb = knee.clone().add(foot.clone().sub(knee).multiplyScalar(0.4)).add(fwd.clone().multiplyScalar(0.8));
      L.piston.span(pa, pb);
      // sparks when the foot strikes
      const sp = this.sparks[i];
      sp.points.position.copy(foot);
      sp.update(t, lift[i] < 0.25 && held < 0.5 ? 0.6 + 0.2 * ph : 0);
    });
    // lamps: amber climbing to red through the race; green when it holds
    const cols = [0xffa020, 0xff6010, 0xff1808];
    this.lamps.forEach((l, k) => {
      const on = held > 0.5 ? 1 : k <= ph ? 1 : 0.1;
      l.color = held > 0.5 ? 0x30ff60 : cols[Math.min(2, Math.round(ph))];
      l.level = on * (held > 0.5 ? 1 : 0.7 + 0.3 * Math.sin(t * (4 + ph * 4) + k));
    });
    this.steam.update(t, 0.25 + ph * 0.25 + held * 0.75, 0.45);
    void o.moving;
  }
}
