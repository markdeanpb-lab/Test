// Builds the bundled map extract and validated circuits from raw OSM + terrain tiles.
//   npm run geodata:fetch   (downloads raw data into data-raw/, not committed)
//   npm run geodata:build   (writes public/data/stalbans-city.json, src/data/circuits.json, docs/CIRCUITS.md)
import fs from 'node:fs';
import { loadOsmDir, type OsmData, type OsmWay } from './lib/osm';
import { project, ORIGIN } from './lib/geo';
import { elevationRaw } from './lib/terrain';
import { buildGraph, route, edgeBetween, roadWidth, type Graph } from './lib/graph';
import { CIRCUITS, type CircuitDef, type ChicaneMod } from './circuit-defs';
import { unproject } from './lib/geo';

const BOUNDS = (() => {
  const [x0, z1] = project(51.737, -0.372);
  const [x1, z0] = project(51.769, -0.312);
  return { x0: Math.ceil(x0), x1: Math.floor(x1), z0: Math.ceil(z0), z1: Math.floor(z1) };
})();

const osm: OsmData = await loadOsmDir('data-raw/osm');
const graph: Graph = buildGraph(osm);
console.log('graph nodes', graph.nodes.size, 'edges', graph.edges.length);

// ---------------------------------------------------------------- terrain
const elevAt = (x: number, z: number) => { const [lat, lon] = unproject(x, z); return elevationRaw(lat, lon); };
const TSTEP = 20;
const tnx = Math.floor((BOUNDS.x1 - BOUNDS.x0) / TSTEP) + 1, tnz = Math.floor((BOUNDS.z1 - BOUNDS.z0) / TSTEP) + 1;
let th = new Float64Array(tnx * tnz);
for (let j = 0; j < tnz; j++) for (let i = 0; i < tnx; i++) th[j * tnx + i] = elevAt(BOUNDS.x0 + i * TSTEP, BOUNDS.z0 + j * TSTEP);
// The source is a surface model: smooth to suppress building/tree bumps (3 passes of a 5x5 box filter).
for (let pass = 0; pass < 3; pass++) {
  const o = new Float64Array(th.length);
  for (let j = 0; j < tnz; j++) for (let i = 0; i < tnx; i++) {
    let s = 0, c = 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= tnx || jj >= tnz) continue; s += th[jj * tnx + ii]; c++; }
    o[j * tnx + i] = s / c;
  }
  th = o;
}
function terrainH(x: number, z: number): number {
  const fi = Math.max(0, Math.min(tnx - 1.001, (x - BOUNDS.x0) / TSTEP)), fj = Math.max(0, Math.min(tnz - 1.001, (z - BOUNDS.z0) / TSTEP));
  const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, tz = fj - j;
  const a = th[j * tnx + i], b = th[j * tnx + i + 1], c = th[(j + 1) * tnx + i], d = th[(j + 1) * tnx + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

// ---------------------------------------------------------------- city features
const q = (v: number) => Math.round(v * 10); // decimetres
const names: string[] = [];
const nameIdx = (n: string) => { if (!n) return -1; let i = names.indexOf(n); if (i < 0) { i = names.length; names.push(n); } return i; };
const wayPts = (w: OsmWay) => w.nodes.map((id) => osm.nodes.get(id)).filter(Boolean).map((n) => project(n!.lat, n!.lon));
const inBounds = (p: number[][]) => p.some(([x, z]) => x > BOUNDS.x0 && x < BOUNDS.x1 && z > BOUNDS.z0 && z < BOUNDS.z1);
const flat = (p: number[][]) => p.flatMap(([x, z]) => [q(x), q(z)]);

const ROAD_CLS = ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service', 'pedestrian', 'footway', 'path', 'cycleway', 'steps', 'track', 'bridleway'];
const roads: number[][] = [];
for (const w of osm.ways.values()) {
  const h = w.tags.highway; if (!h) continue;
  const base = h.replace('_link', '');
  let ci = ROAD_CLS.indexOf(base); if (ci < 0) continue;
  if (w.tags.area === 'yes') continue;
  const p = wayPts(w); if (p.length < 2 || !inBounds(p)) continue;
  const width = ci <= 8 ? roadWidth(w.tags) : h === 'track' ? 3 : 1.8;
  roads.push([ci, q(width), nameIdx(w.tags.name ?? ''), w.tags.bridge === 'yes' ? 1 : 0, ...flat(p)]);
}

// Buildings (ways + multipolygon outers)
const BKIND = ['house', 'terrace', 'apartments', 'commercial', 'church', 'industrial', 'civic', 'garage', 'cathedral', 'station', 'other'];
function buildingKind(t: Record<string, string>): number {
  const b = t.building;
  if (b === 'cathedral') return 8;
  if (b === 'church' || b === 'chapel' || t.amenity === 'place_of_worship') return 4;
  if (b === 'train_station' || t.railway === 'station') return 9;
  if (['house', 'detached', 'semidetached_house', 'bungalow'].includes(b)) return 0;
  if (b === 'terrace') return 1;
  if (['apartments', 'residential', 'dormitory', 'hotel'].includes(b)) return 2;
  if (['commercial', 'retail', 'office', 'supermarket', 'shop'].includes(b) || t.shop || t.amenity === 'pub' || t.amenity === 'restaurant') return 3;
  if (['industrial', 'warehouse', 'service'].includes(b)) return 5;
  if (['public', 'civic', 'school', 'university', 'college', 'hospital', 'government', 'townhall'].includes(b) || t.amenity === 'townhall' || t.amenity === 'school') return 6;
  if (['garage', 'garages', 'shed', 'roof', 'carport', 'hut', 'greenhouse'].includes(b)) return 7;
  return 10;
}
function polyArea(p: number[][]) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; } return Math.abs(a) / 2; }
function centroid(p: number[][]) { let x = 0, z = 0; for (const [a, b] of p) { x += a; z += b; } return [x / p.length, z / p.length]; }
const buildings: number[][] = [];
const buildingPolys: { p: number[][]; bb: number[] }[] = [];
function addBuilding(p: number[][], t: Record<string, string>) {
  if (p.length < 4 || !inBounds(p)) return;
  const area = polyArea(p);
  if (area < 6) return;
  const kind = buildingKind(t);
  const [cx, cz] = centroid(p);
  const central = Math.hypot(cx, cz) < 450;
  let h = parseFloat(t.height ?? '');
  const lv = parseFloat(t['building:levels'] ?? '');
  if (!(h > 2 && h < 90)) {
    if (lv > 0) h = lv * 3.1 + (kind === 0 || kind === 1 ? 2.2 : 0.8);
    else h = [7.5, 8, 12, central ? 10 : 8, 13, 8, 11, 3, 22, 9, area < 50 ? 3.2 : central ? 9 : 7.2][kind];
  }
  if (kind === 8) h = Math.max(h, 24);
  const roof = kind === 0 || kind === 1 || kind === 4 || kind === 8 || (kind === 10 && area < 220) || (kind === 3 && central && area < 400) ? 1 : 0;
  buildings.push([q(h), kind, roof, ...flat(p.slice(0, -1))]);
  const xs = p.map((v) => v[0]), zs = p.map((v) => v[1]);
  buildingPolys.push({ p, bb: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] });
}
for (const w of osm.ways.values()) if (w.tags.building && w.nodes[0] === w.nodes[w.nodes.length - 1]) addBuilding(wayPts(w), w.tags);
for (const r of osm.relations.values()) {
  if (!r.tags.building) continue;
  for (const m of r.members) if (m.type === 'way' && m.role === 'outer') { const w = osm.ways.get(m.ref); if (w && w.nodes[0] === w.nodes[w.nodes.length - 1]) addBuilding(wayPts(w), { ...w.tags, ...r.tags }); }
}

