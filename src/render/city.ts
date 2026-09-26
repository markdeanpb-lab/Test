// Builds the miniature St Albans from the bundled OSM extract (public/data/stalbans-city.json).
// Everything is merged into a handful of meshes (vertex colours) so the city stays cheap to draw.
import * as THREE from 'three';
import { Rng } from '../sim/rng';

export const EXAG = 1.6; // vertical exaggeration so gradients read clearly in the miniature
export const BASE_ELEV = 70; // metres subtracted from terrain heights

export interface CityData {
  origin: { lat: number; lon: number }; bounds: { x0: number; x1: number; z0: number; z1: number };
  roadClasses: string[]; buildingKinds: string[]; areaKinds: string[]; names: string[];
  terrain: { x0: number; z0: number; step: number; nx: number; nz: number; h: number[] };
  roads: number[][]; buildings: number[][]; areas: number[][]; waterways: number[][]; rail: number[][]; trees: number[];
  landmarks: { id: string; name: string; kind: string; x: number; z: number; footprint?: number[] }[];
  attribution: string;
}

export class Terrain {
  t: CityData['terrain'];
  constructor(t: CityData['terrain']) { this.t = t; }
  /** Raw terrain elevation (m) at local x/z. */
  raw(x: number, z: number): number {
    const t = this.t;
    const fi = Math.max(0, Math.min(t.nx - 1.001, (x - t.x0) / t.step)), fj = Math.max(0, Math.min(t.nz - 1.001, (z - t.z0) / t.step));
    const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j;
    const h = t.h;
    const a = h[j * t.nx + i], b = h[j * t.nx + i + 1], c = h[(j + 1) * t.nx + i], d = h[(j + 1) * t.nx + i + 1];
    return ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz) / 10;
  }
  /** Scene height (exaggerated, relative to base). */
  y(x: number, z: number): number { return (this.raw(x, z) - BASE_ELEV) * EXAG; }
}

const col = (hex: string) => new THREE.Color(hex);
export const PALETTE = {
  ground: col('#d9d3c1'), residential: col('#d4cdb9'), commercial: col('#cfc8ba'), park: col('#98bf78'), grass: col('#a5c784'), wood: col('#6f9a57'), field: col('#cfd08f'),
  pitch: col('#8fbe6c'), cemetery: col('#9cb88a'), parking: col('#bdb8ad'), railway: col('#b3aa9b'), allotments: col('#b4c07e'), scrub: col('#9eb67a'), water: col('#7fb2d1'),
  road: col('#bdb9b0'), primary: col('#b3aea5'), path: col('#d3cbb8'), rail: col('#7a736b'),
};
const AREA_COL: Record<number, THREE.Color> = { 0: PALETTE.park, 1: PALETTE.grass, 2: PALETTE.wood, 3: PALETTE.water, 4: PALETTE.cemetery, 5: PALETTE.field, 6: PALETTE.pitch, 7: PALETTE.parking, 8: PALETTE.railway, 9: PALETTE.allotments, 10: PALETTE.commercial, 11: PALETTE.residential, 12: PALETTE.scrub };

