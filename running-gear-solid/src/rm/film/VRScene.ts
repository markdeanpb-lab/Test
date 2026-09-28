// VR TRAINING: a void with a glowing grid floor, for sessions that have no course worth
// showing (intervals, treadmill). STRIDE runs down an endless lane; the HUD counts reps.
import * as THREE from 'three';
import { Scene, Stage, Ctx, Cue } from './core';
import { Runner, PhaseTrack } from '../char/Runner';
import { applyCam, CamSpec, mixSpec } from './cams';

export interface VRShot {
  dur: number;
  cam: CamSpec;
  cam2?: Partial<CamSpec>;
}
export interface VROpts {
  id: string;
  chapter?: string;
  /** running speed (m/s) as a function of scene time */
  speed: (t: number) => number;
  shots: VRShot[];
  color?: number;
  onFrame?: (t: number, ctx: Ctx, info: { d: number; speed: number; shot: number; shotT: number }) => void;
  cues?: Cue[];
}

const GRID_FRAG = /* glsl */ `
  uniform vec3 uCol; uniform float uFog;
  varying vec3 vW;
  float line(float x, float w) { float d = abs(fract(x - 0.5) - 0.5) / fwidth(x); return 1.0 - min(d / w, 1.0); }
  void main() {
    float g1 = max(line(vW.x, 1.0), line(vW.z, 1.0)) * 0.35;
    float g10 = max(line(vW.x / 10.0, 1.2), line(vW.z / 10.0, 1.2));
    float lane = step(abs(vW.x), 1.2) * 0.08;
    float d = length(vW.xz - cameraPosition.xz);
    float f = exp(-d * uFog);
    vec3 c = uCol * (max(g1, g10) + lane) * f;
    gl_FragColor = vec4(c, 1.0);
  }`;

export class VRScene extends Scene {
  readonly id: string;
  readonly dur: number;
  private o: VROpts;
  private runner!: Runner;
  private track!: PhaseTrack;
  private starts: number[] = [];
  private dist: (t: number) => number;

  constructor(o: VROpts) {
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
    // integrate distance
    const dt = 1 / 48, n = Math.ceil(t / dt) + 2;
    const D = new Float64Array(n);
    for (let i = 1; i < n; i++) D[i] = D[i - 1] + o.speed(i * dt) * dt;
    this.dist = (tt: number) => {
      const f = Math.max(0, tt / dt), i = Math.min(n - 2, Math.floor(f));
      return D[i] + (D[i + 1] - D[i]) * (f - i);
    };
  }

  async load(ctx: Ctx) {
    const st = (this.stage = new Stage());
    await st.sky(ctx.r, { hdri: 'moonless_golf', env: 0.4, sun: 0.8, sunDir: [0.3, 1, 0.5], bgIntensity: 0, shadowSize: 12 });
    st.scene.background = new THREE.Color(0x020405);
    st.scene.fog = null;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(this.o.color ?? 0x5fffb0) }, uFog: { value: 0.035 } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: GRID_FRAG,
      }),
    );
    floor.position.z = 1800;
    const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.6 }));
    shadowCatcher.position.set(0, 0.002, 1800);
    shadowCatcher.receiveShadow = true;
    this.runner = await Runner.create();
    st.scene.add(floor, shadowCatcher, this.runner.root);
    this.track = new PhaseTrack(this.runner, (tt) => this.dist(tt), -1, this.dur + 1);
  }

  frame(t: number, ctx: Ctx) {
    let i = this.starts.length - 1;
    while (i > 0 && this.starts[i] > t) i--;
    const shot = this.o.shots[i];
    const lt = t - this.starts[i];
    const d = this.dist(t), speed = this.o.speed(t);
    const pos = new THREE.Vector3(0, 0, d);
    this.runner.root.position.copy(pos);
    this.runner.root.rotation.y = 0;
    if (speed < 0.3) this.runner.pose({ phase: 0, speed: 1, locoWeight: 0, other: { Idle_Loop: [1, t] }, fatigue: 0.6 });
    else this.runner.pose({ phase: this.track.at(t), speed });
    const st = this.stage!;
    applyCam(st.camera, mixSpec(shot.cam, shot.cam2, lt / shot.dur), { pos, dir: { dx: 0, dz: 1 } }, t, () => 0);
    st.atmos.follow(pos);
    const g = ctx.r.grade;
    g.bloom = 0.5;
    g.saturation = 0.9;
    this.o.onFrame?.(t, ctx, { d, speed, shot: i, shotT: lt });
  }

  cues() {
    return this.o.cues ?? [];
  }
}
