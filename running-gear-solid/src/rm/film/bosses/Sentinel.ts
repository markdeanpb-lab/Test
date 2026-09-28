// DOUBLE ZERO: a dockside sentinel whose head is a race clock. Its arms are wind turbines (the wind
// that held the first attempt at exactly 20:00). It can only be beaten by a time under 20:00: the
// display shatters and the machine folds at the knees.
import * as THREE from 'three';
import { metal, box, cyl, Piston, Lamp, LedDisplay, Particles, hazard, greeble, clamp01, smoothstep } from './kit';
import { hash } from '../../engine/assets';

export class Sentinel {
  readonly root = new THREE.Group();
  private body = new THREE.Group(); // everything above the feet (drops when it kneels)
  private hips: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private rotors: THREE.Group[] = [];
  private pistons: { p: Piston; a: THREE.Object3D; b: THREE.Object3D }[] = [];
  private eyes: Lamp[] = [];
  private beacon!: Lamp;
  readonly display = new LedDisplay(5, 2.1, 3.4, { col: '#ff3a20', gap: 0.12 });
  private homes: THREE.Vector3[] = [];
  readonly sparks = new Particles({ n: 260, box: [9, 2, 3], vel: [0, -9, 4], life: 0.9, size: 0.18, color: 0xffb040, additive: true, swirl: 3, seed: 5 });
  readonly steam = new Particles({ n: 180, box: [5, 1, 3], vel: [2, 5, 0], life: 2.6, size: 1.6, color: 0xc8ccd2, opacity: 0.45, grow: 2.5, seed: 6 });

  static async create() {
    const s = new Sentinel();
    await s.build();
    return s;
  }

