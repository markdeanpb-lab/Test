// STRIDE: the CC0 Quaternius base character with generated running kit (tools/blender/build_runner.py),
// driven by the Universal Animation Library. Locomotion is phase-driven: clip time comes from the
// distance actually covered (so feet never slide), jog/sprint/walk are blended by speed, and a
// procedural fatigue layer bends the posture.
import * as THREE from 'three';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGLTF } from '../engine/assets';

export interface Kit {
  singlet: number;
  shorts: number;
  socks: number;
  shoes: number;
  hair: number;
  skin?: number;
  bib?: boolean;
}
export const STRIDE_KIT: Kit = { singlet: 0x1d3f6e, shorts: 0x141417, socks: 0xe6e6e0, shoes: 0xff5a1f, hair: 0x2a1d14 };

interface Gait { clip: THREE.AnimationClip; action: THREE.AnimationAction; a: number; b: number; travel: number; speed: number; stride: number; offset: number }

let shared: Promise<{ body: THREE.Object3D; clips: THREE.AnimationClip[] }> | null = null;
function assets() {
  shared ??= (async () => {
    const [char, u1, u2] = await Promise.all([loadGLTF('/assets/char/runner.glb'), loadGLTF('/assets/char/UAL1_Standard.glb'), loadGLTF('/assets/char/UAL2_Standard.glb')]);
    return { body: char.scene, clips: [...u1.animations, ...u2.animations] };
  })();
  return shared;
}

export class Runner {
  readonly root = new THREE.Group();
  readonly body: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly clips: Map<string, THREE.AnimationClip>;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private gaits: Record<'walk' | 'jog' | 'sprint', Gait>;
  private bones: Record<string, THREE.Bone> = {};
  readonly materials: Record<string, THREE.MeshStandardMaterial> = {};

