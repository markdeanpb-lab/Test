import * as THREE from 'three';
import { cam } from '../Sequence';
import { RaceSequence } from '../RaceSequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, glow, ps1, setPointLight } from '../../shaders/ps1';
import { corridor } from '../../environments/sets';
import { skyDome, ground, sevenSeg, block } from '../../environments/props';
import { TEX, signTexture } from '../../renderer/textures';
import { Runner } from '../../runner/Runner';
import { Phantom } from '../../bosses/Phantom';
import { PHANTOM_2023, PHANTOM_2024, clockAt, type BossEncounter } from '../../data/activities';
import { LOG_2023, PEAK_2024 } from '../../data/career';
import { raceAt, kmTimeline, lifeAt } from '../race';
import { drawBossTitle, drawLogCard, drawRunHUD, drawStamp, drawRadar } from '../../hud/screens';
import { blink, clamp, fmtSigned, fmtTime, ramp, smooth, window01 } from '../../core/util';

const PACE_130 = 5400 / 21.0975; // s per km for a 1:30:00 half

/** seconds the runner is behind (+) / ahead (-) of an even 1:30 pacer, per GPS km */
function phantomDelta(e: BossEncounter, km: number) {
  return clockAt(e.splits, km) - PACE_130 * km;
}

// ---------------------------------------------------------------------------
// ENCOUNTER 01 - Hackney Half, 21.05.2023: "An ambitious attempt at 1:30"
// ---------------------------------------------------------------------------
export class Phantom1 extends RaceSequence {
  enc = PHANTOM_2023;
  runner = new Runner('racer');
  phantom = new Phantom();
  kmAt = kmTimeline([[0, 0], [2.6, 1.2], [5.5, 11.5], [8.2, PHANTOM_2023.distanceKm]]);

  build() {
    this.initRoute();
    this.clearColor.setHex(0xb4b8bc);
    this.anchor(0, 0.4, 3.2);
    this.anchor(2.6, 6, 4.8);
    this.anchor(5.5, 14, 4.2);
    this.anchor(8.2, 21.0, 2.5);
    this.group.add(skyDome(0x98a0a8, 0xc0c4c8, 0xa0a4a8));
    const gr = ground(9000, 9000, TEX.asphalt(), [900, 900], 0x8a8a8a, 40);
    gr.position.set(0, -0.05, 0);
    this.group.add(gr);
    this.group.add(corridor(this.route, { style: 'terrace', centers: this.anchorCentres(), crowd: true, seed: 2305, radius: 140 }));
    this.group.add(this.runner.root, this.phantom.root);

    // shots (all in the runner's frame)
    this.shot(0, 2.6, cam(-2.2, 1.5, 4.2, 0.4, 1.3, 0, 48), cam(-1.2, 1.5, 3.8, 0.6, 1.4, 0, 46), 'sine.inOut', (t, c) => this.followRunner(t, c));
    this.shot(2.6, 2.9, cam(4.6, 1.4, 0.8, -3, 1.3, -1, 52), cam(4.0, 1.3, 1.2, -3, 1.3, -1, 54), 'sine.inOut', (t, c) => this.followRunner(t, c));
    this.shot(5.5, 2.7, cam(0.6, 1.9, -4.5, 0, 1.4, 10, 50), cam(0.4, 1.8, -3.8, 0, 1.5, 14, 48), 'power1.in', (t, c) => this.followRunner(t, c));
    this.shot(8.2, 3.8, cam(3.5, 1.1, 3.5, 0, 1.2, 0, 44), cam(3.0, 1.2, 3.0, 0, 1.25, 0, 40), 'sine.out', (t, c) => this.followRunner(t, c));
  }

  update(t: number, fx: FX) {
    applyLighting({ fog: 0xb4b8bc, fogNear: 8, fogFar: 70, lightDir: [-0.3, -1, 0.2], light: 0xe8e8e0, lightI: 0.6, sky: 0x98a0a8, ground: 0x505050, ambient: 0x141414 });
    const km = this.kmAt(t);
    const fatigue = clamp((km - 12) / 9) * 0.55;
    this.placeRunner(this.runner, t, t < 8.2 ? 'run' : 'handsOnKnees', 1, fatigue);
    // phantom offset along route: delta seconds * current speed
    const d = phantomDelta(this.enc, km);
    const gap = clamp(-d * 4.2 * 0.25, -60, 60); // metres (compressed)
    const phantomVis = t < 0.6 ? 0 : t < 1.2 ? (t - 0.6) / 0.6 : t > 7.8 ? clamp(1 - (t - 7.8) / 0.5) : 1;
    const lead = t < 5.5 ? -Math.max(1.8, -gap) : Math.max(2.5, gap * 0.4 + (t - 5.5) * 3.5);
    const f = this.placeRunner(this.phantom.body, t, 'run', 1, 0, 0, -1.3, lead);
    this.phantom.ghosts.forEach((g, i) => this.placeRunner(g, t - 0.06 * (i + 1), 'run', 1, 0, 0, -1.3, lead - 0.5 * (i + 1)));
    this.phantom.setState(t, phantomVis);
    setPointLight(0, f.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x40ffe0, 8, 0.6 * phantomVis);
    fx.sat = 0.75;
    fx.fade = t < 0.3 ? 1 - t / 0.3 : t > 11.6 ? (t - 11.6) / 0.4 : 0;
  }

