import * as THREE from 'three';
import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, glow, ps1, setPointLight } from '../../shaders/ps1';
import { ground, crt, block } from '../../environments/props';
import { TEX } from '../../renderer/textures';
import { CAREER } from '../../data/career';
import { clamp, ramp, rng, easeOutExpo } from '../../core/util';

// SERVICE RECORD: the whole career, 14.05.2020 - 27.09.2026, in a data room.
// Every figure is from the Strava history (see data/career.ts).

const BARS = 5.2, PBS = 9.2;
const EVEREST = 8849;

export class Records extends Sequence {
  bars: THREE.Mesh[] = [];
  cam!: THREE.PerspectiveCamera;

  build() {
    this.clearColor.setHex(0x020604);
    const fl = ground(80, 80, TEX.panel(), [20, 20], 0x3a4a40, 4);
    this.group.add(fl);
    // banks of monitors on three walls
    const r = rng(9219);
    for (let side = 0; side < 3; side++) {
      for (let i = 0; i < 9; i++) {
        for (let row = 0; row < 3; row++) {
          const m = crt(1.4, 1.05, TEX.xray(), r() < 0.2 ? 0xffb830 : 0x40ff60);
          const x = -8 + i * 2;
          m.group.position.set(0, row * 1.25, 0);
          const g = new THREE.Group();
          g.add(m.group);
          if (side === 0) g.position.set(x, 0, -12);
          if (side === 1) {
            g.position.set(-12, 0, x);
            g.rotation.y = Math.PI / 2;
          }
          if (side === 2) {
            g.position.set(12, 0, x);
            g.rotation.y = -Math.PI / 2;
          }
          this.group.add(g);
        }
      }
    }
    // yearly distance as glowing columns
    const maxKm = Math.max(...CAREER.yearly.map((y) => y.km));
    CAREER.yearly.forEach((y, i) => {
      const h = (y.km / maxKm) * 4.6;
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1, 1.1), ps1({ color: y.partial ? 0xffb830 : 0x6cf07a, unlit: true }));
      b.geometry.translate(0, 0.5, 0);
      b.position.set((i - 3) * 1.8, 0.02, 0);
      b.userData.h = h;
      this.group.add(b);
      this.bars.push(b);
      const base = block(1.5, 0.1, 1.5, null, 0x1a2a20);
      base.position.set((i - 3) * 1.8, 0, 0);
      this.group.add(base);
    });
    const halo = new THREE.Mesh(new THREE.CircleGeometry(9, 16), glow(0x2c7a3a, 0.25));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.03;
    this.group.add(halo);

    this.shotKeys(0, cam(-9, 4, 13, 0, 2.5, 0, 46), [{ dur: 14, to: { x: 8, y: 5, z: 12, tx: 0, ty: 2.8 }, ease: 'sine.inOut' }]);
  }

  update(t: number, fx: FX, camera: THREE.PerspectiveCamera) {
    this.cam = camera;
    applyLighting({ fog: 0x020604, fogNear: 14, fogFar: 40, lightDir: [0, -1, 0], light: 0x40a060, lightI: 0.35, sky: 0x103018, ground: 0x000000, ambient: 0x081008 });
    setPointLight(0, new THREE.Vector3(0, 6, 3), 0x6cf07a, 18, 1.0);
    this.bars.forEach((b, i) => {
      const k = easeOutExpo(clamp((t - BARS - i * 0.18) / 0.6));
      b.scale.y = Math.max(0.001, (b.userData.h as number) * k);
      b.visible = k > 0;
    });
    fx.scan = 0.1;
    fx.fade = t < 0.3 ? 1 - t / 0.3 : t > 13.7 ? (t - 13.7) / 0.3 : 0;
  }

  private screen(v3: THREE.Vector3) {
    this.cam.updateMatrixWorld();
    const v = v3.clone().project(this.cam);
    return [((v.x + 1) / 2) * 960, ((1 - v.y) / 2) * 540];
  }

  drawUI(ui: UI, t: number) {
    ui.text('SERVICE RECORD', 480, 20, { scale: 4, color: COL.green, align: 'center', alpha: ramp(t, 0.2, 0.5) });
    ui.text(`${CAREER.firstRun} - ${CAREER.asOf}`, 480, 58, { scale: 2, color: COL.greenDim, align: 'center', alpha: ramp(t, 0.4, 0.7) });
    if (t < BARS) {
      const rows: [string, number, string][] = [
        ['RUNS LOGGED', CAREER.runs, ''],
        ['DISTANCE', CAREER.distanceKm, ' KM'],
        ['TIME ON FEET', CAREER.movingHours, ' H'],
        ['CLIMBED', CAREER.elevationM, ' M'],
      ];
      ui.rect(220, 110, 520, 250, '#000', 0.7 * clamp(t / 0.3));
      rows.forEach(([k, v, unit], i) => {
        const at = 0.6 + i * 0.5;
        if (t < at) return;
        const n = Math.round(v * easeOutExpo(clamp((t - at) / 0.9)));
        const y = 130 + i * 52;
        ui.text(k, 240, y + 8, { scale: 2, color: COL.grey });
        ui.text(n.toLocaleString('en-GB') + unit, 720, y, { scale: 4, color: COL.white, align: 'right' });
      });
      if (t > 3.4) ui.text(`= ${(CAREER.elevationM / EVEREST).toFixed(1)} X EVEREST`, 720, 332, { scale: 2, color: COL.amber, align: 'right', alpha: ramp(t, 3.4, 3.7) });
      return;
    }
    if (t < PBS) {
      ui.text('KILOMETRES PER YEAR', 480, 100, { scale: 2, color: COL.green, align: 'center' });
      if (!this.cam) return;
      CAREER.yearly.forEach((y, i) => {
        const b = this.bars[i];
        const [sx, sy] = this.screen(new THREE.Vector3(b.position.x, b.scale.y + 0.4, 0));
        const [bx, by] = this.screen(new THREE.Vector3(b.position.x, -0.3, 0.8));
        const a = clamp((t - BARS - i * 0.18 - 0.3) / 0.3);
        ui.text(Math.round(y.km).toLocaleString('en-GB'), sx, sy - 14, { scale: 2, color: y.partial ? COL.amber : COL.white, align: 'center', alpha: a });
        ui.text(String(y.year) + (y.partial ? '*' : ''), bx, by, { scale: 2, color: COL.grey, align: 'center', alpha: a });
      });
      ui.text('* TO 27.09.2026', 900, 500, { scale: 1, color: COL.dim, align: 'right', alpha: ramp(t, BARS + 1.5, BARS + 1.8) });
      ui.text(`BIGGEST MONTH: ${CAREER.biggestMonth.month} - ${CAREER.biggestMonth.km} KM`, 480, 470, { scale: 2, color: COL.amber, align: 'center', alpha: ramp(t, BARS + 1.8, BARS + 2.1) });
      return;
    }
    // personal bests
    const pt = t - PBS;
    ui.rect(150, 100, 660, 380, '#000', 0.78 * clamp(pt / 0.3));
    ui.text('PERSONAL BESTS', 480, 116, { scale: 3, color: COL.white, align: 'center', alpha: ramp(pt, 0.1, 0.3) });
    CAREER.pbs.forEach((p, i) => {
      const at = 0.3 + i * 0.3;
      if (pt < at) return;
      const y = 160 + i * 40;
      const a = clamp((pt - at) / 0.2);
      ui.text(p.event, 180, y + 6, { scale: 2, color: COL.green, alpha: a });
      ui.text(`${p.where} ${p.date}`, 330, y + 8, { scale: 1, color: COL.grey, alpha: a });
      ui.text(p.time, 790, y, { scale: 3, color: COL.white, align: 'right', alpha: a });
    });
    const extra: [string, string][] = [
      ['FINSBURY PARKRUNS', String(CAREER.finsburyParkruns)],
      ['HIGHEST RELATIVE EFFORT', `${CAREER.highestRelativeEffort.value} (RICHMOND)`],
    ];
    extra.forEach(([k, v], i) => {
      const at = 2.0 + i * 0.3;
      if (pt < at) return;
      const y = 380 + i * 30;
      ui.text(k, 180, y + 4, { scale: 2, color: COL.grey, alpha: clamp((pt - at) / 0.2) });
      ui.text(v, 790, y, { scale: 2, color: COL.amber, align: 'right', alpha: clamp((pt - at) / 0.2) });
    });
  }
}
