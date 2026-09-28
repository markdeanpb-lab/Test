// OSM building footprints -> extruded PBR buildings with procedural windows, shopfronts,
// gabled or flat roofs and chimneys. Geometry is merged per 128 m cell for culling.
import * as THREE from 'three';
import { ArenaData, Building } from './ArenaData';
import { hash, pbrArray } from '../engine/assets';

export const FACADE_TEX = ['brick_wall_02', 'brick_4', 'brick_wall_08', 'white_stucco', 'concrete_wall_003', 'plastered_wall_02', 'painted_brick', 'corrugated_iron'];
const FACADE_SCALE = [2.2, 2.0, 2.2, 3.0, 3.0, 3.0, 2.2, 2.0];
export const ROOF_TEX = ['grey_roof_tiles', 'roof_slates_02', 'clean_asphalt', 'concrete_pavement'];

const CELL = 128;
const HOUSE = new Set(['house', 'terrace', 'semidetached_house', 'detached', 'residential', 'bungalow']);
const SHED = new Set(['shed', 'garage', 'garages', 'roof', 'industrial', 'warehouse', 'hut', 'carport', 'greenhouse', 'service', 'storage_tank', 'container']);
const SHOP = new Set(['retail', 'commercial', 'office', 'supermarket', 'shop', 'kiosk']);

// kinds: 0 house, 1 apartments, 2 shop/commercial (shopfront ground floor), 3 shed/industrial (no windows), 4 civic (tall windows)
interface Style { facade: number; kind: number; floorH: number; tint: [number, number, number]; roof: number }

function styleFor(b: Building, idx: number, area: number): Style {
  const t = b.t ?? 'yes';
  const r = hash(idx, 7), r2 = hash(idx, 11);
  const v = 0.9 + 0.2 * hash(idx, 13);
  const tint: [number, number, number] = [v, v, v];
  if (SHED.has(t) || b.h < 3.2) return { facade: r < 0.5 ? 7 : 4, kind: 3, floorH: 3, tint: [v * 0.9, v * 0.92, v * 0.95], roof: 2 };
  if (['church', 'chapel', 'cathedral', 'school', 'university', 'college', 'civic', 'public', 'train_station', 'hospital'].includes(t))
    return { facade: r < 0.5 ? 1 : r < 0.8 ? 0 : 5, kind: 4, floorH: 4.2, tint, roof: 0 };
  if (SHOP.has(t)) return { facade: r < 0.3 ? 3 : r < 0.55 ? 0 : r < 0.75 ? 4 : r < 0.9 ? 6 : 5, kind: 2, floorH: 3.4, tint, roof: 2 };
  if (t === 'apartments' || (t === 'yes' && area > 600) || b.h > 14) {
    const f = r < 0.4 ? 0 : r < 0.6 ? 2 : r < 0.8 ? 4 : 1;
    return { facade: f, kind: 1, floorH: 2.9, tint, roof: 2 };
  }
  // London terraces: yellow stock brick, red brick, white stucco
  const f = r < 0.5 ? 0 : r < 0.72 ? 2 : r < 0.88 ? 1 : r < 0.96 ? 3 : 6;
  if (f === 6) tint.splice(0, 3, 0.95 * v, 0.9 * v, 0.82 * v);
  const roof = r2 < 0.8 ? 0 : 1;
  const kind = t === 'yes' && r2 > 0.85 ? 2 : 0;
  return { facade: f, kind, floorH: 2.9, tint, roof };
}

class GeoBuf {
  pos: number[] = [];
  nrm: number[] = [];
  uv: number[] = [];
  seg: number[] = []; // segLen, eave (walls) | 0,0 roofs
  sty: number[] = []; // facade/roof layer, seed, floorH, kind
  col: number[] = [];
  push(p: THREE.Vector3Like, n: THREE.Vector3Like, u: number, v: number, segLen: number, eave: number, s: Style, seed: number, layer: number) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.seg.push(segLen, eave);
    this.sty.push(layer, seed, s.floorH, s.kind);
    this.col.push(...s.tint);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aSeg', new THREE.Float32BufferAttribute(this.seg, 2));
    g.setAttribute('aSty', new THREE.Float32BufferAttribute(this.sty, 4));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
  get empty() {
    return this.pos.length === 0;
  }
}

