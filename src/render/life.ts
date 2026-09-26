// City life around a race: parked cars of the period along the streets near the circuit (never on the
// closed circuit roads), fewer in the 1920s and more as car ownership grows. Purely cosmetic: placed with
// the cosmetic random stream, so it never touches the simulation.
import * as THREE from 'three';
import type { Track } from '../sim/track';
import type { CityData, Terrain } from './city';
import { Rng } from '../sim/rng';

const PAINT: [number, string[]][] = [
  [1946, ['#1d1d1f', '#23301f', '#4a1f22', '#2a2f3d', '#3b3326']],
  [1966, ['#e8dfc6', '#8fb3c9', '#9c2b2b', '#2f4a3a', '#d8cfb4', '#6b7f8f']],
  [1986, ['#c8651b', '#8a5a2b', '#d9b43c', '#3e5a2a', '#e5e0cf', '#7b1e22']],
  [9999, ['#c9ccd1', '#9aa0a8', '#1f2a44', '#b3262b', '#f2f2ef', '#33373d']],
];

export function buildStreetLife(city: CityData, terrain: Terrain, tr: Track, year: number, quality: 'low' | 'medium' | 'high'): THREE.Group {
  const group = new THREE.Group(); group.name = 'street-life';
  if (quality === 'low') return group;
  const rng = new Rng(`cosmetic:life:${tr.id}:${year}`);
  // track proximity grid (closed roads and run-off stay clear)
  const cell = 24; const grid = new Map<string, number[]>();
  for (let i = 0; i < tr.n; i += 3) { const k = `${Math.floor(tr.x[i] / cell)},${Math.floor(tr.z[i] / cell)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(tr.x[i], tr.z[i]); }
  const nearTrack = (x: number, z: number, r: number) => { const cx = Math.floor(x / cell), cz = Math.floor(z / cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const pts = grid.get(`${cx + a},${cz + b}`); if (pts) for (let i = 0; i < pts.length; i += 2) if (Math.hypot(pts[i] - x, pts[i + 1] - z) < r) return true; } return false; };
  let cxm = 0, czm = 0; for (let i = 0; i < tr.n; i++) { cxm += tr.x[i]; czm += tr.z[i]; } cxm /= tr.n; czm /= tr.n;
  const radius = 900;
  const ownership = Math.min(1, Math.max(0.06, (year - 1920) / 55)); // parked cars per metre of kerb grows with car ownership
  const perM = (quality === 'high' ? 0.05 : 0.03) * ownership;
  const max = quality === 'high' ? 1400 : 700;
  const spots: { x: number; z: number; h: number }[] = [];
  for (const r of city.roads) {
    const cls = r[0];
    if (cls < 3 || cls > 7) continue; // residential and minor streets only
    for (let i = 4; i + 3 < r.length && spots.length < max; i += 2) {
      const x0 = r[i] / 10, z0 = r[i + 1] / 10, x1 = r[i + 2] / 10, z1 = r[i + 3] / 10;
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 8) continue;
      if (Math.hypot((x0 + x1) / 2 - cxm, (z0 + z1) / 2 - czm) > radius) continue;
      const n = Math.floor(L * perM + rng.next());
      const hw = r[1] / 20; const h = Math.atan2(x1 - x0, z1 - z0);
      const nx = (z1 - z0) / L, nz = -(x1 - x0) / L;
      for (let k = 0; k < n; k++) {
        const t = rng.next(); const side = rng.chance(0.5) ? 1 : -1;
        const x = x0 + (x1 - x0) * t + nx * side * (hw - 1.1), z = z0 + (z1 - z0) * t + nz * side * (hw - 1.1);
        if (nearTrack(x, z, 16)) continue;
        spots.push({ x, z, h });
      }
    }
  }
  if (!spots.length) return group;
  const paints = (PAINT.find(([y]) => year < y) ?? PAINT[PAINT.length - 1])[1];
  const early = year < 1950;
  const body = new THREE.BoxGeometry(1.7, early ? 1.0 : 0.8, early ? 3.8 : 4.2); body.translate(0, early ? 0.75 : 0.6, 0);
  const cabin = new THREE.BoxGeometry(1.5, early ? 0.75 : 0.6, early ? 1.9 : 2.1); cabin.translate(0, early ? 1.6 : 1.3, early ? -0.2 : -0.1);
  const mat = new THREE.MeshLambertMaterial();
  const ib = new THREE.InstancedMesh(body, mat, spots.length), ic = new THREE.InstancedMesh(cabin, mat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  spots.forEach((p, i) => {
    q.setFromAxisAngle(up, p.h + (rng.chance(0.1) ? Math.PI : 0));
    m.compose(new THREE.Vector3(p.x, terrain.y(p.x, p.z), p.z), q, s);
    ib.setMatrixAt(i, m); ic.setMatrixAt(i, m);
    col.set(rng.pick(paints)); ib.setColorAt(i, col); ic.setColorAt(i, col.clone().multiplyScalar(0.85));
  });
  ib.castShadow = ic.castShadow = quality === 'high';
  group.add(ib, ic);
  return group;
}
