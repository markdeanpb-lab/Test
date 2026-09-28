// Arena data produced by tools/geo/build-arena.ts (OSM + DEM + map-matched Strava GPS).
// Local metres: x = east, z = south, origin at the first course's start. y = metres above
// the arena's lowest terrain point.
import { loadBin, loadJSON } from '../engine/assets';

export interface Road { k: 'major' | 'road' | 'service' | 'pedestrian' | 'path' | 'track' | 'steps'; w: number; p: number[]; b?: 1; u?: 1; l?: number; n?: string }
export interface Building { p: number[]; h: number; m?: number; t?: string; c?: string; mat?: string }
export interface Area { k: string; p: number[]; holes?: number[][]; n?: string }
export interface Waterway { k: string; w: number; p: number[] }
export interface Course { name: string; gps: number[]; p: number[]; snapped: number }
export interface ArenaJSON {
  name: string;
  note: string;
  attribution: string;
  origin: [number, number];
  terrain: { x0: number; z0: number; dx: number; nx: number; nz: number; base: number };
  courses: Course[];
  roads: Road[];
  buildings: Building[];
  areas: Area[];
  water: Waterway[];
  rails: { k: string; p: number[]; b?: 1 }[];
  barriers: { k: string; p: number[] }[];
  trees: number[];
  labels: { n: string; x: number; z: number }[];
}

export class ArenaData {
  readonly j: ArenaJSON;
  readonly dem: Float32Array;
  readonly T: ArenaJSON['terrain'];
  /** water mask (0..1) at MASK_RES metres, blurred; used to carve lake/river beds */
  mask!: Float32Array<ArrayBufferLike>;
  mx0 = 0;
  mz0 = 0;
  mnx = 0;
  mnz = 0;
  static MASK_RES = 2;

  private constructor(j: ArenaJSON, bin: ArrayBuffer) {
    this.j = j;
    this.T = j.terrain;
    const raw = new Int16Array(bin);
    this.dem = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i++) this.dem[i] = raw[i] / 10;
    this.buildMask();
  }

  static async load(name: string) {
    const [j, bin] = await Promise.all([loadJSON<ArenaJSON>(`/arenas/${name}.json`), loadBin(`/arenas/${name}.height.bin`)]);
    return new ArenaData(j, bin);
  }

  get bounds() {
    const T = this.T;
    return { x0: T.x0, z0: T.z0, x1: T.x0 + (T.nx - 1) * T.dx, z1: T.z0 + (T.nz - 1) * T.dx };
  }

  /** Smoothed DEM height (bilinear), no carving. */
  demAt(x: number, z: number): number {
    const T = this.T;
    let fx = (x - T.x0) / T.dx, fz = (z - T.z0) / T.dx;
    fx = Math.min(Math.max(fx, 0), T.nx - 1.001);
    fz = Math.min(Math.max(fz, 0), T.nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const d = this.dem, n = T.nx, k = j * n + i;
    return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + n] * (1 - u) + d[k + n + 1] * u) * v;
  }

  maskAt(x: number, z: number): number {
    let fx = (x - this.mx0) / ArenaData.MASK_RES, fz = (z - this.mz0) / ArenaData.MASK_RES;
    if (fx < 0 || fz < 0 || fx >= this.mnx - 1 || fz >= this.mnz - 1) return 0;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const d = this.mask, n = this.mnx, k = j * n + i;
    return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + n] * (1 - u) + d[k + n + 1] * u) * v;
  }

  private segGrid?: Map<string, number[]>;
  /** Distance from (x,z) to the nearest course line (any course), capped at `cap`. */
  courseDist(x: number, z: number, cap = 30): number {
    const cell = 20;
    if (!this.segGrid) {
      this.segGrid = new Map();
      for (const c of this.j.courses) for (let i = 0; i + 3 < c.p.length; i += 2) {
        const ax = c.p[i], az = c.p[i + 1], bx = c.p[i + 2], bz = c.p[i + 3];
        const x0 = Math.floor(Math.min(ax, bx) / cell), x1 = Math.floor(Math.max(ax, bx) / cell);
        const z0 = Math.floor(Math.min(az, bz) / cell), z1 = Math.floor(Math.max(az, bz) / cell);
        for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
          const k = `${gx}_${gz}`;
          let g = this.segGrid.get(k);
          if (!g) this.segGrid.set(k, (g = []));
          g.push(ax, az, bx, bz);
        }
      }
    }
    let best = cap;
    const r = Math.ceil(cap / cell);
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const g = this.segGrid.get(`${cx + dx}_${cz + dz}`);
      if (!g) continue;
      for (let i = 0; i < g.length; i += 4) {
        const ax = g[i], az = g[i + 1], vx = g[i + 2] - ax, vz = g[i + 3] - az, l2 = vx * vx + vz * vz;
        const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
        best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
      }
    }
    return best;
  }

  /** Ground height: DEM with water beds carved out. */
  heightAt(x: number, z: number): number {
    const h = this.demAt(x, z);
    const m = this.maskAt(x, z);
    if (m <= 0.001) return h;
    const s = Math.min(1, Math.max(0, (m - 0.3) / 0.6));
    return h - 1.6 * s * s * (3 - 2 * s);
  }
  /** Water surface height at a point inside a water body. */
  waterAt(x: number, z: number): number {
    return this.demAt(x, z) - 0.28;
  }

  private buildMask() {
    const R = ArenaData.MASK_RES;
    const b = this.bounds;
    this.mx0 = b.x0;
    this.mz0 = b.z0;
    this.mnx = Math.ceil((b.x1 - b.x0) / R) + 1;
    this.mnz = Math.ceil((b.z1 - b.z0) / R) + 1;
    const c = document.createElement('canvas');
    c.width = this.mnx;
    c.height = this.mnz;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.setTransform(1 / R, 0, 0, 1 / R, -b.x0 / R, -b.z0 / R);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    g.lineCap = g.lineJoin = 'round';
    for (const a of this.j.areas) {
      if (a.k !== 'water') continue;
      g.beginPath();
      ring(g, a.p);
      for (const h of a.holes ?? []) ring(g, h);
      g.fill('evenodd');
    }
    for (const w of this.j.water) {
      g.lineWidth = w.w;
      g.beginPath();
      line(g, w.p);
      g.stroke();
    }
    const img = g.getImageData(0, 0, c.width, c.height).data;
    let m: Float32Array<ArrayBufferLike> = new Float32Array(this.mnx * this.mnz);
    for (let i = 0; i < m.length; i++) m[i] = img[i * 4] / 255;
    m = boxBlur(m, this.mnx, this.mnz, 2);
    m = boxBlur(m, this.mnx, this.mnz, 2);
    this.mask = m;
  }
}

