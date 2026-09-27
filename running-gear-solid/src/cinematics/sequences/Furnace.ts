import * as THREE from 'three';
import { cam } from '../Sequence';
import { RaceSequence } from '../RaceSequence';
import type { FX } from '../../renderer/Renderer';
import type { UI } from '../../hud/UI';
import { COL } from '../../hud/UI';
import { applyLighting, glow, ps1, setPointLight } from '../../shaders/ps1';
import { corridor, tacticalMap } from '../../environments/sets';
import { skyDome, ground, block, barrier } from '../../environments/props';
import { TEX, signTexture } from '../../renderer/textures';
import { Runner } from '../../runner/Runner';
import { Furnace } from '../../bosses/Furnace';
import { RICHMOND } from '../../data/activities';
import { raceAt, kmTimeline, lifeAt } from '../race';
import { drawBossTitle, drawDataPanel, drawResults, drawRunHUD, drawRadar, drawStamp } from '../../hud/screens';
import { blink, clamp, fmtTime, lerp, ramp, smooth, window01 } from '../../core/util';

// ENCOUNTER: FURNACE - Richmond Runfest Marathon, 10.09.2023.
// First half 1:43:32, second half 2:09:47, relative effort 739 (the highest on
// record). "Managed to pass through the end when they started to cancel the
// race due to too many casualties."

const DIVE = 3.4, QUIET = 6.4, REVEAL = 9.2, MELT = 13.4, EVAC = 19, GATE = 21.6, END = 24.2, RESULTS = 25.6;
const MAP = new THREE.Vector3(30000, 0, 0);
const GATE_KM = 42.25;

type Frame = { pos: THREE.Vector3; yaw: number };
function toWorld(f: Frame, x: number, y: number, z: number) {
  const cs = Math.cos(f.yaw), sn = Math.sin(f.yaw);
  return new THREE.Vector3(f.pos.x + x * cs + z * sn, f.pos.y + y, f.pos.z - x * sn + z * cs);
}

export class FurnaceSeq extends RaceSequence {
  enc = RICHMOND;
  runner = new Runner('marathon');
  boss = new Furnace();
  river = new THREE.Group();
  gate = new THREE.Group();
  shutters: THREE.Mesh[] = [];
  beacons: THREE.Mesh[] = [];
  marker = new THREE.Group();
  mapGroup!: THREE.Group;
  kmAt = kmTimeline([[QUIET, 5], [REVEAL, 21.1], [MELT, 21.1], [EVAC, 31], [GATE, 41.6], [23.0, GATE_KM], [END, 42.39]]);
  sGate = 0;