// Areas: land use for ground colouring
const AKIND = ['park', 'grass', 'wood', 'water', 'cemetery', 'field', 'pitch', 'parking', 'railway', 'allotments', 'commercial', 'residential', 'scrub'];
function areaKind(t: Record<string, string>): number {
  if (t.natural === 'water' || t.water || t.landuse === 'reservoir' || t.landuse === 'basin') return 3;
  if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'common') return 0;
  if (t.leisure === 'pitch' || t.leisure === 'golf_course' || t.leisure === 'recreation_ground' || t.leisure === 'playground' || t.leisure === 'sports_centre') return 6;
  if (t.landuse === 'grass' || t.landuse === 'village_green' || t.landuse === 'recreation_ground' || t.natural === 'grassland') return 1;
  if (t.landuse === 'forest' || t.natural === 'wood') return 2;
  if (t.natural === 'scrub' || t.natural === 'wetland') return 12;
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return 4;
  if (t.landuse === 'farmland' || t.landuse === 'meadow' || t.landuse === 'orchard') return 5;
  if (t.amenity === 'parking') return 7;
  if (t.landuse === 'railway') return 8;
  if (t.landuse === 'allotments') return 9;
  if (t.landuse === 'commercial' || t.landuse === 'retail' || t.landuse === 'industrial') return 10;
  if (t.landuse === 'residential') return 11;
  return -1;
}
const areas: number[][] = [];
for (const w of osm.ways.values()) {
  if (w.nodes[0] !== w.nodes[w.nodes.length - 1]) continue;
  const k = areaKind(w.tags); if (k < 0) continue;
  const p = wayPts(w); if (p.length < 4 || !inBounds(p)) continue;
  areas.push([k, ...flat(p.slice(0, -1))]);
}
for (const r of osm.relations.values()) {
  const k = areaKind(r.tags); if (k < 0) continue;
  for (const m of r.members) if (m.type === 'way' && m.role === 'outer') {
    const w = osm.ways.get(m.ref); if (!w || w.nodes[0] !== w.nodes[w.nodes.length - 1]) continue;
    const p = wayPts(w); if (p.length >= 4 && inBounds(p)) areas.push([k, ...flat(p.slice(0, -1))]);
  }
}
// Draw big/low-priority areas first
areas.sort((a, b) => [11, 10, 5, 8, 12, 0, 1, 6, 4, 9, 7, 2, 3].indexOf(a[0]) - [11, 10, 5, 8, 12, 0, 1, 6, 4, 9, 7, 2, 3].indexOf(b[0]));

const waterways: number[][] = [];
const rail: number[][] = [];
for (const w of osm.ways.values()) {
  const p = wayPts(w); if (p.length < 2 || !inBounds(p)) continue;
  if (w.tags.waterway === 'river' || w.tags.waterway === 'stream') waterways.push([q(w.tags.waterway === 'river' ? 5 : 2), ...flat(p)]);
  if (w.tags.railway === 'rail' && !w.tags.service) rail.push([w.tags.bridge === 'yes' ? 1 : 0, ...flat(p)]);
}

const trees: number[] = [];
for (const n of osm.nodes.values()) if (n.tags?.natural === 'tree') { const [x, z] = project(n.lat, n.lon); if (x > BOUNDS.x0 && x < BOUNDS.x1 && z > BOUNDS.z0 && z < BOUNDS.z1) trees.push(q(x), q(z)); }
for (const w of osm.ways.values()) if (w.tags.natural === 'tree_row') { const p = wayPts(w); for (let i = 0; i + 1 < p.length; i++) { const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); for (let s = 0; s < L; s += 9) { const t = s / L; trees.push(q(p[i][0] + (p[i + 1][0] - p[i][0]) * t), q(p[i][1] + (p[i + 1][1] - p[i][1]) * t)); } } }