  private async build() {
    const [blue, plate, rust, cont] = await Promise.all([metal('blue', { tint: 0x9aa8c0 }), metal('plate'), metal('rust', { tint: 0x6e5448, rough: 0.9 }), metal('container', { tint: 0xb8bcc0 })]);
    const haz = hazard();
    const dark = await metal('plate', { tint: 0x3c4046, rough: 0.8 });
    const gm = { panel: plate, dark, pipe: rust };
    this.root.add(this.body);
    // legs: hip pivot at 14.2 m, knee at 8.2 m, feet on the ground (feet stay put)
    for (const side of [-1, 1]) {
      const x = side * 3;
      const foot = box(3.4, 1.2, 4.6, plate);
      foot.position.set(x, 0.6, 0.4);
      this.root.add(foot);
      const toe = box(3.5, 0.5, 1.2, haz);
      toe.position.set(x, 1.0, 2.5);
      this.root.add(toe);
      const hip = new THREE.Group();
      hip.position.set(x, 14.2, 0);
      this.body.add(hip);
      const thigh = box(2.2, 6, 2.6, blue);
      thigh.position.y = -3;
      hip.add(thigh);
      const tg = greeble(2.2, 6, 2.6, gm, { seed: 11 + side, n: 3, pipes: 1, face: side < 0 ? 'left' : 'right' });
      tg.position.y = -3;
      hip.add(tg);
      const knee = new THREE.Group();
      knee.position.y = -6;
      hip.add(knee);
      const drum = cyl(1.5, 1.5, 2.8, rust, 24);
      drum.rotation.z = Math.PI / 2;
      knee.add(drum);
      const shin = box(1.9, 7, 2.3, blue);
      shin.position.y = -3.7;
      knee.add(shin);
      const sg = greeble(1.9, 7, 2.3, gm, { seed: 21 + side, n: 4, pipes: 1 });
      sg.position.y = -3.7;
      knee.add(sg);
      for (const cz of [-1.45, 1.45]) {
        const cap = cyl(0.8, 0.8, 0.25, dark, 20);
        cap.rotation.z = Math.PI / 2;
        cap.position.x = cz;
        knee.add(cap);
      }
      const ankle = cyl(1.1, 1.1, 2.4, rust, 20);
      ankle.rotation.z = Math.PI / 2;
      ankle.position.y = -7.2;
      knee.add(ankle);
      // hydraulic piston on the front of the knee
      const a = new THREE.Object3D();
      a.position.set(0, -1.5, 1.6);
      hip.add(a);
      const b = new THREE.Object3D();
      b.position.set(0, -2.6, 1.4);
      knee.add(b);
      const p = new Piston(0.38, 3, rust);
      this.body.add(p.group);
      this.pistons.push({ p, a, b });
      this.hips.push(hip);
      this.knees.push(knee);
    }
    // pelvis + torso
    const pelvis = box(8, 2.2, 3.4, rust);
    pelvis.position.y = 15.2;
    this.body.add(pelvis);
    this.torso.position.y = 16.3;
    this.body.add(this.torso);
    const chest = box(6.6, 7.4, 4.4, cont);
    chest.position.y = 3.7;
    this.torso.add(chest);
    for (const [face, seed] of [['front', 31], ['back', 32], ['left', 33], ['right', 34]] as const) {
      const gg = greeble(6.6, 7.4, 4.4, gm, { seed, face, n: face === 'front' ? 4 : 5, pipes: 2 });
      gg.position.y = 3.7;
      this.torso.add(gg);
    }
    const pg = greeble(8, 2.2, 3.4, gm, { seed: 41, n: 3, pipes: 1 });
    pg.position.y = 15.2;
    this.body.add(pg);
    const band = box(6.7, 0.7, 4.5, haz);
    band.position.y = 6.6;
    this.torso.add(band);
    const vent = box(3.6, 2.2, 0.3, await metal('grate'));
    vent.position.set(0, 2.6, 2.3);
    this.torso.add(vent);
    // turbine arms
    const beam = box(15.5, 1.4, 1.8, plate);
    beam.position.y = 7.2;
    this.torso.add(beam);
    for (const side of [-1, 1]) {
      const nac = cyl(1.0, 1.0, 3.6, plate, 20);
      nac.rotation.x = Math.PI / 2;
      nac.position.set(side * 7.9, 7.2, 0.4);
      this.torso.add(nac);
      const rotor = new THREE.Group();
      rotor.position.set(side * 7.9, 7.2, 2.4);
      const white = new THREE.MeshStandardMaterial({ color: 0xe8e6de, roughness: 0.5, metalness: 0.1 });
      for (let k = 0; k < 3; k++) {
        const blade = box(0.7, 6.4, 0.16, white);
        blade.geometry.translate(0, 3.3, 0);
        blade.rotation.z = (k / 3) * Math.PI * 2;
        rotor.add(blade);
      }
      const hub = cyl(0.55, 0.7, 0.9, plate, 16);
      hub.rotation.x = Math.PI / 2;
      rotor.add(hub);
      this.torso.add(rotor);
      this.rotors.push(rotor);
    }
    // head: a race clock
    this.head.position.y = 9.4;
    this.torso.add(this.head);
    const neck = cyl(0.9, 1.2, 1.4, rust, 16);
    neck.position.y = -0.6;
    this.head.add(neck);
    const housing = box(12.6, 5.6, 2.2, plate);
    housing.position.y = 2.6;
    this.head.add(housing);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 4.4), new THREE.MeshStandardMaterial({ color: 0x06080a, roughness: 0.15, metalness: 0.2 }));
    glass.position.set(0, 2.6, 1.11);
    this.head.add(glass);
    this.display.group.position.set(0, 2.6, 1.14);
    this.head.add(this.display.group);
    this.homes = this.display.cells.map((c) => c.position.clone());
    for (const side of [-1, 1]) {
      const e = new Lamp(0.42, 0xff2a10);
      e.group.position.set(side * 3.4, 5.9, 0.9);
      this.head.add(e.group);
      this.eyes.push(e);
    }
    const mast = cyl(0.12, 0.16, 3.2, plate, 8);
    mast.position.set(5, 6.9, -0.3);
    this.head.add(mast);
    this.beacon = new Lamp(0.28, 0xff2010);
    this.beacon.group.position.set(5, 8.6, -0.3);
    this.head.add(this.beacon.group);
    this.sparks.points.position.set(0, 12, 2);
    this.steam.points.position.set(0, 16, 0);
    this.root.add(this.sparks.points, this.steam.points);
    this.display.set('20:00');
  }

  /**
   * t: film time; wind 0..1 spins the rotors; look: world point the head tracks; kneel 0..1 folds
   * the machine (defeat); shatter 0..1 flings the digits apart; lamps 0..1.
   */
  update(t: number, o: { wind?: number; text?: string; col?: string; look?: THREE.Vector3; kneel?: number; shatter?: number; lamps?: number; flicker?: number }) {
    const wind = o.wind ?? 0.5, kneel = clamp01(o.kneel ?? 0), sh = clamp01(o.shatter ?? 0);
    const lamps = (o.lamps ?? 1) * (1 - kneel * 0.9);
    if (o.text) this.display.set(o.text, o.col);
    const fl = o.flicker ?? 0;
    this.display.level = (1 - smoothstep(0.6, 1, sh)) * (1 - fl * (hash(Math.floor(t * 24), 3) > 0.6 ? 0.8 : 0));
    // idle: a slow weight shift; the rotors turn with the wind and wind down as it falls
    const sway = Math.sin(t * 0.7) * 0.012 * (1 - kneel);
    this.body.rotation.z = sway;
    this.rotors.forEach((r, i) => (r.rotation.z = (i ? -1 : 1) * t * (0.8 + wind * 5) * (1 - kneel * 0.85)));
    // kneel: hips pitch back, knees forward, body drops, torso folds, head sags
    const k = smoothstep(0, 1, kneel);
    this.hips.forEach((h) => (h.rotation.x = -k * 0.95));
    this.knees.forEach((n) => (n.rotation.x = k * 1.9));
    this.body.position.y = -k * 5.2;
    this.torso.rotation.x = k * 0.5;
    this.head.rotation.x = k * 0.45;
    // head tracks the subject (yaw only, limited)
    if (o.look) {
      const w = new THREE.Vector3();
      this.head.getWorldPosition(w);
      const local = this.torso.worldToLocal(o.look.clone());
      const yaw = Math.atan2(local.x, local.z);
      this.head.rotation.y = Math.max(-0.7, Math.min(0.7, yaw)) * (1 - k);
      void w;
    }
    this.root.updateMatrixWorld(true);
    for (const { p, a, b } of this.pistons) {
      const wa = a.getWorldPosition(new THREE.Vector3()), wb = b.getWorldPosition(new THREE.Vector3());
      this.body.worldToLocal(wa);
      this.body.worldToLocal(wb);
      p.span(wa, wb);
    }
    for (const e of this.eyes) e.level = lamps * (0.8 + 0.2 * Math.sin(t * 3));
    this.beacon.level = lamps * (Math.sin(t * 4) > 0.6 ? 1 : 0.05);
    // shatter: digits fly out of the housing and fall
    this.display.cells.forEach((c, i) => {
      const s = sh, h0 = this.homes[i];
      c.position.set(h0.x + s * (hash(i, 7) - 0.5) * 14, h0.y + s * (hash(i, 8) * 7) - s * s * 16, h0.z + s * (3 + hash(i, 9) * 8));
      c.rotation.set(s * hash(i, 10) * 8, s * hash(i, 11) * 6, s * (hash(i, 12) - 0.5) * 10);
    });
    this.sparks.update(t, sh > 0 && sh < 0.8 ? 1 : kneel > 0.05 && kneel < 0.9 ? 0.5 : 0, 1);
    this.steam.update(t, kneel > 0.1 ? 1 : 0, 0.3);
    this.sparks.points.position.y = 12 + 9.4 - k * 5;
  }
}