  build() {
    this.initRoute(1600, 0.012);
    this.clearColor.setHex(0xd8ccb0);
    this.sGate = this.sAtKm(GATE_KM);
    const kmOf = (s: number) => (s / this.route.total) * this.enc.distanceKm;
    this.anchor(0, 4, 0);
    this.anchor(DIVE, 4, 3.6);
    this.anchor(QUIET, 12, 3.8);
    this.anchor(REVEAL, 21, 3.2);
    this.anchor(MELT, 24, 2.9);
    this.anchor(15.5, 29, 2.6);
    this.anchor(EVAC, 34, 2.8);
    this.anchor(GATE, kmOf(this.sGate - 3.0 * 1.4), 3.0);
    this.anchor(23.6, kmOf(this.sGate + 3.0 * 0.6), 1.3);
    this.anchor(24.6, kmOf(this.sGate + 3.0 * 0.6 + 1.3), 0);

    this.group.add(skyDome(0x8ab0d8, 0xe8dcc0, 0xc0b090));
    const gr = ground(9000, 9000, TEX.grass(), [900, 900], 0xb8b070, 40);
    gr.position.y = -0.3;
    this.group.add(gr);
    this.group.add(corridor(this.route, { style: 'riverside', centers: this.anchorCentres(80), seed: 1009, radius: 170 }));

    // the river (placed per shot on the far side of the path)
    const water = new THREE.Mesh(new THREE.PlaneGeometry(70, 900, 8, 60), ps1({ map: TEX.water(), color: 0x6a8a9a, uvScale: [4, 50], wave: 0.12 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(46, -0.2, 0);
    this.river.add(water);
    const bank = new THREE.Mesh(new THREE.PlaneGeometry(3, 900), ps1({ map: TEX.stone(), color: 0x9a9080, uvScale: [1, 300] }));
    bank.rotation.x = -Math.PI / 2;
    bank.position.set(10.5, -0.1, 0);
    this.river.add(bank);
    this.group.add(this.river, this.boss.root, this.runner.root);

    // the finish gate (the course is being closed behind the runner)
    const fg = this.frameAt(this.sGate);
    for (const sx of [-1, 1]) {
      const post = block(0.8, 6.5, 0.8, TEX.metal(), 0x4a4a52, 2);
      post.position.set(sx * 6.4, 0, 0);
      this.gate.add(post);
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), glow(0xff2010, 1));
      beacon.position.set(sx * 6.4, 6.9, 0);
      this.gate.add(beacon);
      this.beacons.push(beacon);
      const sh = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 0.25), ps1({ map: TEX.hazard(), color: 0xffffff, uvScale: [5, 2] }));
      sh.position.set(sx * 7.5, 1.2, 0);
      this.gate.add(sh);
      this.shutters.push(sh);
    }
    const bar = block(13.6, 1.2, 0.6, null, 0x202024);
    bar.position.set(0, 6.4, 0);
    this.gate.add(bar);
    for (const back of [false, true]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.1), ps1({ map: signTexture('FINISH', '#ffffff', '#b01810', 64, 9, 1), unlit: true }));
      sign.position.set(0, 7.0, back ? -0.31 : 0.31);
      if (back) sign.rotation.y = Math.PI;
      this.gate.add(sign);
    }
    for (const sx of [-1, 1]) {
      const b = barrier(24);
      b.rotation.y = Math.PI / 2;
      b.position.set(sx * 5, 0, -12);
      this.gate.add(b);
    }
    this.gate.position.copy(fg.pos);
    this.gate.rotation.y = fg.yaw;
    this.group.add(this.gate);

    // tactical map for the dive
    const tm = tacticalMap(this.mapRoute, 0xff9040);
    this.mapGroup = tm.group;
    this.mapGroup.position.copy(MAP);
    this.group.add(this.mapGroup);
    const start = this.mapRoute.at(0).pos.clone().add(MAP);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 40, 0.3), glow(0xffc080, 0.5));
    beam.position.y = 20;
    const dot = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), glow(0xffe0a0, 1));
    this.marker.add(beam, dot);
    this.marker.position.copy(start);
    this.group.add(this.marker);
    const c = this.mapRoute.center().add(MAP);
    const s0 = start;

    // --- shots
    this.shot(0, DIVE, cam(c.x - 20, 150, c.z + 90, c.x, 0, c.z, 50), cam(s0.x + 1, 7, s0.z + 6, s0.x, 0, s0.z, 60), 'power2.in');
    this.shot(DIVE, 3.0, cam(-14, 3.5, 8, 30, 3, 40, 52), cam(-13, 3.4, 14, 30, 3, 46, 52), 'none', (t, c) => this.followRunner(t, c));
    this.shot(QUIET, 2.8, cam(-1.5, 1.6, -4.2, 0.5, 1.3, 6, 50), cam(-1.2, 1.5, -3.6, 0.5, 1.4, 6, 50), 'sine.inOut', (t, c) => this.followRunner(t, c));
    // reveal: detail (inspection port igniting), then the plant across the river
    this.shot(REVEAL, 1.0, cam(66, 16, 52, 88, 16.1, 64, 22), cam(68, 16, 53, 88, 16.1, 64, 17), 'none', (t, c) => this.followFrame(this.stageFrame(t), c));
    this.shot(REVEAL + 1.0, MELT - REVEAL - 1.0, cam(-4, 0.6, -6, 60, 10, 60, 60), cam(-3, 0.8, -3, 60, 14, 60, 62), 'sine.out', (t, c) => this.followRunner(t, c));
    this.shot(MELT, 15.5 - MELT, cam(0.8, 1.55, 2.8, 0, 1.45, 0, 44), cam(0.6, 1.5, 2.3, 0, 1.45, 0, 42), 'sine.inOut', (t, c) => this.followRunner(t, c));
    this.shot(15.5, EVAC - 15.5, cam(-3, 0.35, 5, 20, 8, -30, 64, 0, 0.015), cam(-2.6, 0.4, 4, 20, 8, -30, 66, 0, 0.02), 'none', (t, c) => this.followRunner(t, c));
    this.shot(EVAC, GATE - EVAC, cam(-2.2, 2.4, -5.5, 0, 1.2, 4, 56), cam(-1.8, 2.1, -4.6, 0, 1.2, 4, 56), 'none', (t, c) => this.followRunner(t, c));
    this.shot(GATE, 29 - GATE, cam(3.0, 1.7, 15, -0.4, 1.4, -8, 32), cam(2.4, 1.8, 13, -0.2, 1.3, -2, 30), 'sine.inOut', (t, c) => this.followFrame(fg, c));
  }

  /** the frame the boss and river are staged against for the current shot */
  stageFrame(t: number): Frame {
    let a = this.anchors[0];
    for (const x of this.anchors) if (t >= x.t0) a = x;
    return this.frameAt(this.sAtKm(a.km));
  }

  heatAt(t: number) {
    if (t < REVEAL) return 0.04;
    if (t < MELT) return smooth(ramp(t, REVEAL + 0.1, REVEAL + 0.9)) * 0.8;
    return clamp(0.8 + (t - MELT) * 0.05);
  }

  update(t: number, fx: FX) {
    const inMap = t < DIVE;
    this.mapGroup.visible = this.marker.visible = inMap;
    this.runner.root.visible = !inMap;
    const heat = this.heatAt(t);
    const km = t < QUIET ? 4 + (t - DIVE) * 0.1 : this.kmAt(t);
    if (inMap) {
      applyLighting({ fog: 0x020804, fogNear: 400, fogFar: 900, lightDir: [0, -1, 0], light: 0xffffff, lightI: 0.3, sky: 0x203020, ground: 0x102010 });
      this.clearColor.setHex(0x020804);
      this.marker.visible = blink(t, 0.35) || t > DIVE - 1;
      fx.static = t > DIVE - 0.35 ? (t - (DIVE - 0.35)) / 0.35 : 0;
      fx.fade = t < 0.3 ? 1 - t / 0.3 : 0;
      return;
    }
    const m = clamp((t - MELT) / 6);
    const fog = new THREE.Color(0xd8ccb0).lerp(new THREE.Color(0xe0a068), m);
    applyLighting({ fog: fog.getHex(), fogNear: lerp(30, 12, m), fogFar: lerp(260, 140, m), lightDir: [-0.5, -1, 0.3], light: 0xfff0d0, lightI: 1.05, sky: 0xa0c0e0, ground: 0x807050, ambient: 0x101008 });
    this.clearColor.copy(fog);

    // stage: river and furnace on the far side of the path for this shot
    const sf = this.stageFrame(t);
    this.river.position.copy(sf.pos);
    this.river.rotation.y = sf.yaw;
    const bp = toWorld(sf, 88, -0.4, 64);
    this.boss.root.position.copy(bp);
    this.boss.root.rotation.y = sf.yaw - Math.PI / 2;
    this.boss.root.scale.setScalar(t >= REVEAL ? 1.5 : 1);
    this.boss.update(t, heat);
    setPointLight(0, toWorld(sf, 70, 6, 64), 0xff6020, 60, 1.6 * heat);

    const fatigue = clamp((km - 20) / 12) * 0.9;
    let mode: 'run' | 'walk' | 'handsOnKnees' = 'run';
    if (t >= 23.6) mode = 'walk';
    if (t >= 24.6) mode = 'handsOnKnees';
    this.placeRunner(this.runner, t, mode, lerp(1, 0.7, fatigue), fatigue);

    // evacuation: shutters close, sirens turn
    const close = smooth(ramp(t, 22.2, 23.9));
    this.shutters.forEach((s, i) => (s.position.x = (i ? 1 : -1) * (3 + 4.5 * (1 - close))));
    const siren = t >= EVAC ? 0.5 + 0.5 * Math.sin(t * 9) : 0;
    this.beacons.forEach((b) => ((b.material as THREE.ShaderMaterial).uniforms.uOpacity.value = t >= EVAC ? 0.3 + 0.7 * siren : 0.2));
    if (t >= EVAC) {
      const f = this.frameAt(this.runnerS(t));
      setPointLight(1, toWorld(f, 3 * Math.cos(t * 4.5), 3, 4 + 3 * Math.sin(t * 4.5)), 0xff2010, 12, 1.4 * siren);
      setPointLight(2, toWorld(this.frameAt(this.sGate), 0, 6, 0), 0xff3010, 16, 1.2 * siren);
    }

    fx.heat = t >= REVEAL ? 0.15 + heat * 0.85 : 0.1;
    fx.tint = [1 + 0.12 * m, 1 - 0.02 * m, 1 - 0.18 * m];
    fx.sat = 1.05 + 0.1 * m;
    fx.red = t >= EVAC && t < END ? 0.18 * siren : 0;
    fx.flash = t < DIVE + 0.2 ? 1 - (t - DIVE) / 0.2 : 0;
    fx.flashColor = [1, 0.8, 0.5];
    if (t >= END) fx.sat = 0.7;
    fx.fade = t > 28.6 ? (t - 28.6) / 0.4 : 0;
  }

  drawUI(ui: UI, t: number) {
    if (t < DIVE) {
      ui.text('MISSION 03', 28, 28, { scale: 3, color: COL.amber, alpha: ramp(t, 0.2, 0.4) });
      drawDataPanel(ui, 28, 70, 'OPERATION: FURNACE', [
        ['EVENT', 'RICHMOND RUNFEST MARATHON'],
        ['DATE', this.enc.date],
        ['DISTANCE', `${this.enc.distanceKm} KM`],
        ['ELEVATION', `${this.enc.elevationGain} M`],
      ], t - 0.5, { w: 360, color: COL.amber });
      ui.text('INSERTION POINT', 480, 300, { scale: 2, color: COL.amber, align: 'center', alpha: window01(t, 2.2, 3.2) * (blink(t, 0.2) ? 1 : 0.4) });
      return;
    }
    if (t < QUIET) {
      ui.letterbox(1);
      ui.text('KM 4 // RICHMOND', 28, 470, { scale: 2, color: COL.grey, alpha: window01(t, DIVE + 0.4, QUIET - 0.2) });
      return;
    }
    if (t >= REVEAL && t < MELT) {
      ui.letterbox(1);
      drawBossTitle(ui, { name: 'FURNACE', subtitle: this.enc.bossSubtitle, info: ['RICHMOND RUNFEST MARATHON // ' + this.enc.date] }, t - (REVEAL + 1.7), MELT - REVEAL - 1.7);
      return;
    }
    if (t < END) {
      const km = this.kmAt(t);
      const s = raceAt(this.enc, km);
      const phase = km < 20 ? 'CRUISE' : km < 31 ? 'MELTDOWN' : 'EVACUATION';
      const split = this.enc.splits[Math.min(this.enc.splits.length - 1, Math.floor(km))];
      const alerts: string[] = [];
      if (phase === 'MELTDOWN') alerts.push('! OVERHEATING', '! PACE COLLAPSING');
      if (phase === 'EVACUATION') alerts.push('! RACE BEING CANCELLED', '! REACH THE EXIT');
      drawRunHUD(ui, {
        life: lifeAt(this.enc, km, phase === 'CRUISE' ? 0 : 0.35),
        pace: s.pace,
        hr: s.hr,
        clock: s.clock,
        km,
        totalKm: this.enc.distanceKm,
        boss: { name: 'FURNACE', hp: 1 - km / this.enc.distanceKm },
        phase,
        delta: { label: 'SPLIT', value: `KM ${Math.floor(km) + 1}  ${fmtTime(split)}`, color: split > 330 ? COL.red : split > 300 ? COL.amber : COL.white },
        alerts,
      }, t);
      drawRadar(ui, 86, 400, 60, this.mapRoute.radar, km / this.enc.distanceKm, t, 0.9);
      if (t > REVEAL - 0.9 && t < REVEAL) ui.text('HALFWAY  1:43:32', 480, 150, { scale: 3, color: COL.green, align: 'center', outline: '#000' });
      if (t > 16 && t < 18.6) ui.text('SPLITS 5:16 > 6:46', 480, 150, { scale: 3, color: COL.red, align: 'center', outline: '#000' });
      return;
    }
    if (t < RESULTS) {
      drawStamp(ui, 'SURVIVED', t - END, RESULTS - END + 0.1, COL.amber, 200, 9, 'PASSED THE FINISH AS THE RACE WAS CANCELLED');
      return;
    }
    drawResults(ui, 'MISSION COMPLETE', [
      ['TIME', this.enc.timeLabel],
      ['FIRST HALF', '1:43:32', COL.green],
      ['SECOND HALF', '2:09:47', COL.red],
      ['AVERAGE HR', `${this.enc.hrAvg} BPM`],
      ['RELATIVE EFFORT', `${this.enc.relativeEffort}  HIGHEST ON RECORD`, COL.amber],
    ], t - RESULTS, '"THAT WAS REALLY HARD"');
  }
}