// Landmarks (verified OSM positions; footprints where OSM has them)
interface Landmark { id: string; name: string; kind: string; x: number; z: number; footprint?: number[]; osm: string }
const landmarks: Landmark[] = [];
function findWay(pred: (t: Record<string, string>) => boolean): OsmWay | undefined { for (const w of osm.ways.values()) if (pred(w.tags)) return w; }
function addLm(id: string, name: string, kind: string, w: OsmWay | undefined) {
  if (!w) { console.warn('landmark missing', id); return; }
  const p = wayPts(w); const [x, z] = centroid(p.slice(0, -1));
  landmarks.push({ id, name, kind, x: +x.toFixed(1), z: +z.toFixed(1), footprint: flat(p.slice(0, -1)), osm: `way/${w.id}` });
}
addLm('cathedral', 'St Albans Cathedral', 'cathedral', findWay((t) => t.name === 'St Albans Cathedral' && !!t.building));
addLm('clocktower', 'The Clock Tower', 'clocktower', findWay((t) => t.name === 'The Clock Tower' && !!t.building));
addLm('stpeters', "St Peter's Church", 'church', findWay((t) => t.name === "St Peter's Church" && !!t.building));
addLm('stmichaels', "St Michael's Church", 'church', findWay((t) => t.name === "St Michael's Church" && !!t.building));
addLm('ststephens', "St Stephen's Church", 'church', findWay((t) => t.name === "St. Stephen's Church" && !!t.building));
addLm('museum', 'Verulamium Museum', 'museum', findWay((t) => t.name === 'Verulamium Museum'));
addLm('hypocaust', 'The Hypocaust', 'museum', findWay((t) => t.name === 'The Hypocaust'));
addLm('watermill', 'Kingsbury Water Mill', 'mill', findWay((t) => t.name === 'Kingsbury Water Mill'));
addLm('arena', 'The Alban Arena', 'civic', findWay((t) => t.name === 'The Alban Arena'));
addLm('museumgallery', "St Alban's Museum + Gallery", 'civic', findWay((t) => t.name === "St Alban's Museum + Gallery"));
addLm('verulamiumpark', 'Verulamium Park', 'park', findWay((t) => t.name === 'Verulamium Park' && t.leisure === 'park'));
addLm('clarencepark', 'Clarence Park', 'park', findWay((t) => t.name === 'Clarence Park' && t.leisure === 'park'));
for (const n of osm.nodes.values()) {
  if (n.tags?.railway === 'station' && n.tags.name === 'St Albans City') { const [x, z] = project(n.lat, n.lon); landmarks.push({ id: 'station', name: 'St Albans City station', kind: 'station', x: +x.toFixed(1), z: +z.toFixed(1), osm: `node/${n.id}` }); }
}
{ // The Peahen junction is named after the pub on the corner; Market Place area.
  const pea = graph.nodes.get(490664)!; landmarks.push({ id: 'peahen', name: 'The Peahen junction', kind: 'junction', x: +pea.x.toFixed(1), z: +pea.z.toFixed(1), osm: 'node/490664' });
  const th2 = graph.nodes.get(490669)!; landmarks.push({ id: 'townhall', name: 'Old Town Hall', kind: 'junction', x: +th2.x.toFixed(1), z: +th2.z.toFixed(1), osm: 'node/490669' });
  const mp = findWay((t) => t.name === 'Market Place' && t.highway === 'pedestrian');
  if (mp) { const p = wayPts(mp); const [x, z] = centroid(p); landmarks.push({ id: 'marketplace', name: 'Market Place', kind: 'market', x: +x.toFixed(1), z: +z.toFixed(1), osm: `way/${mp.id}` }); }
}

// ---------------------------------------------------------------- building spatial index (for clearance checks)
const GRID = 50;
const bgrid = new Map<string, number[]>();
buildingPolys.forEach((b, i) => { for (let gx = Math.floor(b.bb[0] / GRID); gx <= Math.floor(b.bb[2] / GRID); gx++) for (let gz = Math.floor(b.bb[1] / GRID); gz <= Math.floor(b.bb[3] / GRID); gz++) { const k = gx + ',' + gz; if (!bgrid.has(k)) bgrid.set(k, []); bgrid.get(k)!.push(i); } });
function pointInPoly(x: number, z: number, p: number[][]) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, zi] = p[i], [xj, zj] = p[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; }
function insideBuilding(x: number, z: number): boolean {
  for (const i of bgrid.get(Math.floor(x / GRID) + ',' + Math.floor(z / GRID)) ?? []) { const b = buildingPolys[i]; if (x < b.bb[0] || x > b.bb[2] || z < b.bb[1] || z > b.bb[3]) continue; if (pointInPoly(x, z, b.p)) return true; }
  return false;
}

// ---------------------------------------------------------------- circuit processing
interface Pt { x: number; z: number; w: number; street: string; junction: boolean; chicane?: boolean }
function resample(pts: Pt[], step: number, closed: boolean): Pt[] {
  const src = closed ? [...pts, pts[0]] : pts;
  const out: Pt[] = [];
  let carry = 0;
  for (let i = 0; i + 1 < src.length; i++) {
    const a = src[i], b = src[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    let s = carry;
    while (s < L) { const t = s / L; out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t, street: t < 0.5 ? a.street : b.street, junction: (t < 0.2 && a.junction) || (t > 0.8 && b.junction), chicane: t < 0.5 ? a.chicane : b.chicane }); s += step; }
    carry = s - L;
  }
  return out;
}
function normals(xs: number[], zs: number[]) {
  const n = xs.length, nx = new Array(n), nz = new Array(n);
  for (let i = 0; i < n; i++) { const a = (i - 1 + n) % n, b = (i + 1) % n; const dx = xs[b] - xs[a], dz = zs[b] - zs[a]; const L = Math.hypot(dx, dz) || 1; nx[i] = -dz / L; nz[i] = dx / L; }
  return { nx, nz };
}
function curvature(xs: number[], zs: number[], span: number) {
  const n = xs.length, k = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - span + n) % n, b = (i + span) % n;
    const ax = xs[i] - xs[a], az = zs[i] - zs[a], bx = xs[b] - xs[i], bz = zs[b] - zs[i];
    const cross = ax * bz - az * bx, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(xs[b] - xs[a], zs[b] - zs[a]);
    k[i] = (2 * cross) / (la * lb * lc || 1); // signed Menger curvature (+ = turning right in x-east/z-south frame)
  }
  return k;
}
function segIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(d) < 1e-9) return false;
  const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