function signedArea(p: number[]) {
  let s = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    s += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return s / 2;
}

/** Minimum-area bounding rectangle: centre, unit axis (long), half extents. */
function minRect(p: number[]) {
  const n = p.length / 2;
  let best = { area: Infinity, cx: 0, cz: 0, ux: 1, uz: 0, hu: 0, hv: 0 };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let ux = p[j * 2] - p[i * 2], uz = p[j * 2 + 1] - p[i * 2 + 1];
    const l = Math.hypot(ux, uz);
    if (l < 0.5) continue;
    ux /= l;
    uz /= l;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const a = p[k * 2] * ux + p[k * 2 + 1] * uz, b = -p[k * 2] * uz + p[k * 2 + 1] * ux;
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b);
    }
    const area = (a1 - a0) * (b1 - b0);
    if (area < best.area) {
      const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
      best = { area, cx: ca * ux - cb * uz, cz: ca * uz + cb * ux, ux, uz, hu: (a1 - a0) / 2, hv: (b1 - b0) / 2 };
    }
  }
  if (best.hv > best.hu) best = { ...best, ux: -best.uz, uz: best.ux, hu: best.hv, hv: best.hu };
  return best;
}

export class Buildings {
  readonly group = new THREE.Group();
  readonly wallMat: THREE.MeshStandardMaterial;
  readonly roofMat: THREE.MeshStandardMaterial;
  readonly uniforms: Record<string, THREE.IUniform>;

  private constructor(a: ArenaData, fac: { albedo: THREE.DataArrayTexture; normal: THREE.DataArrayTexture }, roof: { albedo: THREE.DataArrayTexture; normal: THREE.DataArrayTexture }, filter?: (b: Building, i: number) => boolean) {
    this.uniforms = {
      uAlb: { value: fac.albedo },
      uNrm: { value: fac.normal },
      uScale: { value: FACADE_SCALE.map((s) => 1 / s) },
      uNight: { value: 0 },
      uWet: { value: 0 },
    };
    this.wallMat = makeWallMaterial(this.uniforms);
    this.roofMat = makeRoofMaterial({ uAlb: { value: roof.albedo }, uNrm: { value: roof.normal }, uWet: this.uniforms.uWet });
    const cells = new Map<string, { w: GeoBuf; r: GeoBuf }>();
    a.j.buildings.forEach((b, i) => {
      if (filter && !filter(b, i)) return;
      let p = b.p.slice();
      if (p.length >= 4 && p[0] === p[p.length - 2] && p[1] === p[p.length - 1]) p = p.slice(0, -2);
      if (p.length < 6) return;
      let cx = 0, cz = 0;
      for (let k = 0; k < p.length; k += 2) {
        cx += p[k];
        cz += p[k + 1];
      }
      cx /= p.length / 2;
      cz /= p.length / 2;
      const key = `${Math.floor(cx / CELL)}_${Math.floor(cz / CELL)}`;
      let c = cells.get(key);
      if (!c) cells.set(key, (c = { w: new GeoBuf(), r: new GeoBuf() }));
      addBuilding(a, b, i, p, c.w, c.r);
    });
    for (const c of cells.values()) {
      if (!c.w.empty) {
        const m = new THREE.Mesh(c.w.build(), this.wallMat);
        m.castShadow = m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        this.group.add(m);
      }
      if (!c.r.empty) {
        const m = new THREE.Mesh(c.r.build(), this.roofMat);
        m.castShadow = m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        this.group.add(m);
      }
    }
  }

  static async create(a: ArenaData, filter?: (b: Building, i: number) => boolean) {
    const [fac, roof] = await Promise.all([pbrArray(FACADE_TEX), pbrArray(ROOF_TEX)]);
    return new Buildings(a, fac, roof, filter);
  }
}

