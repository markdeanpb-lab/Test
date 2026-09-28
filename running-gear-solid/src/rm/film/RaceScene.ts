// The workhorse scene: STRIDE running a real course (map-matched GPS) with the real pace
// profile, a shot list (race time can jump at cuts; within a shot it runs at `rate`),
// other runners, spectators, and hooks for boss visuals and HUD.
import * as THREE from 'three';
import { Scene, Stage, Ctx, Cue, ease, easeInOut } from './core';
import { AtmosSpec } from '../engine/Atmos';
import { Grade } from '../engine/Renderer';
import { Arena, ArenaOpts } from '../world/Arena';
import { Polyline } from '../world/ArenaData';
import { Runner, PhaseTrack, Kit, STRIDE_KIT } from '../char/Runner';
import { Crowd, Person, randomKit } from '../char/Crowd';
import { RunProfile } from './profile';
import { CamSpec, applyCam, mixSpec } from './cams';
import { hash } from '../engine/assets';
import { barriers, autoBridges } from './dressing';

export interface Shot {
  dur: number;
  /** race time at the start of the shot (s); negative = before the gun */
  T: number;
  /** race seconds per film second (1 = real time, <1 slow motion) */
  rate?: number;
  cam: CamSpec;
  cam2?: Partial<CamSpec>;
  ease?: 'linear' | 'inout' | 'out';
  grade?: Partial<Grade>;
  tag?: string;
}

export interface Info {
  t: number; // scene-local film time
  T: number; // race time
  d: number; // race distance (m)
  s: number; // course arc (m)
  pos: THREE.Vector3;
  dir: { dx: number; dz: number };
  speed: number;
  shot: number;
  shotT: number; // time within shot
  shotU: number; // 0..1 within shot
  tag?: string;
  finished: boolean;
}

export interface FieldOpts {
  /** runners spread over the course with paces relative to STRIDE */
  count: number;
  /** pace factor range relative to STRIDE (0.8 = 20% slower) */
  kmin?: number;
  kmax?: number;
  /** runners in a pack around STRIDE (same pace, small offsets) */
  pack?: number;
  packSpread?: number;
  seed?: number;
}

export interface SpecOpts {
  /** course arc range (m) where spectators line the course */
  s0: number;
  s1: number;
  /** people per metre per side */
  density?: number;
  sides?: (-1 | 1)[];
  /** distance from course centreline to the barrier line */
  off?: number;
  /** put steel crowd barriers in front of them (default true) */
  barrier?: boolean;
}

export interface RaceOpts {
  id: string;
  chapter?: string;
  arena: string;
  arenaOpts?: ArenaOpts;
  course?: number;
  /** use the raw GPS line (for courses OSM doesn't map well) */
  rawGps?: boolean;
  profile: RunProfile;
  sky: AtmosSpec;
  shots: Shot[];
  kit?: Kit;
  field?: FieldOpts;
  spectators?: SpecOpts[];
  /** path half-width available for lateral spread (m) */
  halfWidth?: number;
  /** STRIDE lateral offset (m, +right) */
  lane?: number;
  /** course arc (m) where race distance 0 sits (for scenes that start part-way round) */
  s0?: number;
  /** explicit course points (local metres, flat x,z) instead of an arena course */
  path?: (race: RaceScene) => number[];
  /** hide STRIDE (prop-only shots) */
  hideRunner?: boolean;
  /** override ground height along the course (bridges): arc -> y or null */
  deck?: (s: number) => number | null;
  /** don't auto-build flat bridges over water crossings */
  noAutoBridge?: boolean;
  wet?: number;
  night?: number;
  treeLight?: number;
  /** extra 3D content */
  build?: (race: RaceScene, ctx: Ctx) => Promise<void> | void;
  /** per-frame hook for boss/FX/HUD (after camera is placed) */
  onFrame?: (race: RaceScene, i: Info, ctx: Ctx) => void;
  /** hook for runner pose overrides (fatigue etc.) */
  pose?: (i: Info) => { fatigue?: number; lean?: number; other?: Record<string, [number, number]>; locoWeight?: number; speedScale?: number; post?: (r: Runner) => void };
  cues?: Cue[];
  /** what STRIDE does after the finish: walk on, or stop */
  after?: 'walk' | 'stop';
}

type Pos = { x: number; z: number; dx: number; dz: number };
interface FieldEntry { k: number; c: number; lane: number; seed: number; kit: ReturnType<typeof randomKit>; body: string; scale: number }

