import * as THREE from 'three';
import { glow, particles, ps1 } from '../shaders/ps1';
import { TEX } from '../renderer/textures';
import { clamp, hash1 } from '../core/util';

// THE WALL: named by the athlete ("The Wall Won."). Invisible for 26 km - a
// heat-haze ghost at the end of the road - then it rises out of the tarmac
// brick by brick and presses against the runner to the finish.

const COLS = 22, ROWS = 24, BW = 1.2, BH = 0.6;

export class Wall {
  readonly root = new THREE.Group();
  readonly solid: THREE.InstancedMesh;
  readonly ghost: THREE.Mesh;
  readonly dust = particles({ count: 240, box: [28, 3, 6], vel: [0, 4, 3], size: 0.7, life: 1.6, color: 0x9a8a78, opacity: 0.7, swirl: 1.5, seed: 44 });
  private slots: { m: THREE.Matrix4; row: number; col: number; seed: number }[] = [];
  private tmp = new THREE.Matrix4();
  readonly width = COLS * BW;
  readonly height = ROWS * BH;

  constructor() {
    this.solid = new THREE.InstancedMesh(new THREE.BoxGeometry(BW * 0.96, BH * 0.9, 1.4), ps1({ map: TEX.brick(), color: 0xb87060 }), COLS * ROWS);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c - COLS / 2 + 0.5 + (r % 2 ? 0.25 : -0.25)) * BW;
        const m = new THREE.Matrix4().makeTranslation(x, BH / 2 + r * BH, 0);
        const i = r * COLS + c;
        this.slots.push({ m, row: r, col: c, seed: hash1(i * 7.31) });
        this.solid.setMatrixAt(i, m);
      }
    }
    this.solid.frustumCulled = false;
    this.root.add(this.solid);
    this.ghost = new THREE.Mesh(new THREE.PlaneGeometry(this.width, this.height), glow(0xc08870, 0.15, TEX.brick()));
    (this.ghost.material as THREE.ShaderMaterial).uniforms.uUvScale.value.set(COLS / 2, ROWS / 2);
    this.ghost.position.y = this.height / 2;
    this.root.add(this.ghost);
    this.dust.position.set(0, 1, -2);
    this.root.add(this.dust);
  }

  /** ghost 0..1 visibility; rise 0..1 build progress; t for flicker/dust */
  update(t: number, ghost: number, rise: number, shake: number) {
    const gm = this.ghost.material as THREE.ShaderMaterial;
    gm.uniforms.uOpacity.value = ghost * (0.3 + 0.12 * Math.sin(t * 13) * Math.sin(t * 5.3));
    this.ghost.visible = ghost > 0.01;
    this.solid.visible = rise > 0;
    if (rise > 0) {
      this.slots.forEach((s, i) => {
        // bottom rows first, centre outwards, with jitter
        const order = (s.row / ROWS) * 0.75 + (Math.abs(s.col - COLS / 2) / COLS) * 0.15 + s.seed * 0.1;
        const k = clamp((rise - order) / 0.12);
        if (k <= 0) {
          this.tmp.makeScale(0, 0, 0);
        } else {
          this.tmp.copy(s.m);
          const e = 1 - (1 - k) * (1 - k);
          this.tmp.elements[13] = s.m.elements[13] - (1 - e) * (3 + s.row * BH);
          this.tmp.elements[12] += Math.sin(t * 40 + s.seed * 30) * 0.03 * shake;
        }
        this.solid.setMatrixAt(i, this.tmp);
      });
      this.solid.instanceMatrix.needsUpdate = true;
    }
    const dm = this.dust.material as THREE.ShaderMaterial;
    dm.uniforms.uTime.value = t;
    dm.uniforms.uOpacity.value = rise > 0 && rise < 1 ? 0.7 : 0.2 * shake;
  }
}