function addBuilding(a: ArenaData, b: Building, idx: number, p: number[], W: GeoBuf, R: GeoBuf) {
  const n = p.length / 2;
  const sa = signedArea(p);
  const area = Math.abs(sa);
  if (area < 4) return;
  const st = styleFor(b, idx, area);
  const seed = hash(idx, 3);
  // ground under the footprint
  let gMin = Infinity, gMax = -Infinity;
  for (let k = 0; k < n; k++) {
    const h = a.heightAt(p[k * 2], p[k * 2 + 1]);
    gMin = Math.min(gMin, h);
    gMax = Math.max(gMax, h);
  }
  const base = gMin - 0.6 + (b.m ?? 0);
  const ground = gMax + (b.m ?? 0);
  const H = Math.max(2.5, b.h - (b.m ?? 0));
  // roof shape
  const rect = minRect(p);
  const rectangular = n <= 10 && area / (rect.hu * rect.hv * 4) > 0.84;
  const gable = rectangular && (st.kind === 0 || (st.kind === 4 && area < 900)) && rect.hv < 9;
  // terraces: narrow deep plots get the ridge across the plot (parallel to the street)
  const across = gable && rect.hu / rect.hv > 1.35 && st.kind === 0;
  const half = across ? rect.hu : rect.hv; // half-span perpendicular to the ridge
  const rise = gable ? Math.min(3.6, half * 0.62) : 0;
  const eave = gable ? Math.max(2.6, H - rise) : H;
  const top = ground + eave;
  const parapet = !gable && st.kind !== 3 ? 0.6 : 0;
  const ccw = sa > 0;
  const tmp = new THREE.Vector3(), nv = new THREE.Vector3();
  // walls
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const ax = p[k * 2], az = p[k * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    // outward normal
    const ox = ccw ? dz : -dz, oz = ccw ? -dx : dx;
    nv.set(ox, 0, oz);
    const y0 = base, y1 = top + parapet;
    const v0 = y0 - ground, v1 = y1 - ground;
    const quad = [
      [ax, y0, az, 0, v0],
      [bx, y0, bz, len, v0],
      [bx, y1, bz, len, v1],
      [ax, y1, az, 0, v1],
    ];
    // winding: (a0,b0,b1) faces (-dz,dx); flip when outward is the other way
    const order = ox === -dz && oz === dx ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    for (const o of order) {
      const q = quad[o];
      W.push(tmp.set(q[0], q[1], q[2]), nv, q[3], q[4], len, eave, st, seed, st.facade);
    }
  }
  if (gable) {
    const { cx, cz } = rect;
    // ridge axis r (unit), span axis s
    const rx = across ? -rect.uz : rect.ux, rz = across ? rect.ux : rect.uz;
    const hr = (across ? rect.hv : rect.hu) + 0.05, hs = half + 0.3;
    const sx = -rz, sz = rx;
    const ridgeY = top + rise;
    const P = (r: number, s: number, y: number) => new THREE.Vector3(cx + rx * r + sx * s, y, cz + rz * r + sz * s);
    const eY = top - 0.3 * (rise / half);
    for (const side of [-1, 1]) {
      const e0 = P(-hr, side * hs, eY), e1 = P(hr, side * hs, eY), r0 = P(-hr, 0, ridgeY), r1 = P(hr, 0, ridgeY);
      const nrm = new THREE.Vector3().subVectors(e1, e0).cross(new THREE.Vector3().subVectors(r0, e0)).normalize();
      const tri = nrm.y > 0 ? [e0, e1, r1, e0, r1, r0] : [e0, r1, e1, e0, r0, r1];
      if (nrm.y < 0) nrm.negate();
      const slope = Math.hypot(hs, rise);
      for (const v of tri) {
        const along = (v.x - cx) * rx + (v.z - cz) * rz;
        const up = v === r0 || v === r1 ? slope : 0;
        R.push(v, nrm, along, up, 0, 0, st, seed, st.roof);
      }
    }
    // gable end walls (triangles) use the facade material above the eave
    for (const end of [-1, 1]) {
      const g0 = P(end * (hr - 0.05), -half, top), g1 = P(end * (hr - 0.05), half, top), g2 = P(end * (hr - 0.05), 0, ridgeY);
      const nrm = new THREE.Vector3(rx * end, 0, rz * end);
      const f = new THREE.Vector3().subVectors(g1, g0).cross(new THREE.Vector3().subVectors(g2, g0));
      const tri = f.dot(nrm) > 0 ? [g0, g1, g2] : [g0, g2, g1];
      for (const v of tri) {
        const u = (v.x - cx) * sx + (v.z - cz) * sz + half;
        W.push(v, nrm, u, v.y - ground, half * 2, eave, st, seed, st.facade);
      }
    }
    // chimney stacks on the party walls / gable ends
    if (st.kind === 0 && hash(idx, 21) < 0.75) {
      for (const end of [-1, 1]) {
        if (hash(idx, 22 + end) < 0.35) continue;
        const c = P(end * (hr - 0.45), 0, ridgeY);
        box(W, c.x, c.z, rx, rz, 0.45, 0.35, ridgeY - 1.2, ridgeY + 1.1, st, seed, ground);
      }
    }
  } else {
    // flat roof (with parapet walls above)
    const contour: THREE.Vector2[] = [];
    for (let k = 0; k < n; k++) contour.push(new THREE.Vector2(p[k * 2], p[k * 2 + 1]));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const up = new THREE.Vector3(0, 1, 0);
    const y = top + (parapet ? 0.05 : 0);
    for (const t of tris) {
      const [i0, i1, i2] = t;
      const A = contour[i0], B = contour[i1], C = contour[i2];
      const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x); // x-z
      const ord = cross < 0 ? [A, B, C] : [A, C, B];
      for (const v of ord) R.push(tmp.set(v.x, y, v.y), up, v.x, v.y, 0, 0, st, seed, st.roof === 0 ? 2 : st.roof);
    }
    // inner face of the parapet
    if (parapet) {
      for (let k = 0; k < n; k++) {
        const j = (k + 1) % n;
        const ax = p[k * 2], az = p[k * 2 + 1], bx = p[j * 2], bz = p[j * 2 + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        const ix = ccw ? -dz : dz, iz = ccw ? dx : -dx;
        nv.set(ix, 0, iz);
        const quad = [[ax, top, az], [bx, top, bz], [bx, top + parapet, bz], [ax, top + parapet, az]];
        const order = ix === -dz && iz === dx ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const o of order) W.push(tmp.set(quad[o][0] + ix * 0.2, quad[o][1], quad[o][2] + iz * 0.2), nv, 0, -5, len, eave, st, seed, st.facade);
      }
    }
  }
}

