// Film core: scenes on a timeline, lazily loaded, deterministic frame(t).
import * as THREE from 'three';
import { Renderer, defaultGrade } from '../engine/Renderer';
import { Atmos, AtmosSpec } from '../engine/Atmos';
import { Hud } from '../hud/Hud';

/** Audio cue for the offline score/SFX synthesiser (times are scene-local seconds). */
export interface Cue {
  t: number;
  kind: string;
  [k: string]: unknown;
}

export interface Ctx {
  r: Renderer;
  hud: Hud;
}

export abstract class Scene {
  abstract readonly id: string;
  abstract readonly dur: number;
  chapter = '';
  /** 3D stage (null for pure 2D/HUD scenes) */
  stage: Stage | null = null;
  loaded = false;
  abstract load(ctx: Ctx): Promise<void>;
  /** set camera/objects/grade and draw HUD for local time t */
  abstract frame(t: number, ctx: Ctx): void;
  unload(): void {
    this.stage?.dispose();
    this.stage = null;
    this.loaded = false;
  }
  cues(): Cue[] {
    return [];
  }
}

/** A THREE.Scene with sky/sun/fog. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly atmos = new Atmos();
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 3000);
  async sky(r: Renderer, spec: AtmosSpec) {
    await this.atmos.apply(r.gl, this.scene, spec);
    return this;
  }
  dispose() {
    // shared resources (arenas, characters) are owned by their caches; just detach
    this.scene.clear();
  }
}

export class Film {
  readonly scenes: Scene[];
  readonly starts: number[] = [];
  readonly duration: number;
  private active: Scene | null = null;

  constructor(scenes: Scene[]) {
    this.scenes = scenes;
    let t = 0;
    for (const s of scenes) {
      this.starts.push(t);
      t += s.dur;
    }
    this.duration = t;
  }

  at(T: number) {
    let i = this.starts.length - 1;
    while (i > 0 && this.starts[i] > T) i--;
    return { i, scene: this.scenes[i], t: T - this.starts[i] };
  }

  async renderFrame(T: number, ctx: Ctx): Promise<string> {
    const { scene, t } = this.at(Math.min(T, this.duration - 1e-4));
    if (this.active !== scene) {
      if (this.active) this.active.unload();
      this.active = scene;
      if (!scene.loaded) {
        await scene.load(ctx);
        scene.loaded = true;
      }
    }
    ctx.r.grade = defaultGrade();
    ctx.hud.clear();
    ctx.hud.time = T;
    if (scene.stage) {
      ctx.r.setScene(scene.stage.scene);
      ctx.r.camera = scene.stage.camera;
    } else {
      ctx.r.setScene(emptyScene);
      ctx.r.grade.fade = 1;
    }
    scene.frame(t, ctx);
    ctx.r.render(T);
    return scene.id;
  }

  /** absolute-time cue list for the audio synthesiser */
  cues(): Cue[] {
    const out: Cue[] = [];
    this.scenes.forEach((s, i) => {
      for (const c of s.cues()) out.push({ ...c, t: c.t + this.starts[i], scene: s.id });
    });
    return out.sort((a, b) => a.t - b.t);
  }

  chapters() {
    return this.scenes.map((s, i) => ({ id: s.id, chapter: s.chapter, start: +this.starts[i].toFixed(2), dur: s.dur }));
  }
}
const emptyScene = new THREE.Scene();

// ---------------------------------------------------------------- small maths helpers
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** piecewise-linear interpolation through [x, y] keys (x ascending) */
export function keys(k: [number, number][], x: number): number {
  if (x <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (x <= k[i][0]) {
      const [x0, y0] = k[i - 1], [x1, y1] = k[i];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return k[k.length - 1][1];
}

/** deterministic smooth noise in [-1, 1] for camera shake */
export function noise1(x: number, seed = 0) {
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return (h(i) * (1 - u) + h(i + 1) * u) * 2 - 1;
}
