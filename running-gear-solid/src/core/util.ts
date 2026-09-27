// Small deterministic helpers shared by every system. Nothing in the film may
// read wall-clock time or Math.random: all motion is a pure function of the
// timeline position so that renderFrame(t) always produces the same image.

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a));
export const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
export const smoother = (t: number) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
/** 0..1 ramp over [a,b] with smoothstep */
export const ramp = (t: number, a: number, b: number) => smooth((t - a) / (b - a));
/** 1 inside [a,b] with soft edges of width f */
export const window01 = (t: number, a: number, b: number, f = 0.25) =>
  Math.min(ramp(t, a, a + f), 1 - ramp(t, b - f, b));

export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
export const easeInCubic = (t: number) => clamp(t) ** 3;
export const easeOutCubic = (t: number) => 1 - (1 - clamp(t)) ** 3;
export const easeOutBack = (t: number) => {
  const c1 = 1.70158, c3 = c1 + 1, x = clamp(t) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
};

/** Mulberry32 seeded PRNG */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash noise in [0,1) */
export function hash1(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
export function hash2(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
/** Smooth 1D value noise in [-1,1] */
export function noise1(x: number) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}

/** Seconds -> "m:ss" or "h:mm:ss" */
export function fmtTime(sec: number, forceHours = false): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  if (h > 0 || forceHours) return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`;
  return `${m}:${String(x).padStart(2, '0')}`;
}
/** Seconds per km -> "m:ss" */
export const fmtPace = (secPerKm: number) => fmtTime(secPerKm);
export const fmtSigned = (sec: number) => (sec < 0 ? '-' : '+') + fmtTime(Math.abs(sec));

/** Piecewise-linear lookup of y over sorted xs */
export function interp(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]) return ys[0];
  const n = xs.length;
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid; else hi = mid;
  }
  return lerp(ys[lo], ys[hi], (x - xs[lo]) / (xs[hi] - xs[lo]));
}

/** Blink helper: square wave with given period (seconds) */
export const blink = (t: number, period = 0.5, duty = 0.5) => ((t / period) % 1) < duty;
