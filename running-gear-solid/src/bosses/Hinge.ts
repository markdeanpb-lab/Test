import * as THREE from 'three';
import { ps1, particles } from '../shaders/ps1';
import { TEX } from '../renderer/textures';
import { block } from '../environments/props';

// HINGE: a colossal rusted hydraulic knee riding a rail on the viaduct.
// Its "eyes" are the warning lamps on the knee drum.

export class HingeBoss {
  readonly root = new THREE.Group();
  readonly hip = new THREE.Group();
  readonly knee = new THREE.Group();
  readonly lamps: THREE.Mesh[] = [];
  readonly steam = particles({ count: 160, box: [3, 1, 3], vel: [0, 3.5, 0], size: 0.5, life: 1.8, color: 0xd8dce0, opacity: 0.5, swirl: 0.8, seed: 3 });
  readonly sparks = particles({ count: 120, box: [1.5, 0.5, 1.5], vel: [0, -6, 0], size: 0.12, life: 0.6, color: 0xffc040, opacity: 1, swirl: 2.5, additive: true, seed: 9 });
  private lampOn = ps1({ color: 0xff2010, emissive: 0xff3020, unlit: true });
  private lampOk = ps1({ color: 0x20ff40, emissive: 0x30ff50, unlit: true });
  private lampOff = ps1({ color: 0x401010 });
  private pistons: { a: THREE.Mesh; b: THREE.Mesh }[] = [];

  constructor() {
    const rust = TEX.rust();
    const metal = TEX.metal();
    // carriage riding on the viaduct
    const carriage = block(8, 3, 6, metal, 0x8a8a84, 2);
    this.root.add(carriage);
    for (const x of [-3, 3])
      for (const z of [-2.4, 2.4]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 8), ps1({ color: 0x303030 }));
        w.rotation.x = Math.PI / 2;
        w.position.set(x, 0.3, z);
        this.root.add(w);
      }
    // hip pivot hangs over the road side (+z)
    this.hip.position.set(0, 2, 3.2);
    this.root.add(this.hip);
    const hipDrum = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3.2, 10), ps1({ map: rust, color: 0xb09080 }));
    hipDrum.rotation.z = Math.PI / 2;
    this.hip.add(hipDrum);
    const thigh = block(2.6, 12, 2.4, rust, 0xc0a090, 3);
    thigh.geometry.translate(0, -12, 0);
    this.hip.add(thigh);
    this.knee.position.y = -12;
    this.hip.add(this.knee);
    const kneeDrum = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 3.4, 10), ps1({ map: metal, color: 0x9a9a98 }));
    kneeDrum.rotation.z = Math.PI / 2;
    this.knee.add(kneeDrum);
    // bolts around the drum
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      for (const s of [-1, 1]) {
        const b = block(0.3, 0.3, 0.3, null, 0xd0d0c8);
        b.position.set(s * 1.75, Math.sin(a) * 1.5 - 0.15, Math.cos(a) * 1.5);
        this.knee.add(b);
      }
    }
    // warning lamps (eyes) on the front of the knee
    for (const x of [-0.7, 0.7]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.4), this.lampOff);
      l.position.set(x * 1.3, 0.3, 2.1);
      this.knee.add(l);
      this.lamps.push(l);
    }
    const shin = block(2.2, 12, 2.1, rust, 0xb89888, 3);
    shin.geometry.translate(0, -12, 0);
    this.knee.add(shin);
    const foot = block(4.2, 1.6, 5, TEX.hazard(), 0xffffff, 1.2);
    foot.position.set(0, -13.4, 0.6);
    this.knee.add(foot);
    // hydraulic pistons across the knee (visual only)
    for (const x of [-1.5, 1.5]) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5, 6), ps1({ color: 0x505458 }));
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 5, 6), ps1({ color: 0xd8d8d8 }));
      this.root.add(a, b);
      this.pistons.push({ a, b });
      a.userData.x = x;
    }
    this.steam.position.set(0, 0, 0);
    this.knee.add(this.steam);
    this.sparks.position.set(0, -13.8, 0.6);
    this.knee.add(this.sparks);
  }

  /** Solve hip/knee angles so the foot sole reaches a world-space point (IK). */
  reach(world: THREE.Vector3) {
    const S = this.root.scale.x;
    const dz = (world.z - this.root.position.z) / S - this.hip.position.z;
    const dy = (world.y - this.root.position.y) / S - this.hip.position.y;
    const L1 = 12, L2 = 13.4;
    let d = Math.hypot(dz, dy);
    d = Math.min(d, L1 + L2 - 0.01);
    const phi = Math.atan2(dz, -dy);
    const cosK = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
    const a2 = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosK)));
    const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
    const a1 = phi + Math.acos(Math.max(-1, Math.min(1, cosA)));
    return { hip: a1, knee: a2 };
  }

  /** hipA: forward swing (rad), kneeA: bend (rad), mood: 0 off,1 angry,2 ok */
  pose(hipA: number, kneeA: number, mood: 0 | 1 | 2, t: number, strain = 0) {
    this.hip.rotation.x = -hipA;
    this.knee.rotation.x = kneeA;
    const flash = Math.sin(t * 14) > 0;
    this.lamps.forEach((l, i) => {
      l.material = mood === 2 ? this.lampOk : mood === 1 && (flash || i === 0) ? this.lampOn : this.lampOff;
    });
    (this.steam.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.steam.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.25 + strain * 0.5;
    (this.sparks.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.sparks.material as THREE.ShaderMaterial).uniforms.uOpacity.value = strain;
    // pistons from carriage to shin
    this.root.updateMatrixWorld(true);
    const top = new THREE.Vector3(), bot = new THREE.Vector3();
    for (const p of this.pistons) {
      const x = p.a.userData.x as number;
      this.hip.localToWorld(top.set(x, -4, 1.4));
      this.knee.localToWorld(bot.set(x, -3, 1.2));
      this.root.worldToLocal(top);
      this.root.worldToLocal(bot);
      const mid = top.clone().add(bot).multiplyScalar(0.5);
      const dir = bot.clone().sub(top);
      const len = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      p.a.position.copy(top.clone().lerp(mid, 0.5));
      p.a.quaternion.copy(q);
      p.a.scale.set(1, len / 10, 1);
      p.b.position.copy(bot.clone().lerp(mid, 0.5));
      p.b.quaternion.copy(q);
      p.b.scale.set(1, len / 10, 1);
    }
  }
}
