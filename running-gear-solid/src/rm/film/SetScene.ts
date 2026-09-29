// A hand-built set (interior, boss arena, cutscene) with keyframed cameras and an actor timeline:
// the building block for cutscenes and boss fights that don't happen on a GPS course.
import * as THREE from 'three';
import { Scene, Stage, Ctx, Cue, ease, noise1 } from './core';
import { Runner } from '../char/Runner';
import type { AtmosSpec } from '../engine/Atmos';

export type V3 = [number, number, number];

/** a camera shot: hard cut at its start, eased move from (p0,l0) to (p1,l1) */
export interface SetShot {
  dur: number;
  p0: V3;
  l0: V3;
  p1?: V3;
  l1?: V3;
  fov?: number;
  fov1?: number;
  shake?: number;
  /** 'ease' (default), 'linear' or 'in' (accelerating) */
  curve?: 'ease' | 'linear' | 'in';
  tag?: string;
}

/**
 * Actor beat: from t0 the actor plays `clip` (one-shot clips hold their last frame unless loop),
 * moving from `from` to `to` over [t0, t1] facing `yaw` (or the direction of travel).
 * clip 'walk' / 'run' / 'jog' uses the locomotion gaits at `speed`.
 */
export interface Beat {
  t0: number;
  t1: number;
  clip: string;
  from?: V3;
  to?: V3;
  yaw?: number;
  loop?: boolean;
  speed?: number;
  /** start offset into the clip (s) */
  off?: number;
  /** clip playback rate */
  rate?: number;
}

export class Actor {
  readonly runner: Runner;
  private beats: Beat[];
  constructor(runner: Runner, beats: Beat[]) {
    this.runner = runner;
    this.beats = [...beats].sort((a, b) => a.t0 - b.t0);
  }
  private at(t: number) {
    let i = 0;
    while (i + 1 < this.beats.length && this.beats[i + 1].t0 <= t) i++;
    return i;
  }
  /** position/yaw at t */
  place(t: number) {
    const b = this.beats[this.at(t)];
    const u = b.t1 > b.t0 ? Math.min(1, Math.max(0, (t - b.t0) / (b.t1 - b.t0))) : 1;
    const from = b.from ?? this.prevEnd(b);
    const to = b.to ?? from;
    const p = new THREE.Vector3(from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u, from[2] + (to[2] - from[2]) * u);
    let yaw = b.yaw;
    if (yaw === undefined) yaw = to[0] !== from[0] || to[2] !== from[2] ? Math.atan2(to[0] - from[0], to[2] - from[2]) : this.prevYaw(b);
    return { p, yaw };
  }
  private prevEnd(b: Beat): V3 {
    const i = this.beats.indexOf(b);
    for (let k = i - 1; k >= 0; k--) {
      const q = this.beats[k];
      if (q.to) return q.to;
      if (q.from) return q.from;
    }
    return [0, 0, 0];
  }
  private prevYaw(b: Beat): number {
    const i = this.beats.indexOf(b);
    for (let k = i - 1; k >= 0; k--) {
      const q = this.beats[k];
      if (q.yaw !== undefined) return q.yaw;
      if (q.from && q.to && (q.to[0] !== q.from[0] || q.to[2] !== q.from[2])) return Math.atan2(q.to[0] - q.from[0], q.to[2] - q.from[2]);
    }
    return 0;
  }
  private clipTime(b: Beat, t: number) {
    const r = b.rate ?? 1;
    let ct = (t - b.t0) * r + (b.off ?? 0);
    if (!b.loop && !['walk', 'run', 'jog'].includes(b.clip)) {
      const c = this.runner.clips.get(b.clip);
      if (c) ct = Math.min(ct, c.duration - 0.02);
    }
    return Math.max(0, ct);
  }
  update(t: number, extra: { post?: (r: Runner) => void; fatigue?: number } = {}) {
    const i = this.at(t);
    const b = this.beats[i];
    const { p, yaw } = this.place(t);
    const r = this.runner;
    r.root.position.copy(p);
    r.root.rotation.y = yaw;
    const loco = (bb: Beat) => ['walk', 'run', 'jog'].includes(bb.clip);
    const other: Record<string, [number, number]> = {};
    // cross-fade 0.25 s from the previous beat
    const fade = i > 0 ? Math.min(1, (t - b.t0) / 0.25) : 1;
    let locoW = 0, speed = b.speed ?? (b.clip === 'walk' ? 1.3 : b.clip === 'jog' ? 3 : 5);
    let phase = 0;
    const add = (bb: Beat, w: number) => {
      if (w <= 0) return;
      if (loco(bb)) {
        locoW += w;
        speed = bb.speed ?? speed;
        const from = bb.from ?? [0, 0, 0], to = bb.to ?? from;
        const len = Math.hypot(to[0] - from[0], to[2] - from[2]);
        const u = bb.t1 > bb.t0 ? Math.min(1, Math.max(0, (t - bb.t0) / (bb.t1 - bb.t0))) : 0;
        phase = (len * u) / r.strideAt(speed);
      } else other[bb.clip] = [w, this.clipTime(bb, t)];
    };
    add(b, fade);
    if (fade < 1) add(this.beats[i - 1], 1 - fade);
    r.pose({ phase, speed, locoWeight: locoW, other, post: extra.post, fatigue: extra.fatigue });
  }
}

