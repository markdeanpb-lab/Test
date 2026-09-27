import * as THREE from 'three';
import { block } from '../environments/props';
import { glow, ps1 } from '../shaders/ps1';
import { TEX } from '../renderer/textures';
import { clamp } from '../core/util';

// THE CLAW: a buried mechanical hand under Highgate. The palm sits on the
// village summit; each finger is one of the run's climbs, laid out along the
// real compass bearing the climb approaches from. Its knuckles light up as it
// wakes, and each finger curls away once it has been run up.

/** finger profile in (radial distance, height), tip -> palm edge */
const PROFILE: [number, number][] = [
  [150, 0],
  [100, 9],
  [58, 22],
  [20, 34],
];
const LENS = PROFILE.slice(1).map((p, i) => Math.hypot(p[0] - PROFILE[i][0], p[1] - PROFILE[i][1]));
const TOTAL = LENS.reduce((a, b) => a + b, 0);

export interface Finger {
  name: string;
  bearing: number; // degrees, from the summit out to the foot of the climb
  pivot: THREE.Group;
  yaw: number;
  dir: THREE.Vector3;
  lights: THREE.Mesh[];
}

export class Claw {
  readonly root = new THREE.Group();
  readonly palm = new THREE.Group();
  readonly fingers: Finger[] = [];
  private eyeMat: THREE.ShaderMaterial;
  private lightMats: THREE.ShaderMaterial[] = [];