function box(W: GeoBuf, cx: number, cz: number, ux: number, uz: number, hu: number, hv: number, y0: number, y1: number, st: Style, seed: number, ground: number) {
  const vx = -uz, vz = ux;
  const c = [
    [cx - ux * hu - vx * hv, cz - uz * hu - vz * hv],
    [cx + ux * hu - vx * hv, cz + uz * hu - vz * hv],
    [cx + ux * hu + vx * hv, cz + uz * hu + vz * hv],
    [cx - ux * hu + vx * hv, cz - uz * hu + vz * hv],
  ];
  const tmp = new THREE.Vector3(), nv = new THREE.Vector3();
  for (let k = 0; k < 4; k++) {
    const a = c[k], b = c[(k + 1) % 4];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / len, dz = (b[1] - a[1]) / len;
    // outward = centre -> edge midpoint
    const mx = (a[0] + b[0]) / 2 - cx, mz = (a[1] + b[1]) / 2 - cz;
    const sgn = mx * -dz + mz * dx > 0 ? 1 : -1;
    nv.set(-dz * sgn, 0, dx * sgn);
    const q = [[a[0], y0, a[1], 0], [b[0], y0, b[1], len], [b[0], y1, b[1], len], [a[0], y1, a[1], 0]];
    const ord = sgn > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    // negative eave => no windows on chimneys
    for (const o of ord) W.push(tmp.set(q[o][0], q[o][1], q[o][2]), nv, q[o][3], q[o][1] - ground, len, -1, st, seed, st.facade === 3 ? 0 : st.facade);
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const o of [0, 2, 1, 0, 3, 2]) W.push(tmp.set(c[o][0], y1, c[o][1]), up, 0, -5, 1, -1, st, seed, st.facade === 3 ? 0 : st.facade);
}