  drawUI(ui: UI, t: number) {
    drawBossTitle(ui, { name: 'PHANTOM 1:30', label: 'ENCOUNTER 01', subtitle: 'HACKNEY HALF MARATHON // ' + this.enc.date, info: [`STRAVA: "${this.enc.stravaDescription!.toUpperCase()}"`] }, t - 0.5, 2.1);
    if (t >= 2.6 && t < 8.2) {
      const km = this.kmAt(t);
      const s = raceAt(this.enc, km);
      const d = phantomDelta(this.enc, km);
      drawRunHUD(ui, {
        life: lifeAt(this.enc, km, 0.2),
        pace: s.pace,
        hr: s.hr,
        clock: s.clock,
        km,
        totalKm: this.enc.distanceKm,
        boss: { name: 'PHANTOM 1:30', hp: 1 - km / this.enc.distanceKm },
        phase: d < 0 ? 'AHEAD' : 'OVERTAKEN',
        delta: { label: 'PHANTOM DELTA', value: fmtSigned(d), color: d < 0 ? COL.green : COL.red },
        alerts: d > 0 ? ['! PHANTOM PULLING AWAY'] : [],
      }, t);
      drawRadar(ui, 86, 400, 60, this.mapRoute.radar, km / this.enc.distanceKm, t, 0.9);
    }
    if (t >= 8.2 && t < 10.2) {
      ui.letterbox(1);
      drawStamp(ui, '1:35:30', t - 8.3, 1.9, COL.amber, 190, 9, 'PHANTOM ESCAPED  (+5:30)');
      ui.text('"...BUT HAPPY WITH 1:35"', 480, 330, { scale: 2, color: COL.grey, align: 'center', alpha: ramp(t, 8.9, 9.2) });
    }
    if (t >= 10.2) {
      const i = t < 11.1 ? 1 : 2;
      drawLogCard(ui, LOG_2023[i], t - (i === 1 ? 10.2 : 11.1), i === 1 ? 0.9 : 0.9, 40, 330, 540);
    }
  }
}

// ---------------------------------------------------------------------------
// ENCOUNTER 02 - Hackney Half, 19.05.2024: 1:29:01
// ---------------------------------------------------------------------------
const F0 = 6, F1 = 16;

export class Phantom2 extends RaceSequence {
  enc = PHANTOM_2024;
  runner = new Runner('racer');
  phantom = new Phantom();
  watch = new THREE.Group();
  bigDigits: ReturnType<typeof sevenSeg>[] = [];
  digitRow = new THREE.Group();
  kmAt = kmTimeline([[F0, 0], [9, 5.5], [12, 11], [14.5, 17], [F1, PHANTOM_2024.distanceKm]]);