  constructor(defs: { name: string; bearing: number }[]) {
    const metal = TEX.metal();
    // palm: the summit
    const base = new THREE.Mesh(new THREE.CylinderGeometry(24, 30, 36, 8), ps1({ map: metal, color: 0x5a5c64, uvScale: [6, 3] }));
    base.position.y = 18;
    this.palm.add(base);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), ps1({ map: metal, color: 0x6a6c74, uvScale: [4, 2] }));
    dome.position.y = 36;
    this.palm.add(dome);
    // the village spire on top
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.4, 26, 4), ps1({ map: TEX.stone(), color: 0x9a9890 }));
    spire.position.set(-6, 64, -6);
    this.palm.add(spire);
    const tower = block(6, 12, 6, TEX.stone(), 0x8a8880, 2);
    tower.position.set(-6, 44, -6);
    this.palm.add(tower);
    // eye, facing out between the fingers
    const eyeRing = new THREE.Mesh(new THREE.TorusGeometry(6.5, 1.4, 4, 10), ps1({ map: metal, color: 0x3a3c44 }));
    this.eyeMat = ps1({ color: 0x200404, unlit: true }) as THREE.ShaderMaterial;
    const eye = new THREE.Mesh(new THREE.CircleGeometry(5.5, 10), this.eyeMat);
    const eyeG = new THREE.Group();
    eyeG.add(eyeRing, eye);
    eye.position.z = 0.2;
    const eb = (140 * Math.PI) / 180;
    eyeG.position.set(Math.sin(eb) * 27, 24, -Math.cos(eb) * 27);
    eyeG.lookAt(Math.sin(eb) * 100, 24, -Math.cos(eb) * 100);
    this.palm.add(eyeG);
    this.root.add(this.palm);

    for (const d of defs) {
      const b = (d.bearing * Math.PI) / 180;
      const dir = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b));
      const yaw = Math.atan2(dir.x, dir.z);
      const holder = new THREE.Group();
      holder.rotation.y = yaw;
      const pivot = new THREE.Group();
      pivot.position.set(0, PROFILE[3][1], PROFILE[3][0]);
      holder.add(pivot);
      const lights: THREE.Mesh[] = [];
      for (let k = 0; k < 3; k++) {
        const [r0, y0] = PROFILE[k], [r1, y1] = PROFILE[k + 1];
        const L = LENS[k];
        const dy = y1 - y0, dz = r1 - r0;
        const phi = Math.atan2(dy, -dz); // local +z points back down the finger, top stays up
        const seg = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(7, 3, L + 1.5), ps1({ map: metal, color: 0x585a62, uvScale: [1, L / 7] }));
        slab.position.y = -1.5;
        seg.add(slab);
        const road = new THREE.Mesh(new THREE.PlaneGeometry(5, L + 1.5), ps1({ map: TEX.road(), color: 0x8a8c94, uvScale: [1, L / 8] }));
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0.03;
        seg.add(road);
        for (const sx of [-1, 1]) {
          const rail = block(0.4, 0.9, L + 1.5, null, 0x2a2a30);
          rail.position.set(sx * 3.3, -0.2, 0);
          seg.add(rail);
        }
        seg.position.set(0, (y0 + y1) / 2 - PROFILE[3][1], (r0 + r1) / 2 - PROFILE[3][0]);
        seg.rotation.x = phi;
        pivot.add(seg);
        // knuckle
        if (k > 0) {
          const kn = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 8.4, 8), ps1({ map: metal, color: 0x46484e }));
          kn.rotation.z = Math.PI / 2;
          kn.position.set(0, y0 - PROFILE[3][1] - 3.2, r0 - PROFILE[3][0]);
          pivot.add(kn);
          for (const sx of [-1, 1]) {
            const lm = glow(0xff3020, 0.1);
            this.lightMats.push(lm as THREE.ShaderMaterial);
            const l = new THREE.Mesh(new THREE.CircleGeometry(1.4, 6), lm);
            l.position.set(sx * 4.25, y0 - PROFILE[3][1] - 3.2, r0 - PROFILE[3][0]);
            l.rotation.y = (sx * Math.PI) / 2;
            pivot.add(l);
            lights.push(l);
          }
        }
      }
      // the nail, driven into the ground at the foot of the climb
      const nail = new THREE.Mesh(new THREE.ConeGeometry(3.2, 12, 4), ps1({ map: TEX.rust(), color: 0x8a7060 }));
      nail.rotation.x = Math.PI * 0.62;
      nail.position.set(0, -PROFILE[3][1] - 1, PROFILE[0][0] - PROFILE[3][0] + 4);
      pivot.add(nail);
      this.root.add(holder);
      this.fingers.push({ name: d.name, bearing: d.bearing, pivot, yaw, dir, lights });
    }
  }

  /** surface point of finger i at u (0 = foot of the climb, 1 = palm edge) */
  pointOn(i: number, u: number) {
    const f = this.fingers[i];
    let s = clamp(u) * TOTAL;
    let r = PROFILE[3][0], y = PROFILE[3][1];
    for (let k = 0; k < 3; k++) {
      if (s <= LENS[k] || k === 2) {
        const a = clamp(s / LENS[k]);
        r = PROFILE[k][0] + (PROFILE[k + 1][0] - PROFILE[k][0]) * a;
        y = PROFILE[k][1] + (PROFILE[k + 1][1] - PROFILE[k][1]) * a;
        break;
      }
      s -= LENS[k];
    }
    const pos = f.dir.clone().multiplyScalar(r).add(this.root.position);
    pos.y = y + this.root.position.y;
    return { pos, yaw: f.yaw + Math.PI }; // facing up the finger, towards the palm
  }

  /** wake 0..1; curls[i] 0..1; sink = palm/fist sinking into the ground */
  update(t: number, wake: number, curls: number[], sink: number) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 6);
    this.eyeMat.uniforms.uColor.value.setRGB(0.12 + 0.88 * wake * pulse, 0.02 + 0.1 * wake, 0.02);
    this.fingers.forEach((f, i) => {
      const c = curls[i] ?? 0;
      f.pivot.rotation.x = -1.35 * c * c * (3 - 2 * c);
      f.lights.forEach((l, j) => {
        const on = clamp(wake * 3 - j * 0.35 - i * 0.12);
        ((l.material as THREE.ShaderMaterial).uniforms.uOpacity.value = (0.1 + 0.9 * on * pulse) * (1 - c * 0.8));
      });
    });
    this.root.position.y = -sink * 46;
  }
}