export class RaceScene extends Scene {
  readonly id: string;
  readonly dur: number;
  readonly o: RaceOpts;
  arena!: Arena;
  runner!: Runner;
  crowd: Crowd | null = null;
  course!: Polyline;
  private track!: PhaseTrack;
  private shotStart: number[] = [];
  private scale = 1; // course arc per race metre
  private field: FieldEntry[] = [];
  private specs: Person[] = [];
  private tmp = new THREE.Vector3();
  readonly extras = new THREE.Group();

  constructor(o: RaceOpts) {
    super();
    this.o = o;
    this.id = o.id;
    this.chapter = o.chapter ?? '';
    let t = 0;
    for (const s of o.shots) {
      this.shotStart.push(t);
      t += s.dur;
    }
    this.dur = t;
  }

  async load(ctx: Ctx) {
    const o = this.o;
    const stage = (this.stage = new Stage());
    const [arena, runner, crowd] = await Promise.all([
      Arena.load(o.arena, o.arenaOpts),
      Runner.create(o.kit ?? STRIDE_KIT),
      o.field || o.spectators ? Crowd.create() : Promise.resolve(null),
      stage.sky(ctx.r, o.sky),
    ]);
    this.arena = arena;
    this.runner = runner;
    this.crowd = crowd;
    const c = arena.data.j.courses[o.course ?? 0];
    this.course = new Polyline(o.path ? o.path(this) : o.rawGps ? c.gps : c.p);
    this.scale = o.profile.synthetic ? 1 : this.course.length / o.profile.distance;
    stage.scene.add(arena.group, runner.root, this.extras);
    if (crowd) stage.scene.add(crowd.group);
    arena.wet = o.wet ?? 0;
    arena.night = o.night ?? 0;
    arena.trees.uniforms.uLight.value.setScalar(o.treeLight ?? 0.85);
    // phase integration over the race-time span the shots cover
    let T0 = Infinity, T1 = -Infinity;
    o.shots.forEach((s) => {
      T0 = Math.min(T0, s.T);
      T1 = Math.max(T1, s.T + s.dur * (s.rate ?? 1));
    });
    this.track = new PhaseTrack(runner, (T) => this.dist(T), T0 - 1, T1 + 1);
    if (!o.noAutoBridge && !o.deck) o.deck = autoBridges(this);
    this.buildField();
    this.buildSpectators();
    await o.build?.(this, ctx);
  }

  unload() {
    super.unload();
  }

  /** race distance including the pre-start stand and post-finish walk-off */
  dist(T: number) {
    const p = this.o.profile;
    if (T <= 0) return 0;
    if (T <= p.finish) return p.distAt(T);
    const vf = p.speedAt(p.finish - 3, 3);
    const e = T - p.finish;
    if (this.o.after === 'stop') return p.distance + vf * 1.4 * (1 - Math.exp(-e / 1.4));
    // decelerate to a walk over ~3 s, then walk on at 1.2 m/s for up to 25 m
    const walk = 1.2, k = 1.3;
    const dec = (vf - walk) * k * (1 - Math.exp(-e / k)) + walk * e;
    return p.distance + Math.min(dec, (vf - walk) * k + 25);
  }

  /** course position at arc s, extrapolated straight beyond both ends */
  courseAt(s: number): Pos {
    const L = this.course.length;
    if (s >= 0 && s <= L) {
      const a = this.course.at(s), d = this.course.dir(s, 5);
      return { x: a.x, z: a.z, dx: d.dx, dz: d.dz };
    }
    const end = s < 0 ? 0 : L;
    const a = this.course.at(end), d = this.course.dir(end, 8);
    const e = s - end;
    return { x: a.x + d.dx * e, z: a.z + d.dz * e, dx: d.dx, dz: d.dz };
  }

  /** world position for arc s and lateral offset (m, +right) */
  place(s: number, off: number) {
    const q = this.courseAt(s);
    const x = q.x - q.dz * off, z = q.z + q.dx * off;
    const dk = this.o.deck?.(s);
    return { x, y: dk ?? this.arena.heightAt(x, z), z, dx: q.dx, dz: q.dz };
  }

  raceTime(t: number) {
    const i = this.shotIndex(t);
    const s = this.o.shots[i];
    const lt = t - this.shotStart[i];
    return s.T + lt * (s.rate ?? 1);
  }

  shotIndex(t: number) {
    let i = this.shotStart.length - 1;
    while (i > 0 && this.shotStart[i] > t) i--;
    return i;
  }