  build() {
    this.initRoute();
    this.clearColor.setHex(0x0a0c14);
    this.anchor(0, 0.2, 0);
    this.anchor(3.2, 0.3, 4.6);
    this.anchor(F0, 2.5, 5.0);
    this.anchor(9, 7.5, 5.0);
    this.anchor(12, 12.5, 5.0);
    this.anchor(14.5, 18, 5.0);
    this.anchor(F1, 21.25, 3.0);
    this.anchor(19, 9, 5.5); // peak-form montage uses the same streets
    this.group.add(skyDome(0x04040c, 0x1a1830, 0x0a0a14));
    const gr = ground(9000, 9000, TEX.asphalt(), [900, 900], 0x303038, 40);
    gr.position.y = -0.05;
    this.group.add(gr);
    this.group.add(corridor(this.route, { style: 'city', centers: this.anchorCentres(90), crowd: true, seed: 1905, night: true, lamp: 0xb0d0ff, radius: 150 }));
    this.group.add(this.runner.root, this.phantom.root);

    // the watch (for the transition)
    const wrist = block(0.9, 0.9, 3, null, 0xd8a882);
    wrist.position.y = -0.9;
    this.watch.add(wrist);
    const body = block(1.3, 0.3, 1.5, null, 0x141414);
    this.watch.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), ps1({ map: signTexture('4:13', '#9affa0', '#061208', 32, 32, 1), unlit: true }));
    screen.rotation.x = -Math.PI / 2;
    screen.position.y = 0.31;
    this.watch.add(screen);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25), ps1({ map: signTexture('AVG PACE', '#4a9a50', '#061208', 64, 16, 1), unlit: true }));
    label.rotation.x = -Math.PI / 2;
    label.position.set(0, 0.315, 0.38);
    this.watch.add(label);
    this.group.add(this.watch);
    // giant digits across the street: "4:13"
    ['4', '1', '3'].forEach((ch, i) => {
      const d = sevenSeg(2.2, 0.8, 0x7aff8a, 0x0a200e);
      d.set(ch);
      d.group.position.set((i === 0 ? -4 : i === 1 ? 1.2 : 4.4), 3.2, 0);
      this.digitRow.add(d.group);
      this.bigDigits.push(d);
    });
    for (const y of [4.0, 2.4]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.8), glow(0x7aff8a, 1));
      c.position.set(-1.6, y, 0);
      this.digitRow.add(c);
    }
    this.group.add(this.digitRow);

    // camera
    this.shot(0, 2.4, cam(0.3, 2.2, 1.6, 0, 0.3, 0, 50), cam(0.05, 1.0, 0.35, 0, 0.3, 0.05, 30), 'power2.in'); // push into the watch
    this.shot(2.4, 0.8, cam(0, 3.2, -6, 0, 3.2, 6, 70), cam(0, 3.0, -1, 0, 3.0, 10, 80), 'power3.in', (t, c) => this.followRunner(t, c));
    this.shot(3.2, 2.8, cam(-3.2, 1.2, 4.5, 0, 1.4, -2, 52), cam(-2.4, 1.3, 4.2, 0, 1.5, -3, 50), 'sine.inOut', (t, c) => this.followRunner(t, c));
    this.shot(F0, 3.0, cam(1.3, 1.7, 2.6, 0, 1.3, -6, 56), cam(1.0, 1.6, 2.2, 0, 1.3, -7, 58), 'sine.inOut', (t, c) => this.followRunner(t, c));
    this.shot(9, 3.0, cam(-6, 1.5, 1, 0, 1.3, 1, 44), cam(-6, 1.5, 3, 0, 1.3, 2.5, 44), 'none', (t, c) => this.followRunner(t, c));
    this.shot(12, 2.5, cam(-4, 40, -4, 0, 0, 10, 55), cam(-2, 44, -2, 0, 0, 12, 55), 'none', (t, c) => this.followRunner(t, c));
    this.shot(14.5, 1.5, cam(0.8, 0.4, 3.5, 0, 1.4, -4, 64, 0, 0.02), cam(0.6, 0.35, 3.0, 0, 1.5, -5, 66, 0, 0.02), 'none', (t, c) => this.followRunner(t, c));
    this.shot(F1, 3.0, cam(2.5, 2.2, -5, 0, 1.3, 0, 50), cam(3.5, 2.8, -7, 0, 1.5, 0, 48), 'power2.out', (t, c) => this.followRunner(t, c));
    this.shot(19, 4.0, cam(-2.4, 1.1, 4, 0, 1.4, 0, 46), cam(-1.8, 1.3, 3.2, 0, 1.5, 0, 42), 'sine.inOut', (t, c) => this.followRunner(t, c));
  }

  update(t: number, fx: FX) {
    applyLighting({ fog: 0x0a0c14, fogNear: 12, fogFar: 110, lightDir: [0.3, -1, 0.2], light: 0x5a6a9a, lightI: 0.45, sky: 0x2a2a4a, ground: 0x181820, ambient: 0x10101a });
    const km = t < F0 ? 0 : this.kmAt(t);
    const inWatch = t < 2.4;
    this.watch.visible = inWatch;
    this.runner.root.visible = !inWatch;
    this.digitRow.visible = t >= 2.4 && t < 4.2;
    // lamps follow the runner (street lights ahead)
    const f = this.frameAt(this.runnerS(t));
    for (let i = 0; i < 3; i++) {
      const p = this.frameAt(this.runnerS(t) + (i - 0.5) * 22).pos;
      setPointLight(i, p.add(new THREE.Vector3(0, 5, 0)), 0xb0d0ff, 24, 0.9);
    }
    if (inWatch) {
      this.watch.position.set(f.pos.x, 0, f.pos.z);
      this.watch.rotation.y = f.yaw;
    }
    // digits planted across the road ahead
    const ahead = this.frameAt(this.runnerS(2.4) + 14);
    this.digitRow.position.copy(ahead.pos);
    this.digitRow.rotation.y = ahead.yaw + Math.PI;
    const d = phantomDelta(this.enc, km);
    this.placeRunner(this.runner, t, t < F1 + 0.8 || t > 19 ? 'run' : 'victory', 1.15, 0.1);
    // phantom behind the runner by the real delta (compressed)
    const behind = clamp(-d * 0.08, 0.8, 12);
    const vis = t < 3.4 ? 0 : t < 4.2 ? (t - 3.4) / 0.8 : t < 19 ? 1 : 0;
    const dissolve = t > F1 ? clamp((t - F1 - 0.1) / 1.2) : 0;
    const pf = this.placeRunner(this.phantom.body, t, 'run', 1.1, 0, 0, 1.4, -behind);
    this.phantom.ghosts.forEach((g, i) => this.placeRunner(g, t - 0.06 * (i + 1), 'run', 1.1, 0, 0, 1.4, -behind - 0.5 * (i + 1)));
    this.phantom.setState(t, vis, dissolve);
    setPointLight(3, pf.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), 0x40ffe0, 10, 0.8 * vis * (1 - dissolve));
    fx.tint = [0.95, 1.0, 1.1];
    fx.contrast = 1.1;
    if (t > 2.3 && t < 2.55) fx.flash = 1 - (t - 2.3) / 0.25;
    if (t > F1 + 0.05 && t < F1 + 0.35) fx.flash = (1 - (t - F1 - 0.05) / 0.3) * 0.8;
    if (t >= 19) {
      applyLighting({ fog: 0xc8ccd0, fogNear: 20, fogFar: 150, lightDir: [-0.4, -1, 0.3], light: 0xfff4e0, lightI: 0.85, sky: 0x90a8c8, ground: 0x505048, ambient: 0x141414 });
      this.clearColor.setHex(0xc8ccd0);
      fx.tint = [1, 1, 1];
    } else this.clearColor.setHex(0x0a0c14);
    fx.fade = t > 22.6 ? (t - 22.6) / 0.4 : 0;
  }

  drawUI(ui: UI, t: number) {
    if (t < 2.4) {
      ui.letterbox(1);
      ui.text('19.05.2024 // HACKNEY', 28, 470, { scale: 2, color: COL.grey, alpha: window01(t, 0.2, 2.3) });
      return;
    }
    drawBossTitle(ui, { name: 'PHANTOM 1:30', label: 'ENCOUNTER 02', subtitle: 'HACKNEY HALF MARATHON // ' + this.enc.date, info: ['ONE YEAR LATER. SAME PHANTOM.'] }, t - 3.6, 2.3);
    if (t >= F0 && t < F1) {
      const km = this.kmAt(t);
      const s = raceAt(this.enc, km);
      const d = phantomDelta(this.enc, km);
      const alerts = d > -40 ? ['! PHANTOM BEHIND YOU'] : [];
      drawRunHUD(ui, {
        life: 1 - (km / this.enc.distanceKm) * 0.35,
        pace: s.pace,
        hr: s.hr,
        clock: s.clock,
        km,
        totalKm: this.enc.distanceKm,
        boss: { name: 'PHANTOM 1:30', hp: 1 - km / this.enc.distanceKm },
        phase: 'METRONOME',
        delta: { label: 'PHANTOM DELTA', value: fmtSigned(d), color: d < 0 ? COL.green : COL.red },
        alerts,
      }, t);
      drawRadar(ui, 86, 400, 60, this.mapRoute.radar, km / this.enc.distanceKm, t, 0.9);
      if (t > 12 && t < 14.5) ui.text('SPLITS: EVERY KM 4:02 - 4:19', 480, 150, { scale: 2, color: COL.green, align: 'center' });
      if (d > -40 && blink(t, 0.3)) ui.text('!', 480, 196, { scale: 8, color: COL.red, align: 'center' });
    }
    if (t >= F1 && t < 19) {
      ui.letterbox(1);
      drawStamp(ui, '1:29:01', t - F1 - 0.4, 2.6, COL.green, 180, 10, 'SUB 1:30 - PHANTOM DESTROYED');
    }
    if (t >= 19) {
      // peak form, 2024
      const cards = [PEAK_2024[1], PEAK_2024[2], PEAK_2024[3], PEAK_2024[4]];
      const i = Math.min(3, Math.floor((t - 19) / 0.95));
      drawLogCard(ui, cards[i], t - 19 - i * 0.95, i === 3 ? 1.2 : 0.95, 40, 300, 540);
      if (i === 2) ui.text('PEAK FORM', 700, 140, { scale: 5, color: COL.amber, align: 'center', outline: '#000', alpha: ramp(t, 19 + 1.95, 19 + 2.1) });
    }
    void smooth;
    void fmtTime;
  }
}
