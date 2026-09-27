import * as THREE from 'three';
import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, glow, ps1, setPointLight, particles } from '../../shaders/ps1';
import { textPixels } from '../../hud/font';
import { block, ground, searchlight } from '../../environments/props';
import { TEX } from '../../renderer/textures';
import { blink, clamp, easeOutBack, easeOutCubic, hash1, ramp } from '../../core/util';

// Title screen: a voxel logo assembled out of the dark, 1998-style.

interface Voxel {
  target: THREE.Vector3;
  from: THREE.Vector3;
  delay: number;
  color: THREE.Color;
}

export class Title extends Sequence {
  voxels: Voxel[] = [];
  logo!: THREE.InstancedMesh;
  lights: THREE.Mesh[] = [];
  dust = particles({ count: 260, box: [40, 16, 20], vel: [0.2, 0.4, 0], size: 0.06, life: 6, color: 0x8090a0, opacity: 0.6, swirl: 0.4, seed: 7 });
  m4 = new THREE.Matrix4();

  build() {
    this.clearColor.setHex(0x000000);
    const G = this.group;
    const floor = ground(80, 80, TEX.metal(), [20, 20], 0x40464c, 20);
    G.add(floor);
    // logo voxels
    const add = (s: string, size: number, y: number, colorA: number, colorB: number, depth = 1) => {
      const px = textPixels(s, 1);
      const w = Math.max(...px.map((p) => p.x)) + 1;
      for (const p of px) {
        for (let d = 0; d < depth; d++) {
          const tx = (p.x - w / 2 + 0.5) * size;
          const ty = y - p.y * size;
          const c = new THREE.Color(colorA).lerp(new THREE.Color(colorB), p.y / 6);
          const i = this.voxels.length;
          this.voxels.push({
            target: new THREE.Vector3(tx, ty, -d * size),
            from: new THREE.Vector3((hash1(i * 3.1) - 0.5) * 60, ty + (hash1(i * 7.7) - 0.2) * 30, -30 - hash1(i * 1.3) * 40),
            delay: (p.x / w) * 0.9 + hash1(i * 5.5) * 0.35 + (colorA === 0xe02018 ? 0.55 : 0),
            color: c,
          });
        }
      }
    };
    add('RUNNING GEAR', 0.5, 13.0, 0xe8eef4, 0x7a8898, 2);
    add('SOLID', 1.2, 8.9, 0xff5a38, 0xb01a10, 2);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.logo = new THREE.InstancedMesh(geo, ps1({ color: 0xffffff }), this.voxels.length);
    this.voxels.forEach((v, i) => this.logo.setColorAt(i, v.color));
    this.logo.frustumCulled = false;
    G.add(this.logo);
    // steel plinth
    const plinth = block(16, 0.6, 3, TEX.metal(), 0x707880, 2);
    plinth.position.set(0, 0, -0.5);
    G.add(plinth);
    // searchlights
    for (const [x, rot] of [[-14, 0.35], [14, -0.35], [-7, 0.15], [7, -0.15]] as const) {
      const s = searchlight(0xd0e0ff, 40, 4, 0.06);
      s.position.set(x, -3, -12);
      s.rotation.z = rot;
      s.rotation.x = -0.25;
      G.add(s);
      this.lights.push(s);
    }
    this.dust.position.set(0, 4, 0);
    G.add(this.dust);

    // camera: rise from below the logo, settle front-on, slight roll
    this.shotKeys(0, cam(-3, 0.8, 12, 0, 8, -2, 62, 0.14), [
      { dur: 4.8, to: { x: 0, y: 9.0, z: 40, ty: 7.4, tz: 0, fov: 38, roll: 0 }, ease: 'power3.out' },
      { dur: 5.2, to: { z: 37, y: 8.6, fov: 37 }, ease: 'sine.inOut' },
    ]);
  }

  update(t: number, fx: FX) {
    applyLighting({ fog: 0x000000, fogNear: 18, fogFar: 70, lightDir: [0.2, -0.6, -1], light: 0xb8c4d8, lightI: 0.9, sky: 0x202838, ground: 0x050608 });
    setPointLight(0, new THREE.Vector3(0, 6, 6), 0xff5030, 16, ramp(t, 2.5, 3.6) * 1.2);
    const tt = t - 0.8;
    this.voxels.forEach((v, i) => {
      const k = clamp((tt - v.delay * 2.2) / 0.9);
      const e = easeOutCubic(k);
      const p = new THREE.Vector3().lerpVectors(v.from, v.target, e);
      const spin = (1 - e) * 6;
      const s = (i < 0 ? 1 : v.target.z === 0 ? 1 : 1) * this.voxelSize(i) * (0.2 + 0.8 * easeOutBack(k));
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(spin, spin * 0.7, 0));
      this.m4.compose(p, q, new THREE.Vector3(s, s, s));
      this.logo.setMatrixAt(i, this.m4);
    });
    this.logo.instanceMatrix.needsUpdate = true;
    this.lights.forEach((l, i) => {
      l.visible = t > 0.6 + i * 0.15;
      l.rotation.z += 0;
    });
    this.dust.material.uniforms.uTime.value = t;
    fx.fade = t < 0.6 ? 1 - t / 0.6 : 0;
    // PRESS START -> flash
    if (t > 8.25 && t < 8.6) fx.flash = 1 - (t - 8.25) / 0.35;
    if (t > 9.6) fx.fade = (t - 9.6) / 0.4;
    fx.vignette = 0.6;
  }

  voxelSize(i: number) {
    // voxels built for 'RUNNING GEAR' are small, 'SOLID' big
    return this.voxels[i].target.y > 9.6 ? 0.46 : 1.1;
  }

  drawUI(ui: UI, t: number) {
    ui.letterbox(1, 40);
    if (t > 4.4) {
      const a = ramp(t, 4.4, 5.0);
      ui.text('TACTICAL ENDURANCE ACTION', 480, 378, { scale: 2, color: COL.grey, align: 'center', alpha: a, spacing: 2 });
    }
    if (t > 5.4 && t < 8.3) {
      if (blink(t, 0.6, 0.6)) ui.text('PRESS START BUTTON', 480, 430, { scale: 2, color: COL.white, align: 'center' });
    }
    if (t >= 8.3) {
      const items = ['NEW GAME', 'CONTINUE', 'OPTIONS'];
      items.forEach((s, i) => {
        const sel = i === 0;
        ui.text((sel ? '> ' : '  ') + s, 400, 410 + i * 20, { scale: 2, color: sel ? (blink(t, 0.12) ? COL.white : COL.amber) : COL.dim });
      });
    }
    ui.text('(C) 1998 KINETIC SOFTWORKS    ALL RUNS RESERVED', 480, 510, { scale: 1, color: COL.dim, align: 'center', alpha: ramp(t, 5, 5.6) });
  }
}

void glow;
