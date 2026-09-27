import * as THREE from 'three';
import { Sequence, cam, type Cam } from '../Sequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, glow, ps1, setPointLight } from '../../shaders/ps1';
import { ground, skyDome, tree, gravestone, block, skyline, lampPost } from '../../environments/props';
import { TEX } from '../../renderer/textures';
import { Runner } from '../../runner/Runner';
import { Claw } from '../../bosses/Claw';
import { CLAW, clockAt, paceAt } from '../../data/activities';
import { kmTimeline } from '../race';
import { drawBossTitle, drawResults, drawStamp } from '../../hud/screens';
import { clamp, fmtTime, ramp, rng, smooth, window01, blink } from '../../core/util';

// ENCOUNTER: THE CLAW - Highgate hills, 26.11.2023. 22.3 km, 445 m of climbing.
// The five fingers are the five climbs into Highgate village, in the order the
// GPS altitude profile shows them; the stats on each are this run's Strava
// segment efforts. One of the run's segments is literally called "Highgate Claw".

const FINGERS = [
  { name: 'HIGHGATE WEST HILL', bearing: 188, seg: '621 M  +37 M  3:51' },
  { name: "SWAIN'S LANE", bearing: 167, seg: '856 M  +60 M  5:33' },
  { name: 'DARTMOUTH PARK HILL', bearing: 133, seg: '474 M  +35 M  3:11' },
  { name: 'HIGHGATE HILL', bearing: 117, seg: '920 M  +64 M  5:57' },
  { name: 'HORNSEY LANE', bearing: 71, seg: '1105 M  +34 M  6:36' },
];
const CLIMB_END = CLAW.phases.filter((p) => p.name !== 'APPROACH' && p.name !== 'RETURN').map((p) => p.toKm);

const WAKE = 1.8, TITLE = 3.0, F1 = 5.2, F2 = 7.4, F3 = 9.8, OVER = 11.6, RETRACT = 13.5, RESULTS = 15;

/** which finger the runner is on, and how far up it (u) */
function runnerOn(t: number): [number, number] {
  if (t < F2) return [0, 0.5 + (t - F1) * 0.02];
  if (t < F3) return [1, 0.3 + (t - F2) * 0.018];
  if (t < OVER) return [2, 0.62 + (t - F3) * 0.02];
  if (t < 12.55) return [3, 0.15 + ((t - OVER) / 0.95) * 0.85];
  return [4, 0.15 + clamp((t - 12.55) / 0.9) * 0.85];
}

export class ClawSeq extends Sequence {
  claw = new Claw(FINGERS);
  runner = new Runner('club');
  beacon = new THREE.Group();
  kmAt = kmTimeline([[F1, 6.9], [F2 - 0.001, 7.6], [F2, 9.0], [F3 - 0.001, 9.6], [F3, 11.1], [OVER - 0.001, 11.6], [OVER, 12.8], [12.5, 14.0], [12.55, 15.5], [RETRACT, 16.8], [RESULTS, 22.3]]);

