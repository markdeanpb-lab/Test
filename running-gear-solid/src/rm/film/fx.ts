// Boss/metaphor visuals shared by chapters:
//  - Ghost: a translucent copy of a runner (THE HARE = impatience, PHANTOM 1:30 = the target pace)
//  - HoloText: a giant projected number hanging over the course (DOUBLE ZERO, FORTY, NINETEEN...)
//    that can flicker, crack and shatter into particles
import * as THREE from 'three';
import { Runner, PhaseTrack } from '../char/Runner';
import { hash } from '../engine/assets';

export class Ghost {
  readonly runner: Runner;
  private track: PhaseTrack | null = null;
  readonly mats: THREE.Material[] = [];
  private constructor(r: Runner, col: number, wire: boolean, opacity: number) {
    this.runner = r;
    r.root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;
      const fill = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      this.mats.push(fill);
      if (wire) {
        const w = new THREE.MeshBasicMaterial({ color: col, wireframe: true, transparent: true, opacity: Math.min(1, opacity * 2.2), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
        this.mats.push(w);
        const copy = new THREE.SkinnedMesh(m.geometry, w);
        copy.bind(m.skeleton, m.bindMatrix);
        copy.frustumCulled = false;
        m.parent!.add(copy);
      }
      m.material = fill;
    });
  }
  static async create(col = 0xffffff, wire = false, opacity = 0.28) {
    return new Ghost(await Runner.create(), col, wire, opacity);
  }
  /** integrate the ghost's own phase over race time [T0,T1] for distance fn d(T) */
  prepare(d: (T: number) => number, T0: number, T1: number) {
    this.track = new PhaseTrack(this.runner, d, T0, T1);
  }
  set opacity(v: number) {
    for (const m of this.mats) (m as THREE.MeshBasicMaterial).opacity = v * ((m as THREE.MeshBasicMaterial).wireframe ? 2.2 : 1);
    this.runner.root.visible = v > 0.002;
  }
  pose(pos: { x: number; y: number; z: number; dx: number; dz: number }, T: number, speed: number) {
    const r = this.runner;
    r.root.position.set(pos.x, pos.y, pos.z);
    r.root.rotation.y = Math.atan2(pos.dx, pos.dz);
    r.pose({ phase: this.track ? this.track.at(T) : T * 2.9, speed: Math.max(0.8, speed) });
  }
}

