import * as THREE from 'three';
import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, ps1, setPointLight } from '../../shaders/ps1';
import { ground, skyDome, lampPost } from '../../environments/props';
import { TEX } from '../../renderer/textures';
import { drawCodec, type CodecSpec } from '../../hud/screens';
import { clamp, ramp, rng, easeOutBack } from '../../core/util';

// THE BUILD: 18 weeks of Manchester Marathon training (15.12.2025 - 19.04.2026),
// one brick column per week, height = kilometres run that week (Strava runs,
// Monday-Sunday; "Week N/18" as the athlete logged it). 1,120 km in total.

export const WEEK_KM = [52.6, 33.4, 81.1, 69.2, 64.3, 61.1, 83.0, 41.2, 75.0, 46.6, 86.8, 80.5, 62.1, 80.8, 44.4, 59.9, 43.3, 54.3];
const NOTES: Record<number, [string, string]> = {
  7: ['! SHIN', COL.red],
  10: ['32 KM', COL.white],
  12: ['! BATH HALF', COL.red],
  13: ['10K PB', COL.green],
  15: ['! CALF', COL.red],
  17: ['RACE', COL.amber],
};
const KM_PER_BRICK = 4;
const SPACING = 1.7;
const CODEC = 6.2;

export class WallBuild extends Sequence {
  bricks!: THREE.InstancedMesh;
  brickInfo: { week: number; row: number; m: THREE.Matrix4 }[] = [];
  cam!: THREE.PerspectiveCamera;
  codec: CodecSpec = {
    caller: 'tempo',
    open: CODEC + 0.4,
    close: 9.8,
    lines: [
      { who: 'tempo', text: '18 WEEKS. 1,120 KILOMETRES. TARGET?', at: CODEC + 0.6 },
      { who: 'stride', text: 'SUB THREE.', at: CODEC + 2.4 },
    ],
  };

  build() {
    this.clearColor.setHex(0x14161c);
    this.group.add(skyDome(0x0a0c12, 0x2a2c34, 0x14161c));
    const g = ground(200, 200, TEX.concrete(), [40, 40], 0x5a5a60, 8);
    this.group.add(g);
    for (const x of [-18, 18]) {
      const l = lampPost(8, 0xffd8a0, 1.6, true);
      l.position.set(x, 0, 3);
      l.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.group.add(l);
    }
    const total = WEEK_KM.reduce((a, k) => a + Math.round(k / KM_PER_BRICK), 0) * 2;
    this.bricks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.56, 0.42, 0.8), ps1({ map: TEX.brick(), color: 0xc08070 }), total);
    let n = 0;
    WEEK_KM.forEach((km, w) => {
      const rows = Math.round(km / KM_PER_BRICK);
      const x0 = (w - 8.5) * SPACING;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < 2; c++) {
          const m = new THREE.Matrix4().makeTranslation(x0 - 0.29 + c * 0.58 + (r % 2 ? 0.06 : -0.06), 0.21 + r * 0.44, 0);
          this.brickInfo.push({ week: w, row: r, m });
          this.bricks.setMatrixAt(n++, m);
        }
      }
    });
    this.bricks.count = n;
    this.bricks.frustumCulled = false;
    this.group.add(this.bricks);

    this.shot(0, CODEC, cam(-3, 4.5, 34, 0, 4.2, 0, 44), cam(2, 5, 31, 0, 4.5, 0, 44), 'sine.inOut');
    this.shot(CODEC, 10 - CODEC, cam(2, 5, 31, 0, 4.5, 0, 44), cam(2, 5, 31, 0, 4.5, 0, 44), 'none');
  }

  weekT(w: number) {
    return 0.5 + w * 0.26;
  }

  update(t: number, fx: FX, camera: THREE.PerspectiveCamera) {
    this.cam = camera;
    applyLighting({ fog: 0x14161c, fogNear: 30, fogFar: 90, lightDir: [-0.3, -1, -0.6], light: 0xb0b8c8, lightI: 0.9, sky: 0x505868, ground: 0x181818, ambient: 0x202020 });
    setPointLight(0, new THREE.Vector3(-17, 8, 4), 0xffc080, 26, 1.2);
    setPointLight(1, new THREE.Vector3(17, 8, 4), 0xffc080, 26, 1.2);
    const m = new THREE.Matrix4();
    this.brickInfo.forEach((b, i) => {
      const at = this.weekT(b.week) + b.row * 0.012;
      const k = clamp((t - at) / 0.18);
      if (k <= 0) {
        m.makeScale(0, 0, 0);
      } else {
        const drop = (1 - easeOutBack(k)) * 2.5;
        m.copy(b.m);
        m.elements[13] += drop;
      }
      this.bricks.setMatrixAt(i, m);
    });
    this.bricks.instanceMatrix.needsUpdate = true;
    fx.sceneMix = t >= CODEC ? 0 : 1;
    fx.static = t >= CODEC && t < CODEC + 0.4 ? 0.5 : 0;
    fx.scan = t >= CODEC ? 0.12 : 0;
    fx.fade = t < 0.25 ? 1 - t / 0.25 : t > 9.8 ? (t - 9.8) / 0.2 : 0;
  }

  private screen(x: number, y: number, z: number) {
    this.cam.updateMatrixWorld();
    const v = new THREE.Vector3(x, y, z).project(this.cam);
    return [((v.x + 1) / 2) * 960, ((1 - v.y) / 2) * 540];
  }

  drawUI(ui: UI, t: number) {
    if (t >= CODEC) {
      drawCodec(ui, this.codec, t);
      return;
    }
    ui.letterbox(1);
    ui.text('MANCHESTER MARATHON // TRAINING BLOCK', 24, 44, { scale: 2, color: COL.amber, alpha: ramp(t, 0.1, 0.4) });
    let sum = 0;
    WEEK_KM.forEach((km, w) => {
      if (t < this.weekT(w)) return;
      sum += km;
      if (!this.cam) return;
      const top = Math.round(km / KM_PER_BRICK) * 0.44;
      const [sx, sy] = this.screen((w - 8.5) * SPACING, top + 0.3, 0);
      const a = clamp((t - this.weekT(w)) / 0.2);
      ui.text(String(Math.round(km)), sx, sy - 16, { scale: 1, color: COL.white, align: 'center', alpha: a });
      const [bx, by] = this.screen((w - 8.5) * SPACING, 0, 0.6);
      ui.text(String(w + 1), bx, by + 6, { scale: 1, color: COL.grey, align: 'center', alpha: a });
      const note = NOTES[w];
      if (note) ui.text(note[0], sx, sy - 34 - (w % 2) * 12, { scale: 1, color: note[1], align: 'center', alpha: clamp((t - this.weekT(w) - 0.2) / 0.2) });
    });
    ui.text(`WEEK`, 24, 70, { scale: 2, color: COL.grey });
    ui.text(`${Math.min(18, Math.max(0, Math.floor((t - 0.5) / 0.26) + 1))}/18`, 90, 70, { scale: 2, color: COL.white });
    ui.text(`${Math.round(sum).toLocaleString('en-GB')} KM`, 936, 44, { scale: 3, color: COL.white, align: 'right' });
    if (t > 4.2) {
      const a = clamp((t - 4.2) / 0.3);
      ui.rect(250, 440, 460, 34, '#000', 0.7 * a);
      ui.text('MARCH 2026: 311 KM - BIGGEST MONTH ON RECORD', 480, 450, { scale: 2, color: COL.amber, align: 'center', alpha: a });
    }
    void rng;
  }
}