function pip(x: number, z: number, p: number[], off: number): boolean {
  let c = false;
  const n = (p.length - off) / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[off + i * 2] / 10, zi = p[off + i * 2 + 1] / 10, xj = p[off + j * 2] / 10, zj = p[off + j * 2 + 1] / 10;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

export interface CityMeshes { group: THREE.Group; terrain: Terrain; buildingCount: number; treeMesh: THREE.InstancedMesh | null; waterMat: THREE.MeshLambertMaterial; groundMat: THREE.MeshLambertMaterial }

export function buildCity(data: CityData, quality: 'low' | 'medium' | 'high', focus?: { x: number; z: number; r: number }): CityMeshes {
  const group = new THREE.Group();
  group.name = 'city';
  const terrain = new Terrain(data.terrain);
  const b = data.bounds;
  // ---------------- terrain: 10 m grid coloured by land use
  const step = quality === 'low' ? 20 : 10;
  const nx = Math.floor((b.x1 - b.x0) / step) + 1, nz = Math.floor((b.z1 - b.z0) / step) + 1;
  const pos = new Float32Array(nx * nz * 3), colors = new Float32Array(nx * nz * 3);
  // area bounding boxes for fast colouring (later areas drawn on top)
  const areaBoxes = data.areas.map((a) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (let i = 1; i < a.length; i += 2) { const x = a[i] / 10, z = a[i + 1] / 10; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return [x0, x1, z0, z1]; });
  const grid = new Map<string, number[]>();
  const G = 200;
  areaBoxes.forEach((bb, ai) => { for (let gx = Math.floor(bb[0] / G); gx <= Math.floor(bb[1] / G); gx++) for (let gz = Math.floor(bb[2] / G); gz <= Math.floor(bb[3] / G); gz++) { const k = gx + ',' + gz; let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(ai); } });
  const tmp = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = b.x0 + i * step, z = b.z0 + j * step;
    const k = (j * nx + i) * 3;
    pos[k] = x; pos[k + 1] = terrain.y(x, z) - 0.05; pos[k + 2] = z;
    let c = PALETTE.ground;
    const cands = grid.get(Math.floor(x / G) + ',' + Math.floor(z / G));
    if (cands) for (const ai of cands) { const bb = areaBoxes[ai]; if (x < bb[0] || x > bb[1] || z < bb[2] || z > bb[3]) continue; const a = data.areas[ai]; if (a[0] === 3) continue; if (pip(x, z, a, 1)) c = AREA_COL[a[0]] ?? c; }
    // subtle height tint for readability of the hills
    const h = terrain.raw(x, z);
    tmp.copy(c).offsetHSL(0, 0, (h - 100) * 0.0015);
    colors[k] = tmp.r; colors[k + 1] = tmp.g; colors[k + 2] = tmp.b;
  }
  const idx: number[] = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b2 = a + 1, c2 = a + nx, d = c2 + 1; idx.push(a, c2, b2, b2, c2, d); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const ground = new THREE.Mesh(tg, groundMat);
  ground.receiveShadow = quality !== 'low';
  ground.name = 'terrain';
  group.add(ground);

  // ---------------- water: lakes as flat surfaces, river as ribbons
  const waterMat = new THREE.MeshLambertMaterial({ color: PALETTE.water, transparent: true, opacity: 0.92 });
  const wpos: number[] = [], widx: number[] = [];
  for (const a of data.areas) {
    if (a[0] !== 3) continue;
    const pts: THREE.Vector2[] = []; let ymin = Infinity;
    for (let i = 1; i < a.length; i += 2) { pts.push(new THREE.Vector2(a[i] / 10, a[i + 1] / 10)); ymin = Math.min(ymin, terrain.y(a[i] / 10, a[i + 1] / 10)); }
    const tris = THREE.ShapeUtils.triangulateShape(pts, []);
    const base = wpos.length / 3;
    for (const p of pts) wpos.push(p.x, ymin + 0.25, p.y);
    for (const t of tris) widx.push(base + t[0], base + t[2], base + t[1]);
  }
  for (const w of data.waterways) ribbon(w, 1, w[0] / 10, (x, z) => terrain.y(x, z) + 0.12, wpos, widx, null, null);
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3)); wg.setIndex(widx); wg.computeVertexNormals();
  const water = new THREE.Mesh(wg, waterMat); water.name = 'water'; group.add(water);

  // ---------------- roads, paths and railways
  const rpos: number[] = [], ridx: number[] = [], rcol: number[] = [];
  for (const r of data.roads) {
    const cls = r[0];
    const w = r[1] / 10;
    const isPath = cls >= 9;
    if (quality === 'low' && isPath) continue;
    const c = cls <= 1 ? PALETTE.primary : isPath ? PALETTE.path : PALETTE.road;
    ribbon(r, 4, isPath ? Math.min(w, 2) : w, (x, z) => terrain.y(x, z) + (isPath ? 0.06 : 0.1) + (cls <= 3 ? 0.02 : 0), rpos, ridx, rcol, c);
  }
  for (const r of data.rail) ribbon(r, 1, 3.2, (x, z) => terrain.y(x, z) + 0.08, rpos, ridx, rcol, PALETTE.rail);
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3)); rg.setAttribute('color', new THREE.Float32BufferAttribute(rcol, 3)); rg.setIndex(ridx); rg.computeVertexNormals();
  const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const roads = new THREE.Mesh(rg, roadMat); roads.receiveShadow = quality !== 'low'; roads.name = 'roads'; group.add(roads);

  // ---------------- buildings
  const bpos: number[] = [], bidx: number[] = [], bcol: number[] = [];
  const rng = new Rng('cosmetic:buildings');
  let count = 0;
  const WALL: Record<number, string[]> = {
    0: ['#c98b6b', '#b8795b', '#d7a27f', '#c4917a', '#e2d6c1'], 1: ['#b8765a', '#a8684e', '#d9c7a8', '#e5dccb'], 2: ['#d8cfbf', '#c9bba5', '#b7aa98'], 3: ['#e3d8c6', '#d5c6ae', '#cdb9a2', '#e8e0d0'],
    4: ['#cbbfa6'], 5: ['#a9aeb3', '#9ba2a8', '#b9b3a6'], 6: ['#d6ccb8', '#cfc2aa'], 7: ['#a8a39a', '#b1ab9f'], 8: ['#cdb89a'], 9: ['#c9b9a0'], 10: ['#d2c1a8', '#c5a98c', '#ddd3c2'],
  };
  const ROOF = ['#6f7178', '#7c5448', '#8f4f3b', '#5f636b', '#9a5a43'];
  for (const bd of data.buildings) {
    const kind = bd[1];
    if (kind === 8) continue; // cathedral modelled separately
    const h = bd[0] / 10, roof = bd[2];
    const n = (bd.length - 3) / 2;
    if (n < 3) continue;
    const xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < n; i++) { xs.push(bd[3 + i * 2] / 10); zs.push(bd[4 + i * 2] / 10); }
    const cx = xs.reduce((a, v) => a + v, 0) / n, cz = zs.reduce((a, v) => a + v, 0) / n;
    if (quality === 'low') { if (focus && Math.hypot(cx - focus.x, cz - focus.z) > focus.r) continue; if (areaOf(xs, zs) < 40) continue; }
    let base = Infinity; for (let i = 0; i < n; i++) base = Math.min(base, terrain.y(xs[i], zs[i]));
    base -= 0.3;
    const top = base + h + 0.3;
    const wallC = col(rng.pick(WALL[kind] ?? WALL[10]));
    const roofC = col(roof ? rng.pick(ROOF) : '#8e8c88');
    walls(xs, zs, cx, cz, base, top, wallC, bpos, bidx, bcol);
    // roof
    if (roof && n >= 4 && quality !== 'low') gableRoof(xs, zs, top, kind === 4 ? 0.9 : 0.55, roofC, bpos, bidx, bcol);
    else flatRoof(xs, zs, top, roofC, bpos, bidx, bcol);
    // church towers
    if (kind === 4 && quality !== 'low') tower(xs[0] * 0.7 + cx * 0.3, zs[0] * 0.7 + cz * 0.3, 3.2, top + 8, base, col('#c8bea8'), true, bpos, bidx, bcol);
    count++;
  }
  // landmarks: the Cathedral (long nave, central tower) and the Clock Tower
  for (const lm of data.landmarks) {
    if (!lm.footprint) continue;
    const n = lm.footprint.length / 2;
    const xs: number[] = [], zs: number[] = [];
    for (let i = 0; i < n; i++) { xs.push(lm.footprint[i * 2] / 10); zs.push(lm.footprint[i * 2 + 1] / 10); }
    let base = Infinity; for (let i = 0; i < n; i++) base = Math.min(base, terrain.y(xs[i], zs[i]));
    if (lm.kind === 'cathedral') {
      const top = base + 21;
      const stone = col('#cdb694');
      const ccx = xs.reduce((a, v) => a + v, 0) / n, ccz = zs.reduce((a, v) => a + v, 0) / n;
      walls(xs, zs, ccx, ccz, base - 0.5, top, stone, bpos, bidx, bcol);
      gableRoof(xs, zs, top, 0.75, col('#5b5f66'), bpos, bidx, bcol);
      // crossing tower (the Norman tower stands roughly mid-church)
      const ob = obb(xs, zs);
      const tx = ob.cx + ob.ax * ob.hl * 0.12, tz = ob.cz + ob.az * ob.hl * 0.12;
      tower(tx, tz, 8.5, base + 44, base, col('#c7ad86'), false, bpos, bidx, bcol);
    } else if (lm.kind === 'clocktower') {
      const cx = xs.reduce((a, v) => a + v, 0) / n, cz = zs.reduce((a, v) => a + v, 0) / n;
      tower(cx, cz, 3.4, base + 21, base, col('#bfae8f'), true, bpos, bidx, bcol);
    }
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(bcol, 3)); bg.setIndex(bidx); bg.computeVertexNormals();
  const bmesh = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true }));
  bmesh.castShadow = quality === 'high'; bmesh.receiveShadow = quality !== 'low'; bmesh.name = 'buildings';
  group.add(bmesh);

  // ---------------- trees (instanced)
  let treeMesh: THREE.InstancedMesh | null = null;
  const treePts: number[] = [];
  const trng = new Rng('cosmetic:trees');
  for (let i = 0; i < data.trees.length; i += 2) treePts.push(data.trees[i] / 10, data.trees[i + 1] / 10);
  const density = quality === 'high' ? 1 : quality === 'medium' ? 0.55 : 0.2;
  for (const a of data.areas) {
    const kind = a[0];
    const per = kind === 2 ? 110 : kind === 0 ? 700 : kind === 4 ? 500 : kind === 12 ? 300 : kind === 11 ? 2600 : 0;
    if (!per) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 1; i < a.length; i += 2) { x0 = Math.min(x0, a[i] / 10); x1 = Math.max(x1, a[i] / 10); z0 = Math.min(z0, a[i + 1] / 10); z1 = Math.max(z1, a[i + 1] / 10); }
    const area = (x1 - x0) * (z1 - z0);
    const target = Math.min(3000, Math.round((area / per) * density));
    for (let k = 0; k < target; k++) { const x = trng.range(x0, x1), z = trng.range(z0, z1); if (pip(x, z, a, 1)) treePts.push(x, z); }
  }
  if (treePts.length) {
    const canopy = new THREE.IcosahedronGeometry(1, 0);
    canopy.translate(0, 1.6, 0);
    const trunk = new THREE.CylinderGeometry(0.12, 0.16, 1.2, 5); trunk.translate(0, 0.6, 0);
    const merged = mergeSimple([canopy, trunk], [col('#5f8f4a'), col('#6b4f3a')]);
    const nT = treePts.length / 2;
    treeMesh = new THREE.InstancedMesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }), nT);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < nT; i++) {
      const x = treePts[i * 2], z = treePts[i * 2 + 1];
      const sc = trng.range(3.2, 6.5);
      p.set(x, terrain.y(x, z) - 0.2, z); s.set(sc * trng.range(0.8, 1.15), sc * trng.range(0.9, 1.4), sc * trng.range(0.8, 1.15));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), trng.range(0, 6.28));
      m.compose(p, q, s); treeMesh.setMatrixAt(i, m);
      c.setHSL(0.24 + trng.range(-0.03, 0.04), 0.35 + trng.range(-0.08, 0.1), 0.34 + trng.range(-0.06, 0.08)); treeMesh.setColorAt(i, c);
    }
    treeMesh.castShadow = quality === 'high';
    treeMesh.name = 'trees';
    group.add(treeMesh);
  }
  return { group, terrain, buildingCount: count, treeMesh, waterMat, groundMat };
}


