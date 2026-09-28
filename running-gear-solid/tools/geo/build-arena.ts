// Build a GPS-accurate arena from real map data.
//
//   npx tsx tools/geo/build-arena.ts <arena|all> [--dry]
//
// 1. Load the Strava GPS course(s) for the arena (src/data/gps/*.json).
// 2. Download OpenStreetMap data (API 0.6 /map, small cached tiles) in a
//    corridor around the course. Data (c) OpenStreetMap contributors, ODbL.
// 3. Download AWS Terrain Tiles (Terrarium) and build a smoothed ground grid.
// 4. Map-match the GPS trace onto the OSM paths/roads so corners, laps and
//    out-and-backs follow the real geometry.
// 5. Write public/arenas/<arena>.json (+ .height.bin): local metres, x = east,
//    z = south, origin at the course start.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sax from 'sax';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OSM_DIR = path.join(ROOT, 'assets-src', 'osm');
const TER_DIR = path.join(ROOT, 'assets-src', 'terrain');
const OUT_DIR = path.join(ROOT, 'public', 'arenas');

interface ArenaDef { gps: string[]; buffer: number; note: string }
export const ARENAS: Record<string, ArenaDef> = {
  finsbury: { gps: ['finsbury-parkrun'], buffer: 420, note: 'Finsbury Park: parkrun course, athletics track (5000s)' },
  regents: { gps: ['first-run', 'regents-park-10k'], buffer: 220, note: "Camden / Regent's Park: first run, 10K PB" },
  hackney: { gps: ['hackney-half'], buffer: 170, note: 'Hackney Half (Olympic Park start/finish)' },
  gnr: { gps: ['great-north-run'], buffer: 170, note: 'Great North Run: Newcastle, Tyne Bridge, South Shields' },
  'royal-parks': { gps: ['royal-parks-half'], buffer: 170, note: 'Royal Parks Half: Hyde Park, Whitehall, Kensington Gardens' },
  vienna: { gps: ['vienna-parkrun'], buffer: 300, note: 'Vienna Donaupark parkrun' },
  'victoria-dock': { gps: ['victoria-dock'], buffer: 380, note: 'Royal Victoria Dock parkrun' },
  battersea: { gps: ['battersea-10k'], buffer: 260, note: 'Battersea Park 10K' },
  lordship: { gps: ['lordship-parkrun'], buffer: 260, note: 'Lordship Rec parkrun' },
  richmond: { gps: ['richmond-marathon'], buffer: 170, note: 'Richmond Runfest Marathon: Thames towpath' },
  highgate: { gps: ['highgate-claw'], buffer: 200, note: 'Highgate hills (The Claw)' },
  'robin-hood': { gps: ['robin-hood-half'], buffer: 160, note: 'Robin Hood Half, Nottingham' },
  'st-albans': { gps: ['st-albans-half', 'st-albans-parkrun', 'striders-festive-5k'], buffer: 170, note: 'St Albans: half, Verulamium parkrun, Striders 5K' },
  bath: { gps: ['bath-half'], buffer: 160, note: 'Bath Half' },
  manchester: { gps: ['manchester-marathon'], buffer: 160, note: 'Manchester Marathon' },
  chippenham: { gps: ['chippenham-half'], buffer: 160, note: 'Chippenham Half' },
};

// ------------------------------------------------------------------ helpers
const R = 6378137;
const DEG = Math.PI / 180;
type LL = [number, number];

function loadGps(name: string): LL[] {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'gps', name + '.json'), 'utf8'));
  if (j.latlng) return j.latlng;
  if (j.lat) return j.lat.map((la: number, i: number) => [la, j.lng[i]]);
  if (j.track) return j.track.lapLatlng;
  throw new Error('no coordinates in ' + name);
}

function makeProj(lat0: number, lon0: number) {
  const k = Math.cos(lat0 * DEG) * DEG * R;
  return {
    fwd: (lat: number, lon: number): [number, number] => [(lon - lon0) * k, -(lat - lat0) * DEG * R],
    inv: (x: number, z: number): LL => [lat0 - z / (DEG * R), lon0 + x / k],
  };
}