  private buildField() {
    const f = this.o.field;
    if (!f) return;
    const seed = f.seed ?? 7;
    const hw = this.o.halfWidth ?? 2.5;
    const bodies = ['m', 'm', 'b', 'f', 'f'];
    const npack = f.pack ?? 0;
    for (let i = 0; i < f.count + npack; i++) {
      const packed = i >= f.count;
      const r = hash(i, seed, 1);
      const k = packed ? 1 : (f.kmin ?? 0.72) + ((f.kmax ?? 1.12) - (f.kmin ?? 0.72)) * r;
      // pack: spaced out in a staggered formation so nobody overlaps
      const j = i - f.count;
      const c = packed ? ((j + 1) * (f.packSpread ?? 14) * 2) / (npack + 1) - (f.packSpread ?? 14) + (hash(i, seed, 2) - 0.5) * 1.2 : 0;
      const lane = packed ? ((j % 3) - 1) * Math.min(1.1, (hw - 0.45) / 1.2) + (hash(i, seed, 3) - 0.5) * 0.3 : (hash(i, seed, 3) * 2 - 1) * (hw - 0.45);
      this.field.push({
        k,
        c,
        lane,
        seed: i * 13 + seed,
        kit: randomKit(i * 7 + seed),
        body: bodies[Math.floor(hash(i, seed, 4) * bodies.length)],
        scale: 0.93 + 0.12 * hash(i, seed, 5),
      });
    }
  }

  private buildSpectators() {
    const sp = this.o.spectators;
    if (!sp) return;
    let n = 0;
    const poses = ['rail', 'rail', 'call', 'idle', 'arms', 'phone', 'idle', 'rail'];
    for (const g of sp) {
      const dens = g.density ?? 0.5;
      const boff = g.off ?? (this.o.halfWidth ?? 2.5) + 0.6;
      for (const side of g.sides ?? [-1, 1]) {
        if (g.barrier !== false) barriers(this, g.s0, g.s1, side as 1 | -1, boff);
        for (let s = g.s0; s < g.s1; s += 1 / dens) {
          n++;
          const j = hash(n, 99, 1);
          const pz = poses[Math.floor(hash(n, 99, 3) * poses.length)];
          const atRail = pz === 'rail' || pz === 'call';
          const off = side * (boff + (atRail && g.barrier !== false ? 0.42 : 0.9 + j * 1.6));
          const p = this.place(s + (hash(n, 99, 2) - 0.5) / dens, off);
          const pose = atRail && g.barrier === false ? 'idle' : pz;
          const body = ['m', 'b', 'f'][Math.floor(hash(n, 99, 4) * 3)];
          const frames = this.crowd!.frames(pose, body);
          const kit = randomKit(n * 31 + 5);
          // face the course
          const yaw = Math.atan2(-(-p.dz * side), -(p.dx * side)) + (hash(n, 99, 6) - 0.5) * 0.8;
          this.specs.push({
            mesh: `${pose}_${body}_${String(Math.floor(hash(n, 99, 5) * frames)).padStart(2, '0')}`,
            x: p.x, y: p.y, z: p.z, yaw, scale: 0.92 + 0.14 * hash(n, 99, 7),
            ...kit, top: hash(n, 99, 8) < 0.5 ? kit.top : [0x2b2f36, 0x4a3b2c, 0x1d2a3a, 0x5b5b5b, 0x7a2b2b, 0x2e4a2e][Math.floor(hash(n, 99, 9) * 6)],
          });
        }
      }
    }
  }