/** Push a triangle facing `want` (flips winding if needed); vertices are not shared, so shading is flat. */
function tri3(pos: number[], idx: number[], cols: number[], a: number[], b: number[], c: number[], col: THREE.Color, want: number[], shade = 1) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const flip = nx * want[0] + ny * want[1] + nz * want[2] < 0;
  const v0 = pos.length / 3;
  for (const p of flip ? [a, c, b] : [a, b, c]) { pos.push(p[0], p[1], p[2]); cols.push(col.r * shade, col.g * shade, col.b * shade); }
  idx.push(v0, v0 + 1, v0 + 2);
}
function quad3(pos: number[], idx: number[], cols: number[], a: number[], b: number[], c: number[], d: number[], col: THREE.Color, want: number[], shade = 1) {
  tri3(pos, idx, cols, a, b, c, col, want, shade); tri3(pos, idx, cols, a, c, d, col, want, shade);
}

function walls(xs: number[], zs: number[], cx: number, cz: number, base: number, top: number, c: THREE.Color, pos: number[], idx: number[], cols: number[]) {
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = xs[j] - xs[i], ez = zs[j] - zs[i];
    let ox = ez, oz = -ex; // a normal of the edge; point it away from the footprint centre
    const mx = (xs[i] + xs[j]) / 2 - cx, mz = (zs[i] + zs[j]) / 2 - cz;
    if (ox * mx + oz * mz < 0) { ox = -ox; oz = -oz; }
    const shade = 0.8 + 0.2 * Math.max(0, (ox * 0.5 + oz * -0.8) / (Math.hypot(ox, oz) || 1));
    quad3(pos, idx, cols, [xs[i], base, zs[i]], [xs[j], base, zs[j]], [xs[j], top, zs[j]], [xs[i], top, zs[i]], c, [ox, 0, oz], shade);
  }
}
function flatRoof(xs: number[], zs: number[], top: number, c: THREE.Color, pos: number[], idx: number[], cols: number[]) {
  const pts = xs.map((x, i) => new THREE.Vector2(x, zs[i]));
  let tris: number[][] = [];
  try { tris = THREE.ShapeUtils.triangulateShape(pts, []); } catch { tris = []; }
  for (const t of tris) tri3(pos, idx, cols, [xs[t[0]], top, zs[t[0]]], [xs[t[1]], top, zs[t[1]]], [xs[t[2]], top, zs[t[2]]], c, [0, 1, 0]);
}