/** Canvas-rendered glowing text on a plane (additive), with scanlines. */
export class HoloText {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly mat: THREE.MeshBasicMaterial;
  private canvas: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private text = '';
  private points: THREE.Points | null = null;
  private pBase: Float32Array | null = null;
  private pVel: Float32Array | null = null;
  readonly width: number;
  readonly height: number;
  col: string;
  constructor(text: string, width: number, o: { col?: string; font?: string; aspect?: number } = {}) {
    this.col = o.col ?? '#ff4436';
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2048;
    this.canvas.height = Math.round(2048 / (o.aspect ?? 3.2));
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.width = width;
    this.height = width / (o.aspect ?? 3.2);
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.width, this.height), this.mat);
    this.group.add(this.mesh);
    this.setText(text, o.font);
  }
  setText(text: string, font = '700 {S}px "Share Tech Mono"') {
    if (text === this.text) return;
    this.text = text;
    const c = this.canvas, g = c.getContext('2d')!;
    g.clearRect(0, 0, c.width, c.height);
    const S = Math.round(c.height * 0.82);
    g.font = font.replace('{S}', String(S));
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = this.col;
    g.shadowBlur = 40;
    g.fillStyle = this.col;
    g.fillText(text, c.width / 2, c.height / 2 + S * 0.04);
    g.shadowBlur = 0;
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 0; y < c.height; y += 6) g.fillRect(0, y, c.width, 2);
    g.globalCompositeOperation = 'source-over';
    this.tex.needsUpdate = true;
  }
  /** brightness / flicker (0..1+) */
  intensity(v: number, t = 0, flicker = 0) {
    const f = flicker > 0 ? 1 - flicker * (0.5 + 0.5 * Math.sin(t * 37.1) * Math.sin(t * 13.7)) : 1;
    this.mat.opacity = Math.max(0, v * f);
    this.mat.color.setScalar(1.6);
    this.group.visible = v > 0.002;
  }
  /** shatter into particles: u 0..1 progress (deterministic) */
  shatter(u: number) {
    if (!this.points) {
      const g = this.canvas.getContext('2d')!;
      const img = g.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
      const pos: number[] = [], vel: number[] = [];
      let n = 0;
      for (let k = 0; k < 400000 && n < 5000; k++) {
        const x = Math.floor(hash(k, 1) * this.canvas.width), y = Math.floor(hash(k, 2) * this.canvas.height);
        if (img[(y * this.canvas.width + x) * 4 + 3] > 120) {
          const px = (x / this.canvas.width - 0.5) * this.width, py = (0.5 - y / this.canvas.height) * this.height;
          pos.push(px, py, 0);
          vel.push(px * 0.6 + (hash(k, 3) - 0.5) * 6, py * 0.4 + (hash(k, 4) - 0.2) * 5, (hash(k, 5) - 0.5) * 12);
          n++;
        }
      }
      this.pBase = new Float32Array(pos);
      this.pVel = new Float32Array(vel);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      this.points = new THREE.Points(geo, new THREE.PointsMaterial({ color: new THREE.Color(this.col), size: this.width / 220, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
      this.group.add(this.points);
    }
    const on = u > 0;
    this.points.visible = on && u < 1;
    this.mesh.visible = !on;
    if (!on) return;
    const a = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const b = this.pBase!, v = this.pVel!;
    const tt = u * 2.5;
    for (let i = 0; i < b.length; i += 3) {
      a.array[i] = b[i] + v[i] * tt;
      a.array[i + 1] = b[i + 1] + v[i + 1] * tt - 4.9 * tt * tt;
      a.array[i + 2] = b[i + 2] + v[i + 2] * tt;
    }
    a.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = 1 - u;
  }
}

/** Deterministic rain (or wind-blown streaks) in a box that follows the camera. */
export class Streaks {
  readonly lines: THREE.LineSegments;
  private n: number;
  private box: THREE.Vector3;
  private vel: THREE.Vector3;
  private len: number;
  constructor(o: { n?: number; box?: [number, number, number]; vel?: [number, number, number]; len?: number; color?: number; opacity?: number } = {}) {
    this.n = o.n ?? 5000;
    this.box = new THREE.Vector3(...(o.box ?? [40, 18, 40]));
    this.vel = new THREE.Vector3(...(o.vel ?? [0.6, -9, 0.3]));
    this.len = o.len ?? 0.045;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.n * 6), 3));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: o.color ?? 0xc8d4dc, transparent: true, opacity: o.opacity ?? 0.35, depthWrite: false }));
    this.lines.frustumCulled = false;
  }
  update(cam: THREE.Vector3, t: number) {
    const a = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = a.array as Float32Array;
    const b = this.box, v = this.vel;
    const wrap = (x: number, w: number) => ((x % w) + w) % w - w / 2;
    for (let i = 0; i < this.n; i++) {
      const sp = 0.8 + 0.4 * hash(i, 9);
      const x = cam.x + wrap(hash(i, 1) * b.x + v.x * t * sp - cam.x, b.x);
      const y = cam.y + wrap(hash(i, 2) * b.y + v.y * t * sp - cam.y, b.y);
      const z = cam.z + wrap(hash(i, 3) * b.z + v.z * t * sp - cam.z, b.z);
      const k = i * 6;
      arr[k] = x; arr[k + 1] = y; arr[k + 2] = z;
      arr[k + 3] = x - v.x * this.len * sp; arr[k + 4] = y - v.y * this.len * sp; arr[k + 5] = z - v.z * this.len * sp;
    }
    a.needsUpdate = true;
  }
}
