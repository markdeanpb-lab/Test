import * as THREE from 'three';
import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, glow, ps1 } from '../../shaders/ps1';
import { TEX } from '../../renderer/textures';
import { SETBACK_LOG, PEAK_2024 } from '../../data/career';
import { drawDataPanel, drawLogCard, drawStamp, drawCaption } from '../../hud/screens';
import { blink, clamp, easeOutExpo, ramp, window01 } from '../../core/util';

// SETBACK (autumn 2024). Peak form ends in sore ankles; the Valencia marathon
// build is cancelled ("Valencia marathon dream over - we will come back
// stronger", 01.11.2024). A later activity description names it a stress reaction.

const XRAY = 3.0, CANCEL = 7.0, GYM = 9.5, CONT = 11.3;

export class Setback extends Sequence {
  bones = new THREE.Group();
  hot!: THREE.Mesh;
  scan!: THREE.Mesh;

  build() {
    this.clearColor.setHex(0x02060a);
    // light box
    const box = new THREE.Mesh(new THREE.PlaneGeometry(26, 16), ps1({ map: TEX.xray(), color: 0x6a90a8, unlit: true, uvScale: [4, 3] }));
    box.position.set(0, 4, -6);
    this.group.add(box);
    // lower leg and foot, drawn as X-ray bones
    const boneMat = glow(0x8ab8d0, 0.16);
    const edge = new THREE.LineBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.55 });
    const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, boneMat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge));
      this.bones.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(0.55, 0.75, 9, 6), 0, 6.2, 0); // tibia
    add(new THREE.CylinderGeometry(0.22, 0.28, 8.6, 5), 1.05, 6.1, -0.2); // fibula
    add(new THREE.SphereGeometry(0.8, 6, 4), 0, 1.4, 0); // talus
    add(new THREE.BoxGeometry(1.3, 1.1, 2.1), 0, 0.6, -1.1, 0.25); // calcaneus
    add(new THREE.BoxGeometry(1.4, 0.7, 1.2), 0, 0.8, 1.0); // midfoot
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.22, 0.24, 2.4), -0.6 + i * 0.3, 0.45, 2.7 - Math.abs(i - 1.5) * 0.18, 0.12);
    this.hot = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), glow(0xff3020, 0.8));
    this.hot.position.set(0.2, 2.4, 0.3);
    this.bones.add(this.hot);
    this.bones.position.y = -3;
    this.group.add(this.bones);
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(12, 0.25), glow(0x9ff0ff, 0.6));
    this.scan.position.z = 1.5;
    this.group.add(this.scan);

    this.shot(0, XRAY, cam(0, 3, 24, 0, 2, 0, 40));
    this.shotKeys(XRAY, cam(-7, 5, 22, 0, 2.2, 0, 42), [{ dur: CANCEL - XRAY, to: { x: 4, y: 3, z: 17, ty: 1.2, fov: 38 }, ease: 'sine.inOut' }]);
    this.shot(CANCEL, 14 - CANCEL, cam(0, 3, 24, 0, 2, 0, 40), cam(0, 3, 23, 0, 2, 0, 40), 'none');
  }

  update(t: number, fx: FX) {
    applyLighting({ fog: 0x02060a, fogNear: 50, fogFar: 90, lightDir: [0, -1, 0], light: 0xffffff, lightI: 0.2, sky: 0x203040, ground: 0x000000 });
    this.group.visible = t >= XRAY;
    this.bones.rotation.y = -0.6 + (t - XRAY) * 0.18;
    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    (this.hot.material as THREE.ShaderMaterial).uniforms.uOpacity.value = t > XRAY + 1.4 ? 0.35 + 0.6 * pulse : 0;
    this.hot.scale.setScalar(1 + 0.25 * pulse);
    this.scan.position.y = -3 + ((t - XRAY) * 5) % 12;
    this.scan.visible = t < CANCEL;
    fx.sat = t >= CANCEL ? 0.4 : 1;
    fx.flash = t >= CANCEL && t < CANCEL + 0.25 ? (1 - (t - CANCEL) / 0.25) * 0.8 : 0;
    fx.flashColor = [1, 0.2, 0.1];
    fx.static = t > XRAY - 0.25 && t < XRAY + 0.15 ? 0.8 : 0;
    fx.sceneMix = t >= CONT ? 0.25 : 1;
    fx.fade = t > 13.7 ? (t - 13.7) / 0.3 : 0;
  }

  drawUI(ui: UI, t: number) {
    if (t < XRAY || (t >= CANCEL && t < GYM)) this.missionSelect(ui, t);
    if (t >= XRAY && t < CANCEL) {
      ui.text('MEDICAL BAY', 28, 24, { scale: 3, color: COL.cyan });
      drawDataPanel(ui, 610, 60, 'SCAN RESULT', [
        ['SUBJECT', 'STRIDE'],
        ['AREA', 'ANKLE'],
        ['FINDING', 'STRESS REACTION'],
        ['STATUS', 'NO RUNNING'],
      ], t - XRAY - 0.8, { w: 320, color: COL.cyan });
      if (t > XRAY + 1.4 && blink(t, 0.3)) ui.text('! FAULT DETECTED', 770, 250, { scale: 2, color: COL.red, align: 'center' });
      drawCaption(ui, ["DR. LACTATE: BONE DOESN'T NEGOTIATE, STRIDE."], t - (XRAY + 2.0), CANCEL - XRAY - 2.1);
    }
    if (t >= CANCEL && t < GYM) {
      drawStamp(ui, 'MISSION CANCELLED', t - CANCEL - 0.1, GYM - CANCEL, COL.red, 330, 6);
      drawLogCard(ui, SETBACK_LOG[2], t - CANCEL - 0.8, GYM - CANCEL - 0.8, 220, 410, 520);
    }
    if (t >= GYM && t < CONT) {
      ui.text('MEANWHILE', 480, 90, { scale: 3, color: COL.grey, align: 'center', alpha: ramp(t, GYM, GYM + 0.2) });
      drawLogCard(ui, SETBACK_LOG[3], t - GYM - 0.1, CONT - GYM - 0.1, 200, 200, 560);
    }
    if (t >= CONT) {
      const cd = t - CONT;
      ui.rect(0, 0, ui.W, ui.H, '#000', 0.6);
      ui.text('CONTINUE?', 480, 120, { scale: 7, color: COL.white, align: 'center', shadow: COL.redDim });
      if (cd < 1.8) {
        const n = 9 - Math.floor(cd / 0.2);
        ui.text(String(Math.max(1, n)), 480, 200, { scale: 16, color: COL.red, align: 'center' });
      } else {
        const a = easeOutExpo((cd - 1.8) / 0.3);
        ui.text('> YES', 480, 210, { scale: 6, color: COL.green, align: 'center', alpha: a });
        drawLogCard(ui, SETBACK_LOG[4], cd - 1.9, 14 - CONT - 1.9, 220, 330, 520);
      }
    }
  }

  private missionSelect(ui: UI, t: number) {
    const cancelled = t >= CANCEL;
    ui.rect(0, 0, ui.W, ui.H, '#04080c', 1);
    ui.text('MISSION SELECT', 60, 40, { scale: 4, color: COL.white });
    ui.rect(60, 84, 840, 2, COL.red);
    const rows: [string, string, string][] = [
      ['HACKNEY HALF', '19.05.2024', '1:29:01'],
      [PEAK_2024[1].headline, PEAK_2024[1].date, PEAK_2024[1].stat!],
      [PEAK_2024[3].headline, PEAK_2024[3].date, PEAK_2024[3].stat!],
      ['VALENCIA MARATHON', 'TARGET', cancelled ? 'CANCELLED' : 'IN TRAINING'],
    ];
    rows.forEach(([name, date, stat], i) => {
      const y = 116 + i * 52;
      const a = clamp((t - 0.2 - i * 0.12) / 0.2);
      const sel = i === 3;
      if (sel) ui.rect(52, y - 10, 856, 42, cancelled ? '#300806' : '#0c2412', a);
      const col = sel ? (cancelled ? COL.red : COL.green) : COL.grey;
      ui.text(`${sel ? (blink(t, 0.25) ? '>' : ' ') : '{'} ${name}`, 70, y, { scale: 3, color: col, alpha: a });
      ui.text(date, 620, y + 6, { scale: 2, color: COL.dim, alpha: a });
      ui.text(stat, 890, y, { scale: 3, color: col, align: 'right', alpha: a });
      if (sel && cancelled) ui.rect(70, y + 10, 540 * clamp((t - CANCEL) / 0.3), 3, COL.red);
    });
    if (!cancelled) {
      const alerts = [SETBACK_LOG[0], SETBACK_LOG[1]];
      alerts.forEach((e, i) => {
        const at = 1.0 + i * 0.8;
        if (t < at) return;
        ui.text(`! ${e.date}  ${e.headline} - ${e.quote}`, 60, 360 + i * 26, { scale: 2, color: COL.amber, alpha: window01(t, at, XRAY + 1) });
      });
    }
  }
}
