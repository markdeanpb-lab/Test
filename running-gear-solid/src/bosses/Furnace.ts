import * as THREE from 'three';
import { block, chimney } from '../environments/props';
import { glow, particles, ps1 } from '../shaders/ps1';
import { TEX } from '../renderer/textures';
import { clamp } from '../core/util';

// FURNACE: a riverside thermal plant that wakes up at halfway. Its mouth is a
// grated furnace door, its eyes two inspection ports, its breath the heat
// haze over the course.

export class Furnace {
  readonly root = new THREE.Group();
  private mouth: THREE.Mesh;
  private mouthMat: THREE.ShaderMaterial;
  private eyes: THREE.Mesh[] = [];
  private stackTops: THREE.Mesh[] = [];
  readonly embers = particles({ count: 260, box: [26, 4, 10], vel: [0, 7, 1.5], size: 0.45, life: 2.4, color: 0xffa040, opacity: 0.9, swirl: 1.2, additive: true, seed: 71 });
  readonly smoke: THREE.Points[] = [];
  private grille: THREE.Group = new THREE.Group();

  constructor() {
    const brick = TEX.brick();
    const hall = block(46, 22, 20, brick, 0x9a6a58, 4);
    this.root.add(hall);
    const roof = block(48, 2, 22, TEX.metal(), 0x5a5048, 2);
    roof.position.y = 22;
    this.root.add(roof);
    // stepped shoulders
    for (const sx of [-1, 1]) {
      const wing = block(14, 14, 18, brick, 0x8a5a4a, 4);
      wing.position.set(sx * 30, 0, 1);
      this.root.add(wing);
    }
    // chimneys
    for (const [x, h] of [[-15, 58], [15, 52]] as const) {
      const c = chimney(3.2, 2.2, h, 0x7a6a62);
      c.position.set(x, 22, -3);
      this.root.add(c);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.2, 8), ps1({ color: 0x401000, unlit: true }));
      top.position.set(x, 22 + h, -3);
      this.root.add(top);
      this.stackTops.push(top);
      const sm = particles({ count: 120, box: [4, 2, 4], vel: [3, 9, 0], size: 2.6, life: 5, color: 0x3a3230, opacity: 0.7, swirl: 2, seed: 90 + x });
      sm.position.set(x, 23 + h, -3);
      this.root.add(sm);
      this.smoke.push(sm);
    }
    // furnace mouth
    const frame = block(22, 11, 1.2, TEX.rust(), 0xb08060, 4);
    frame.position.set(0, 0.5, 10.2);
    this.root.add(frame);
    this.mouthMat = ps1({ color: 0x100400, unlit: true });
    this.mouth = new THREE.Mesh(new THREE.PlaneGeometry(19, 8.5), this.mouthMat);
    this.mouth.position.set(0, 5.6, 10.85);
    this.root.add(this.mouth);
    for (let i = 0; i < 9; i++) {
      const bar = block(0.7, 8.8, 0.6, TEX.metal(), 0x2a2420, 2);
      bar.position.set(-8.8 + i * 2.2, 1.2, 11.1);
      this.grille.add(bar);
    }
    this.root.add(this.grille);
    // eyes: inspection ports
    for (const x of [-7, 7]) {
      const ring = block(4.2, 4.2, 0.8, TEX.metal(), 0x6a6460, 2);
      ring.position.set(x, 14, 10.3);
      this.root.add(ring);
      const eye = new THREE.Mesh(new THREE.CircleGeometry(1.5, 8), ps1({ color: 0x200800, unlit: true }));
      eye.position.set(x, 16.1, 10.75);
      this.root.add(eye);
      this.eyes.push(eye);
    }
    // warning lights across the top
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), glow(0xff3020, 0.9));
      l.position.set(-20 + i * 8, 23.4, 10.6);
      this.root.add(l);
    }
    const heatGlow = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), glow(0xff5010, 0.12));
    heatGlow.position.set(0, 6, 11.5);
    this.root.add(heatGlow);
    this.embers.position.set(0, 4, 14);
    this.root.add(this.embers);
  }

  /** heat 0 (dormant) .. 1 (meltdown) */
  update(t: number, heat: number) {
    const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.1);
    const h = clamp(heat);
    this.mouthMat.uniforms.uColor.value.setRGB(0.06 + 0.9 * h * flick, 0.02 + 0.35 * h * flick, 0.0);
    for (const e of this.eyes) (e.material as THREE.ShaderMaterial).uniforms.uColor.value.setRGB(0.1 + 0.9 * h, 0.05 + 0.6 * h, 0.02);
    for (const s of this.stackTops) (s.material as THREE.ShaderMaterial).uniforms.uColor.value.setRGB(0.2 + 0.8 * h * flick, 0.05 + 0.25 * h, 0);
    const em = this.embers.material as THREE.ShaderMaterial;
    em.uniforms.uTime.value = t;
    em.uniforms.uOpacity.value = 0.9 * h;
    for (const s of this.smoke) {
      const m = s.material as THREE.ShaderMaterial;
      m.uniforms.uTime.value = t;
      m.uniforms.uOpacity.value = 0.25 + 0.5 * h;
    }
    // the grille rattles as it wakes
    this.grille.position.x = h > 0.3 ? Math.sin(t * 31) * 0.12 * h : 0;
  }
}