const TLAT = 0.004, TLON = 0.006;
function tilesFor(route: LL[], bufferM: number) {
  const set = new Set<string>();
  for (const [la, lo] of route) {
    const dla = bufferM / (DEG * R), dlo = bufferM / (DEG * R * Math.cos(la * DEG));
    for (let a = Math.floor((la - dla) / TLAT); a <= Math.floor((la + dla) / TLAT); a++)
      for (let o = Math.floor((lo - dlo) / TLON); o <= Math.floor((lo + dlo) / TLON); o++) set.add(`${a}_${o}`);
  }
  return [...set];
}

function curl(url: string, out: string) {
  for (let n = 0; n < 5; n++) {
    const r = spawnSync('curl', ['-sS', '-f', '-m', '180', '-o', out + '.part', url], { stdio: ['ignore', 'ignore', 'pipe'] });
    if (r.status === 0) {
      fs.renameSync(out + '.part', out);
      return true;
    }
    const err = String(r.stderr);
    if (/ 400| 509/.test(err)) return false; // too many nodes: caller splits
    spawnSync('sleep', [String(2 ** (n + 1))]);
  }
  return false;
}

function fetchOsmTile(key: string) {
  const [a, o] = key.split('_').map(Number);
  const file = path.join(OSM_DIR, `t_${key}.osm`);
  if (fs.existsSync(file)) return [file];
  const bbox = (s: number, w: number, n: number, e: number) => `${w.toFixed(5)},${s.toFixed(5)},${e.toFixed(5)},${n.toFixed(5)}`;
  const s = a * TLAT, w = o * TLON;
  if (curl(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox(s, w, s + TLAT, w + TLON)}`, file)) {
    spawnSync('sleep', ['1']);
    return [file];
  }
  // dense tile: split into quarters
  const files: string[] = [];
  for (const [ds, dw] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
    const f = path.join(OSM_DIR, `t_${key}_${ds}_${dw}.osm`);
    if (!fs.existsSync(f)) {
      const ss = s + ds * TLAT, ww = w + dw * TLON;
      if (!curl(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox(ss, ww, ss + TLAT / 2, ww + TLON / 2)}`, f)) throw new Error('OSM tile failed ' + key);
      spawnSync('sleep', ['1']);
    }
    files.push(f);
  }
  return files;
}

interface ONode { lat: number; lon: number; tags?: Record<string, string> }
interface OWay { nodes: number[]; tags: Record<string, string> }
interface ORel { members: { type: string; ref: number; role: string }[]; tags: Record<string, string> }
function parseOsm(files: string[]) {
  const nodes = new Map<number, ONode>(), ways = new Map<number, OWay>(), rels = new Map<number, ORel>();
  for (const file of files) {
    const p = sax.parser(true, {});
    let cur: any = null;
    p.onopentag = (t: any) => {
      const a = t.attributes;
      if (t.name === 'node') cur = { k: 'n', id: +a.id, v: { lat: +a.lat, lon: +a.lon } };
      else if (t.name === 'way') cur = { k: 'w', id: +a.id, v: { nodes: [], tags: {} } };
      else if (t.name === 'relation') cur = { k: 'r', id: +a.id, v: { members: [], tags: {} } };
      else if (t.name === 'nd' && cur?.k === 'w') cur.v.nodes.push(+a.ref);
      else if (t.name === 'member' && cur?.k === 'r') cur.v.members.push({ type: a.type, ref: +a.ref, role: a.role });
      else if (t.name === 'tag' && cur) (cur.v.tags ??= {})[a.k] = a.v;
    };
    p.onclosetag = (name: string) => {
      if (!cur || !['node', 'way', 'relation'].includes(name)) return;
      if (cur.k === 'n') nodes.set(cur.id, cur.v);
      else if (cur.k === 'w') {
        const prev = ways.get(cur.id);
        if (!prev || prev.nodes.length < cur.v.nodes.length) ways.set(cur.id, cur.v);
      } else rels.set(cur.id, cur.v);
      cur = null;
    };
    p.write(fs.readFileSync(file, 'utf8')).close();
  }
  return { nodes, ways, rels };
}

