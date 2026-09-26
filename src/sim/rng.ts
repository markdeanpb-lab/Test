// Seeded, serialisable pseudo-random streams (sfc32). Every sporting system draws from its own named
// stream; cosmetic systems (crowd, clouds, wording) use separate streams so they can never perturb results.
import { dlog, dsqrt } from './dmath';

export type RngState = [number, number, number, number];

/** cyrb128: string -> 4 x uint32 seed words. */
export function hashSeed(str: string): RngState {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

export class Rng {
  s: RngState;
  constructor(seed: string | RngState) {
    this.s = typeof seed === 'string' ? hashSeed(seed) : ([...seed] as RngState);
    for (let i = 0; i < 12; i++) this.u32(); // warm up
  }
  static fromState(s: RngState): Rng { const r = Object.create(Rng.prototype) as Rng; r.s = [...s] as RngState; return r; }
  /** Wrap an existing state array without copying: draws mutate that array (for serialisable sim state). */
  static wrap(s: RngState): Rng { const r = Object.create(Rng.prototype) as Rng; r.s = s; return r; }
  state(): RngState { return [...this.s] as RngState; }
  u32(): number {
    const s = this.s;
    const a = s[0] >>> 0, b = s[1] >>> 0, c = s[2] >>> 0, d = s[3] >>> 0;
    const t = (((a + b) >>> 0) + d) >>> 0;
    s[3] = (d + 1) >>> 0;
    s[0] = (b ^ (b >>> 9)) >>> 0;
    s[1] = (c + (c << 3)) >>> 0;
    const c2 = (c << 21) | (c >>> 11);
    s[2] = (c2 + t) >>> 0;
    return t;
  }
  /** Uniform [0, 1). */
  next(): number { return this.u32() / 4294967296; }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(n: number): number { return Math.floor(this.next() * n); }
  intRange(a: number, b: number): number { return a + this.int(b - a + 1); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]; }
  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    let tot = 0; for (const w of weights) tot += Math.max(0, w);
    let r = this.next() * tot;
    for (let i = 0; i < items.length; i++) { r -= Math.max(0, weights[i]); if (r < 0) return items[i]; }
    return items[items.length - 1];
  }
  /** Standard normal via the Marsaglia polar method (only +,*,/,sqrt,log — deterministic). */
  normal(): number {
    for (;;) {
      const u = this.next() * 2 - 1, v = this.next() * 2 - 1;
      const s = u * u + v * v;
      if (s > 0 && s < 1) return u * dsqrt((-2 * dlog(s)) / s);
    }
  }
  gauss(mean: number, sd: number): number { return mean + sd * this.normal(); }
  /** Normal clamped to [lo, hi]. */
  gaussClamp(mean: number, sd: number, lo: number, hi: number): number { const v = this.gauss(mean, sd); return v < lo ? lo : v > hi ? hi : v; }
  shuffle<T>(arr: T[]): T[] { for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
  /** Deterministically derive an independent child stream. */
  fork(label: string): Rng { return new Rng(hashSeed(`${this.s.join(',')}|${label}`)); }
}

/** Derive a stream from a universe seed and a stable label (e.g. `race:R1926-03`). */
export function streamFor(universeSeed: string, label: string): Rng { return new Rng(`${universeSeed}::${label}`); }