function makeWallMaterial(uniforms: Record<string, THREE.IUniform>) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSeg; attribute vec4 aSty; varying vec2 vSeg; varying vec4 vSty; varying vec2 vM; varying vec3 vWN;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSeg = aSeg; vSty = aSty; vM = uv; vWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uAlb, uNrm; uniform float uScale[8]; uniform float uNight, uWet;
        varying vec2 vSeg; varying vec4 vSty; varying vec2 vM; varying vec3 vWN;
        float h1(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float box2(vec2 p, vec2 a, vec2 b) { vec2 s = step(a, p) * step(p, b); return s.x * s.y; }
        float gRough; vec3 gN; float gEmis; float gMetal;`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        float layer = floor(vSty.x + 0.5);
        int li = int(layer);
        float sc = uScale[0];
        for (int i = 0; i < 8; i++) if (i == li) sc = uScale[i];
        vec2 tuv = vM * sc;
        vec4 A = texture(uAlb, vec3(tuv, layer));
        vec4 B = texture(uNrm, vec3(tuv, layer));
        vec3 alb = A.rgb;
        if (li == 6) alb = vec3(dot(alb, vec3(0.3, 0.5, 0.2))) * vec3(1.25, 1.2, 1.1);
        alb *= vColor.rgb;
        float rough = A.a;
        vec2 nxy = B.xy * 2.0 - 1.0;
        gEmis = 0.0; gMetal = 0.0;
        float seed = vSty.y, fh = vSty.z, kind = floor(vSty.w + 0.5);
        float segLen = vSeg.x, eave = vSeg.y;
        float u = vM.x, v = vM.y;
        // grime at the base, soot under the eaves
        alb *= mix(0.72, 1.0, smoothstep(-0.2, 1.2, v));
        if (eave > 0.0) alb *= mix(1.0, 0.82, smoothstep(eave - 1.5, eave, v));
        if (kind < 2.5 || kind > 3.5) {
          float spacing = kind > 3.5 ? 3.4 : kind > 0.5 ? 2.9 : 2.6;
          float nwin = floor((segLen - 0.9) / spacing);
          float margin = (segLen - nwin * spacing) * 0.5;
          float cu = (u - margin) / spacing;
          float ci = floor(cu), fu = fract(cu);
          float fl = floor(v / fh), fv = fract(v / fh);
          bool shop = kind > 1.5 && kind < 2.5 && fl < 0.5;
          float inCol = step(0.0, ci) * step(ci, nwin - 1.0);
          float below = step(v, eave - 0.35) * step(0.2, v);
          float ww = kind > 3.5 ? 0.5 : 0.44;
          float wv0 = kind > 3.5 ? 0.22 : 0.3, wv1 = kind > 3.5 ? 0.9 : 0.86;
          float win = 0.0, frame = 0.0, sill = 0.0;
          if (shop) {
            // shopfront glazing on the ground floor, fascia above
            float edge = step(0.6, u) * step(u, segLen - 0.6);
            win = edge * box2(vec2(u, v), vec2(0.0, 0.25), vec2(1e4, 2.7));
            float fascia = edge * box2(vec2(u, v), vec2(0.0, 2.8), vec2(1e4, 3.35));
            vec3 fc = vec3(h1(vec3(seed, 1, 2)), h1(vec3(seed, 3, 4)), h1(vec3(seed, 5, 6))) * 0.5 + 0.08;
            alb = mix(alb, fc, fascia);
            rough = mix(rough, 0.35, fascia);
            frame = edge * (box2(vec2(u, v), vec2(0.0, 0.2), vec2(1e4, 2.78)) - win);
          } else {
            vec2 q = vec2(fu, fv);
            win = inCol * below * box2(q, vec2(0.5 - ww * 0.5, wv0), vec2(0.5 + ww * 0.5, wv1));
            float fr = inCol * below * box2(q, vec2(0.5 - ww * 0.5 - 0.035, wv0 - 0.03), vec2(0.5 + ww * 0.5 + 0.035, wv1 + 0.03));
            frame = fr - win;
            sill = inCol * below * box2(q, vec2(0.5 - ww * 0.5 - 0.06, wv0 - 0.07), vec2(0.5 + ww * 0.5 + 0.06, wv0 - 0.03));
            // sash bar
            float bar = win * box2(q, vec2(0.0, (wv0 + wv1) * 0.5 - 0.012), vec2(1.0, (wv0 + wv1) * 0.5 + 0.012));
            frame = max(frame, bar); win *= 1.0 - bar;
          }
          float wid = h1(vec3(ci, fl, seed));
          // glass: dark, glossy, reflective; some windows show pale curtains
          vec3 glass = mix(vec3(0.02, 0.025, 0.03), vec3(0.34, 0.3, 0.26), step(0.78, wid) * 0.5);
          alb = mix(alb, glass, win);
          rough = mix(rough, 0.06, win);
          gMetal = win * 0.55;
          alb = mix(alb, kind > 0.5 && kind < 1.5 ? vec3(0.2) : vec3(0.82, 0.8, 0.75), frame * 0.95);
          rough = mix(rough, 0.5, frame);
          alb = mix(alb, vec3(0.7, 0.68, 0.62), sill);
          nxy *= 1.0 - max(win, frame);
          gEmis = win * step(1.0 - 0.35 * uNight, h1(vec3(ci * 1.7, fl * 3.1, seed + 0.5))) * uNight;
        }
        rough = mix(rough, 0.25, uWet);
        alb *= mix(1.0, 0.7, uWet);
        gRough = rough;
        vec3 T = normalize(vec3(-vWN.z, 0.0, vWN.x));
        gN = normalize(vWN + T * nxy.x * 0.8 + vec3(0.0, 1.0, 0.0) * nxy.y * 0.8);
        diffuseColor.rgb = alb;`,
      )
      .replace('#include <color_fragment>', '')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = gMetal;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * gEmis * 2.2;');
  };
  m.customProgramCacheKey = () => 'rm-wall';
  return m;
}

