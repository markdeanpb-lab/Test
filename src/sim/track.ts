// Runtime track model built from the validated geometry in src/data/circuits.json.
import circuitsData from '../data/circuits.json';

export interface CornerDef { name: string; s0: number; sApex: number; s1: number; radius: number; angle: number; dir: string; street: string; chicane?: boolean }
export interface GeometryJson {
  id: string; circuitId: string; variant: string; label: string; name: string; short: string; reverse: boolean; character: string; note: string;
  fictionalModifications: string[]; surface1920: string; spacing: number; length: number;
  x: number[]; z: number[]; y: number[]; w: number[]; k: number[]; rl: number[];
  corners: CornerDef[]; sectors: number[]; streets: { name: string; s0: number; s1: number }[]; landmarks: string[];
  pit: { entryS: number; exitS: number; side: number; kerb: boolean; path: number[][]; length: number; fictional: string };
  metrics: { lengthM: number; corners: number; minWidth: number; avgWidth: number; narrowPct: number; maxGradePct: number; climbM: number; elevRangeM: number; longestStraightM: number; minRadiusM: number; slowCorners: number; fastCorners: number };
  validation: { name: string; ok: boolean; detail: string }[];
}

export const GEOMETRIES: GeometryJson[] = (circuitsData as any).layouts;
export const GEOMETRY_ATTRIBUTION: string = (circuitsData as any).attribution;

export class Track {
  g: GeometryJson;
  id: string;
  n: number;
  ds: number;
  length: number;
  x: Float64Array; z: Float64Array; y: Float64Array; w: Float64Array; k: Float64Array; rl: Float64Array; grade: Float64Array;
  nx: Float64Array; nz: Float64Array; // unit normal (right of travel direction)
  heading: Float64Array;
  cornerAt: Int16Array; // index of the next corner at or after each sample
  inCorner: Uint8Array; // 1 if the sample lies within a corner's s0..s1
  passable: Uint8Array; // 1 if two cars can run side by side
  straightness: Float64Array; // 0..1 (1 = straight) smoothed look-ahead
  toCorner: Float64Array; // distance to the next corner entry
  passAhead: Float64Array; // share of the next 120 m wide enough for two abreast
  sectorBounds: number[];
  pitEntry: number; pitExit: number; pitLen: number; pitSpan: number; pitSide: number;
  corners: CornerDef[];

