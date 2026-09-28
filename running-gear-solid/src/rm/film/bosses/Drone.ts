// EIGHTEEN (Striders Festive 5K, 2025): a pacing drone over the track, its belly display locked on
// 18:00 pace. It sits a few metres ahead all race and never comes back: he finishes 18:19.
import * as THREE from 'three';
import { metal, box, cyl, Lamp, LedDisplay, greeble } from './kit';

export class Drone {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private rotors: THREE.Group[] = [];
  private lamps: Lamp[] = [];
  readonly display = new LedDisplay(5, 0.34, 0.54, { col: '#ff3a20', gap: 0.03 });
  private beam: THREE.Mesh;

  static async create() {
    const d = new Drone();
    await d.build();
    return d;
  }
  private constructor() {
    this.beam = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 3.2, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
  }
  private async build() {
    const [plate, dark] = await Promise.all([metal('plate', { tint: 0x2a2d32, rough: 0.6 }), metal('plate', { tint: 0x9aa0a8 })]);
    this.root.add(this.body);
    const hull = box(1.1, 0.34, 1.5, plate, 1, 0.25);
    this.body.add(hull);
    const g = greeble(1.1, 0.34, 1.5, { panel: dark, dark: plate }, { seed: 81, n: 2, pipes: 0, face: 'back' });
    this.body.add(g);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const arm = box(1.1, 0.08, 0.12, dark, 1, 0.2);
      arm.position.set(x * 0.55, 0.05, z * 0.6);
      arm.rotation.y = Math.atan2(z, x) * -1;
      this.body.add(arm);
      const motor = cyl(0.11, 0.13, 0.18, plate, 12);
      motor.position.set(x * 0.95, 0.12, z * 1.0);
      this.body.add(motor);
      const rotor = new THREE.Group();
      rotor.position.set(x * 0.95, 0.24, z * 1.0);
      const blur = new THREE.Mesh(new THREE.CircleGeometry(0.46, 24), new THREE.MeshBasicMaterial({ color: 0xcfd6dc, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
      blur.rotation.x = -Math.PI / 2;
      rotor.add(blur);
      for (let k = 0; k < 2; k++) {
        const b = box(0.9, 0.02, 0.06, dark, 1, 0);
        b.rotation.y = k * Math.PI / 2;
        rotor.add(b);
      }
      this.body.add(rotor);
      this.rotors.push(rotor);
      const l = new Lamp(0.05, z < 0 ? 0xff2010 : 0xf0f0ff);
      l.group.position.set(x * 0.95, 0.02, z * 1.0);
      this.body.add(l.group);
      this.lamps.push(l);
    }
    // the pace display on its tail, facing the runner behind it
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.66), new THREE.MeshStandardMaterial({ color: 0x06080a, roughness: 0.2 }));
    panel.position.set(0, -0.36, -0.78);
    panel.rotation.y = Math.PI;
    this.body.add(panel);
    this.display.group.position.set(0, -0.36, -0.8);
    this.display.group.rotation.y = Math.PI;
    this.body.add(this.display.group);
    this.display.set('18:00');
    this.beam.position.y = -1.7;
    this.body.add(this.beam);
  }
  pose(pos: { x: number; y: number; z: number; dx: number; dz: number }, t: number, hover = 3.2) {
    this.root.position.set(pos.x, pos.y + hover + Math.sin(t * 1.7) * 0.12, pos.z);
    this.root.rotation.y = Math.atan2(pos.dx, pos.dz);
    this.body.rotation.x = 0.12 + Math.sin(t * 1.3) * 0.03; // pitched forward, pulling away
    this.body.rotation.z = Math.sin(t * 0.9) * 0.04;
    this.rotors.forEach((r, i) => (r.rotation.y = t * 40 * (i % 2 ? 1 : -1)));
    this.lamps.forEach((l, i) => (l.level = (i < 2 ? Math.sin(t * 6) > 0.5 : true) ? 0.9 : 0.1));
  }
}
