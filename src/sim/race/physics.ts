// Point-mass vehicle model. Corner speeds come from grip and downforce; straights from power, drag,
// rolling resistance and gradient; braking zones from a backward pass. The resulting speed profile is
// what a driver aims for; the race engine then integrates each car's actual motion with interaction.
import { dsqrt } from '../dmath';
import type { Track } from '../track';

export const G = 9.81;
export const RHO = 1.2;
export const CRR = 0.015;
export const VMAX = 105; // m/s hard cap (378 km/h)

export interface ProfileParams {
  powerKW: number;
  mass: number; // car + driver + fuel (kg)
  cdA: number;
  clA: number;
  mu: number; // effective tyre-road friction (includes tyre state, surface, water, driver cornering)
  brakeG: number; // brake system capability (g) incl. driver braking factor
  traction: number; // share of grip usable for drive (0.4..0.75)
  dragMult?: number; // e.g. slipstream < 1 (not used in stored profiles)
}

/** Maximum steady-state corner speed for curvature k. */
export function cornerSpeed(p: ProfileParams, k: number): number {
  const ak = k < 0 ? -k : k;
  const aero = (p.mu * RHO * p.clA) / (2 * p.mass);
  const den = ak - aero;
  if (den <= 1e-6) return VMAX;
  const v = dsqrt((p.mu * G) / den);
  return v > VMAX ? VMAX : v;
}

/** Longitudinal acceleration available at speed v on sample i (friction ellipse, power, drag, gradient). */
export function accelAt(p: ProfileParams, v: number, k: number, grade: number, dragMult = 1): number {
  const ak = k < 0 ? -k : k;
  const down = 0.5 * RHO * p.clA * v * v;
  const N = p.mass * G + down;
  const latMax = p.mu * N;
  const latUsed = p.mass * v * v * ak;
  const frac = latUsed >= latMax ? 1 : latUsed / latMax;
  const longAvail = latMax * dsqrt(1 - frac * frac) * p.traction;
  const vv = v < 4 ? 4 : v;
  const fPower = (p.powerKW * 1000) / vv;
  const fDrive = fPower < longAvail ? fPower : longAvail;
  const fDrag = 0.5 * RHO * p.cdA * dragMult * v * v;
  return (fDrive - fDrag - CRR * p.mass * G - p.mass * G * grade) / p.mass;
}

/** Maximum deceleration (positive number) at speed v. */
export function brakeAt(p: ProfileParams, v: number, k: number, grade: number): number {
  const ak = k < 0 ? -k : k;
  const down = 0.5 * RHO * p.clA * v * v;
  const N = p.mass * G + down;
  const latMax = p.mu * N;
  const latUsed = p.mass * v * v * ak;
  const frac = latUsed >= latMax ? 1 : latUsed / latMax;
  const tyre = latMax * dsqrt(1 - frac * frac);
  const sys = p.brakeG * p.mass * G + down * p.mu * 0.6;
  const fb = tyre < sys ? tyre : sys;
  const fDrag = 0.5 * RHO * p.cdA * v * v;
  return (fb + fDrag + CRR * p.mass * G + p.mass * G * grade) / p.mass;
}

/** Speed profile around the lap (target speeds per sample). */
export function computeProfile(tr: Track, p: ProfileParams, out?: Float64Array): Float64Array {
  const n = tr.n, ds = tr.ds;
  const v = out && out.length === n ? out : new Float64Array(n);
  const vc = new Float64Array(n);
  let minI = 0;
  for (let i = 0; i < n; i++) { vc[i] = cornerSpeed(p, tr.k[i]); if (vc[i] < vc[minI]) minI = i; }
  // forward (acceleration) pass, twice around from the slowest point so the loop closes
  v[minI] = vc[minI];
  for (let t = 1; t <= n; t++) {
    const i = (minI + t) % n, pi = (minI + t - 1) % n;
    const a = accelAt(p, v[pi], tr.k[pi], tr.grade[pi]);
    let nv = v[pi] * v[pi] + 2 * a * ds;
    nv = nv > 0 ? dsqrt(nv) : 0;
    v[i] = nv < vc[i] ? nv : vc[i];
  }
  // backward (braking) pass
  for (let t = 1; t <= 2 * n; t++) {
    const i = ((minI - t) % n + n) % n, ni = (i + 1) % n;
    const b = brakeAt(p, v[ni], tr.k[ni], tr.grade[ni]);
    const lim = dsqrt(v[ni] * v[ni] + 2 * b * ds);
    if (lim < v[i]) v[i] = lim;
  }
  return v;
}

export function lapTimeOf(tr: Track, prof: Float64Array): number {
  let t = 0;
  for (let i = 0; i < tr.n; i++) { const a = prof[i], b = prof[(i + 1) % tr.n]; t += (2 * tr.ds) / (a + b); }
  return t;
}