const LANDMARK_CORNER_NAMES: [string, string][] = [['peahen', 'Peahen'], ['clocktower', 'Clock Tower'], ['townhall', 'Town Hall'], ['station', 'Station'], ['stpeters', "St Peter's"], ['ststephens', "St Stephen's"], ['stmichaels', "St Michael's"], ['cathedral', 'Abbey'], ['museum', 'Museum']];

interface Report { [k: string]: any }
const circuitsOut: any[] = [];
const pitSites = new Map<string, { x: number; z: number; nx: number; nz: number; side: number; kerb: boolean }>();
const reportLines: string[] = [];

function buildVariant(def: CircuitDef, variant: CircuitDef['variants'][number]) {
  const rep: Report = { id: `${def.id}-${variant.key}`, checks: [] as { name: string; ok: boolean; detail: string }[] };
  const check = (name: string, ok: boolean, detail: string) => rep.checks.push({ name, ok, detail });
  // 1. route through the graph
  const allowed = new Set(def.streets);
  const used = new Set<number>();
  let nodes: number[] = [];
  const vias = def.vias;
  for (let i = 0; i < vias.length; i++) {
    const a = vias[i], b = vias[(i + 1) % vias.length];
    const forbidden = new Set(used); forbidden.delete(a); if (i === vias.length - 1) forbidden.delete(vias[0]);
    const p = route(graph, a, b, allowed, forbidden);
    if (!p) throw new Error(`${def.id}: no route ${a} -> ${b}`);
    for (const n of p) used.add(n);
    nodes.push(...(nodes.length ? p.slice(1) : p));
  }
  check('Closed loop', nodes[0] === nodes[nodes.length - 1], `${nodes.length - 1} graph nodes`);
  nodes = nodes.slice(0, -1);
  const uniq = new Set(nodes);
  check('No repeated junction (no at-grade self crossing)', uniq.size === nodes.length, `${nodes.length - uniq.size} repeated nodes`);
  if (variant.reverse) nodes.reverse();
  const streetsUsed = new Map<string, number>();
  const offList: string[] = [];
  let edgesOk = true;
  const pts: Pt[] = nodes.map((id, i) => {
    const nx = nodes[(i + 1) % nodes.length], pv = nodes[(i - 1 + nodes.length) % nodes.length];
    const e1 = edgeBetween(graph, id, nx), e0 = edgeBetween(graph, pv, id);
    if (!e1) edgesOk = false;
    if (e1) { streetsUsed.set(e1.name, (streetsUsed.get(e1.name) ?? 0) + e1.len); if (!allowed.has(e1.name)) offList.push(e1.name || e1.cls); }
    const node = graph.nodes.get(id)!;
    const deg = graph.adj.get(id)?.length ?? 0;
    return { x: node.x, z: node.z, w: Math.min(e1?.width ?? 6, e0?.width ?? 6), street: e1?.name ?? '', junction: deg >= 3 };
  });
  check('Every consecutive pair joined by a real drivable OSM way', edgesOk, edgesOk ? 'all edges exist' : 'missing edge');
  check('Only permitted streets used', offList.length === 0, offList.length ? `unexpected: ${[...new Set(offList)].join(', ')}` : 'ok');
  rep.streets = [...streetsUsed.entries()].map(([n, l]) => `${n || '(unnamed link)'} ${l.toFixed(0)}m`);

  // 2. fine resample, apply chicane modifications, constrained smoothing (within the carriageway)
  let fine = resample(pts, 2, true);
  const n0 = fine.length;
  const baseX = fine.map((p) => p.x), baseZ = fine.map((p) => p.z);
  const allowDev = fine.map((p) => Math.max(0.6, p.w / 2 - 0.8) + (p.junction ? 3.5 : 0));
  const mods: ChicaneMod[] = variant.mods ?? [];
  const fictional: string[] = [];
  for (const m of mods) {
    const idx = fine.map((p, i) => (p.street === m.street ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) throw new Error(`mod street not on route ${m.street}`);
    const c = idx[Math.floor(idx.length * m.at)];
    const half = Math.round(m.length / 2 / 2);
    void half;
    const { nx, nz } = normals(baseX, baseZ);
    for (let d = -half; d <= half; d++) {
      const i = (c + d + n0) % n0; const t = d / half; // -1..1
      const amp = Math.max(1.4, fine[i].w / 2 - 1.2);
      const off = amp * Math.sin(Math.PI * t) * (1 - Math.abs(t) ** 4);
      baseX[i] += nx[i] * off; baseZ[i] += nz[i] * off; allowDev[i] = 0.3; fine[i].chicane = true;
    }
    fictional.push(m.reason);
  }
  // clearance to mapped building frontages on each side of the raw centreline (limits corner cutting and width)
  const rawN = normals(baseX, baseZ);
  const clearance = (x: number, z: number, nx: number, nz: number) => { for (let d = 0.5; d <= 16; d += 0.5) if (insideBuilding(x + nx * d, z + nz * d)) return d; return 16; };
  const clrR = baseX.map((x, i) => clearance(x, baseZ[i], rawN.nx[i], rawN.nz[i]));
  const clrL = baseX.map((x, i) => clearance(x, baseZ[i], -rawN.nx[i], -rawN.nz[i]));
  let xs = baseX.slice(), zs = baseZ.slice();
  for (let it = 0; it < 260; it++) {
    const nxs = xs.slice(), nzs = zs.slice();
    for (let i = 0; i < n0; i++) {
      const a = (i - 1 + n0) % n0, b = (i + 1) % n0;
      let x = (xs[a] + xs[b] + xs[i] * 2) / 4, z = (zs[a] + zs[b] + zs[i] * 2) / 4;
      let dx = x - baseX[i], dz = z - baseZ[i];
      const d = Math.hypot(dx, dz);
      if (d > allowDev[i]) { dx *= allowDev[i] / d; dz *= allowDev[i] / d; }
      // keep the lateral component clear of building frontages (car half-width + pavement margin)
      const lat = dx * rawN.nx[i] + dz * rawN.nz[i];
      const latC = Math.max(-(clrL[i] - 2.6), Math.min(clrR[i] - 2.6, lat));
      if (latC !== lat) { const c = Math.max(-allowDev[i], Math.min(allowDev[i], latC)); dx += (c - lat) * rawN.nx[i]; dz += (c - lat) * rawN.nz[i]; }
      nxs[i] = baseX[i] + dx; nzs[i] = baseZ[i] + dz;
    }
    xs = nxs; zs = nzs;
  }
  // 3. resample centreline to 4 m samples
  const SP = 4;
  const cl = resample(fine.map((p, i) => ({ ...p, x: xs[i], z: zs[i] })), SP, true);
  const chicaneMask = cl.map((p) => !!p.chicane);
  let N = cl.length;
  let cx = cl.map((p) => p.x), cz = cl.map((p) => p.z);
  // width smoothing (moving min then average)
  let w = cl.map((p) => p.w);
  {
    // Usable carriageway: mapped width, capped by measured clearance to building frontages minus ~1 m pavement.
    // Where OSM footprints overlap the mapped carriageway (alignment artefacts) a 5 m minimum is kept and counted.
    const nn = normals(cx, cz);
    let overlaps = 0;
    for (let i = 0; i < N; i++) {
      const cR = clearance(cx[i], cz[i], nn.nx[i], nn.nz[i]), cL = clearance(cx[i], cz[i], -nn.nx[i], -nn.nz[i]);
      let hR = Math.min(w[i] / 2, cR - 1.0), hL = Math.min(w[i] / 2, cL - 1.0);
      if (hR < 2.5) { hR = 2.5; overlaps++; }
      if (hL < 2.5) { hL = 2.5; overlaps++; }
      const shift = (hR - hL) / 2;
      cx[i] += nn.nx[i] * shift; cz[i] += nn.nz[i] * shift; w[i] = hR + hL;
    }
    rep.frontageOverlaps = overlaps;
  }
  for (let pass = 0; pass < 2; pass++) { const c0 = cx.slice(), z0 = cz.slice(); for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; cx[i] = (c0[a] + c0[b] + 2 * c0[i]) / 4; cz[i] = (z0[a] + z0[b] + 2 * z0[i]) / 4; } }
  { const w0 = w.slice(); w = w0.map((_, i) => { let m = Infinity; for (let d = -3; d <= 3; d++) m = Math.min(m, w0[(i + d + N) % N]); return m; }); }
  w = w.map((_, i) => { let s = 0; for (let d = -2; d <= 2; d++) s += w[(i + d + N) % N]; return s / 5; });
  // barrier chicanes: staggered temporary walls leave a ~3.6 m corridor snaking kerb to kerb
  for (let i = 0; i < N; i++) if (chicaneMask[i]) w[i] = Math.min(w[i], 3.6);
  // 4. racing line: lateral offset minimising curvature within the usable width
  const { nx: cnx, nz: cnz } = normals(cx, cz);
  let off = new Array(N).fill(0);
  const lim = w.map((ww, i) => (chicaneMask[i] ? 0.3 : Math.max(0, ww / 2 - 1.3)));
  for (let it = 0; it < 400; it++) {
    const px = cx.map((v, i) => v + cnx[i] * off[i]), pz = cz.map((v, i) => v + cnz[i] * off[i]);
    const no = off.slice();
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const tx = (px[a] + px[b]) / 2, tz = (pz[a] + pz[b]) / 2;
      // project the midpoint onto the lateral axis at i
      let o = (tx - cx[i]) * cnx[i] + (tz - cz[i]) * cnz[i];
      o = off[i] + (o - off[i]) * 0.8;
      no[i] = Math.max(-lim[i], Math.min(lim[i], o));
    }
    off = no;
  }
  // final clearance repair: pull any racing-line sample that lands inside a mapped footprint back towards the centreline
  let repaired = 0;
  for (let i = 0; i < N; i++) {
    let tries = 0;
    while (insideBuilding(cx[i] + cnx[i] * off[i], cz[i] + cnz[i] * off[i]) && tries < 20) { off[i] *= 0.8; tries++; }
    if (tries) repaired++;
  }
  for (let pass = 0; pass < 3; pass++) { const o0 = off.slice(); for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; const m = (o0[a] + o0[b]) / 2; off[i] = Math.abs(m) < Math.abs(o0[i]) ? m : o0[i]; } }
  rep.repaired = repaired;
  const rx = cx.map((v, i) => v + cnx[i] * off[i]), rz = cz.map((v, i) => v + cnz[i] * off[i]);
  const kC = curvature(cx, cz, 3);
  const kR0 = curvature(rx, rz, 2);
  const kR = kR0.map((_, i) => { let s = 0; for (let d = -1; d <= 1; d++) s += kR0[(i + d + N) % N]; return s / 3; });

  // 5. elevation along the track (terrain is a smoothed surface model; smooth further along the route)
  let y = cx.map((x, i) => terrainH(x, cz[i]));
  for (let pass = 0; pass < 3; pass++) y = y.map((_, i) => { let s = 0; for (let d = -8; d <= 8; d++) s += y[(i + d + N) % N]; return s / 17; });
  const grade = y.map((_, i) => (y[(i + 2) % N] - y[(i - 2 + N) % N]) / (4 * SP));

  // 6. self-intersection / proximity of non-adjacent parts
  let crossings = 0; let minSep = Infinity; let minSepAt = -1;
  for (let i = 0; i < N; i++) for (let j = i + 12; j < N; j++) {
    if (N - j + i < 12) continue;
    if (segIntersect(cx[i], cz[i], cx[(i + 1) % N], cz[(i + 1) % N], cx[j], cz[j], cx[(j + 1) % N], cz[(j + 1) % N])) crossings++;
    const d = Math.hypot(cx[i] - cx[j], cz[i] - cz[j]) - (w[i] + w[j]) / 2;
    if (d < minSep) { minSep = d; minSepAt = i; }
  }
  check('Route never crosses itself', crossings === 0, `${crossings} crossings`);
  check('Separate parts of the track do not overlap', minSep > 1, `closest non-adjacent edges ${minSep.toFixed(1)} m apart`);
  const rMin = 1 / Math.max(...kR.map(Math.abs));
  check('Minimum racing-line radius is drivable (>= 5.5 m, a slow street hairpin)', rMin >= 5.5, `${rMin.toFixed(1)} m`);
  const maxGrade = Math.max(...grade.map(Math.abs));
  check('Gradients plausible for a road (< 14%)', maxGrade < 0.14, `max ${(maxGrade * 100).toFixed(1)}%`);
  const minW = Math.min(...w);
  check('Carriageway at least 4.5 m everywhere (barrier chicanes excepted)', Math.min(...w.filter((_, i) => !chicaneMask[i])) >= 4.5, `min ${Math.min(...w.filter((_, i) => !chicaneMask[i])).toFixed(1)} m outside chicanes`);
  let gap = 0; for (let i = 0; i < N; i++) gap = Math.max(gap, Math.hypot(cx[(i + 1) % N] - cx[i], cz[(i + 1) % N] - cz[i]));
  check('Continuous (no gaps between samples)', gap < SP * 1.6, `max step ${gap.toFixed(2)} m`);
  let inB = 0; const inBAt: string[] = []; for (let i = 0; i < N; i++) if (insideBuilding(rx[i], rz[i])) { inB++; inBAt.push(`${cl[i].street}@${rx[i].toFixed(0)},${rz[i].toFixed(0)}${cl[i].junction ? "J" : ""}`); }
  if (inB) console.log("  in-building:", inBAt.join(" "));
  check('Racing line never enters a mapped building', inB === 0, `${inB} samples inside buildings`);
  check('Carriageway edges clear of building frontages', (rep.frontageOverlaps ?? 0) <= N * 0.03, `${rep.frontageOverlaps ?? 0} of ${2 * N} edge samples limited by OSM footprint overlap`);

  // 7. start/finish and pit lane placement: search the sfStreet run for the clearest straight side
  const PIT_LEN = def.pitLength ?? 300, PIT_TAPER = 50;
  const stIdx = cl.map((p, i) => (def.sfStreets.includes(p.street) ? i : -1)).filter((i) => i >= 0);
  if (!stIdx.length) throw new Error(`${def.id}: sfStreets not on route`);
  let best: any = null;
  const half = Math.round(PIT_LEN / 2 / SP), taper = Math.round(PIT_TAPER / SP);
  const site = pitSites.get(def.id);
  let candidates = stIdx;
  if (site) { // variants keep the physical pit site of the original layout
    let bi = 0, bd = Infinity; for (let i = 0; i < N; i++) { const d = Math.hypot(cx[i] - site.x, cz[i] - site.z); if (d < bd) { bd = d; bi = i; } }
    candidates = [bi];
  }
  for (let ci = 0; ci < candidates.length; ci += site ? 1 : 2) {
    const c = candidates[ci];
    const sides = site ? [((cnx[c] * site.nx + cnz[c] * site.nz) > 0 ? 1 : -1) * site.side] : [1, -1];
    for (const side of sides) for (const kerb of site ? [site.kerb] : [false, true]) {
      let conflicts = 0, curv = 0;
      const path: number[][] = [];
      for (let d = -half - taper; d <= half + taper; d++) {
        const i = (c + d + N) % N;
        const ramp = d < -half ? (d + half + taper) / taper : d > half ? (half + taper - d) / taper : 1;
        const o = kerb ? side * (w[i] / 2 - 1.9 * ramp) : side * (w[i] / 2 + 2 + 3.5 * ramp) * (0.35 + 0.65 * ramp);
        const x = cx[i] + cnx[i] * o, z = cz[i] + cnz[i] * o;
        path.push([x, z]);
        if (Math.abs(d) <= half) {
          if (insideBuilding(x, z)) conflicts++;
          const gx = cx[i] + cnx[i] * (o + side * (kerb ? 2.5 : 5)), gz = cz[i] + cnz[i] * (o + side * (kerb ? 2.5 : 5));
          if (insideBuilding(gx, gz)) conflicts += 0.5; // garages / pit wall behind the lane
          curv += Math.abs(kC[i]);
        }
      }
      const pref = site ? 0 : Math.abs(ci / stIdx.length - def.sfAt);
      const score = conflicts * 3 + curv * 400 + pref * 30 + (kerb ? 60 : 0);
      if (!best || score < best.score) best = { score, c, side, conflicts, curv, path, kerb };
    }
  }
  if (!site) pitSites.set(def.id, { x: cx[best.c], z: cz[best.c], nx: cnx[best.c], nz: cnz[best.c], side: best.side, kerb: best.kerb });
  if (best.kerb) { for (let d = -half; d <= half; d++) { const i = (best.c + d + N) % N; w[i] = Math.max(4.8, w[i] - 3.6); cx[i] -= cnx[i] * best.side * 1.8; cz[i] -= cnz[i] * best.side * 1.8; off[i] = Math.max(-(w[i] / 2 - 1.3), Math.min(w[i] / 2 - 1.3, off[i])); } }
  check('Pit lane arrangement', true, best.kerb ? 'kerbside pit lane inside the carriageway behind a temporary wall; racing width reduced by 3.6 m alongside it' : 'separate temporary pit lane beside the carriageway');
  check('Pit lane corridor clear of mapped buildings', best.conflicts <= 6, `${best.conflicts} conflicting samples on the chosen side`);
  // rotate so the start/finish line (just after the pit box area) is s = 0
  const sfIdx = (best.c + Math.round(half * 0.25)) % N;
  const rot = <T,>(a: T[]) => [...a.slice(sfIdx), ...a.slice(0, sfIdx)];
  const R = { chic: rot(chicaneMask), cx: rot(cx), cz: rot(cz), w: rot(w), y: rot(y), grade: rot(grade), kR: rot(kR), kC: rot(kC), off: rot(off), street: rot(cl.map((p) => p.street)) };
  const pitEntryIdx = ((best.c - half - taper - sfIdx) % N + N) % N;
  const pitExitIdx = ((best.c + half + taper - sfIdx) % N + N) % N;
  check('Pit entry before and exit after the start/finish line', pitEntryIdx > N / 2 && pitExitIdx < N / 2, `entry s=${(pitEntryIdx * SP).toFixed(0)} exit s=${(pitExitIdx * SP).toFixed(0)} (lap ${(N * SP).toFixed(0)} m)`);

  // 8. corners
  const corners: any[] = [];
  const K_T = 1 / 160;
  let i0 = -1;
  const absK = R.kR.map(Math.abs);
  // find a start index on a straight to avoid splitting a corner at s=0
  let start = absK.findIndex((v) => v < K_T * 0.5); if (start < 0) start = 0;
  let inC = false, cs = 0;
  for (let t = 0; t <= N; t++) {
    const i = (start + t) % N;
    if (!inC && absK[i] > K_T) { inC = true; cs = i; }
    else if (inC && (absK[i] < K_T * 0.7 || t === N)) {
      inC = false;
      const idx: number[] = []; for (let j = cs; j !== i; j = (j + 1) % N) idx.push(j);
      if (idx.length < 2) continue;
      let apex = idx[0]; for (const j of idx) if (absK[j] > absK[apex]) apex = j;
      const angle = idx.reduce((s, j) => s + R.kR[j] * SP, 0);
      if (Math.abs(angle) < 0.3) continue; // ignore gentle kinks under ~17 degrees
      corners.push({ s0: cs * SP, sApex: apex * SP, s1: i * SP, radius: +(1 / absK[apex]).toFixed(1), angle: +((angle * 180) / Math.PI).toFixed(0), dir: R.kR[apex] > 0 ? 'R' : 'L', street: R.street[apex], apexIdx: apex, chicane: R.chic[apex] });
      void i0;
    }
  }
  // explicit entries for barrier chicanes whose lobes fall under the corner threshold
  for (let i = 0; i < N; i++) {
    if (!R.chic[i] || R.chic[(i - 1 + N) % N]) continue;
    let j = i; while (R.chic[(j + 1) % N] && j - i < 40) j++;
    if (corners.some((c) => c.sApex >= i * SP - 8 && c.sApex <= j * SP + 8)) continue;
    let apex = i; for (let t = i; t <= j; t++) if (absK[t % N] > absK[apex % N]) apex = t;
    corners.push({ s0: i * SP, sApex: (apex % N) * SP, s1: (j % N) * SP, radius: +(1 / absK[apex % N]).toFixed(1), angle: 0, dir: 'S', street: R.street[apex % N], apexIdx: apex % N, chicane: true });
  }
  corners.sort((a, b) => a.sApex - b.sApex);
  // names
  const used2 = new Map<string, number>();
  for (const c of corners) {
    let name = '';
    for (const [lid, label] of LANDMARK_CORNER_NAMES) { const lm = landmarks.find((l) => l.id === lid); if (lm && Math.hypot(lm.x - R.cx[c.apexIdx], lm.z - R.cz[c.apexIdx]) < 75) { name = label; break; } }
    if (!name) {
      const before = R.street[(c.apexIdx - 8 + N) % N], after = R.street[(c.apexIdx + 8) % N];
      const clean = (s: string) => s.replace(/ (Street|Road|Lane|Hill|Drive)$/, '').replace(/ Roundabout$/, ' Roundabout');
      if (after && before !== after && after !== 'A1081' && after !== 'A5183') name = clean(after);
      else if (before && /Roundabout/.test(before)) name = before.replace(' Roundabout', '');
      else name = clean(c.street || before || after || 'Link') + (Math.abs(c.angle) > 60 ? ' Corner' : ' Bend');
    }
    if (c.chicane) name = (c.street || '').replace(/ (Street|Road|Lane|Hill|Drive)$/, '') + ' Chicane';
    {
    }
    name = def.cornerNames?.[name] ?? name;
    const k = used2.get(name) ?? 0; used2.set(name, k + 1);
    c.name = k ? `${name} ${k + 1}` : name;
    delete c.apexIdx;
  }
  // 9. sectors at ~1/3 and ~2/3 snapped to the straightest nearby sample
  const snap = (target: number) => { let bi = target, bv = Infinity; for (let d = -25; d <= 25; d++) { const i = (target + d + N) % N; if (absK[i] < bv) { bv = absK[i]; bi = i; } } return bi * SP; };
  const sectors = [snap(Math.round(N / 3)), snap(Math.round((2 * N) / 3))];
  // 10. character metrics
  const L = N * SP;
  let longest = 0, run = 0; for (let t = 0; t < 2 * N; t++) { if (absK[t % N] < 1 / 400) { run += SP; longest = Math.max(longest, run); } else run = 0; }
  longest = Math.min(longest, L);
  const narrowFrac = w.filter((v) => v < 7).length / N;
  let climb = 0; for (let i = 0; i < N; i++) climb += Math.max(0, R.y[(i + 1) % N] - R.y[i]);
  const metrics = {
    lengthM: Math.round(L), corners: corners.length, minWidth: +Math.min(...w).toFixed(1), avgWidth: +(w.reduce((a, b) => a + b, 0) / N).toFixed(1),
    narrowPct: Math.round(narrowFrac * 100), maxGradePct: +(maxGrade * 100).toFixed(1), climbM: Math.round(climb), elevRangeM: Math.round(Math.max(...y) - Math.min(...y)),
    longestStraightM: Math.round(longest), minRadiusM: +rMin.toFixed(1), slowCorners: corners.filter((c) => c.radius < 25).length, fastCorners: corners.filter((c) => c.radius > 80).length,
  };
  rep.metrics = metrics;
  const streetsRuns: any[] = [];
  for (let i = 0; i < N; i++) { const s = R.street[i]; if (!streetsRuns.length || streetsRuns[streetsRuns.length - 1].name !== s) streetsRuns.push({ name: s, s0: i * SP, s1: i * SP }); streetsRuns[streetsRuns.length - 1].s1 = (i + 1) * SP; }
  const nearLm = landmarks.filter((l) => { for (let i = 0; i < N; i += 3) if (Math.hypot(l.x - R.cx[i], l.z - R.cz[i]) < 120) return true; return false; }).map((l) => l.id);

  const r1 = (a: number[]) => a.map((v) => Math.round(v * 10) / 10);
  const r3 = (a: number[]) => a.map((v) => Math.round(v * 100000) / 100000);
  const pitPath = best.path.map(([x, z]: number[]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
  const out = {
    id: `${def.id}-${variant.key}`, circuitId: def.id, variant: variant.key, label: variant.label, name: def.name + (variant.key === 'v1' ? '' : ` (${variant.label})`), short: def.short,
    reverse: !!variant.reverse, character: def.character, note: variant.note, fictionalModifications: fictional, surface1920: def.surfaceEra1920,
    spacing: SP, length: L, x: r1(R.cx), z: r1(R.cz), y: r1(R.y), w: r1(R.w), k: r3(R.kR), rl: r1(R.off),
    corners, sectors, streets: streetsRuns.filter((r) => r.s1 - r.s0 > 20), landmarks: nearLm,
    pit: { entryS: pitEntryIdx * SP, exitS: pitExitIdx * SP, side: best.side, kerb: best.kerb, path: pitPath, length: Math.round(PIT_LEN + 2 * PIT_TAPER), fictional: best.kerb ? 'Temporary kerbside pit lane walled off inside the carriageway (fictional racing modification).' : 'Temporary pit lane and paddock beside the road (fictional racing modification).' },
    metrics, validation: rep.checks,
  };
  circuitsOut.push(out);
  const ok = rep.checks.every((c: any) => c.ok);
  reportLines.push(`### ${out.name} \`${out.id}\` — ${ok ? 'VALID' : 'CHECK FAILURES'}\n`);
  reportLines.push(`Length ${metrics.lengthM} m · ${metrics.corners} corners · width ${metrics.minWidth}–${metrics.avgWidth} m avg · elevation range ${metrics.elevRangeM} m, max grade ${metrics.maxGradePct}% · longest straight ${metrics.longestStraightM} m · tightest radius ${metrics.minRadiusM} m\n`);
  reportLines.push(`Streets: ${rep.streets.join(', ')}\n`);
  reportLines.push(`Corners: ${corners.map((c) => `${c.name} (${c.dir}, r≈${c.radius} m, ${c.angle}°)`).join('; ')}\n`);
  reportLines.push('| Check | Result | Detail |\n|---|---|---|');
  for (const c of rep.checks) reportLines.push(`| ${c.name} | ${c.ok ? 'pass' : '**FAIL**'} | ${c.detail} |`);
  reportLines.push('');
  if (fictional.length) reportLines.push(`Fictional racing modifications: ${fictional.join(' ')}\n`);
  console.log(out.id, ok ? 'VALID' : 'FAIL', JSON.stringify(metrics), rep.checks.filter((c: any) => !c.ok).map((c: any) => c.name + ': ' + c.detail).join('; '));
}

for (const def of CIRCUITS) for (const v of def.variants) buildVariant(def, v);

// ---------------------------------------------------------------- write outputs
fs.mkdirSync('public/data', { recursive: true });
fs.mkdirSync('src/data', { recursive: true });
fs.mkdirSync('docs', { recursive: true });
const terrainOut = { x0: BOUNDS.x0, z0: BOUNDS.z0, step: TSTEP, nx: tnx, nz: tnz, h: Array.from(th, (v) => Math.round(v * 10)) };
const city = {
  origin: ORIGIN, bounds: BOUNDS, units: 'decimetres (x east, z south of the origin)',
  roadClasses: ROAD_CLS, buildingKinds: BKIND, areaKinds: AKIND, names,
  terrain: terrainOut, roads, buildings, areas, waterways, rail, trees, landmarks,
  attribution: 'Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL) — openstreetmap.org/copyright. Elevation: Terrain Tiles on AWS (Mapzen/Tilezen terrarium encoding; SRTM-derived in this area, NASA/USGS).',
  extractedAt: new Date().toISOString().slice(0, 10),
};
fs.writeFileSync('public/data/stalbans-city.json', JSON.stringify(city));
fs.writeFileSync('src/data/circuits.json', JSON.stringify({ attribution: city.attribution, terrainNote: 'Track elevations from SRTM-derived terrain, smoothed along the route.', layouts: circuitsOut }));
fs.writeFileSync('src/data/terrain.json', JSON.stringify(terrainOut));
const md = `# Circuit derivation and validation report\n\nGenerated by \`tools/build-map.ts\` from OpenStreetMap data (© OpenStreetMap contributors, ODbL) and SRTM-derived terrain tiles.\nEach circuit is routed through the real drivable street graph between named junctions; nothing below is a claim about historical racing in St Albans.\n\n${reportLines.join('\n')}\n`;
fs.writeFileSync('docs/CIRCUITS.md', md);
console.log('city: roads', roads.length, 'buildings', buildings.length, 'areas', areas.length, 'trees', trees.length / 2, 'landmarks', landmarks.length);
console.log('sizes', (fs.statSync('public/data/stalbans-city.json').size / 1e6).toFixed(2), 'MB city,', (fs.statSync('src/data/circuits.json').size / 1e3).toFixed(0), 'KB circuits');
