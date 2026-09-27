import * as THREE from 'three';
import gsap from 'gsap';
import type { FX } from '../renderer/Renderer';
import type { UI } from '../hud/UI';
import type { SeqSlot } from './schedule';
import { noise1 } from '../core/util';

export interface Cam {
  x: number;
  y: number;
  z: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  roll: number;
  shake: number;
}

export const cam = (x: number, y: number, z: number, tx: number, ty: number, tz: number, fov = 50, roll = 0, shake = 0): Cam => ({ x, y, z, tx, ty, tz, fov, roll, shake });

interface Shot {
  t0: number;
  t1: number;
  proxy: Cam;
  follow?: (t: number, c: Cam) => void;
}

export interface FilmHost {
  scene: THREE.Scene;
  tl: gsap.core.Timeline;
}

/**
 * A sequence owns a 3D set (group), a list of authored camera shots and a UI
 * layer. Camera shots are GSAP tweens on per-shot proxy objects inside the
 * master timeline, so any timeline position can be seeked deterministically.
 */
export abstract class Sequence {
  readonly group = new THREE.Group();
  readonly clearColor = new THREE.Color(0x000000);
  protected shots: Shot[] = [];
  protected readonly tl: gsap.core.Timeline;

  constructor(protected host: FilmHost, readonly slot: SeqSlot) {
    this.tl = host.tl;
    this.group.visible = false;
    this.group.name = slot.id;
    host.scene.add(this.group);
  }

  get start() {
    return this.slot.start;
  }
  get duration() {
    return this.slot.duration;
  }

  abstract build(): void;
  abstract update(t: number, fx: FX, camera: THREE.PerspectiveCamera): void;
  drawUI(_ui: UI, _t: number): void {}

  /** Add a camera shot (hard cut at t0) tweening from -> to over dur. */
  protected shot(t0: number, dur: number, from: Cam, to: Cam | null = null, ease = 'power2.inOut', follow?: (t: number, c: Cam) => void) {
    const proxy = { ...from };
    if (to) {
      this.tl.fromTo(proxy, { ...from }, { ...to, duration: dur, ease, immediateRender: false }, this.start + t0);
    }
    this.shots.push({ t0, t1: t0 + dur, proxy, follow });
    this.shots.sort((a, b) => a.t0 - b.t0);
    return proxy;
  }

  /** Multi-key shot: keys are consecutive tweens on the same proxy. */
  protected shotKeys(t0: number, from: Cam, keys: { dur: number; to: Partial<Cam>; ease?: string }[], follow?: (t: number, c: Cam) => void) {
    const proxy = { ...from };
    let t = t0;
    let prev = { ...from };
    for (const k of keys) {
      const next = { ...prev, ...k.to };
      this.tl.fromTo(proxy, { ...prev }, { ...next, duration: k.dur, ease: k.ease ?? 'power2.inOut', immediateRender: false }, this.start + t);
      t += k.dur;
      prev = next;
    }
    this.shots.push({ t0, t1: t, proxy, follow });
    this.shots.sort((a, b) => a.t0 - b.t0);
    return proxy;
  }

  /** Tween arbitrary numeric fields of an object inside this sequence's window. */
  protected tween<T extends object>(target: T, at: number, dur: number, from: Partial<T>, to: Partial<T>, ease = 'power2.inOut') {
    this.tl.fromTo(target, { ...from } as gsap.TweenVars, { ...to, duration: dur, ease, immediateRender: false } as gsap.TweenVars, this.start + at);
  }

  /** Discrete state change at a time (a scene "event"). */
  protected set<T extends object>(target: T, at: number, vars: Partial<T>) {
    this.tl.set(target, { ...vars } as gsap.TweenVars, this.start + at);
  }

  activeShot(t: number) {
    let s = this.shots[0];
    for (const sh of this.shots) if (t >= sh.t0) s = sh;
    return s;
  }

  applyCamera(t: number, camera: THREE.PerspectiveCamera) {
    const s = this.activeShot(t);
    if (!s) return;
    const c = { ...s.proxy };
    s.follow?.(t, c);
    let { x, y, z } = c;
    if (c.shake > 0) {
      x += noise1(t * 13.1) * c.shake;
      y += noise1(t * 11.7 + 40) * c.shake;
      z += noise1(t * 12.3 + 80) * c.shake * 0.5;
    }
    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.lookAt(c.tx, c.ty, c.tz);
    if (c.roll) camera.rotateZ(c.roll);
    if (camera.fov !== c.fov) {
      camera.fov = c.fov;
      camera.updateProjectionMatrix();
    }
  }

  /** index of the shot active at t (for cut-dependent logic) */
  shotIndex(t: number) {
    let i = 0;
    this.shots.forEach((s, k) => {
      if (t >= s.t0) i = k;
    });
    return i;
  }
}

export const ease = (name: string) => gsap.parseEase(name) as (t: number) => number;
