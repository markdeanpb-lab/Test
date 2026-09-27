import * as THREE from 'three';
import { ps1, particles, glow } from '../shaders/ps1';
import { TEX } from '../renderer/textures';
import { block, sevenSeg } from '../environments/props';
import { hash1, clamp } from '../core/util';

// DOUBLE ZERO: a dockside sentinel whose head is a four-digit race clock.
// Arms are wind turbines. It can only be hurt by a time below 20:00.

export class ClockSentinel {
  readonly root = new THREE.Group();
  readonly head = new THREE.Group();
  readonly digits: ReturnType<typeof sevenSeg>[] = [];
  readonly digitGroups: THREE.Group[] = [];
  readonly colon: THREE.Mesh[] = [];
  readonly rotors: THREE.Group[] = [];
  readonly wind = particles({ count: 220, box: [30, 14, 12], vel: [-26, 0, 0], size: 0.35, life: 1.2, color: 0xe8f0ff, opacity: 0.55, seed: 21 });
  private shardSeeds: number[] = [];

  constructor() {
    const metal = TEX.metal();
    // legs
    for (const x of [-2.4, 2.4]) {
      const leg = block(1.6, 9, 1.8, metal, 0x6a7078, 2);
      leg.position.x = x;
      this.root.add(leg);
      const foot = block(2.4, 0.8, 3, TEX.hazard(), 0xffffff, 1);
      foot.position.x = x;
      this.root.add(foot);
    }
    const hips = block(6.4, 1.6, 2.4, metal, 0x5a6068, 2);
    hips.position.y = 9;
    this.root.add(hips);
    const torso = block(5.2, 6, 3, metal, 0x8a9098, 2);
    torso.position.y = 10.6;
    this.root.add(torso);
    const stripe = block(5.3, 0.6, 3.1, TEX.hazard(), 0xffffff, 1);
    stripe.position.y = 13.4;
    this.root.add(stripe);
    // turbine arms
    for (const side of [-1, 1]) {
      const arm = block(4, 1.2, 1.2, metal, 0x5a6068, 2);
      arm.position.set(side * 4.4, 15, 0);
      this.root.add(arm);
      const nacelle = block(1.8, 1.8, 3, metal, 0xc8ccd0, 2);
      nacelle.position.set(side * 6.8, 14.1, 0);
      this.root.add(nacelle);
      const rotor = new THREE.Group();
      rotor.position.set(side * 6.8, 15, 1.7);
      for (let b = 0; b < 3; b++) {
        const blade = block(0.5, 5.5, 0.12, null, 0xe8e8e0);
        blade.rotation.z = (b / 3) * Math.PI * 2;
        rotor.add(blade);
      }
      const hub = block(0.8, 0.8, 0.8, null, 0xff3020, 8, { emissive: 0x401008 });
      hub.position.y = -0.4;
      rotor.add(hub);
      this.root.add(rotor);
      this.rotors.push(rotor);
    }
    // head: display panel
    this.head.position.y = 17.2;
    this.root.add(this.head);
    const panel = block(11, 5, 1.6, null, 0x101216);
    panel.position.y = -0.5;
    this.head.add(panel);
    const bezel = block(11.6, 0.5, 1.8, metal, 0x9aa0a8, 2);
    bezel.position.y = 4.4;
    this.head.add(bezel);
    const bezel2 = bezel.clone();
    bezel2.position.y = -0.8;
    this.head.add(bezel2);
    const xs = [-4.1, -1.6, 1.6, 4.1];
    for (let i = 0; i < 4; i++) {
      const d = sevenSeg(1.6, 0.35, 0xff3a20, 0x2a0a08);
      const g = new THREE.Group();
      g.add(d.group);
      g.position.set(xs[i], 2, 0.85);
      this.head.add(g);
      this.digits.push(d);
      this.digitGroups.push(g);
      this.shardSeeds.push(i * 17.3);
    }
    for (const y of [2.8, 1.2]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.3), ps1({ color: 0xff3a20, emissive: 0xff3a20, unlit: true }));
      c.position.set(0, y, 0.9);
      this.head.add(c);
      this.colon.push(c);
    }
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5), glow(0xff3020, 0.08));
    halo.position.set(0, 2, 1.0);
    this.head.add(halo);
    this.wind.position.set(0, 7, 6);
    this.root.add(this.wind);
  }

  /** show a clock string like "19:25" */
  show(text: string, colonOn = true) {
    const ch = text.replace(':', '').padStart(4, ' ').slice(-4);
    for (let i = 0; i < 4; i++) this.digits[i].set(i === 0 && ch[0] === '0' ? ' ' : ch[i]);
    this.colon.forEach((c) => (c.visible = colonOn));
  }

  update(t: number, windStrength: number, shatter: number) {
    this.rotors.forEach((r, i) => (r.rotation.z = t * (6 + windStrength * 10) * (i ? -1 : 1)));
    const wm = this.wind.material as THREE.ShaderMaterial;
    wm.uniforms.uTime.value = t;
    wm.uniforms.uOpacity.value = 0.55 * windStrength;
    // shatter: digits fly apart
    this.digitGroups.forEach((g, i) => {
      const s = shatter;
      const seed = this.shardSeeds[i];
      g.position.z = 0.85 + s * (4 + hash1(seed) * 6);
      g.position.y = 2 + s * (hash1(seed + 1) * 6 - 1) - s * s * 14;
      g.position.x = [-4.1, -1.6, 1.6, 4.1][i] + s * (hash1(seed + 2) - 0.5) * 12;
      g.rotation.set(s * hash1(seed + 3) * 9, s * hash1(seed + 4) * 7, s * hash1(seed + 5) * 11);
    });
    this.head.rotation.z = shatter > 0 ? Math.sin(t * 40) * 0.02 * clamp(1 - shatter) : 0;
  }
}