function areaOf(xs: number[], zs: number[]) { let a = 0; for (let i = 0; i < xs.length; i++) { const j = (i + 1) % xs.length; a += xs[i] * zs[j] - xs[j] * zs[i]; } return Math.abs(a) / 2; }

/** Ribbon along a packed polyline (coordinates in decimetres from index `off`). */
function ribbon(line: number[], off: number, width: number, yAt: (x: number, z: number) => number, pos: number[], idx: number[], colors: number[] | null, c: THREE.Color | null) {
  const pts: number[] = [];
  for (let i = off; i + 1 < line.length; i += 2) pts.push(line[i] / 10, line[i + 1] / 10);
  // subdivide long segments so the ribbon follows the terrain
  const sub: number[] = [];
  for (let i = 0; i + 2 < pts.length + 0.1 && i + 1 < pts.length; i += 2) {
    const x0 = pts[i], z0 = pts[i + 1];
    sub.push(x0, z0);
    if (i + 3 < pts.length) { const x1 = pts[i + 2], z1 = pts[i + 3]; const L = Math.hypot(x1 - x0, z1 - z0); const n = Math.floor(L / 8); for (let k = 1; k < n; k++) sub.push(x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n); }
  }
  const m = sub.length / 2;
  if (m < 2) return;
  const hw = width / 2;
  const base = pos.length / 3;
  for (let i = 0; i < m; i++) {
    const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
    const dx = sub[b * 2] - sub[a * 2], dz = sub[b * 2 + 1] - sub[a * 2 + 1];
    const L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L, nz = dx / L;
    const x = sub[i * 2], z = sub[i * 2 + 1];
    const y = yAt(x, z);
    pos.push(x + nx * hw, y, z + nz * hw, x - nx * hw, y, z - nz * hw);
    if (colors && c) colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let i = 0; i < m - 1; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
}

function obb(xs: number[], zs: number[]) {
  const n = xs.length;
  const cx = xs.reduce((a, v) => a + v, 0) / n, cz = zs.reduce((a, v) => a + v, 0) / n;
  let sxx = 0, szz = 0, sxz = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - cx, dz = zs[i] - cz; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; }
  const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ax = Math.cos(ang), az = Math.sin(ang);
  let l0 = Infinity, l1 = -Infinity, w0 = Infinity, w1 = -Infinity;
  for (let i = 0; i < n; i++) { const dx = xs[i] - cx, dz = zs[i] - cz; const l = dx * ax + dz * az, w = -dx * az + dz * ax; l0 = Math.min(l0, l); l1 = Math.max(l1, l); w0 = Math.min(w0, w); w1 = Math.max(w1, w); }
  const lc = (l0 + l1) / 2, wc = (w0 + w1) / 2;
  return { cx: cx + ax * lc - az * wc, cz: cz + az * lc + ax * wc, ax, az, hl: (l1 - l0) / 2, hw: (w1 - w0) / 2 };
}

