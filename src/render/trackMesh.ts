// Race-day dressing for one layout: surface, kerbs, barriers, start line, grid, pit lane & garages,
// grandstands, crowds and marshal posts. Built per meeting from the validated geometry and the
// layout version / era (surfaces and barriers change over the decades).
import * as THREE from 'three';
import type { Track } from '../sim/track';
import type { Terrain } from './city';
import { Rng } from '../sim/rng';

export interface TrackDressing { group: THREE.Group; surfaceMat: THREE.MeshStandardMaterial; flagPosts: { s: number; mesh: THREE.Mesh }[]; crowd: THREE.InstancedMesh | null; crowdBase: Float32Array | null; yAt: (s: number, lat: number) => number }

export interface DressOpts { surface: string; barrier: string; year: number; pitQuality: number; popularity: number; teams: { colour: string; colour2: string }[]; quality: 'low' | 'medium' | 'high' }

const SURF: Record<string, string> = { setts: '#4f4740', macadam: '#46423d', tarmac: '#38393d', modern: '#2e2f33' };

export function dressTrack(tr: Track, terrain: Terrain, o: DressOpts): TrackDressing {
  const g = new THREE.Group();
  g.name = 'track';
  const n = tr.n;
  const rng = new Rng(`cosmetic:dress:${tr.id}:${o.year}`);
  const yAt = (s: number, lat: number) => { const i = tr.idx(s); const x = tr.x[i] + tr.nx[i] * lat, z = tr.z[i] + tr.nz[i] * lat; return terrain.y(x, z); };
  const P = (i: number, lat: number, dy: number) => { const x = tr.x[i] + tr.nx[i] * lat, z = tr.z[i] + tr.nz[i] * lat; return [x, terrain.y(x, z) + dy, z]; };

  // ---------------- racing surface
  const pos: number[] = [], idx: number[] = [], uv: number[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i % n, hw = tr.w[k] / 2 + 0.2;
    const a = P(k, -hw, 0.24), b = P(k, hw, 0.24);
    pos.push(...a, ...b); uv.push(0, (i * tr.ds) / 8, 1, (i * tr.ds) / 8);
    if (i < n) { const v = i * 2; idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setIndex(idx); sg.computeVertexNormals();
  const surfaceMat = new THREE.MeshStandardMaterial({ color: SURF[o.surface] ?? SURF.tarmac, roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const surface = new THREE.Mesh(sg, surfaceMat); surface.receiveShadow = o.quality !== 'low'; surface.name = 'surface'; g.add(surface);

  // centre/edge lines for later eras (white edge lines help read the layout)
  const lpos: number[] = [], lidx: number[] = [], lcol: number[] = [];
  const addQuad = (a: number[], b: number[], c: number[], d: number[], col: THREE.Color) => { const v = lpos.length / 3; lpos.push(...a, ...b, ...c, ...d); for (let q = 0; q < 4; q++) lcol.push(col.r, col.g, col.b); lidx.push(v, v + 1, v + 2, v, v + 2, v + 3); };
  const white = new THREE.Color('#f2efe6'), red = new THREE.Color('#c8372d');
  if (o.year >= 1950) for (let i = 0; i < n; i++) for (const side of [-1, 1]) { const j = (i + 1) % n; const hw = tr.w[i] / 2 - 0.15, hw2 = tr.w[j] / 2 - 0.15; addQuad(P(i, side * hw, 0.27), P(j, side * hw2, 0.27), P(j, side * (hw2 - 0.18), 0.27), P(i, side * (hw - 0.18), 0.27), white); }
  // kerbs at corners (painted stripes from the 1960s; plain stone kerbs before)
  for (const c of tr.corners) {
    const i0 = tr.idx(c.s0 - 10), i1 = tr.idx(c.s1 + 10);
    for (let i = i0, k = 0; i !== i1 && k < 400; i = (i + 1) % n, k++) {
      const j = (i + 1) % n;
      const col = o.year >= 1960 ? (k % 2 === 0 ? red : white) : new THREE.Color('#b7b1a5');
      for (const side of [-1, 1]) { const hw = tr.w[i] / 2 + 0.2, hw2 = tr.w[j] / 2 + 0.2; addQuad(P(i, side * hw, 0.29), P(j, side * hw2, 0.29), P(j, side * (hw2 + 0.9), 0.29), P(i, side * (hw + 0.9), 0.29), col); }
    }
  }
  // start/finish line (chequered) and grid slots
  {
    const hw = tr.w[0] / 2 + 0.2;
    const cells = 12;
    for (let c2 = 0; c2 < cells; c2++) for (let r = 0; r < 2; r++) {
      const l0 = -hw + (2 * hw * c2) / cells, l1 = -hw + (2 * hw * (c2 + 1)) / cells;
      const i0 = tr.idx(-1.2 + r * 1.2), i1 = tr.idx(r * 1.2);
      addQuad(P(i0, l0, 0.3), P(i0, l1, 0.3), P(i1, l1, 0.3), P(i1, l0, 0.3), (c2 + r) % 2 ? new THREE.Color('#111') : white);
    }
    for (let p = 0; p < 26; p++) { const s = tr.length - 12 - p * 7.5; const i = tr.idx(s), j = tr.idx(s + 1.2); const side = p % 2 === 0 ? -1 : 1; const lat = side * Math.min(2.2, tr.w[i] / 2 - 1.1); addQuad(P(i, lat - 1, 0.3), P(i, lat + 1, 0.3), P(j, lat + 1, 0.3), P(j, lat - 1, 0.3), white); }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lpos, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lcol, 3)); lg.setIndex(lidx); lg.computeVertexNormals();
  g.add(new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 })));

  // ---------------- barriers
  const bpos: number[] = [], bidx: number[] = [], bcol: number[] = [];
  const box = (x: number, y: number, z: number, hx: number, hy: number, hz: number, rot: number, col: THREE.Color) => {
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const v0 = bpos.length / 3;
    const pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([a, b]) => [x + a * cs - b * sn, z + a * sn + b * cs]);
    for (const yy of [y, y + hy * 2]) for (const p of pts) { bpos.push(p[0], yy, p[1]); bcol.push(col.r * (yy === y ? 0.8 : 1), col.g * (yy === y ? 0.8 : 1), col.b * (yy === y ? 0.8 : 1)); }
    const f = [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]];
    for (const q of f) bidx.push(v0 + q[0], v0 + q[1], v0 + q[2], v0 + q[0], v0 + q[2], v0 + q[3], v0 + q[0], v0 + q[2], v0 + q[1], v0 + q[0], v0 + q[3], v0 + q[2]);
  };
  const barrierCol = new THREE.Color(o.barrier === 'bales' ? '#d8c37a' : o.barrier === 'armco' ? '#b9bec4' : o.barrier === 'concrete' ? '#d9d6cf' : o.barrier === 'energy' ? '#2d6db5' : '#9c9588');
  const everyN = o.barrier === 'bales' ? 1 : 1;
  const pitA = tr.pitEntry, pitB = tr.pitExit;
  for (let i = 0; i < n; i += everyN) {
    const s = i * tr.ds;
    const near = tr.inCorner[i] || tr.toCorner[i] < 60;
    if (o.barrier === 'bales' && !near) continue;
    if (o.barrier === 'kerbs' && !near) continue;
    for (const side of [-1, 1]) {
      if (side === tr.pitSide && tr.inPitSpan(s)) continue;
      const hw = tr.w[i] / 2 + 1.4;
      const [x, y, z] = P(i, side * hw, 0);
      const h = o.barrier === 'concrete' || o.barrier === 'energy' ? 0.5 : o.barrier === 'armco' ? 0.38 : 0.3;
      box(x, y, z, 0.3, h, tr.ds * 0.52, -tr.heading[i], barrierCol);
      if ((o.barrier === 'concrete' || o.barrier === 'energy') && o.quality !== 'low' && i % 3 === 0) { const [fx, fy, fz] = P(i, side * (hw + 0.2), 1); box(fx, fy, fz, 0.05, 1.6, tr.ds * 1.5, -tr.heading[i], new THREE.Color('#9aa0a6')); }
    }
  }
  void pitA; void pitB;
  // ---------------- pit lane and garages
  const pp = tr.g.pit.path;
  const pitPos: number[] = [], pitIdx: number[] = [];
  for (let k = 0; k < pp.length; k++) {
    const a = pp[Math.max(0, k - 1)], b = pp[Math.min(pp.length - 1, k + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    const x = pp[k][0], z = pp[k][1], y = terrain.y(x, z) + 0.2;
    pitPos.push(x + nx * 2.5, y, z + nz * 2.5, x - nx * 2.5, y, z - nz * 2.5);
    if (k < pp.length - 1) { const v = k * 2; pitIdx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pitPos, 3)); pg.setIndex(pitIdx); pg.computeVertexNormals();
  g.add(new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: SURF[o.surface] ?? SURF.tarmac, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })));
  const garages = Math.max(8, o.teams.length);
  const mid = Math.floor(pp.length * 0.2), end = Math.floor(pp.length * 0.8);
  for (let q = 0; q < garages; q++) {
    const k = Math.floor(mid + ((end - mid) * (q + 0.5)) / garages);
    const a = pp[Math.max(0, k - 1)], b = pp[Math.min(pp.length - 1, k + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const side = tr.pitSide;
    const nx = (-dz / L) * side, nz = (dx / L) * side;
    const x = pp[k][0] + nx * 6, z = pp[k][1] + nz * 6, y = terrain.y(x, z);
    const team = o.teams[q % o.teams.length];
    const tent = o.pitQuality < 0.35;
    box(x, y, z, 2.6, tent ? 1.3 : 2.1, 3.2, -Math.atan2(dx, dz), new THREE.Color(tent ? '#ece6d6' : '#c9c5bd'));
    if (team) box(x - nx * 2.7, y + (tent ? 1.6 : 2.6), z - nz * 2.7, 0.08, 0.5, 2.8, -Math.atan2(dx, dz), new THREE.Color(team.colour));
    // a signal gantry / timing hut at the start line in later eras
  }
  // start gantry
  if (o.year >= 1950) {
    const hw = tr.w[0] / 2 + 1.8;
    const [x1, y1, z1] = P(0, -hw, 0), [x2, y2, z2] = P(0, hw, 0);
    box(x1, y1, z1, 0.25, 3.2, 0.25, 0, new THREE.Color('#444'));
    box(x2, y2, z2, 0.25, 3.2, 0.25, 0, new THREE.Color('#444'));
    const [xm, ym, zm] = P(0, 0, 6.2);
    box(xm, ym, zm, hw, 0.5, 0.4, -tr.heading[0] + Math.PI / 2, new THREE.Color('#2b2b2b'));
  }
  // grandstands opposite the pits and at the slowest corners
  const standSpots: number[] = [0];
  const slow = tr.corners.slice().sort((a, b) => a.radius - b.radius).slice(0, 3);
  for (const c of slow) standSpots.push(c.sApex);
  const crowdPts: number[] = [];
  const standCol = new THREE.Color(o.year < 1950 ? '#8d7b64' : o.year < 1990 ? '#9aa3ab' : '#e3e6ea');
  for (const s0 of standSpots) {
    const i0 = tr.idx(s0);
    const side = s0 === 0 ? -tr.pitSide : (tr.k[i0] > 0 ? -1 : 1);
    const len = s0 === 0 ? 90 : 50;
    for (let d = -len / 2; d < len / 2; d += 6) {
      const i = tr.idx(s0 + d);
      const hw = tr.w[i] / 2 + 5;
      for (let row = 0; row < (o.year < 1940 ? 2 : 4); row++) {
        const [x, y, z] = P(i, side * (hw + row * 1.6), 0);
        box(x, y + row * 0.7, z, 0.8, 0.35, 3.1, -tr.heading[i], standCol);
        for (let c2 = 0; c2 < 4; c2++) { const [cx, cy, cz] = P(tr.idx(s0 + d + c2 * 1.5 - 2), side * (hw + row * 1.6), 0); crowdPts.push(cx, cy + row * 0.7 + 0.7, cz); }
      }
    }
  }
  // spectators along the barriers at every corner (more with popularity)
  const density = (o.quality === 'high' ? 1 : o.quality === 'medium' ? 0.6 : 0.25) * (0.5 + o.popularity / 100);
  for (const c of tr.corners) {
    for (let d = -40; d <= 40; d += 1.2) {
      if (!rng.chance(density * 0.7)) continue;
      const i = tr.idx(c.sApex + d);
      const side = tr.k[tr.idx(c.sApex)] > 0 ? -1 : 1;
      const [x, y, z] = P(i, side * (tr.w[i] / 2 + 2.6 + rng.range(0, 3)), 0);
      crowdPts.push(x, y + 0.9, z);
    }
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3)); bg.setIndex(bidx); bg.computeVertexNormals();
  const bm = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true })); bm.castShadow = o.quality === 'high'; g.add(bm);

  let crowd: THREE.InstancedMesh | null = null, crowdBase: Float32Array | null = null;
  if (crowdPts.length) {
    const person = new THREE.CapsuleGeometry(0.28, 0.9, 2, 5);
    const nC = crowdPts.length / 3;
    crowd = new THREE.InstancedMesh(person, new THREE.MeshLambertMaterial(), nC);
    crowdBase = new Float32Array(crowdPts);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    const early = o.year < 1950, mid2 = o.year < 1985;
    for (let q = 0; q < nC; q++) {
      m.makeTranslation(crowdPts[q * 3], crowdPts[q * 3 + 1], crowdPts[q * 3 + 2]); crowd.setMatrixAt(q, m);
      if (early) c.setHSL(rng.range(0.05, 0.12), rng.range(0.05, 0.25), rng.range(0.15, 0.45));
      else if (mid2) c.setHSL(rng.next(), rng.range(0.2, 0.5), rng.range(0.3, 0.6));
      else c.setHSL(rng.next(), rng.range(0.4, 0.8), rng.range(0.4, 0.65));
      crowd.setColorAt(q, c);
    }
    crowd.name = 'crowd';
    g.add(crowd);
  }
  // marshal posts with flag panels (flag colour animated by the renderer)
  const flagPosts: { s: number; mesh: THREE.Mesh }[] = [];
  for (const c of tr.corners) {
    const s = c.s0 - 30;
    const i = tr.idx(s);
    const side = tr.k[tr.idx(c.sApex)] > 0 ? -1 : 1;
    const [x, y, z] = P(i, side * (tr.w[i] / 2 + 2.2), 0);
    const hut = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 1.4), new THREE.MeshLambertMaterial({ color: '#e8e2d2' }));
    hut.position.set(x, y + 0.9, z); g.add(hut);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), new THREE.MeshBasicMaterial({ color: '#2a2a2a', side: THREE.DoubleSide }));
    flag.position.set(x, y + 2.6, z); flag.rotation.y = -tr.heading[i]; g.add(flag);
    flagPosts.push({ s, mesh: flag });
  }
  return { group: g, surfaceMat, flagPosts, crowd, crowdBase, yAt };
}
