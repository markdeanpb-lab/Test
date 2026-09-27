import * as THREE from 'three';
import gsap from 'gsap';
import { FilmRenderer, defaultFX } from '../renderer/Renderer';
import { UI } from '../hud/UI';
import { DURATION, SCHEDULE, SeqId } from './schedule';
import type { Sequence, FilmHost } from './Sequence';
import { SEQUENCES } from './sequences';

export class Film implements FilmHost {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 3000);
  readonly tl = gsap.timeline({ paused: true });
  readonly renderer: FilmRenderer;
  readonly ui: UI;
  readonly seqs: Sequence[] = [];
  readonly duration = DURATION;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new FilmRenderer(canvas);
    this.ui = new UI(this.renderer.ui);
    this.scene.matrixWorldAutoUpdate = true;
    for (const slot of SCHEDULE) {
      const Ctor = SEQUENCES[slot.id as SeqId];
      const s = new Ctor(this, slot);
      s.build();
      this.seqs.push(s);
    }
    // pad the timeline to full length, then pre-render every tween once in
    // order so that random seeks always see correctly initialised tweens.
    this.tl.set({ pad: 0 }, { pad: 1 }, DURATION);
    this.tl.progress(1, true).progress(0, true);
  }

  activeAt(t: number) {
    let s = this.seqs[0];
    for (const q of this.seqs) if (t >= q.start) s = q;
    return s;
  }

  renderFrame(t: number) {
    const time = Math.max(0, Math.min(this.duration - 1e-6, t));
    this.tl.seek(time, true);
    const seq = this.activeAt(time);
    for (const s of this.seqs) s.group.visible = s === seq;
    const local = time - seq.start;
    const fx = defaultFX();
    seq.update(local, fx, this.camera);
    seq.applyCamera(local, this.camera);
    this.ui.clear();
    seq.drawUI(this.ui, local);
    this.scene.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera, fx, time, seq.clearColor);
    return seq.slot.id;
  }
}
