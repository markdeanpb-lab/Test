// Camera rigs relative to a moving subject (follow / fixed / aerial / orbit), interpolated
// between a start and end spec over a shot, with deterministic handheld shake.
import * as THREE from 'three';
import { lerp, noise1 } from './core';

export interface CamSpec {
  mode: 'follow' | 'fixed' | 'aerial';
  /** follow/aerial: distance from subject (m) */
  dist?: number;
  /** height above subject's feet (m) */
  h?: number;
  /** angle around subject in degrees: 0 = behind, 90 = subject's right, 180 = in front */
  ang?: number;
  /** look-at height above feet */
  look?: number;
  /** look-at point shifted ahead along the heading (m) */
  ahead?: number;
  /** lateral screen offset of the look point (m, +right) */
  side?: number;
  fov?: number;
  /** fixed: world position, or course-relative {s (race distance m), off (m, +right), h} */
  at?: [number, number, number] | { s: number; off: number; h: number };
  shake?: number;
  roll?: number;
  /** min clearance above ground */
  clear?: number;
}

export interface Subject {
  pos: THREE.Vector3; // feet
  dir: { dx: number; dz: number }; // heading (unit, xz)
}

const NUM: (keyof CamSpec)[] = ['dist', 'h', 'ang', 'look', 'ahead', 'side', 'fov', 'shake', 'roll'];

export function mixSpec(a: CamSpec, b: Partial<CamSpec> | undefined, u: number): CamSpec {
  if (!b) return a;
  const o: CamSpec = { ...a };
  for (const k of NUM) {
    const va = a[k] as number | undefined, vb = b[k] as number | undefined;
    if (vb !== undefined) (o as any)[k] = lerp(va ?? DEF[k as keyof typeof DEF] ?? 0, vb, u);
  }
  if (b.at && a.at && Array.isArray(a.at) && Array.isArray(b.at)) o.at = [lerp(a.at[0], b.at[0], u), lerp(a.at[1], b.at[1], u), lerp(a.at[2], b.at[2], u)];
  else if (b.at && a.at && !Array.isArray(a.at) && !Array.isArray(b.at)) o.at = { s: lerp(a.at.s, b.at.s, u), off: lerp(a.at.off, b.at.off, u), h: lerp(a.at.h, b.at.h, u) };
  return o;
}
const DEF = { dist: 4, h: 1.5, ang: 0, look: 1.1, ahead: 0, side: 0, fov: 40, shake: 0.4, roll: 0 };

export function applyCam(
  cam: THREE.PerspectiveCamera,
  c: CamSpec,
  subj: Subject,
  t: number,
  ground: (x: number, z: number) => number,
  courseAt?: (s: number) => { x: number; z: number; dx: number; dz: number },
) {
  const dist = c.dist ?? DEF.dist, h = c.h ?? DEF.h, ang = ((c.ang ?? 0) * Math.PI) / 180;
  const { dx, dz } = subj.dir;
  // the subject's right-hand side: facing +z with +y up, right = forward x up = -x
  const rx = -dz, rz = dx;
  const p = subj.pos;
  let px: number, py: number, pz: number;
  if (c.mode === 'fixed' && c.at) {
    if (Array.isArray(c.at)) [px, py, pz] = c.at;
    else {
      const q = courseAt!(c.at.s);
      const qrx = -q.dz, qrz = q.dx;
      px = q.x + qrx * c.at.off;
      pz = q.z + qrz * c.at.off;
      py = ground(px, pz) + c.at.h;
    }
  } else {
    // behind = -heading; rotate by ang toward the subject's right
    const bx = -dx, bz = -dz;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ox = bx * ca + rx * sa, oz = bz * ca + rz * sa;
    px = p.x + ox * dist;
    pz = p.z + oz * dist;
    py = p.y + h;
  }
  const clear = c.clear ?? 0.35;
  const gy = ground(px, pz) + clear;
  if (py < gy) py = gy;
  const s = (c.shake ?? DEF.shake) * 0.02;
  if (s > 0) {
    px += noise1(t * 0.9, 1) * s;
    py += noise1(t * 1.1, 2) * s * 0.8;
    pz += noise1(t * 0.8, 3) * s;
  }
  cam.position.set(px, py, pz);
  const ahead = c.ahead ?? 0, side = c.side ?? 0;
  const lx = p.x + dx * ahead + rx * side, lz = p.z + dz * ahead + rz * side;
  const ly = p.y + (c.look ?? DEF.look);
  cam.up.set(0, 1, 0);
  cam.lookAt(lx + noise1(t * 0.7, 4) * s * 0.6, ly + noise1(t * 0.6, 5) * s * 0.5, lz + noise1(t * 0.75, 6) * s * 0.6);
  if (c.roll) cam.rotateZ((c.roll * Math.PI) / 180);
  cam.fov = c.fov ?? DEF.fov;
  cam.updateProjectionMatrix();
}
