import * as THREE from 'three';
import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, ps1 } from '../../shaders/ps1';
import { block, ground, lampPost, tree, skyDome } from '../../environments/props';
import { TEX } from '../../renderer/textures';
import { Runner, stridePhase } from '../../runner/Runner';
import { blink, clamp, fmtTime, ramp, rng, window01 } from '../../core/util';
import { drawDataPanel } from '../../hud/screens';
import { FIRST_RUN } from '../../data/activities';

// 14.05.2020, 11:46 - Regent's Park. The first run on record: 5.07 km,
// 37:56 moving, 48:58 elapsed. Eleven minutes of it standing still.

export class ColdOpen extends Sequence {
  runner = new Runner('rookie');
  cctv = new THREE.Group();

  build() {
    this.clearColor.setHex(0xa8acb0);
    const G = this.group;
    G.add(skyDome(0x8e949c, 0xb4b8bc, 0x9a9ea0));
    G.add(ground(300, 300, TEX.grass(), [60, 60], 0x9aa890, 24));
    // curved park path
    const path = new THREE.Mesh(new THREE.RingGeometry(38, 42.5, 48, 1, Math.PI * 0.9, Math.PI * 0.7), ps1({ map: TEX.gravel(), color: 0xc8c0b0, uvScale: [6, 1] }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.03, 40);
    G.add(path);
    const straight = ground(60, 4.5, TEX.gravel(), [15, 1], 0xc8c0b0, 8);
    straight.position.set(0, 0.04, 0);
    G.add(straight);
    const r = rng(14052020);
    // railings along the path
    for (let x = -30; x <= 30; x += 1.2) {
      const p = block(0.06, 1.1, 0.06, null, 0x1a1c1e);
      p.position.set(x, 0, -3.2);
      G.add(p);
    }
    const rail = block(62, 0.06, 0.06, null, 0x1a1c1e);
    rail.position.set(0, 1.0, -3.2);
    G.add(rail);
    // benches
    for (const x of [-9, 7, 19]) {
      const b = block(1.8, 0.45, 0.5, null, 0x5a4030);
      b.position.set(x, 0, -2.6);
      const back = block(1.8, 0.5, 0.08, null, 0x5a4030);
      back.position.set(x, 0.45, -2.85);
      G.add(b, back);
    }
    for (const x of [-18, -2, 14, 28]) {
      const l = lampPost(4.2, 0xfff0d8, 0.5, false);
      l.position.set(x, 0, -2.4);
      G.add(l);
    }
    for (let i = 0; i < 40; i++) {
      const tr = tree(6 + r() * 6, i + 3);
      const side = r() > 0.35 ? -1 : 1;
      tr.position.set(-70 + r() * 140, 0, side < 0 ? -8 - r() * 40 : 8 + r() * 30);
      G.add(tr);
    }
    // Regency terraces in the fog
    for (let i = 0; i < 9; i++) {
      const t = block(22, 14 + r() * 4, 10, TEX.darkWindows(), 0xe8e0cc, 6);
      t.position.set(-90 + i * 24, 0, -85 - r() * 10);
      G.add(t);
    }
    // CCTV camera on a pole (foreground prop, seen from the reverse shot)
    const pole = block(0.18, 6, 0.18, null, 0x3a3c40);
    this.cctv.add(pole);
    const housing = block(0.35, 0.3, 0.8, null, 0xd0d0cc);
    housing.position.set(0, 5.9, 0.3);
    housing.rotation.x = 0.35;
    this.cctv.add(housing);
    const led = block(0.06, 0.06, 0.06, null, 0xff0000, 8, { emissive: 0xff2020, unlit: true });
    led.position.set(0.12, 6.08, 0.62);
    this.cctv.add(led);
    this.cctv.position.set(-24, 0, 3);
    G.add(this.cctv);
    G.add(this.runner.root);

    // --- camera choreography ---
    // CCTV fixed wide (security camera perspective)
    this.shot(2.2, 4.0, cam(9, 7.5, 12, -1, 0.5, 0, 38), cam(9, 7.5, 12, 0.5, 0.5, 0, 38), 'none');
    // low tracking shot at the old trainers (relative to the runner)
    const follow = (t: number, c: { x: number; tx: number }) => {
      const rx = this.runnerX(t);
      c.x += rx;
      c.tx += rx;
    };
    this.shot(6.2, 2.8, cam(-1.6, 0.32, 2.2, 0.6, 0.3, 0, 40), cam(-0.4, 0.4, 2.0, 1.4, 0.35, 0, 42), 'sine.inOut', follow);
    // close profile, slow push
    this.shot(9.0, 4.0, cam(2.2, 1.66, 2.6, 0, 1.52, 0, 34), cam(1.5, 1.62, 1.7, 0, 1.52, 0, 30), 'sine.inOut', follow);
    // pre-roll (black) uses the CCTV framing
    this.shot(0, 2.2, cam(9, 7.5, 12, -1, 0.5, 0, 38));
  }

  /** runner x-position: jog in, stop (hands on knees) 4.7-6.3, jog on */
  runnerX(t: number) {
    const v = 2.3; // slow, first-run shuffle (m/s)
    if (t < 4.7) return -9 + (t - 2.2) * v;
    if (t < 6.3) return -9 + 2.5 * v + (1 - Math.pow(1 - clamp((t - 4.7) / 0.5), 2)) * 0.5;
    return -9 + 2.5 * v + 0.5 + (t - 6.3) * v * 0.72;
  }

  update(t: number, fx: FX) {
    applyLighting({ fog: 0xa8acb0, fogNear: 12, fogFar: 95, lightDir: [-0.3, -1, -0.5], light: 0xd8d8d0, lightI: 0.55, sky: 0x9aa0a8, ground: 0x505448, ambient: 0x202020 });
    const x = this.runnerX(t);
    this.runner.root.position.set(x, 0, 0);
    this.runner.root.rotation.y = Math.PI / 2;
    const stopped = t >= 4.7 && t < 6.3;
    if (stopped) this.runner.pose({ mode: 'handsOnKnees', phase: 0, speed: 0, fatigue: 1, limp: 0, breath: t });
    else this.runner.pose({ mode: 'run', phase: stridePhase(x + 20, 2.0), speed: 0.35, fatigue: t > 9 ? 0.55 : 0.3, limp: 0, breath: t });

    // CCTV grade: monochrome, heavier grain
    const cctv = t >= 2.2 && t < 6.2;
    if (cctv) {
      fx.sat = 0.12;
      fx.contrast = 1.15;
      fx.grain = 0.09;
      fx.levels = 20;
      fx.scan = 0.18;
      fx.vignette = 0.7;
    } else {
      fx.sat = 0.6;
      fx.tint = [0.95, 0.98, 1.02];
    }
    fx.sceneMix = t < 2.2 ? 0 : 1;
    fx.static = t < 2.2 ? 0.0 : t < 2.45 ? 1 - (t - 2.2) / 0.25 : 0;
    fx.fade = t > 12.6 ? (t - 12.6) / 0.4 : 0;
  }

  drawUI(ui: UI, t: number) {
    // opening typed text
    if (t < 2.2) {
      const a = window01(t, 0.1, 2.15, 0.15);
      const l1 = '14.05.2020 // 11:46';
      const l2 = 'GREATER LONDON';
      const l3 = 'THE CITY IS EMPTY.';
      ui.text(l1.slice(0, Math.floor((t - 0.2) * 30)), 480, 222, { scale: 3, align: 'center', alpha: a });
      ui.text(l2.slice(0, Math.floor((t - 0.8) * 30)), 480, 262, { scale: 2, color: COL.grey, align: 'center', alpha: a });
      ui.text(l3.slice(0, Math.floor((t - 1.3) * 30)), 480, 292, { scale: 2, color: COL.grey, align: 'center', alpha: a });
      return;
    }
    if (t < 6.2) {
      // security camera overlay
      ui.text("CAM-04  REGENT'S PARK", 28, 24, { scale: 2, color: COL.white });
      if (blink(t, 1, 0.6)) {
        ui.rect(28, 48, 10, 10, COL.red);
        ui.text('REC', 44, 48, { scale: 2, color: COL.white });
      }
      const secs = 11 * 3600 + 46 * 60 + 54 + (t - 2.2);
      const hh = Math.floor(secs / 3600), mm = Math.floor((secs % 3600) / 60), ss = Math.floor(secs % 60);
      ui.text(`14.05.2020 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 932, 500, { scale: 2, align: 'right' });
      ui.brackets(20, 16, 920, 508, COL.white, 26, 2);
      if (t > 4.9) ui.text('SUBJECT STATIONARY', 480, 440, { scale: 2, color: COL.amber, align: 'center', alpha: blink(t, 0.5) ? 1 : 0.3 });
      return;
    }
    ui.letterbox(1);
    if (t >= 6.4) {
      const moving = FIRST_RUN.movingSec, elapsed = FIRST_RUN.elapsedSec;
      drawDataPanel(ui, 608, 84, 'FIRST RUN ON RECORD', [
        ['DISTANCE', `${FIRST_RUN.distanceKm.toFixed(2)} KM`],
        ['MOVING TIME', fmtTime(moving)],
        ['ELAPSED TIME', fmtTime(elapsed)],
        ['UNACCOUNTED FOR', fmtTime(elapsed - moving)],
      ], t - 6.4, { w: 320 });
    }
    if (t > 9.3) {
      // codec call ring
      const ring = t < 10.2;
      if (ring && blink(t, 0.25)) {
        ui.text('!', 480, 90, { scale: 6, color: COL.red, align: 'center' });
        ui.text('CALL  142.19', 480, 150, { scale: 2, color: COL.green, align: 'center' });
      }
      const sub = (who: string, s: string, a: number, b: number, color = COL.green) => {
        if (t < a || t > b) return;
        ui.text(who, 480, 430, { scale: 2, color, align: 'center', alpha: ramp(t, a, a + 0.15) });
        ui.text(s.slice(0, Math.floor((t - a) * 38)), 480, 452, { scale: 2, align: 'center' });
      };
      sub('MAJOR TEMPO', 'ELEVEN MINUTES STANDING STILL, STRIDE.', 10.2, 11.7);
      sub('STRIDE', "IT'S A START.", 11.8, 12.9, COL.cyan);
    }
  }
}