export function ring(g: CanvasRenderingContext2D | Path2D, p: number[]) {
  g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.closePath();
}
export function line(g: CanvasRenderingContext2D | Path2D, p: number[]) {
  g.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Polyline helper: cumulative distances + point/tangent at distance s. */
export class Polyline {
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly d: Float64Array;
  readonly length: number;
  constructor(p: number[]) {
    const n = p.length / 2;
    this.x = new Float64Array(n);
    this.z = new Float64Array(n);
    this.d = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.x[i] = p[i * 2];
      this.z[i] = p[i * 2 + 1];
      if (i) this.d[i] = this.d[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    }
    this.length = this.d[n - 1];
  }
  private seg(s: number) {
    const d = this.d;
    let lo = 0, hi = d.length - 1;
    if (s <= 0) return 0;
    if (s >= this.length) return d.length - 2;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (d[m] <= s) lo = m;
      else hi = m;
    }
    return lo;
  }
  at(s: number): { x: number; z: number; dx: number; dz: number } {
    const i = this.seg(s);
    const l = this.d[i + 1] - this.d[i] || 1;
    const u = Math.min(1, Math.max(0, (s - this.d[i]) / l));
    const dx = (this.x[i + 1] - this.x[i]) / l, dz = (this.z[i + 1] - this.z[i]) / l;
    return { x: this.x[i] + (this.x[i + 1] - this.x[i]) * u, z: this.z[i] + (this.z[i + 1] - this.z[i]) * u, dx, dz };
  }
  /** Smoothed heading (unit vector) averaged over +-w metres. */
  dir(s: number, w = 6): { dx: number; dz: number } {
    const a = this.at(Math.max(0, s - w)), b = this.at(Math.min(this.length, s + w));
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { dx: (b.x - a.x) / l, dz: (b.z - a.z) / l };
  }
}
