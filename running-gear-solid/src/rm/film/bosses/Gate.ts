// FORTY (Battersea 10K 2023): a steel finish gantry with a portcullis. Its crossbeam is the race
// clock; the gate starts dropping in the last minutes and hits the ground at 40:00. He is under it at
// 39:35; it slams shut behind him.
import * as THREE from 'three';
import { metal, box, cyl, Lamp, LedDisplay, Particles, hazard, greeble, clamp01 } from './kit';

export class Gate {
  readonly root = new THREE.Group();
  private grille = new THREE.Group();
  readonly display = new LedDisplay(5, 0.9, 1.4, { col: '#ff3a20', gap: 0.06 });
  private lamps: Lamp[] = [];
  readonly sparks = new Particles({ n: 200, box: [9, 0.3, 0.6], vel: [0, 4, 2], life: 0.7, size: 0.14, color: 0xffb040, additive: true, swirl: 3, seed: 44 });
  readonly dust = new Particles({ n: 120, box: [10, 0.4, 1.5], vel: [0, 1.5, 3], life: 1.6, size: 1.2, color: 0xa09a90, opacity: 0.35, grow: 2, seed: 45 });
  private width: number;

  static async create(width: number) {
    const g = new Gate(width);
    await g.build();
    return g;
  }
  private constructor(width: number) {
    this.width = width;
  }

  private async build() {
    const W = this.width;
    const [plate, dark, grate] = await Promise.all([metal('plate', { tint: 0x8a9098 }), metal('plate', { tint: 0x2a2c30, rough: 0.8 }), metal('grate', { tint: 0x6a6460 })]);
    const gm = { panel: plate, dark, pipe: dark };
    for (const side of [-1, 1]) {
      const tower = box(1.4, 7.6, 1.4, dark);
      tower.position.set((side * (W + 1.4)) / 2, 3.8, 0);
      this.root.add(tower);
      const tg = greeble(1.4, 7.6, 1.4, gm, { seed: 50 + side, n: 3, pipes: 1, face: 'back' });
      tg.position.copy(tower.position);
      this.root.add(tg);
      const band = box(1.45, 0.4, 1.45, hazard());
      band.position.set(tower.position.x, 1.2, 0);
      this.root.add(band);
      const l = new Lamp(0.2, 0xff2010);
      l.group.position.set(tower.position.x, 7.9, 0.4);
      this.root.add(l.group);
      this.lamps.push(l);
    }
    const beam = box(W + 2.8, 1.9, 1.2, plate);
    beam.position.y = 6.9;
    this.root.add(beam);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.6), new THREE.MeshStandardMaterial({ color: 0x06080a, roughness: 0.2 }));
    panel.position.set(0, 6.9, -0.61);
    panel.rotation.y = Math.PI;
    this.root.add(panel);
    this.display.group.position.set(0, 6.9, -0.63);
    this.display.group.rotation.y = Math.PI; // faces the oncoming runners (-z)
    this.root.add(this.display.group);
    // the portcullis: vertical bars + two crossbars, spikes at the bottom
    const n = Math.round(W / 0.45);
    for (let k = 0; k <= n; k++) {
      const bar = box(0.12, 5.6, 0.12, grate, 1, 0);
      bar.position.set(-W / 2 + (k * W) / n, 2.8, 0);
      this.grille.add(bar);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 6), dark);
      spike.rotation.x = Math.PI;
      spike.position.set(bar.position.x, -0.15, 0);
      this.grille.add(spike);
    }
    for (const y of [1.2, 3.4, 5.4]) {
      const cb = box(W, 0.16, 0.18, grate, 1, 0);
      cb.position.y = y;
      this.grille.add(cb);
    }
    this.root.add(this.grille);
    this.sparks.points.position.set(0, 0.1, 0);
    this.dust.points.position.set(0, 0.2, 0);
    this.root.add(this.sparks.points, this.dust.points);
  }

  /** drop: 0 fully raised (bottom at 5.8 m) .. 1 shut; clock text; slam 0..1 impact burst */
  update(t: number, o: { drop: number; text?: string; slam?: number }) {
    const d = clamp01(o.drop);
    this.grille.position.y = 5.8 * (1 - d) + 0.15;
    if (o.text) this.display.set(o.text);
    const moving = d > 0.02 && d < 0.98;
    this.lamps.forEach((l) => (l.level = moving || d >= 0.98 ? (Math.sin(t * 9) > 0 ? 1 : 0.1) : 0.2));
    const slam = clamp01(o.slam ?? 0);
    this.sparks.update(t, moving ? 0.3 : slam > 0 && slam < 1 ? 1 : 0);
    this.dust.update(t, slam > 0 && slam < 1 ? 1 : 0, 0.35);
  }
}