function gableRoof(xs: number[], zs: number[], top: number, pitch: number, c: THREE.Color, pos: number[], idx: number[], colors: number[]) {
  const o = obb(xs, zs);
  const hl = o.hl + 0.25, hw = o.hw + 0.25;
  const rh = Math.min(hw * pitch, 7);
  const P = (l: number, w: number, y: number) => [o.cx + o.ax * l - o.az * w, y, o.cz + o.az * l + o.ax * w];
  const v = [P(-hl, -hw, top), P(hl, -hw, top), P(hl, hw, top), P(-hl, hw, top), P(-hl, 0, top + rh), P(hl, 0, top + rh)];
  const wOut = [o.az, 0, -o.ax], lOut = [o.ax, 0, o.az];
  // two roof slopes (normals up and outwards) and two gable ends
  quad3(pos, idx, colors, v[0], v[1], v[5], v[4], c, [-wOut[0] * 0.7, 1, -wOut[2] * 0.7], 0.92);
  quad3(pos, idx, colors, v[2], v[3], v[4], v[5], c, [wOut[0] * 0.7, 1, wOut[2] * 0.7], 1.04);
  tri3(pos, idx, colors, v[3], v[0], v[4], c, [-lOut[0], 0, -lOut[2]], 0.85);
  tri3(pos, idx, colors, v[1], v[2], v[5], c, [lOut[0], 0, lOut[2]], 0.85);
}

function tower(x: number, z: number, half: number, top: number, base: number, c: THREE.Color, spire: boolean, pos: number[], idx: number[], colors: number[]) {
  const xs = [x - half, x + half, x + half, x - half], zs = [z - half, z - half, z + half, z + half];
  walls(xs, zs, x, z, base, top, c, pos, idx, colors);
  const apex = spire ? top + half * 2.2 : top + 0.5;
  const roofC = c.clone().multiplyScalar(0.72);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; tri3(pos, idx, colors, [xs[i], top, zs[i]], [xs[j], top, zs[j]], [x, apex, z], roofC, [(xs[i] + xs[j]) / 2 - x, 0.6, (zs[i] + zs[j]) / 2 - z]); }
}

/** Merge simple geometries, painting each a flat vertex colour. */
export function mergeSimple(geos: THREE.BufferGeometry[], colors: THREE.Color[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], colArr: number[] = [], idx: number[] = [];
  geos.forEach((g0, gi) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); colArr.push(colors[gi].r, colors[gi].g, colors[gi].b); idx.push(base + i); }
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
  out.setIndex(idx);
  return out;
}