// ------------------------------------------------------------------ terrain
const TZ = 15, TN = 2 ** TZ;
const tpx = (lat: number, lon: number): [number, number] => [((lon + 180) / 360) * TN * 256, ((1 - Math.asinh(Math.tan(lat * DEG)) / Math.PI) / 2) * TN * 256];
const terrainCache = new Map<string, Float32Array | null>();
function terrainTile(x: number, y: number) {
  const key = `${x}_${y}`;
  if (terrainCache.has(key)) return terrainCache.get(key)!;
  const f = path.join(TER_DIR, `${TZ}_${x}_${y}.png`);
  if (!fs.existsSync(f)) curl(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TZ}/${x}/${y}.png`, f);
  if (!fs.existsSync(f)) {
    terrainCache.set(key, null);
    return null;
  }
  const png = PNG.sync.read(fs.readFileSync(f));
  const h = new Float32Array(256 * 256);
  for (let i = 0; i < h.length; i++) h[i] = png.data[i * 4] * 256 + png.data[i * 4 + 1] + png.data[i * 4 + 2] / 256 - 32768;
  terrainCache.set(key, h);
  return h;
}
function elevation(lat: number, lon: number) {
  const [fx, fy] = tpx(lat, lon);
  const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5), tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
  const s = (ix: number, iy: number) => {
    const t = terrainTile(Math.floor(ix / 256), Math.floor(iy / 256));
    return t ? t[(iy & 255) * 256 + (ix & 255)] : NaN;
  };
  return (s(x0, y0) * (1 - tx) + s(x0 + 1, y0) * tx) * (1 - ty) + (s(x0, y0 + 1) * (1 - tx) + s(x0 + 1, y0 + 1) * tx) * ty;
}

// ------------------------------------------------------------------ feature extraction
const r1 = (v: number) => Math.round(v * 10) / 10;

function roadKind(t: Record<string, string>): [string, number] | null {
  const h = t.highway;
  if (!h) return null;
  const table: Record<string, [string, number]> = {
    motorway: ['major', 14], trunk: ['major', 12], primary: ['major', 11], secondary: ['major', 10], tertiary: ['road', 8.5],
    motorway_link: ['major', 7], trunk_link: ['major', 7], primary_link: ['road', 7], secondary_link: ['road', 7], tertiary_link: ['road', 6.5],
    unclassified: ['road', 6.5], residential: ['road', 7], living_street: ['road', 5.5], service: ['service', 4.5], busway: ['road', 7],
    pedestrian: ['pedestrian', 6], footway: ['path', 2.2], path: ['path', 2.0], cycleway: ['path', 2.6], bridleway: ['path', 2.4],
    track: ['track', 3], steps: ['steps', 2], corridor: ['path', 2],
  };
  const k = table[h];
  if (!k) return null;
  let w = k[1];
  if (t.width && !isNaN(parseFloat(t.width))) w = Math.min(30, Math.max(1.2, parseFloat(t.width)));
  else if (t.lanes && k[0] !== 'path') w = Math.max(w, parseInt(t.lanes) * 3.2);
  return [k[0], w];
}

function areaKind(t: Record<string, string>): string | null {
  if (t.building || t['building:part']) return null;
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin' || t.water) return 'water';
  if (t.leisure === 'track' || t.leisure === 'sports_centre' && t.sport === 'athletics') return 'track';
  if (t.leisure === 'pitch') return 'pitch';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'common' || t.leisure === 'recreation_ground' || t.landuse === 'recreation_ground' || t.leisure === 'golf_course' || t.leisure === 'nature_reserve') return 'park';
  if (t.landuse === 'grass' || t.landuse === 'meadow' || t.natural === 'grassland' || t.landuse === 'village_green' || t.natural === 'heath') return 'grass';
  if (t.landuse === 'forest' || t.natural === 'wood' || t.natural === 'scrub') return 'wood';
  if (t.landuse === 'cemetery' || t.amenity === 'grave_yard') return 'cemetery';
  if (t.landuse === 'allotments' || t.landuse === 'farmland' || t.landuse === 'orchard') return 'farmland';
  if (t.amenity === 'parking' || t.area === 'yes' && t.highway === 'pedestrian' || t.place === 'square') return 'paved';
  if (t.natural === 'sand' || t.natural === 'beach') return 'sand';
  if (t.leisure === 'playground') return 'playground';
  if (t.landuse === 'railway') return 'rail';
  if (t.landuse === 'industrial' || t.landuse === 'commercial' || t.landuse === 'retail' || t.landuse === 'construction' || t.landuse === 'brownfield') return 'urban';
  if (t.landuse === 'residential') return 'residential';
  return null;
}

function buildingHeight(t: Record<string, string>, area: number) {
  if (t.height && !isNaN(parseFloat(t.height))) return parseFloat(t.height);
  if (t['building:levels']) return parseFloat(t['building:levels']) * 3.1 + 1.5;
  const b = t.building;
  if (b === 'garage' || b === 'garages' || b === 'shed' || b === 'hut' || b === 'kiosk' || b === 'roof') return 3;
  if (b === 'church' || b === 'cathedral') return 16;
  if (b === 'house' || b === 'terrace' || b === 'semidetached_house' || b === 'detached') return 8.5;
  if (area > 3000) return 14;
  if (area > 800) return 11;
  return 8.5;
}

function ringArea(p: number[]) {
  let a = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return a / 2;
}

/** stitch relation member ways into closed rings */
function assembleRings(wayNodeLists: number[][]): number[][] {
  const rings: number[][] = [];
  const pool = wayNodeLists.map((w) => [...w]);
  while (pool.length) {
    let ring = pool.shift()!;
    let guard = 0;
    while (ring[0] !== ring[ring.length - 1] && guard++ < 1000) {
      const end = ring[ring.length - 1];
      const i = pool.findIndex((w) => w[0] === end || w[w.length - 1] === end);
      if (i < 0) break;
      const w = pool.splice(i, 1)[0];
      ring = ring.concat(w[0] === end ? w.slice(1) : w.reverse().slice(1));
    }
    if (ring.length > 3 && ring[0] === ring[ring.length - 1]) rings.push(ring);
  }
  return rings;
}

// ------------------------------------------------------------------ map matching
interface Seg { way: number; i: number; ax: number; az: number; bx: number; bz: number }
function snapRoute(routeXZ: [number, number][], wayPts: Map<number, [number, number][]>, maxDist = 14) {
  const cell = 40;
  const grid = new Map<string, Seg[]>();
  for (const [id, pts] of wayPts) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const s: Seg = { way: id, i, ax, az, bx, bz };
      const x0 = Math.floor(Math.min(ax, bx) / cell), x1 = Math.floor(Math.max(ax, bx) / cell);
      const z0 = Math.floor(Math.min(az, bz) / cell), z1 = Math.floor(Math.max(az, bz) / cell);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = `${x}_${z}`;
        (grid.get(k) ?? grid.set(k, []).get(k)!).push(s);
      }
    }
  }
  // densify GPS to ~6 m
  const dense: [number, number][] = [];
  for (let i = 0; i < routeXZ.length - 1; i++) {
    const [ax, az] = routeXZ[i], [bx, bz] = routeXZ[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 6));
    for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  dense.push(routeXZ[routeXZ.length - 1]);
  const matches = dense.map(([x, z], idx) => {
    let best: { d: number; s: Seg; t: number } | null = null;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    // heading of the GPS trace here, to prefer segments running the same way
    const [px, pz] = dense[Math.max(0, idx - 2)], [nx, nz] = dense[Math.min(dense.length - 1, idx + 2)];
    const hx = nx - px, hz = nz - pz, hl = Math.hypot(hx, hz) || 1;
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      for (const s of grid.get(`${gx}_${gz}`) ?? []) {
        const vx = s.bx - s.ax, vz = s.bz - s.az, l2 = vx * vx + vz * vz || 1;
        const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / l2));
        const qx = s.ax + vx * t, qz = s.az + vz * t;
        const align = Math.abs((vx * hx + vz * hz) / (Math.sqrt(l2) * hl));
        const d = Math.hypot(x - qx, z - qz) + (1 - align) * 6;
        if (d < maxDist && (!best || d < best.d)) best = { d, s, t };
      }
    }
    return best;
  });
  // build output: snapped points, inserting way vertices when moving along one way
  const out: [number, number][] = [];
  let prev: (typeof matches)[number] = null;
  let snappedCount = 0;
  dense.forEach((p, i) => {
    const m = matches[i];
    if (!m) {
      out.push(p);
      prev = null;
      return;
    }
    snappedCount++;
    const q: [number, number] = [m.s.ax + (m.s.bx - m.s.ax) * m.t, m.s.az + (m.s.bz - m.s.az) * m.t];
    if (prev && prev.s.way === m.s.way && prev.s.i !== m.s.i && Math.abs(prev.s.i - m.s.i) < 40) {
      const pts = wayPts.get(m.s.way)!;
      if (m.s.i > prev.s.i) for (let k = prev.s.i + 1; k <= m.s.i; k++) out.push(pts[k]);
      else for (let k = prev.s.i; k > m.s.i; k--) out.push(pts[k]);
    }
    out.push(q);
    prev = m;
  });
  // drop duplicates / zero-length steps
  let clean: [number, number][] = [];
  for (const p of out) {
    const l = clean[clean.length - 1];
    if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 0.5) clean.push(p);
  }
  // remove junction spikes: short excursions that double straight back
  for (let pass = 0; pass < 4; pass++) {
    const keep: [number, number][] = [clean[0]];
    for (let i = 1; i < clean.length - 1; i++) {
      const a = keep[keep.length - 1], b = clean[i], c = clean[i + 1];
      const ux = b[0] - a[0], uz = b[1] - a[1], vx = c[0] - b[0], vz = c[1] - b[1];
      const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
      const cos = (ux * vx + uz * vz) / ((lu || 1) * (lv || 1));
      if ((cos < -0.5 && Math.min(lu, lv) < 12) || (cos < 0.1 && Math.min(lu, lv) < 7)) continue; // junction kinks: matching artefacts
      keep.push(b);
    }
    keep.push(clean[clean.length - 1]);
    clean = keep;
  }
  return { pts: clean, snapped: snappedCount / dense.length };
}

// ------------------------------------------------------------------ main
async function build(name: string, dry: boolean) {
  const def = ARENAS[name];
  if (!def) throw new Error('unknown arena ' + name);
  const courses = def.gps.map((g) => ({ name: g, ll: loadGps(g) }));
  const all = courses.flatMap((c) => c.ll);
  const [lat0, lon0] = courses[0].ll[0];
  const proj = makeProj(lat0, lon0);
  const tiles = tilesFor(all, def.buffer);
  console.log(`${name}: ${tiles.length} OSM tiles`);
  if (dry) return tiles.length;
  fs.mkdirSync(OSM_DIR, { recursive: true });
  fs.mkdirSync(TER_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = tiles.flatMap((t, i) => {
    if (i % 10 === 0) process.stdout.write(`  osm ${i}/${tiles.length}\r`);
    return fetchOsmTile(t);
  });
  const { nodes, ways, rels } = parseOsm(files);
  console.log(`  parsed ${nodes.size} nodes, ${ways.size} ways, ${rels.size} relations`);
  const xy = (id: number) => {
    const n = nodes.get(id);
    return n ? proj.fwd(n.lat, n.lon) : null;
  };
  const wayXZ = (w: OWay) => {
    const p: number[] = [];
    for (const id of w.nodes) {
      const q = xy(id);
      if (!q) return null;
      p.push(r1(q[0]), r1(q[1]));
    }
    return p;
  };

  // corridor test (keep features near the course)
  const routeXZ = all.map(([la, lo]) => proj.fwd(la, lo));
  const cell = 50;
  const near = new Set<string>();
  const reach = Math.ceil((def.buffer + 60) / cell);
  for (const [x, z] of routeXZ) {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) if (a * a + b * b <= reach * reach) near.add(`${cx + a}_${cz + b}`);
  }
  const isNear = (p: number[]) => {
    for (let i = 0; i < p.length; i += 2) if (near.has(`${Math.floor(p[i] / cell)}_${Math.floor(p[i + 1] / cell)}`)) return true;
    return false;
  };

  const roads: any[] = [], buildings: any[] = [], areas: any[] = [], water: any[] = [], rails: any[] = [], barriers: any[] = [], trees: number[] = [], labels: any[] = [];
  const walkable = new Map<number, [number, number][]>();
  const usedAsRelMember = new Set<number>();
  for (const [, r] of rels) {
    const t = r.tags;
    if (t.type !== 'multipolygon') continue;
    const kind = t.building ? 'building' : areaKind(t);
    if (!kind) continue;
    const outer = assembleRings(r.members.filter((m) => m.type === 'way' && m.role !== 'inner').map((m) => ways.get(m.ref)?.nodes ?? []).filter((n) => n.length));
    const inner = assembleRings(r.members.filter((m) => m.type === 'way' && m.role === 'inner').map((m) => ways.get(m.ref)?.nodes ?? []).filter((n) => n.length));
    const toXZ = (ring: number[]) => ring.map(xy).every(Boolean) ? ring.flatMap((id) => xy(id)!.map(r1)) : null;
    const holes = inner.map(toXZ).filter(Boolean) as number[][];
    for (const o of outer) {
      const p = toXZ(o);
      if (!p || !isNear(p)) continue;
      if (kind === 'building') buildings.push({ p, h: r1(buildingHeight(t, Math.abs(ringArea(p)))), t: t.building });
      else areas.push({ k: kind, p, holes: holes.length ? holes : undefined, n: t.name });
    }
    r.members.forEach((m) => m.type === 'way' && usedAsRelMember.add(m.ref));
  }
  for (const [id, w] of ways) {
    const t = w.tags;
    const p = wayXZ(w);
    if (!p || p.length < 4) continue;
    const closed = w.nodes[0] === w.nodes[w.nodes.length - 1];
    const nearHere = isNear(p);
    const rk = roadKind(t);
    if (rk && !(closed && t.area === 'yes')) {
      if (nearHere) roads.push({ k: rk[0], w: rk[1], p, b: t.bridge ? 1 : undefined, u: t.tunnel ? 1 : undefined, l: t.layer ? +t.layer : undefined, n: t.name });
      const pts: [number, number][] = [];
      for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
      walkable.set(id, pts);
      continue;
    }
    if (t.leisure === 'track' && !closed) {
      const pts: [number, number][] = [];
      for (let i = 0; i < p.length; i += 2) pts.push([p[i], p[i + 1]]);
      walkable.set(id, pts);
    }
    if (!nearHere) continue;
    if ((t.building || t['building:part']) && closed && !usedAsRelMember.has(id)) {
      buildings.push({ p: p.slice(0, -2), h: r1(buildingHeight(t, Math.abs(ringArea(p)))), m: t.min_height ? +t.min_height : undefined, t: t.building ?? t['building:part'], c: t['building:colour'], mat: t['building:material'] });
      continue;
    }
    if (t.waterway && !closed) {
      const ww = t.waterway === 'river' ? 25 : t.waterway === 'canal' ? 12 : t.waterway === 'stream' ? 3 : 0;
      if (ww) water.push({ k: t.waterway, w: ww, p });
      continue;
    }
    if (t.railway && ['rail', 'light_rail', 'subway', 'tram', 'narrow_gauge'].includes(t.railway) && !t.tunnel) {
      rails.push({ k: t.railway, p, b: t.bridge ? 1 : undefined });
      continue;
    }
    if (t.barrier && ['fence', 'wall', 'hedge', 'railing', 'retaining_wall'].includes(t.barrier)) {
      barriers.push({ k: t.barrier, p });
      continue;
    }
    if (t.natural === 'tree_row') {
      for (let i = 0; i < p.length; i += 2) trees.push(p[i], p[i + 1]);
      continue;
    }
    if (closed && !usedAsRelMember.has(id)) {
      const k = areaKind(t);
      if (k) areas.push({ k, p: p.slice(0, -2), n: t.name });
    }
  }
  for (const [, n] of nodes) {
    if (!n.tags) continue;
    const q = proj.fwd(n.lat, n.lon);
    if (!near.has(`${Math.floor(q[0] / cell)}_${Math.floor(q[1] / cell)}`)) continue;
    if (n.tags.natural === 'tree') trees.push(r1(q[0]), r1(q[1]));
    if (n.tags.name && (n.tags.tourism || n.tags.historic || n.tags.amenity === 'place_of_worship' || n.tags.leisure === 'stadium')) labels.push({ n: n.tags.name, x: r1(q[0]), z: r1(q[1]) });
  }

  // map-match each course
  const courseOut = courses.map((c) => {
    const xz = c.ll.map(([la, lo]) => proj.fwd(la, lo));
    const snap = snapRoute(xz, walkable);
    console.log(`  course ${c.name}: ${xz.length} gps pts -> ${snap.pts.length} matched pts (${Math.round(snap.snapped * 100)}% on OSM ways)`);
    return { name: c.name, gps: xz.flatMap((p) => p.map(r1)), p: snap.pts.flatMap((p) => p.map(r1)), snapped: Math.round(snap.snapped * 100) / 100 };
  });

  // terrain grid over the feature bounds (10 m), smoothed to remove building/tree noise
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of routeXZ) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const pad = def.buffer + 400;
  minX -= pad; minZ -= pad; maxX += pad; maxZ += pad;
  const dx = 10;
  const nx = Math.ceil((maxX - minX) / dx) + 1, nz = Math.ceil((maxZ - minZ) / dx) + 1;
  const raw = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const [la, lo] = proj.inv(minX + i * dx, minZ + j * dx);
    raw[j * nx + i] = elevation(la, lo);
  }
  const sm = new Float32Array(nx * nz);
  const K = 3;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    let s = 0, n = 0;
    for (let b = -K; b <= K; b++) for (let a = -K; a <= K; a++) {
      const ii = i + a, jj = j + b;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
      const v = raw[jj * nx + ii];
      if (!isNaN(v)) { s += v; n++; }
    }
    sm[j * nx + i] = n ? s / n : 0;
  }
  let hmin = Infinity;
  for (const v of sm) hmin = Math.min(hmin, v);
  const bin = new Int16Array(nx * nz);
  for (let k = 0; k < bin.length; k++) bin[k] = Math.round((sm[k] - hmin) * 10);
  fs.writeFileSync(path.join(OUT_DIR, `${name}.height.bin`), Buffer.from(bin.buffer));

  const out = {
    name,
    note: def.note,
    attribution: 'Map data (c) OpenStreetMap contributors (ODbL). Elevation: AWS Terrain Tiles (Mapzen/SRTM). Course: Strava GPS.',
    origin: [lat0, lon0],
    terrain: { x0: r1(minX), z0: r1(minZ), dx, nx, nz, base: r1(hmin) },
    courses: courseOut,
    roads, buildings, areas, water, rails, barriers, trees, labels,
  };
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(out));
  const kb = Math.round(fs.statSync(path.join(OUT_DIR, `${name}.json`)).size / 1024);
  console.log(`  -> ${name}.json ${kb} KB: ${roads.length} roads, ${buildings.length} buildings, ${areas.length} areas, ${water.length} waterways, ${trees.length / 2} trees; terrain ${nx}x${nz}`);
  return tiles.length;
}

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const which = args.filter((a) => !a.startsWith('--'));
const names = which[0] === 'all' || !which.length ? Object.keys(ARENAS) : which;
let total = 0;
for (const n of names) total += (await build(n, dry)) ?? 0;
console.log('total tiles', total);