  build() {
    this.clearColor.setHex(0x56606c);
    this.group.add(skyDome(0x3a4658, 0x6a7482, 0x56606c));
    const gr = ground(3000, 3000, TEX.grass(), [300, 300], 0x5a6a50, 30);
    gr.position.y = -0.4;
    this.group.add(gr);
    this.group.add(this.claw.root, this.runner.root);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 60, 1.2), glow(0x6cf07a, 0.5));
    beam.position.y = 30;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 0.8, 4, 12), glow(0x6cf07a, 0.9));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1;
    this.beacon.add(beam, ring);
    this.group.add(this.beacon);
    const sl = skyline(40, 900, 250, 11, 20, 90, TEX.windows());
    sl.rotation.y = Math.PI * 0.85;
    this.group.add(sl);

    // dressing: trees and houses between the fingers, never on them
    const r = rng(1126);
    const clear = (x: number, z: number) => {
      const d = Math.hypot(x, z);
      if (d < 40) return false;
      const b = ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360;
      return FINGERS.every((f) => {
        const db = Math.abs(((b - f.bearing + 540) % 360) - 180);
        return d * Math.sin((Math.min(db, 90) * Math.PI) / 180) > 12 || d > 175;
      });
    };
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, d = 45 + r() * 260;
      const x = Math.sin(a) * d, z = -Math.cos(a) * d;
      if (!clear(x, z)) continue;
      if (r() < 0.7) {
        const tr = tree(8 + r() * 8, i);
        tr.position.set(x, -0.4, z);
        this.group.add(tr);
      } else {
        const h = block(8, 7 + r() * 3, 9, TEX.terrace(), 0xa09a90, 4);
        h.position.set(x, -0.4, z);
        h.rotation.y = r() * Math.PI;
        this.group.add(h);
      }
    }
    // Highgate Cemetery beside the foot of Swain's Lane
    const sw = this.claw.fingers[1];
    const side = new THREE.Vector3(sw.dir.z, 0, -sw.dir.x);
    for (let i = 0; i < 70; i++) {
      const along = 70 + r() * 80, off = (r() < 0.5 ? -1 : 1) * (9 + r() * 20);
      const g = gravestone(i);
      g.position.copy(sw.dir.clone().multiplyScalar(along).addScaledVector(side, off));
      g.position.y = -0.4;
      g.rotation.y = sw.yaw + (r() - 0.5) * 0.4;
      this.group.add(g);
    }
    // cemetery gate piers at the foot of the climb
    for (const s of [-1, 1]) {
      const pier = block(1.6, 4.5, 1.6, TEX.stone(), 0xa8a498, 2);
      pier.position.copy(sw.dir.clone().multiplyScalar(160).addScaledVector(side, s * 5));
      pier.position.y = -0.4;
      this.group.add(pier);
      const lp = lampPost(5, 0xffd8a0, 1.2, true);
      lp.position.copy(sw.dir.clone().multiplyScalar(154).addScaledVector(side, s * 6));
      lp.position.y = -0.4;
      this.group.add(lp);
    }
    const moon = new THREE.Mesh(new THREE.CircleGeometry(30, 12), glow(0xdde6f0, 0.5));
    moon.position.set(-500, 260, -600);
    moon.lookAt(0, 0, 0);
    this.group.add(moon);

    // --- shots
    const gate = sw.dir.clone().multiplyScalar(160);
    const out = sw.dir.clone().multiplyScalar(176);
    this.shot(0, WAKE, cam(out.x + side.x * 3, 1.6, out.z + side.z * 3, gate.x, 3.2, gate.z, 44), cam(out.x + side.x * 2, 1.8, out.z + side.z * 2, gate.x, 4.4, gate.z, 40), 'sine.inOut');
    this.shot(WAKE, F1 - WAKE, cam(240, 4, 170, 0, 34, 0, 46), cam(215, 22, 190, 0, 36, 0, 52), 'sine.inOut');
    // finger 1: side profile against the sky
    this.shot(F1, F2 - F1, cam(30, 0.8, 1, 0, 1.4, 3, 17), cam(30, 1.0, 4, 0, 1.4, 5, 17), 'none', (t, c) => this.onRunner(t, c));
    // finger 2: low front, looking back down past the cemetery
    this.shot(F2, F3 - F2, cam(1.1, 0.7, 4.2, 0, 1.2, -4, 50), cam(0.9, 0.8, 3.6, 0, 1.1, -5, 48), 'none', (t, c) => this.onRunner(t, c));
    // finger 3: behind, looking up at the eye
    this.shot(F3, OVER - F3, cam(-1.3, 2.3, -6.5, 0, 4.5, 30, 52), cam(-1.1, 2.2, -5.4, 0, 5, 30, 50), 'none', (t, c) => this.onRunner(t, c));
    // fingers 4 & 5: tactical overhead, time-lapse
    this.shot(OVER, RETRACT - OVER, cam(95, 330, 150, 60, 0, 40, 46), cam(92, 300, 140, 60, 0, 40, 46), 'none');
    this.shot(RETRACT, 17 - RETRACT, cam(260, 30, 250, 0, 30, 0, 48), cam(275, 36, 265, 0, 22, 0, 48), 'sine.out');
  }

  private onRunner(t: number, c: Cam) {
    const [i, u] = runnerOn(t);
    const f = this.claw.pointOn(i, u);
    const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw);
    const rot = (x: number, z: number): [number, number] => [x * cs + z * sn, -x * sn + z * cs];
    const [cx, cz] = rot(c.x, c.z);
    const [tx, tz] = rot(c.tx, c.tz);
    c.x = f.pos.x + cx;
    c.z = f.pos.z + cz;
    c.y += f.pos.y;
    c.tx = f.pos.x + tx;
    c.tz = f.pos.z + tz;
    c.ty += f.pos.y;
  }

  curls(t: number) {
    const ends = [F2 + 0.3, F3 + 0.2, OVER + 0.1, 12.5, 13.45];
    return ends.map((e) => smooth(ramp(t, e, e + 0.9)));
  }

  update(t: number, fx: FX) {
    applyLighting({ fog: 0x56606c, fogNear: 40, fogFar: t >= OVER ? 800 : 460, lightDir: [0.5, -0.8, 0.4], light: 0xb8c4d8, lightI: 1.1, sky: 0x7888a0, ground: 0x303428, ambient: 0x181c24 });
    const wake = t < WAKE ? 0 : smooth(ramp(t, WAKE, WAKE + 1.6));
    const sink = t < RETRACT ? 0 : smooth(ramp(t, RETRACT + 0.4, RETRACT + 1.4));
    const curls = this.curls(t).map((c, i) => (t >= RETRACT ? Math.max(c, smooth(ramp(t, RETRACT, RETRACT + 0.5 + i * 0.05))) : c));
    this.claw.update(t, wake, curls, sink);
    setPointLight(0, new THREE.Vector3(60, 30, 60), 0xff3020, 120, 0.5 * wake * (1 - sink));

    this.runner.root.visible = t >= F1 && t < RETRACT;
    this.beacon.visible = false;
    if (this.runner.root.visible) {
      const [i, u] = runnerOn(t);
      const f = this.claw.pointOn(i, u);
      this.runner.root.position.copy(f.pos);
      this.runner.root.rotation.y = f.yaw;
      const s = t * 3;
      this.runner.pose({ mode: 'run', phase: (s / 2.4) % 1, speed: 0.8, fatigue: 0.35, limp: 0, breath: t });
      this.beacon.visible = t >= OVER;
      this.beacon.position.copy(f.pos);
    }
    fx.grain = 0.08;
    fx.sat = 0.85;
    fx.tint = [0.92, 0.98, 1.08];
    if (t > RETRACT + 0.4 && t < RETRACT + 1.6) fx.flash = 0; // dust instead of flash
    fx.fade = t < 0.3 ? 1 - t / 0.3 : t > 16.6 ? (t - 16.6) / 0.4 : 0;
  }

  private drawProfile(ui: UI, km: number) {
    const alt = CLAW.route!.altitude as number[];
    const x0 = 32, w = 300, y0 = 512, h = 40;
    const lo = Math.min(...alt), hi = Math.max(...alt);
    ui.rect(x0 - 8, y0 - h - 18, w + 16, h + 24, '#000', 0.6);
    ui.text('ELEVATION', x0, y0 - h - 14, { scale: 1, color: COL.grey, shadow: null });
    ui.text(`${Math.round(interpAlt(alt, km / CLAW.distanceKm))} M`, x0 + w, y0 - h - 14, { scale: 1, color: COL.white, align: 'right', shadow: null });
    for (let px = 0; px < w; px += 2) {
      const u = px / w;
      const a = interpAlt(alt, u);
      const hh = 2 + ((a - lo) / (hi - lo)) * h;
      const k = u * CLAW.distanceKm;
      const climb = CLAW.phases.some((p) => p.name !== 'APPROACH' && p.name !== 'RETURN' && k >= p.fromKm && k <= p.toKm);
      const done = k <= km;
      ui.rect(x0 + px, y0 - hh, 2, hh, climb ? (done ? COL.amber : '#7a5a18') : done ? COL.green : COL.greenDim, done ? 0.95 : 0.6);
    }
    const mx = x0 + (km / CLAW.distanceKm) * w;
    ui.rect(mx - 1, y0 - h - 4, 2, h + 6, COL.white);
  }

  drawUI(ui: UI, t: number) {
    if (t < WAKE) {
      ui.letterbox(1);
      ui.text('26.11.2023 // HIGHGATE, LONDON', 28, 470, { scale: 2, color: COL.grey, alpha: window01(t, 0.3, WAKE) });
      return;
    }
    if (t < F1) {
      ui.letterbox(1);
      drawBossTitle(ui, { name: 'THE CLAW', subtitle: CLAW.bossSubtitle, info: ['STRAVA SEGMENT "HIGHGATE CLAW": 10.28 KM, +305 M'] }, t - TITLE, F1 - TITLE);
      return;
    }
    if (t < RETRACT) {
      const km = this.kmAt(t);
      const [fi] = runnerOn(t);
      // top left: current finger
      ui.text(`FINGER ${fi + 1}/5`, 24, 22, { scale: 2, color: COL.red });
      ui.text(FINGERS[fi].name, 24, 44, { scale: 3, color: COL.white });
      ui.text('SEGMENT  ' + FINGERS[fi].seg, 24, 76, { scale: 2, color: COL.amber });
      // top right: clock / pace
      ui.text(fmtTime(clockAt(CLAW.splits, km)), 936, 22, { scale: 3, color: COL.white, align: 'right' });
      ui.text(`KM ${km.toFixed(1)} / ${CLAW.distanceKm}`, 936, 52, { scale: 2, color: COL.grey, align: 'right' });
      ui.text(`${fmtTime(paceAt(CLAW.splits, km))} /KM`, 936, 72, { scale: 2, color: COL.white, align: 'right' });
      // right: checklist
      const y0 = 150;
      ui.rect(706, y0 - 10, 238, 5 * 26 + 16, '#000', 0.55);
      FINGERS.forEach((f, i) => {
        const done = km >= CLIMB_END[i];
        const cur = i === fi && !done;
        const col = done ? COL.green : cur ? COL.white : COL.dim;
        ui.text(done ? '{' : cur && blink(t, 0.25) ? '>' : ' ', 716, y0 + i * 26, { scale: 2, color: col });
        ui.text(f.name, 736, y0 + i * 26, { scale: 2, color: col });
      });
      this.drawProfile(ui, km);
      if (t >= OVER) ui.text('TACTICAL VIEW  //  TIME COMPRESSED', 480, 118, { scale: 2, color: COL.green, align: 'center' });
      return;
    }
    if (t < RESULTS) {
      ui.letterbox(1);
      drawStamp(ui, 'CLAW RETRACTED', t - RETRACT - 0.3, RESULTS - RETRACT, COL.green, 200, 6, 'FIVE CLIMBS. ONE RUN.');
      return;
    }
    drawResults(ui, 'MISSION COMPLETE', [
      ['DISTANCE', `${CLAW.distanceKm} KM`],
      ['TIME', CLAW.timeLabel],
      ['ELEVATION GAIN', `${CLAW.elevationGain} M`, COL.amber],
    ], t - RESULTS, `"${CLAW.stravaDescription!.toUpperCase()}"`);
  }
}

function interpAlt(alt: number[], u: number) {
  const x = clamp(u) * (alt.length - 1);
  const i = Math.floor(x), f = x - i;
  return alt[i] + ((alt[Math.min(alt.length - 1, i + 1)] ?? alt[i]) - alt[i]) * f;
}
void ps1;