export interface SetOpts {
  id: string;
  chapter?: string;
  sky?: AtmosSpec;
  shots: SetShot[];
  build: (st: Stage, ctx: Ctx, self: SetScene) => Promise<void>;
  frame: (t: number, ctx: Ctx, info: { shot: number; shotT: number; tag?: string; self: SetScene }) => void;
  cues?: Cue[];
}

export class SetScene extends Scene {
  readonly id: string;
  readonly dur: number;
  readonly o: SetOpts;
  private starts: number[] = [];
  /** free slot for the chapter's own state */
  state: Record<string, unknown> = {};

  constructor(o: SetOpts) {
    super();
    this.o = o;
    this.id = o.id;
    this.chapter = o.chapter ?? '';
    let t = 0;
    for (const s of o.shots) {
      this.starts.push(t);
      t += s.dur;
    }
    this.dur = t;
  }

  async load(ctx: Ctx) {
    const st = (this.stage = new Stage());
    await st.sky(ctx.r, this.o.sky ?? { hdri: 'moonless_golf', env: 0.3, sun: 0, bgIntensity: 0 });
    await this.o.build(st, ctx, this);
  }

  shotAt(t: number) {
    let i = this.starts.length - 1;
    while (i > 0 && this.starts[i] > t) i--;
    return i;
  }

  frame(t: number, ctx: Ctx) {
    const st = this.stage!;
    const i = this.shotAt(t);
    const s = this.o.shots[i];
    const lt = t - this.starts[i];
    const raw = Math.min(1, lt / s.dur);
    const u = s.curve === 'linear' ? raw : s.curve === 'in' ? raw * raw : ease(raw);
    const lerp3 = (a: V3, b: V3 | undefined) => (b ? [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u] : a) as V3;
    const p = lerp3(s.p0, s.p1), l = lerp3(s.l0, s.l1);
    const sh = (s.shake ?? 0.25) * 0.02;
    const cam = st.camera;
    cam.position.set(p[0] + noise1(t * 0.9, 1) * sh, p[1] + noise1(t * 1.1, 2) * sh, p[2] + noise1(t * 0.8, 3) * sh);
    cam.up.set(0, 1, 0);
    cam.lookAt(l[0] + noise1(t * 0.7, 4) * sh * 0.5, l[1] + noise1(t * 0.6, 5) * sh * 0.5, l[2]);
    cam.fov = s.fov1 !== undefined ? (s.fov ?? 40) + (s.fov1 - (s.fov ?? 40)) * u : s.fov ?? 40;
    cam.near = 0.05;
    cam.updateProjectionMatrix();
    ctx.r.camera = cam;
    this.o.frame(t, ctx, { shot: i, shotT: lt, tag: s.tag, self: this });
  }

  cues() {
    return this.o.cues ?? [];
  }
}