function makeRoofMaterial(uniforms: Record<string, THREE.IUniform>) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aSty; varying vec4 vSty; varying vec2 vM; varying vec3 vWN;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvSty = aSty; vM = uv; vWN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray uAlb, uNrm; uniform float uWet;
        varying vec4 vSty; varying vec2 vM; varying vec3 vWN; float gRough; vec3 gN;`,
      )
      .replace(
        '#include <map_fragment>',
        `float layer = floor(vSty.x + 0.5);
        vec2 tuv = vM / (layer < 1.5 ? 2.2 : 3.5);
        vec4 A = texture(uAlb, vec3(tuv, layer));
        vec4 B = texture(uNrm, vec3(tuv, layer));
        vec3 alb = A.rgb;
        if (layer > 0.5 && layer < 1.5) alb = vec3(dot(alb, vec3(0.333))) * vec3(0.55, 0.57, 0.62);
        if (layer > 1.5) alb *= 0.8;
        alb *= 0.85 + 0.3 * fract(sin(vSty.y * 91.7) * 43758.5);
        gRough = mix(A.a, 0.3, uWet);
        alb *= mix(1.0, 0.7, uWet);
        vec2 nxy = B.xy * 2.0 - 1.0;
        vec3 T = normalize(cross(vWN, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
        vec3 Bt = cross(T, vWN);
        gN = normalize(vWN + T * nxy.x + Bt * nxy.y);
        diffuseColor.rgb = alb;`,
      )
      .replace('#include <color_fragment>', '')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);');
  };
  m.customProgramCacheKey = () => 'rm-roof';
  return m;
}
