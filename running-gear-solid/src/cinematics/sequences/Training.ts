import * as THREE from 'three';
import { Sequence, cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, glow } from '../../shaders/ps1';
import { parkSet } from '../../environments/sets';
import { skyDome, block } from '../../environments/props';
import { Runner, stridePhase } from '../../runner/Runner';
import { CAREER, EARLY_LOG, SUB20_CHAIN } from '../../data/career';
import { clamp, easeOutExpo, ramp, window01 } from '../../core/util';
import { drawLogCard, drawCaption } from '../../hud/screens';

// MISSION 00: BASIC TRAINING (2020-2022). Finsbury Park as a training
// facility; the volume graph shows the 5x jump from 2021 to 2022.

export class Training extends Sequence {
  park = parkSet(31);
  rookie = new Runner('rookie');
  club = new Runner('club');
  u = new THREE.Vector3();

  build() {
    this.clearColor.setHex(0xc0c8d0);
    this.group.add(skyDome(0x7a98c0, 0xd0d8e0, 0xa0a8a0));
    this.group.add(this.park.group);
    this.group.add(this.rookie.root, this.club.root);
    // cones marking the course, like a drill yard
    for (let i = 0; i < 24; i++) {
      const p = this.park.curve.getPointAt(i / 24);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 5), glow(0xff7020, 0.9));
      cone.position.set(p.x + 2.2, p.y + 0.3, p.z);
      this.group.add(cone);
    }
    const tower = block(3, 12, 3, null, 0x5a5048);
    tower.position.set(80, 0, 20);
    this.group.add(tower);

    // shots
    this.shot(0, 2.6, cam(0, 120, 60, 0, 0, -30, 50)); // (behind the loading screen)
    // overhead tactical: slow rotate over the loop
    this.shotKeys(2.6, cam(-40, 140, 60, 0, 0, -30, 40), [{ dur: 6.0, to: { x: 30, y: 120, z: 70, fov: 38 }, ease: 'sine.inOut' }]);
    // chase cam behind the runner
    this.shot(8.6, 3.6, cam(0, 1.8, -5.2, 0, 1.3, 4, 55), cam(0.8, 1.5, -4.2, 0, 1.2, 4, 52), 'sine.inOut', (t, c) => this.follow(t, c));
    // low front three-quarter
    this.shot(12.2, 3.8, cam(3.2, 0.6, 6, 0, 1.2, 0, 44), cam(2.2, 0.8, 4.5, 0, 1.3, 0, 40), 'power1.inOut', (t, c) => this.follow(t, c));
  }

  /** position along loop at time t */
  loopU(t: number) {
    return (0.05 + t * 0.012) % 1;
  }

  follow(t: number, c: { x: number; y: number; z: number; tx: number; ty: number; tz: number }) {
    const u = this.loopU(t);
    const p = this.park.curve.getPointAt(u);
    const d = this.park.curve.getTangentAt(u);
    const yaw = Math.atan2(d.x, d.z);
    const rot = (x: number, z: number) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
    const [cx, cz] = rot(c.x, c.z);
    const [tx, tz] = rot(c.tx, c.tz);
    c.x = p.x + cx;
    c.z = p.z + cz;
    c.y += p.y;
    c.tx = p.x + tx;
    c.tz = p.z + tz;
    c.ty += p.y;
  }

  update(t: number, fx: FX) {
    applyLighting({ fog: 0xc0c8d0, fogNear: 60, fogFar: 260, lightDir: [-0.5, -1, -0.2], light: 0xfff4e0, lightI: 0.85, sky: 0x8aa0b8, ground: 0x506040, ambient: 0x181818 });
    const useClub = t > 8.6;
    this.rookie.root.visible = !useClub;
    this.club.root.visible = useClub;
    const r = useClub ? this.club : this.rookie;
    const u = this.loopU(t);
    const p = this.park.curve.getPointAt(u);
    const d = this.park.curve.getTangentAt(u);
    r.root.position.copy(p);
    r.root.rotation.y = Math.atan2(d.x, d.z);
    r.pose({ mode: 'run', phase: stridePhase(t * 4.2, 2.4), speed: useClub ? 0.7 : 0.4, fatigue: 0, limp: 0, breath: t });
    fx.sceneMix = t < 2.6 ? 0 : 1;
    fx.fade = t < 2.6 ? 0 : t < 2.9 ? 1 - (t - 2.6) / 0.3 : t > 15.6 ? (t - 15.6) / 0.4 : 0;
    fx.sat = 0.85;
  }

  drawUI(ui: UI, t: number) {
    if (t < 2.6) {
      // loading screen
      ui.text('MISSION 00', 480, 170, { scale: 3, color: COL.amber, align: 'center' });
      ui.text('BASIC TRAINING', 480, 205, { scale: 6, align: 'center' });
      ui.text('14.05.2020 - 21.05.2022', 480, 262, { scale: 2, color: COL.grey, align: 'center' });
      ui.bar(330, 320, 300, 8, clamp(t / 2.3), COL.green);
      ui.text('LOADING', 480, 340, { scale: 1, color: COL.grey, align: 'center' });
      ui.text("TIP: RUN 6 WAS TITLED 'OUCH MY SHINS'. LISTEN TO YOUR SHINS.", 480, 470, { scale: 1, color: COL.greenDim, align: 'center' });
      return;
    }
    ui.letterbox(1, 40);
    if (t < 8.6) {
      // volume graph: yearly km
      const years = CAREER.yearly.slice(0, 3);
      const x0 = 610, y0 = 420, bw = 70;
      ui.rect(x0 - 20, 176, 340, 272, '#000', 0.6);
      ui.brackets(x0 - 20, 176, 340, 272, COL.green, 12);
      ui.text('TRAINING VOLUME', x0, 188, { scale: 2, color: COL.green, shadow: null });
      years.forEach((y, i) => {
        const k = easeOutExpo(clamp((t - 3.2 - i * 1.3) / 1.0));
        const h = (y.km / 1200) * 190 * k;
        ui.rect(x0 + i * 100, y0 - h, bw, h, i === 2 ? COL.amber : COL.green);
        ui.text(String(y.year), x0 + i * 100 + bw / 2, y0 + 8, { scale: 2, align: 'center', color: COL.grey });
        if (k > 0.05) ui.text(`${Math.round(y.km * k).toLocaleString('en-GB')} KM`, x0 + i * 100 + bw / 2, y0 - h - 16, { scale: 1, align: 'center' });
        if (k > 0.05) ui.text(`${y.runs} RUNS`, x0 + i * 100 + bw / 2, y0 - h - 28, { scale: 1, align: 'center', color: COL.grey });
      });
      if (t > 7.0) ui.text('X5.1', x0 + 250, 230, { scale: 4, color: COL.amber, align: 'center', alpha: ramp(t, 7.0, 7.3) });
      drawCaption(ui, ['FACILITY FP // FINSBURY PARK', 'PARKRUN HOME COURSE'], t - 2.9, 5.6, 28, 60);
      return;
    }
    if (t < 12.2) {
      // parkrun PB chain (2022)
      const first = EARLY_LOG[1];
      const chain = [{ date: first.date, time: first.stat! }, ...SUB20_CHAIN.slice(0, 6)];
      const k = clamp((t - 8.8) / 3.0);
      const idx = Math.min(chain.length - 1, Math.floor(k * chain.length));
      const cur = chain[idx];
      ui.rect(24, 60, 330, 110, '#000', 0.65);
      ui.text('PARKRUN 5K', 40, 72, { scale: 2, color: COL.green, shadow: null });
      ui.text(cur.time, 40, 96, { scale: 7, color: idx === 0 ? COL.white : COL.amber });
      ui.text(cur.date + (idx === 0 ? '  FIRST PARKRUN BACK' : '  PB'), 40, 150, { scale: 1, color: COL.grey });
      chain.slice(0, idx).forEach((c, i) => ui.text(c.time, 380 + i * 58, 72, { scale: 1, color: COL.dim }));
      return;
    }
    const half = EARLY_LOG[2];
    drawLogCard(ui, half, t - 12.4, 3.4, 40, 300, 540);
    if (t > 13.6) {
      const a = window01(t, 13.6, 15.9, 0.15);
      ui.text('GEARBOX', 700, 380, { scale: 2, color: COL.green, alpha: a, align: 'center' });
      ui.text('A HALF MARATHON...', 700, 404, { scale: 2, alpha: a, align: 'center' });
      ui.text('TO RETIRE SOME SHOES?', 700, 426, { scale: 2, alpha: a, align: 'center' });
    }
  }
}
