// THE HARE (impatience), on the road: the same white hare with the pocket watch that waits at start
// lines (chapter 1) and baits him in its Wonderland (chapter 2), now bounding along the course just
// ahead, always a little too fast. "Went off too fast", "full send then big regrets", "big blow up
// after 10k": the thing he keeps chasing. Same API as the old Ghost pacer.
import * as THREE from 'three';
import { Particles } from './kit';
import { makeHare } from '../chapters/hare';

export class Lure {
  readonly root = new THREE.Group();
  /** compatibility with Ghost (chapters add runner.root) */
  readonly runner = { root: this.root };
  private hare!: ReturnType<typeof makeHare>;
  readonly dust = new Particles({ n: 120, box: [0.5, 0.15, 0.5], vel: [0, 1.0, -3], life: 0.9, size: 0.4, color: 0xb0a898, opacity: 0.35, grow: 2, seed: 17 });
  private side = -1;

  static async create() {
    const l = new Lure();
    l.hare = makeHare();
    l.root.add(l.hare.g);
    l.dust.points.position.set(0, 0.05, -0.4);
    l.root.add(l.dust.points);
    return l;
  }

  /** no phase track needed (API compatibility) */
  prepare(_d: (T: number) => number, _a: number, _b: number) {}

  set opacity(v: number) {
    this.root.visible = v > 0.01;
  }

  /** which side of the runner it keeps to (+1 right); reach is ignored now it runs on the road */
  rig(side: number, _reach = 3.2) {
    this.side = side;
  }

  pose(pos: { x: number; y: number; z: number; dx: number; dz: number }, T: number, speed: number) {
    const yaw = Math.atan2(pos.dx, pos.dz);
    this.root.position.set(pos.x, pos.y, pos.z);
    this.root.rotation.y = yaw;
    // a bounding gait, and every so often a look back over its shoulder with the watch up
    const ph = T * Math.max(2, speed) * 1.6;
    const look = Math.max(0, Math.sin(T * 0.7)) ** 8;
    const h = this.hare;
    h.g.position.set(-this.side * 0.4, Math.abs(Math.sin(ph)) * 0.45, 0);
    h.g.rotation.y = look * Math.PI * 0.8;
    h.legs.forEach((l, k) => (l.rotation.x = Math.sin(ph * 2 + k * Math.PI) * 0.9));
    h.watch.rotation.z = look * 0.6;
    this.dust.update(T, 1, 0.35);
  }
}
