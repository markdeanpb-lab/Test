// Deterministic transcendental functions built only from IEEE-754 +, -, *, / and sqrt (which are
// correctly rounded everywhere), so sporting outcomes do not depend on a JavaScript engine's libm.

export const dsqrt = Math.sqrt; // IEEE-754 requires correct rounding: deterministic.

const LN2 = 0.6931471805599453;

/** e^x via range reduction x = k ln2 + r, |r| <= ln2/2, and a degree-13 Taylor polynomial. */
export function dexp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x / LN2);
  const r = x - k * LN2;
  let term = 1, sum = 1;
  for (let i = 1; i <= 13; i++) { term = (term * r) / i; sum += term; }
  // multiply by 2^k exactly
  let res = sum;
  let kk = k;
  while (kk > 0) { const step = kk > 1000 ? 1000 : kk; res *= pow2(step); kk -= step; }
  while (kk < 0) { const step = kk < -1000 ? -1000 : kk; res *= pow2(step); kk -= step; }
  return res;
}
function pow2(k: number): number { // exact power of two for |k| <= 1000
  let r = 1, b = k > 0 ? 2 : 0.5, n = k > 0 ? k : -k;
  while (n > 0) { if (n & 1) r *= b; b *= b; n >>= 1; }
  return r;
}

/** Natural log via mantissa/exponent split and atanh series. */
export function dlog(x: number): number {
  if (x !== x || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let e = 0, m = x;
  while (m >= 2) { m /= 2; e++; }
  while (m < 1) { m *= 2; e--; }
  if (m > 1.4142135623730951) { m /= 2; e++; }
  const t = (m - 1) / (m + 1), t2 = t * t;
  let term = t, sum = 0;
  for (let i = 1; i <= 41; i += 2) { sum += term / i; term *= t2; }
  return 2 * sum + e * LN2;
}

export function dpow(a: number, b: number): number {
  if (a === 0) return b === 0 ? 1 : 0;
  if (b === 0) return 1;
  if (b === 1) return a;
  if (b === 2) return a * a;
  if (b === 0.5) return dsqrt(a);
  return dexp(b * dlog(a));
}

export function dtanh(x: number): number { if (x > 20) return 1; if (x < -20) return -1; const e = dexp(2 * x); return (e - 1) / (e + 1); }
export function dsigmoid(x: number): number { return 1 / (1 + dexp(-x)); }

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
