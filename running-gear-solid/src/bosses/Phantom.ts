import * as THREE from 'three';
import { Runner } from '../runner/Runner';
import { glow, ps1 } from '../shaders/ps1';
import { signTexture } from '../renderer/textures';
import { hash1 } from '../core/util';

// PHANTOM 1:30: a wireframe pace-runner hologram carrying a 1:30 flag.

export class Phantom {
  readonly body = new Runner('club');
  readonly root = new THREE.Group();
  readonly ghosts: Runner[] = [];
  readonly flag: THREE.Group = new THREE.Group();
  private mats: THREE.Material[] = [];
  private ghostMats: THREE.Material[] = [];
  private edgeMat = new THREE.LineBasicMaterial({ color: 0x7ffff0, transparent: true, opacity: 0.9 });

  constructor() {
    this.root.add(this.body.root);
    this.hologram(this.body, 0.35);
    for (let i = 0; i < 3; i++) {
      const g = new Runner('club');
      this.hologram(g, 0.12 - i * 0.03, false);
      this.ghosts.push(g);
      this.root.add(g.root);
    }
    // pacer flag on a pole strapped to the back
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.03), glow(0x9ffff4, 0.8));
    pole.position.set(0, 1.9, -0.18);
    this.flag.add(pole);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.42), ps1({ map: signTexture('1:30', '#0a1a18', '#8ffff0', 32, 20, 1), unlit: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    sign.position.set(0.36, 2.4, -0.18);
    this.flag.add(sign);
    this.body.torso.add(this.flag);
    this.flag.position.y = -0.96;
  }

  private hologram(r: Runner, opacity: number, edges = true) {
    r.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = glow(0x40ffe0, opacity);
      (edges ? this.mats : this.ghostMats).push(mat);
      m.material = mat;
      if (edges) {
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), this.edgeMat);
        m.add(e);
      }
    });
  }

  /** flicker/intensity 0..1, disintegration 0..1 */
  setState(t: number, intensity: number, dissolve = 0) {
    const flick = 0.75 + 0.25 * Math.sin(t * 37) * Math.sin(t * 11.3);
    this.edgeMat.opacity = 0.9 * intensity * flick * (1 - dissolve);
    this.root.visible = intensity > 0.01;
    let i = 0;
    this.body.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      i++;
      if (dissolve > 0) {
        const h = hash1(i * 3.7);
        m.position.y += 0; // parts are driven by the pose; offset via scale below
        m.scale.setScalar(Math.max(0.001, 1 - dissolve * (0.5 + h)));
      } else m.scale.setScalar(1);
    });
    for (const m of this.mats) (m as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.3 * intensity * flick * (1 - dissolve);
    for (const m of this.ghostMats) (m as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.08 * intensity * (1 - dissolve);
  }
}
