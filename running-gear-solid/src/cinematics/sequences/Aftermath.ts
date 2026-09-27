import * as THREE from 'three';
import { Sequence, cam, type Cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, setPointLight } from '../../shaders/ps1';
import { pathRibbon } from '../../environments/sets';
import { skyDome, block, ground, tree, lampPost } from '../../environments/props';
import { TEX } from '../../renderer/textures';
import { Runner, stridePhase } from '../../runner/Runner';
import { Phantom } from '../../bosses/Phantom';
import { AFTERMATH_LOG } from '../../data/career';
import { drawLogCard, drawStamp, drawDataPanel } from '../../hud/screens';
import { clamp, ramp, rng, smooth } from '../../core/util';

// AFTERMATH (Apr - Sep 2026). Two days after Manchester: "Walk to the end of my
// street with crutches - 5.00 (New PB). 2 minutes off my time from yesterday"
// (0.96 km at 27:41/km). Then the way back, ending on an 18:43 parkrun.

const RETURN = 4.2, JAPAN = 6.0, CHIPP = 8.0, STALBANS = 10.0;

export class Aftermath extends Sequence {
  runner = new Runner('club');
  phantom = new Phantom();
  street!: THREE.CatmullRomCurve3;

  build() {
    this.clearColor.setHex(0xc8ccd0);
    this.group.add(skyDome(0x88a0c0, 0xd8dce0, 0xb0b0a8));
    const gr = ground(1200, 1200, TEX.grass(), [120, 120], 0xa8b090, 20);
    gr.position.y = -0.05;
    this.group.add(gr);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.4) * 4, 0, i * 30 - 180));
    this.street = new THREE.CatmullRomCurve3(pts);
    this.group.add(pathRibbon(this.street, 7, TEX.road(), 0xffffff));
    const r = rng(2104);
    for (let i = 0; i < 36; i++) {
      const p = this.street.getPointAt(i / 36);
      for (const s of [-1, 1]) {
        const h = block(8, 7 + r() * 2, 8, TEX.terrace(), 0xd8c8b8, 4);
        h.position.set(p.x + s * 11, 0, p.z);
        this.group.add(h);
        if (r() < 0.35) {
          const t = tree(5 + r() * 3, i * 2 + (s > 0 ? 1 : 0));
          t.position.set(p.x + s * 5.4, 0, p.z + 3);
          this.group.add(t);
        }
      }
      if (i % 4 === 0) {
        const l = lampPost(5, 0xffe0b0, 1.1, false);
        l.position.set(p.x + 4, 0, p.z);
        l.rotation.y = -Math.PI / 2;
        this.group.add(l);
      }
    }
    this.group.add(this.runner.root, this.phantom.root);

    this.shot(0, RETURN, cam(1.6, 1.0, 5.5, 0, 1.1, 0, 40), cam(1.4, 1.0, 4.8, 0, 1.1, 0, 38), 'none', (t, c) => this.follow(t, c));
    this.shot(RETURN, JAPAN - RETURN, cam(-5, 1.6, 1, 0, 1.2, 2, 44), cam(-5, 1.6, 3, 0, 1.2, 4, 44), 'none', (t, c) => this.follow(t, c));
    this.shot(JAPAN, CHIPP - JAPAN, cam(0.8, 0.5, 4, 0, 1.3, 0, 48), cam(0.6, 0.6, 3.4, 0, 1.3, 0, 46), 'none', (t, c) => this.follow(t, c));
    this.shot(CHIPP, STALBANS - CHIPP, cam(-2.2, 1.6, -5, 0, 1.2, 1, 50), cam(-1.8, 1.5, -4.2, 0, 1.2, 1, 50), 'none', (t, c) => this.follow(t, c));
    this.shot(STALBANS, 12 - STALBANS, cam(3.8, 1.3, 5.6, 0, 1.6, 0, 44), cam(3.0, 1.4, 4.6, 0, 1.7, 0, 42), 'sine.out', (t, c) => this.follow(t, c));
  }

  u(t: number) {
    const L = this.street.getLength();
    if (t < RETURN) return 0.1 + (t * 0.6) / L; // crutches: 0.6 m/s (27:41/km)
    const speed = t < JAPAN ? 2.8 : 4.4;
    return clamp(0.3 + ((t - RETURN) * speed) / L, 0, 0.99);
  }

  frame(t: number, du = 0) {
    const u = clamp(this.u(t) + du, 0, 1);
    const p = this.street.getPointAt(u);
    const d = this.street.getTangentAt(u);
    return { p, yaw: Math.atan2(d.x, d.z) };
  }

  follow(t: number, c: Cam) {
    const { p, yaw } = this.frame(t);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const [cx, cz] = [c.x * cs + c.z * sn, -c.x * sn + c.z * cs];
    const [tx, tz] = [c.tx * cs + c.tz * sn, -c.tx * sn + c.tz * cs];
    c.x = p.x + cx;
    c.z = p.z + cz;
    c.y += p.y;
    c.tx = p.x + tx;
    c.tz = p.z + tz;
    c.ty += p.y;
  }

  update(t: number, fx: FX) {
    const japan = t >= JAPAN && t < CHIPP;
    const evening = t < RETURN;
    applyLighting({
      fog: japan ? 0xe8d8b8 : 0xc8ccd0,
      fogNear: 30,
      fogFar: 220,
      lightDir: [-0.5, -0.8, 0.3],
      light: evening ? 0xffd8a8 : japan ? 0xfff0c8 : 0xfff4e8,
      lightI: japan ? 1.15 : 0.9,
      sky: 0x90a8c8,
      ground: 0x505848,
      ambient: 0x181818,
    });
    this.clearColor.setHex(japan ? 0xe8d8b8 : 0xc8ccd0);
    setPointLight(0, null);
    const { p, yaw } = this.frame(t);
    this.runner.root.position.copy(p);
    this.runner.root.rotation.y = yaw;
    const mode = t < RETURN ? 'crutch' : t >= STALBANS + 1.1 ? 'victory' : 'run';
    const phase = t < RETURN ? (t * 0.55) % 1 : stridePhase(t * 4.4, 2.6);
    this.runner.pose({ mode, phase, speed: t < RETURN ? 0.3 : 0.8, fatigue: 0, limp: t < RETURN ? 0.6 : 0, breath: t });
    // the 1:30 pace group, left behind for good
    const inChipp = t >= CHIPP && t < STALBANS;
    const lag = (t - CHIPP) * 2.2 - 1.0;
    const pf = this.frame(t, -lag / this.street.getLength());
    this.phantom.body.root.position.copy(pf.p).add(new THREE.Vector3(Math.cos(yaw) * -1.5, 0, -Math.sin(yaw) * -1.5));
    this.phantom.body.root.rotation.y = yaw;
    this.phantom.body.pose({ mode: 'run', phase: stridePhase(t * 3.9, 2.6), speed: 0.8, fatigue: 0, limp: 0, breath: t });
    this.phantom.ghosts.forEach((g) => (g.root.visible = false));
    this.phantom.setState(t, inChipp ? 1 : 0, inChipp ? smooth(ramp(t, CHIPP + 1.1, STALBANS - 0.1)) : 0);
    fx.heat = japan ? 0.6 : 0;
    fx.tint = evening ? [1.08, 1, 0.9] : japan ? [1.1, 1.0, 0.85] : [1, 1, 1];
    fx.sat = japan ? 1.2 : 1.0;
    fx.flash = [RETURN, JAPAN, CHIPP, STALBANS].some((c) => t >= c && t < c + 0.06) ? 0.5 : 0;
    fx.fade = t < 0.25 ? 1 - t / 0.25 : t > 11.7 ? (t - 11.7) / 0.3 : 0;
  }

  drawUI(ui: UI, t: number) {
    ui.letterbox(1);
    if (t < RETURN) {
      ui.text('21.04.2026 // 2 DAYS AFTER MANCHESTER', 24, 14, { scale: 2, color: COL.grey });
      drawDataPanel(ui, 24, 60, 'SIDE MISSION', [
        ['OBJECTIVE', 'END OF MY STREET'],
        ['EQUIPMENT', 'CRUTCHES'],
        ['DISTANCE', '0.96 KM'],
        ['PACE', '27:41 /KM'],
      ], t - 0.3, { w: 330, color: COL.amber });
      drawStamp(ui, '5:00 NEW PB', t - 2.0, RETURN - 2.0, COL.green, 330, 6, '"2 MINUTES OFF MY TIME FROM YESTERDAY"');
      return;
    }
    const e = t < JAPAN ? AFTERMATH_LOG[1] : t < CHIPP ? AFTERMATH_LOG[2] : t < STALBANS ? AFTERMATH_LOG[3] : AFTERMATH_LOG[4];
    const t0 = t < JAPAN ? RETURN : t < CHIPP ? JAPAN : t < STALBANS ? CHIPP : STALBANS;
    const t1 = t < JAPAN ? JAPAN : t < CHIPP ? CHIPP : t < STALBANS ? STALBANS : 12;
    drawLogCard(ui, e, t - t0 - 0.05, t1 - t0 - 0.05, 24, 48, 460);
  }
}