  private people(T: number, strideD: number, strideLane: number): Person[] {
    // (two passes: positions along the course, then de-confliction and placement)
    const out: Person[] = [];
    if (!this.crowd) return out;
    const L = this.o.profile.distance;
    const runFrames = 12;
    const raw: { r: FieldEntry; d: number; lane: number; T: number; startPen: boolean }[] = [];
    for (const r of this.field) {
      // distance: their own pace (k) on STRIDE's profile, plus a pack offset that drifts
      let d: number;
      if (T <= 0) d = 0;
      else d = r.k === 1 ? this.o.profile.distAt(T) + r.c + Math.sin(T * 0.05 + r.seed) * 6 : this.o.profile.distAt(T * r.k);
      const startPen = T <= 0 || d <= 0;
      let lane = r.lane + (r.k === 1 ? Math.sin(T * 0.07 + r.seed) * 0.25 : Math.sin(T * 0.07 + r.seed) * 0.6);
      if (startPen) {
        // standing in the pen behind the line: shoulder to shoulder, 0.62 m apart
        const idx = this.field.indexOf(r);
        const hw = this.o.halfWidth ?? 2.5;
        const cols = Math.max(3, Math.floor((2 * (hw - 0.3)) / 0.62));
        const row = Math.floor(idx / cols), col = idx % cols;
        lane = (col / (cols - 1) - 0.5) * 2 * (hw - 0.3) + (hash(r.seed, 7) - 0.5) * 0.22;
        d = -1.0 - row * 0.72 - hash(r.seed, 8) * 0.2;
      }
      if (d > L + 30) continue;
      raw.push({ r, d, lane, T, startPen });
    }
    // de-conflict: nobody within 1.1 m ahead/behind and 0.75 m across of anyone else (or STRIDE)
    raw.sort((a, b) => a.d - b.d);
    const hw = (this.o.halfWidth ?? 2.5) - 0.35;
    for (let a = 0; a < raw.length; a++) {
      const A = raw[a];
      if (A.startPen) continue;
      if (Math.abs(A.d - strideD) < 1.6 && Math.abs(A.lane - strideLane) < 0.85) A.lane = strideLane + Math.sign(A.lane - strideLane || 1) * 0.85;
      for (let b = a - 1; b >= 0 && A.d - raw[b].d < 1.1; b--) {
        const B = raw[b];
        if (Math.abs(A.lane - B.lane) < 0.75) A.lane = B.lane + (A.lane >= B.lane ? 0.75 : -0.75);
      }
      if (Math.abs(A.lane) > hw + 1.2) A.lane = Math.sign(A.lane) * (hw + 1.2); // spill onto the verge rather than overlap
    }
    for (const { r, d, lane, T: _T, startPen } of raw) {
      void _T;
      const p = this.place((this.o.s0 ?? 0) + d * this.scale, lane);
      const spd = startPen ? 0 : Math.max(0.1, (this.o.profile.distAt(T * r.k + 1) - this.o.profile.distAt(T * r.k - 1)) / 2);
      const stride = 2.5 + spd * 0.35;
      const phase = d / stride + hash(r.seed, 3);
      const moving = !startPen && d < L;
      const pose = moving ? 'run' : 'idle';
      const frames = moving ? runFrames : 3;
      const fi = moving ? Math.floor((((phase % 1) + 1) % 1) * frames) : r.seed % 3;
      out.push({
        mesh: `${pose}_${r.body}_${String(fi).padStart(2, '0')}`,
        x: p.x, y: p.y, z: p.z,
        yaw: Math.atan2(p.dx, p.dz),
        scale: r.scale,
        ...r.kit,
      });
    }
    return out.concat(this.specs);
  }

  info!: Info;

  frame(t: number, ctx: Ctx) {
    const o = this.o;
    const i = this.shotIndex(t);
    const shot = o.shots[i];
    const lt = t - this.shotStart[i];
    const u = shot.dur > 0 ? lt / shot.dur : 0;
    const T = shot.T + lt * (shot.rate ?? 1);
    const d = this.dist(T);
    const lane = o.lane ?? 0.4;
    const s = (this.o.s0 ?? 0) + d * this.scale;
    const p = this.place(s, lane);
    const speed = T <= 0 ? 0 : (this.dist(T + 0.5) - this.dist(T - 0.5)) / 1;
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    const dir = { dx: p.dx, dz: p.dz };
    const finished = T > o.profile.finish;
    this.info = { t, T, d, s, pos, dir, speed, shot: i, shotT: lt, shotU: u, tag: shot.tag, finished };
    // runner
    const r = this.runner;
    r.root.visible = !o.hideRunner;
    r.root.position.copy(pos);
    r.root.rotation.y = Math.atan2(dir.dx, dir.dz);
    const extra = o.pose?.(this.info) ?? {};
    if (speed < 0.3) {
      r.pose({ phase: 0, speed: 1, locoWeight: 0, other: extra.other ?? { Idle_Loop: [1, T + 10] }, fatigue: extra.fatigue, post: extra.post });
    } else {
      r.pose({ phase: this.track.at(T), speed: Math.max(0.6, speed), fatigue: extra.fatigue, lean: extra.lean, other: extra.other, locoWeight: extra.locoWeight, post: extra.post });
    }
    // camera
    const stage = this.stage!;
    const cu = shot.ease === 'linear' ? u : shot.ease === 'out' ? 1 - Math.pow(1 - u, 2) : easeInOut(u);
    const spec = mixSpec(shot.cam, shot.cam2, cu);
    // fixed cameras are specified by race distance along the course
    applyCam(stage.camera, spec, { pos, dir }, t, (x, z) => this.arena.heightAt(x, z), (dd) => this.courseAt((this.o.s0 ?? 0) + dd * this.scale));
    // world
    stage.atmos.follow(pos);
    this.arena.update(stage.camera.position, pos, t);
    this.crowd?.set(this.people(T, d, lane), stage.camera, 16, pos);
    Object.assign(ctx.r.grade, shot.grade ?? {});
    o.onFrame?.(this, this.info, ctx);
    void ease;
    void this.tmp;
  }

  cues(): Cue[] {
    return this.o.cues ?? [];
  }
}