  private constructor(src: { body: THREE.Object3D; clips: THREE.AnimationClip[] }, kit: Kit) {
    this.body = skClone(src.body);
    this.root.add(this.body);
    this.clips = new Map(src.clips.map((c) => [c.name, c]));
    this.body.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if ((o as THREE.Bone).isBone) this.bones[o.name] = o as THREE.Bone;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      const old = m.material as THREE.MeshStandardMaterial;
      const set = (color: number, rough: number, keepMap = false) => {
        const mat = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
        if (keepMap && old.map) {
          mat.map = old.map;
          mat.alphaTest = 0.4;
        }
        if (old.normalMap) mat.normalMap = old.normalMap;
        mat.side = THREE.DoubleSide;
        this.materials[m.name] = mat;
        m.material = mat;
      };
      switch (m.name) {
        case 'Singlet': set(kit.singlet, 0.78); break;
        case 'Shorts': set(kit.shorts, 0.72); break;
        case 'Socks': set(kit.socks, 0.9); break;
        case 'Shoes': set(kit.shoes, 0.5); break;
        case 'Watch': set(0x101012, 0.25); break;
        case 'Hair': set(kit.hair, 0.55, true); break;
        case 'Eyebrows': set(kit.hair, 0.8, true); break;
        case 'Skin': {
          const mat = old.clone();
          mat.roughness = 0.55;
          if (kit.skin !== undefined) mat.color.setHex(kit.skin);
          this.materials.Skin = mat;
          m.material = mat;
          break;
        }
        default:
          this.materials[m.name] = old;
      }
    });
    this.mixer = new THREE.AnimationMixer(this.body);
    const mk = (name: string): Gait => {
      const clip = this.clips.get(name)!;
      const action = this.mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(0);
      const g = { clip, action, ...this.measure(clip) };
      return g;
    };
    this.gaits = { walk: mk('Walk_Loop'), jog: mk('Jog_Fwd_Loop'), sprint: mk('Sprint_Loop') };
  }

  static async create(kit: Kit = STRIDE_KIT) {
    return new Runner(await assets(), kit);
  }

  /**
   * Find the left foot's ground-contact window [a, b] (clip fractions) and how far the foot
   * travels backwards during it. The clips are in-place loops with short stylised contacts,
   * so pose() time-warps each half cycle to stretch contact to a realistic length.
   */
  private measure(clip: THREE.AnimationClip) {
    const mixer = new THREE.AnimationMixer(this.body);
    const a = mixer.clipAction(clip);
    a.play();
    const foot = this.bones.foot_l;
    const N = 120;
    const ys: number[] = [], zs: number[] = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      mixer.setTime((clip.duration * i) / N);
      this.body.updateMatrixWorld(true);
      foot.getWorldPosition(v);
      ys.push(v.y);
      zs.push(v.z);
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(this.body);
    let low = 0;
    for (let i = 1; i < N; i++) if (ys[i] < ys[low]) low = i;
    const thr = ys[low] + 0.05;
    let i0 = low, i1 = low;
    while (ys[(i0 - 1 + N) % N] < thr && (low - i0) < N / 2) i0--;
    while (ys[(i1 + 1) % N] < thr && (i1 - low) < N / 2) i1++;
    const travel = Math.abs(zs[((i0 % N) + N) % N] - zs[i1 % N]);
    const sa = i0 / N, sb = i1 / N; // sa may be negative (wraps)
    return { a: sa, b: sb, travel, speed: travel / ((sb - sa) * clip.duration), stride: 0, offset: 0 };
  }

  bone(name: string) {
    return this.bones[name];
  }

  action(name: string) {
    let a = this.actions.get(name);
    if (!a) {
      a = this.mixer.clipAction(this.clips.get(name)!);
      a.play();
      a.setEffectiveWeight(0);
      this.actions.set(name, a);
    }
    return a;
  }

  /**
   * Pose the runner. phase = cycles completed (from integrated distance / stride), speed m/s.
   * other: extra clip weights {name: [weight, time]} blended on top (idle, walk-in, etc.)
   */
  pose(o: { phase: number; speed: number; fatigue?: number; lean?: number; other?: Record<string, [number, number]>; locoWeight?: number }) {
    const { jog, sprint, walk } = this.gaits;
    const s = o.speed;
    // gait weights by speed: walk < 2.2 m/s < jog < 4.6 m/s < sprint
    let wWalk = 0, wJog = 0, wSprint = 0;
    if (s < 1.9) wWalk = 1;
    else if (s < 2.5) {
      wJog = (s - 1.9) / 0.6;
      wWalk = 1 - wJog;
    } else if (s < 4.3) wJog = 1;
    else if (s < 5.6) {
      wSprint = (s - 4.3) / 1.3;
      wJog = 1 - wSprint;
    } else wSprint = 1;
    const lw = o.locoWeight ?? 1;
    const T = 120 / cadence(Math.max(0.5, s));
    const ph = (g: Gait) => {
      // p = 0 at left touchdown; each half cycle: contact (length Ld) then swing
      const p = ((o.phase % 1) + 1) % 1;
      const Ls = g.b - g.a;
      const Ld = Math.min(0.46, Math.max(Ls * 0.8, g.travel / (Math.max(0.5, s) * T)));
      const half = p >= 0.5 ? 0.5 : 0;
      const u = p - half;
      const q = u < Ld ? (u / Ld) * Ls : Ls + ((u - Ld) / (0.5 - Ld)) * (0.5 - Ls);
      const c = g.a + half + q;
      return (((c % 1) + 1) % 1) * g.clip.duration;
    };
    for (const [g, w] of [[walk, wWalk], [jog, wJog], [sprint, wSprint]] as [Gait, number][]) {
      g.action.time = ph(g);
      g.action.setEffectiveWeight(w * lw);
    }
    for (const a of this.actions.values()) a.setEffectiveWeight(0);
    for (const [name, [w, t]] of Object.entries(o.other ?? {})) {
      const a = this.action(name);
      a.time = t % a.getClip().duration;
      a.setEffectiveWeight(w);
    }
    this.mixer.update(0);
    // procedural layer: fatigue slump / forward lean
    const f = o.fatigue ?? 0, lean = o.lean ?? 0;
    const rot = (b: string, x: number, y = 0, z = 0) => {
      const bn = this.bones[b];
      if (bn) bn.rotateX(x), bn.rotateY(y), bn.rotateZ(z);
    };
    if (f || lean) {
      rot('spine_01', 0.05 * f + lean * 0.5);
      rot('spine_02', 0.08 * f + lean * 0.3);
      rot('neck_01', 0.12 * f);
      rot('Head', 0.18 * f);
      rot('upperarm_l', 0, 0, -0.12 * f);
      rot('upperarm_r', 0, 0, 0.12 * f);
    }
  }

  /** metres per full cycle (two steps) at speed s */
  strideAt(s: number) {
    return s * (120 / cadence(s));
  }

  get gaitInfo() {
    const { jog, sprint, walk } = this.gaits;
    return { walk: [walk.a, walk.b, walk.travel], jog: [jog.a, jog.b, jog.travel], sprint: [sprint.a, sprint.b, sprint.travel] };
  }
}

/** Steps per minute at speed s (m/s): walking ~100-120, running 160-185. */
export function cadence(s: number) {
  if (s < 1.9) return 88 + 16 * s;
  if (s < 2.5) return THREE.MathUtils.lerp(88 + 16 * 1.9, 158, (s - 1.9) / 0.6);
  return Math.min(192, 158 + 8 * (s - 2.5));
}

/**
 * Integrates locomotion phase over time for a runner whose distance is a function of time.
 * Deterministic: built once per sequence at a fixed step.
 */
export class PhaseTrack {
  private readonly t0: number;
  private readonly dt = 1 / 240;
  private readonly ph: Float64Array;
  constructor(runner: Runner, dist: (t: number) => number, t0: number, t1: number) {
    this.t0 = t0;
    const n = Math.ceil((t1 - t0) / this.dt) + 2;
    this.ph = new Float64Array(n);
    let prev = dist(t0);
    for (let i = 1; i < n; i++) {
      const t = t0 + i * this.dt;
      const d = dist(t);
      const v = (d - prev) / this.dt;
      this.ph[i] = this.ph[i - 1] + (Math.abs(d - prev) / runner.strideAt(Math.max(0.3, Math.abs(v))));
      prev = d;
    }
  }
  at(t: number) {
    const f = (t - this.t0) / this.dt;
    const i = Math.max(0, Math.min(this.ph.length - 2, Math.floor(f)));
    const u = Math.min(1, Math.max(0, f - i));
    return this.ph[i] * (1 - u) + this.ph[i + 1] * u;
  }
}