  constructor(g: GeometryJson) {
    this.g = g; this.id = g.id; this.n = g.x.length; this.ds = g.spacing; this.length = g.length;
    const n = this.n;
    this.x = Float64Array.from(g.x); this.z = Float64Array.from(g.z); this.y = Float64Array.from(g.y);
    this.w = Float64Array.from(g.w); this.k = Float64Array.from(g.k); this.rl = Float64Array.from(g.rl);
    this.grade = new Float64Array(n); this.nx = new Float64Array(n); this.nz = new Float64Array(n); this.heading = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      const L = Math.sqrt(dx * dx + dz * dz) || 1;
      this.nx[i] = -dz / L; this.nz[i] = dx / L;
      this.heading[i] = Math.atan2(dx, dz);
      this.grade[i] = (this.y[(i + 3) % n] - this.y[(i - 3 + n) % n]) / (6 * this.ds);
    }
    this.corners = g.corners.slice().sort((a, b) => a.sApex - b.sApex);
    this.cornerAt = new Int16Array(n).fill(-1);
    this.inCorner = new Uint8Array(n);
    for (let ci = 0; ci < this.corners.length; ci++) {
      const c = this.corners[ci];
      const i0 = Math.floor(c.s0 / this.ds), i1 = Math.floor(c.s1 / this.ds);
      for (let i = i0; ; i = (i + 1) % n) { this.inCorner[i] = 1; if (i === i1 % n) break; }
    }
    // next corner index by walking backwards from each corner apex
    if (this.corners.length) {
      for (let i = 0; i < n; i++) {
        const s = i * this.ds;
        let best = -1, bd = Infinity;
        for (let ci = 0; ci < this.corners.length; ci++) { let d = this.corners[ci].sApex - s; if (d < 0) d += this.length; if (d < bd) { bd = d; best = ci; } }
        this.cornerAt[i] = best;
      }
    }
    this.passable = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.passable[i] = this.w[i] >= 7.0 ? 1 : 0;
    this.straightness = new Float64Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let d = 0; d < 20; d++) m = Math.max(m, Math.abs(this.k[(i + d) % n])); this.straightness[i] = Math.max(0, 1 - m * 120); }
    this.toCorner = new Float64Array(n);
    for (let i = 0; i < n; i++) { let d = 0; while (d < this.length && !this.inCorner[(i + Math.floor(d / this.ds)) % n]) d += this.ds; this.toCorner[i] = d; }
    this.passAhead = new Float64Array(n);
    for (let i = 0; i < n; i++) { let ok = 0, m = 0; for (let d = 0; d <= 120; d += 16) { m++; if (this.passable[(i + Math.floor(d / this.ds)) % n]) ok++; } this.passAhead[i] = ok / m; }
    this.sectorBounds = [0, g.sectors[0], g.sectors[1], this.length];
    this.pitEntry = g.pit.entryS; this.pitExit = g.pit.exitS; this.pitLen = g.pit.length; this.pitSide = g.pit.side;
    this.pitSpan = (this.pitExit - this.pitEntry + this.length) % this.length;
  }

  idx(s: number): number { let i = Math.floor(s / this.ds) % this.n; if (i < 0) i += this.n; return i; }
  wrap(s: number): number { s %= this.length; return s < 0 ? s + this.length : s; }
  /** Interpolated world position of a point at distance s with lateral offset lat (m, + = right). */
  pos(s: number, lat: number, out: { x: number; y: number; z: number; h: number }) {
    s = this.wrap(s);
    const f = s / this.ds; const i = Math.floor(f) % this.n; const j = (i + 1) % this.n; const t = f - Math.floor(f);
    const nx = this.nx[i] + (this.nx[j] - this.nx[i]) * t, nz = this.nz[i] + (this.nz[j] - this.nz[i]) * t;
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t + nx * lat;
    out.z = this.z[i] + (this.z[j] - this.z[i]) * t + nz * lat;
    out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
    let dh = this.heading[j] - this.heading[i]; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI;
    out.h = this.heading[i] + dh * t;
    return out;
  }
  sectorOf(s: number): number { return s < this.sectorBounds[1] ? 0 : s < this.sectorBounds[2] ? 1 : 2; }
  cornerName(s: number): string {
    const i = this.idx(s);
    const ci = this.cornerAt[i];
    if (ci < 0) return this.streetAt(s);
    const c = this.corners[ci];
    let d = c.sApex - s; if (d < 0) d += this.length;
    if (this.inCorner[i] || d < 120) return c.name;
    return this.streetAt(s);
  }
  streetAt(s: number): string {
    for (const r of this.g.streets) if (s >= r.s0 && s < r.s1) return r.name || 'the link road';
    return this.g.streets[0]?.name ?? '';
  }
  /** Is s within the pit lane span (entry .. exit, wrapping over the line)? */
  inPitSpan(s: number): boolean { const d = (s - this.pitEntry + this.length) % this.length; return d <= this.pitSpan; }
  pitFraction(s: number): number { return ((s - this.pitEntry + this.length) % this.length) / this.pitSpan; }
}

const cache = new Map<string, Track>();
export function getTrack(id: string): Track {
  let t = cache.get(id);
  if (!t) {
    const g = GEOMETRIES.find((l) => l.id === id);
    if (!g) throw new Error(`unknown geometry ${id}`);
    t = new Track(g);
    cache.set(id, t);
  }
  return t;
}
export function geometriesOf(circuitId: string): GeometryJson[] { return GEOMETRIES.filter((g) => g.circuitId === circuitId); }
export const CIRCUIT_IDS: string[] = [...new Set(GEOMETRIES.map((g) => g.circuitId))];
