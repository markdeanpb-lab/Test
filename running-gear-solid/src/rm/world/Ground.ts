// Terrain: chunked heightfield (two LODs + skirts) with a splat-mapped PBR material.
// Land use and roads are rasterised from OSM into splat textures: a coarse map over the whole
// arena and a fine 0.125 m/px window around the current focus (re-rasterised as it moves).
import * as THREE from 'three';
import { ArenaData, line, ring } from './ArenaData';
import { pbrArray, hash } from '../engine/assets';

// splat layers (texture array order). 0 = base grass, implicit.
export const GROUND_TEX = ['leafy_grass', 'asphalt_02', 'concrete_pavement', 'worn_asphalt', 'gravel_road', 'brown_mud_leaves_01', 'clean_asphalt', 'sparse_grass'];
// metres covered by one texture repeat
const TEX_SCALE = [2.6, 7.0, 2.6, 6.0, 3.5, 3.0, 4.0, 3.2];

type Layer = 'asphalt' | 'pavement' | 'path' | 'gravel' | 'mud' | 'track';
// canvas A: rgb = asphalt, pavement, path ; canvas B: rgb = gravel, mud, track
const LAYER: Record<Layer, [number, string]> = {
  asphalt: [0, '#f00'],
  pavement: [0, '#0f0'],
  path: [0, '#00f'],
  gravel: [1, '#f00'],
  mud: [1, '#0f0'],
  track: [1, '#00f'],
};
const AREA_LAYER: Record<string, Layer | null> = {
  urban: 'pavement', paved: 'pavement', playground: 'pavement', rail: 'gravel', sand: 'gravel', wood: 'mud', water: 'mud', track: 'track',
  park: null, grass: null, pitch: null, cemetery: null, farmland: null, residential: null,
};
const ROAD_LAYER: Record<string, Layer> = { major: 'asphalt', road: 'asphalt', service: 'asphalt', pedestrian: 'pavement', path: 'path', track: 'gravel', steps: 'pavement' };

export interface SplatOptions {
  /** extra painting after OSM (course dressing, finish lines...) in world metres */
  paint?: (g: CanvasRenderingContext2D, layer: (l: Layer | 'grass') => void, paint: (kind: 'white' | 'yellow' | 'dark') => void) => void;
}

class Splat {
  readonly size: number;
  readonly cA: HTMLCanvasElement;
  readonly cB: HTMLCanvasElement;
  readonly cC: HTMLCanvasElement;
  readonly tA: THREE.CanvasTexture;
  readonly tB: THREE.CanvasTexture;
  readonly tC: THREE.CanvasTexture;
  x0 = 0;
  z0 = 0;
  span = 1;
  constructor(size: number) {
    this.size = size;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      return c;
    };
    this.cA = mk();
    this.cB = mk();
    this.cC = mk();
    const tx = (c: HTMLCanvasElement) => {
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.NoColorSpace;
      t.flipY = false;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.anisotropy = 1;
      return t;
    };
    this.tA = tx(this.cA);
    this.tB = tx(this.cB);
    this.tC = tx(this.cC);
  }

  draw(a: ArenaData, x0: number, z0: number, span: number, sun: THREE.Vector3, opts: SplatOptions) {
    this.x0 = x0;
    this.z0 = z0;
    this.span = span;
    const s = this.size / span;
    const gs = [this.cA, this.cB, this.cC].map((c) => {
      const g = c.getContext('2d')!;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#000';
      g.fillRect(0, 0, c.width, c.height);
      g.setTransform(s, 0, 0, s, -x0 * s, -z0 * s);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      return g;
    });
    const [gA, gB, gC] = gs;
    const pxm = 1 / s; // metres per pixel
    const inView = (p: number[], pad = 30) => {
      for (let i = 0; i < p.length; i += 2) if (p[i] > x0 - pad && p[i] < x0 + span + pad && p[i + 1] > z0 - pad && p[i + 1] < z0 + span + pad) return true;
      // polygon could contain the view: check bbox overlap
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (let i = 0; i < p.length; i += 2) {
        mnx = Math.min(mnx, p[i]); mxx = Math.max(mxx, p[i]); mnz = Math.min(mnz, p[i + 1]); mxz = Math.max(mxz, p[i + 1]);
      }
      return mxx > x0 && mnx < x0 + span && mxz > z0 && mnz < z0 + span;
    };
    let cur: Layer | 'grass' = 'grass';
    const setLayer = (l: Layer | 'grass') => {
      cur = l;
      if (l === 'grass') {
        gA.fillStyle = gA.strokeStyle = '#000';
        gB.fillStyle = gB.strokeStyle = '#000';
        return;
      }
      const [ci, col] = LAYER[l];
      (ci === 0 ? gA : gB).fillStyle = (ci === 0 ? gA : gB).strokeStyle = col;
      (ci === 0 ? gB : gA).fillStyle = (ci === 0 ? gB : gA).strokeStyle = '#000';
    };
    const both = (f: (g: CanvasRenderingContext2D) => void) => {
      f(gA);
      f(gB);
    };
    const setPaint = (k: 'white' | 'yellow' | 'dark') => {
      gC.fillStyle = gC.strokeStyle = k === 'white' ? '#f00' : k === 'yellow' ? '#0f0' : '#00f';
    };
    void cur;

    // 1. land use, painter's order
    const order = ['residential', 'farmland', 'cemetery', 'park', 'grass', 'urban', 'rail', 'wood', 'pitch', 'paved', 'playground', 'sand', 'track', 'water'];
    for (const k of order) {
      for (const ar of a.j.areas) {
        if (ar.k !== k || !inView(ar.p)) continue;
        setLayer(AREA_LAYER[k] ?? 'grass');
        both((g) => {
          g.beginPath();
          ring(g, ar.p);
          for (const h of ar.holes ?? []) ring(g, h);
          g.fill('evenodd');
        });
      }
    }
    // athletics track lane lines: inset outlines of the track polygon, 1.22 m apart
    for (const ar of a.j.areas) {
      if (ar.k !== 'track' || !inView(ar.p)) continue;
      gC.save();
      gC.beginPath();
      ring(gC, ar.p);
      gC.clip();
      for (let i = 0; i <= 8; i++) {
        const d = 0.25 + i * 1.22;
        setPaint('white');
        gC.lineWidth = 2 * d + 0.1;
        gC.beginPath();
        ring(gC, ar.p);
        gC.stroke();
        gC.strokeStyle = '#000';
        gC.lineWidth = 2 * d - 0.05;
        gC.beginPath();
        ring(gC, ar.p);
        gC.stroke();
      }
      gC.restore();
    }
    // 2. rails (ballast)
    setLayer('gravel');
    for (const r of a.j.rails) {
      if (!inView(r.p)) continue;
      both((g) => {
        g.lineWidth = 4.2;
        g.beginPath();
        line(g, r.p);
        g.stroke();
      });
    }
    // 3. roads: pavements first, then carriageways, then paths on top
    const roads = a.j.roads.filter((r) => !r.u && inView(r.p));
    setLayer('pavement');
    for (const r of roads) {
      if (r.k !== 'major' && r.k !== 'road') continue;
      both((g) => {
        g.lineWidth = r.w + 5;
        g.beginPath();
        line(g, r.p);
        g.stroke();
      });
    }
    // kerb darkening
    setPaint('dark');
    for (const r of roads) {
      if (r.k !== 'major' && r.k !== 'road') continue;
      gC.lineWidth = r.w + 0.35;
      gC.globalAlpha = 0.5;
      gC.beginPath();
      line(gC, r.p);
      gC.stroke();
    }
    gC.globalAlpha = 1;
    gC.strokeStyle = '#000';
    for (const r of roads) {
      if (r.k !== 'major' && r.k !== 'road') continue;
      gC.lineWidth = r.w - 0.05;
      gC.beginPath();
      line(gC, r.p);
      gC.stroke();
    }
    for (const kind of ['track', 'path', 'steps', 'pedestrian', 'service', 'road', 'major']) {
      for (const r of roads) {
        if (r.k !== kind) continue;
        setLayer(ROAD_LAYER[kind]);
        both((g) => {
          g.lineWidth = r.w;
          g.beginPath();
          line(g, r.p);
          g.stroke();
        });
      }
    }
    // markings (only worth drawing when resolution is fine)
    if (pxm < 0.3) {
      for (const r of roads) {
        if (r.k !== 'major' && !(r.k === 'road' && r.w >= 7)) continue;
        setPaint('white');
        gC.lineWidth = 0.12;
        gC.setLineDash([3, 6]);
        gC.beginPath();
        line(gC, r.p);
        gC.stroke();
        gC.setLineDash([]);
        // double yellow lines along the kerbs
        setPaint('yellow');
        for (const side of [-1, 1]) for (const off of [0.35, 0.55]) {
          const q = offsetLine(r.p, side * (r.w / 2 - off));
          gC.lineWidth = 0.1;
          gC.beginPath();
          line(gC, q);
          gC.stroke();
        }
      }
    }
    // 4. contact AO under buildings' edges and trees
    setPaint('dark');
    gC.globalAlpha = 0.55;
    gC.lineWidth = 1.2;
    for (const b of a.j.buildings) {
      if (!inView(b.p, 5)) continue;
      gC.beginPath();
      ring(gC, b.p);
      gC.stroke();
    }
    const t = a.j.trees;
    gC.globalAlpha = 0.35;
    for (let i = 0; i < t.length; i += 2) {
      const x = t[i], z = t[i + 1];
      if (x < x0 - 10 || x > x0 + span + 10 || z < z0 - 10 || z > z0 + span + 10) continue;
      const r = 2.2 + hash(i) * 1.5;
      const grd = gC.createRadialGradient(x, z, 0, x, z, r);
      grd.addColorStop(0, '#00f');
      grd.addColorStop(1, 'rgba(0,0,255,0)');
      gC.fillStyle = grd;
      gC.fillRect(x - r, z - r, r * 2, r * 2);
    }
    gC.globalAlpha = 1;
    void sun;
    opts.paint?.(gA, setLayer, setPaint);
    // 5. dressing hook paints on all canvases in world space
    this.tA.needsUpdate = this.tB.needsUpdate = this.tC.needsUpdate = true;
  }
}

export function offsetLine(p: number[], d: number): number[] {
  const out: number[] = [];
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    let dx = p[b * 2] - p[a * 2], dz = p[b * 2 + 1] - p[a * 2 + 1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    out.push(p[i * 2] - dz * d, p[i * 2 + 1] + dx * d);
  }
  return out;
}

/** Tileable value noise, 256px: r = 8 cells, g = 32 cells, b = 4 cells per tile. */
function noiseTexture() {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const oct = (cells: number, seed: number) => {
    const f = (i: number, j: number) => hash((i + cells) % cells, (j + cells) % cells, seed);
    const out = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = (x / S) * cells, fy = (y / S) * cells;
      const i = Math.floor(fx), j = Math.floor(fy);
      let u = fx - i, v = fy - j;
      u = u * u * (3 - 2 * u);
      v = v * v * (3 - 2 * v);
      out[y * S + x] = (f(i, j) * (1 - u) + f(i + 1, j) * u) * (1 - v) + (f(i, j + 1) * (1 - u) + f(i + 1, j + 1) * u) * v;
    }
    return out;
  };
  const r = oct(8, 1), r2 = oct(16, 4), g = oct(32, 2), b = oct(4, 3);
  for (let i = 0; i < S * S; i++) {
    data[i * 4] = (r[i] * 0.7 + r2[i] * 0.3) * 255;
    data[i * 4 + 1] = g[i] * 255;
    data[i * 4 + 2] = b[i] * 255;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const CHUNK = 128;

export class Ground {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private readonly a: ArenaData;
  private readonly coarse = new Splat(2048);
  private readonly fine = new Splat(2048);
  private fineKey = '';
  private chunks: { mesh: THREE.Mesh; cx: number; cz: number; lod: THREE.BufferGeometry[]; i: number; j: number }[] = [];
  readonly uniforms: Record<string, THREE.IUniform>;
  sun = new THREE.Vector3(0.4, 0.8, 0.3);
  splatOpts: SplatOptions = {};
  fineSpan = 256;

  private constructor(a: ArenaData, arr: { albedo: THREE.DataArrayTexture; normal: THREE.DataArrayTexture }) {
    this.a = a;
    const b = a.bounds;
    const span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    this.coarse.draw(a, b.x0, b.z0, span, this.sun, {});
    this.uniforms = {
      uAlb: { value: arr.albedo },
      uNrm: { value: arr.normal },
      uCA: { value: this.coarse.tA },
      uCB: { value: this.coarse.tB },
      uCC: { value: this.coarse.tC },
      uCRect: { value: new THREE.Vector4(b.x0, b.z0, span, span) },
      uFA: { value: this.fine.tA },
      uFB: { value: this.fine.tB },
      uFC: { value: this.fine.tC },
      uFRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uScale: { value: TEX_SCALE.map((s) => 1 / s) },
      uWet: { value: 0 },
      uGrassTint: { value: new THREE.Color(0.72, 0.95, 0.5) },
      uTrackCol: { value: new THREE.Color(0.55, 0.16, 0.1) },
      uNoise: { value: noiseTexture() },
    };
    this.material = makeGroundMaterial(this.uniforms);
    this.buildChunks();
  }

  static async create(a: ArenaData) {
    return new Ground(a, await pbrArray(GROUND_TEX));
  }

  /** Re-rasterise the fine splat window around (x,z) when it moves out of the current window's core. */
  focus(x: number, z: number, force = false) {
    const q = this.fineSpan / 4;
    const cx = Math.round(x / q) * q, cz = Math.round(z / q) * q;
    const key = `${cx},${cz},${this.fineSpan}`;
    if (key === this.fineKey && !force) return;
    this.fineKey = key;
    const x0 = cx - this.fineSpan / 2, z0 = cz - this.fineSpan / 2;
    this.fine.draw(this.a, x0, z0, this.fineSpan, this.sun, this.splatOpts);
    this.uniforms.uFRect.value.set(x0, z0, this.fineSpan, this.fineSpan);
  }

  private buildChunks() {
    const b = this.a.bounds;
    const ni = Math.ceil((b.x1 - b.x0) / CHUNK), nj = Math.ceil((b.z1 - b.z0) / CHUNK);
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const x0 = b.x0 + i * CHUNK, z0 = b.z0 + j * CHUNK;
      const g = this.chunkGeo(x0, z0, Math.min(CHUNK, b.x1 - x0), Math.min(CHUNK, b.z1 - z0), 8);
      const mesh = new THREE.Mesh(g, this.material);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.chunks.push({ mesh, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2, lod: [g], i, j });
    }
  }

  private chunkGeo(x0: number, z0: number, w: number, d: number, step: number) {
    const nx = Math.max(1, Math.round(w / step)), nz = Math.max(1, Math.round(d / step));
    const a = this.a;
    const verts: number[] = [], norms: number[] = [], idx: number[] = [];
    const e = 0.75;
    const nrm = (x: number, z: number) => {
      const hx = a.heightAt(x + e, z) - a.heightAt(x - e, z), hz = a.heightAt(x, z + e) - a.heightAt(x, z - e);
      const l = Math.hypot(hx, 2 * e, hz);
      return [-hx / l, (2 * e) / l, -hz / l];
    };
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = x0 + (w * i) / nx, z = z0 + (d * j) / nz;
      verts.push(x, a.heightAt(x, z), z);
      norms.push(...nrm(x, z));
    }
    const V = (i: number, j: number) => j * (nx + 1) + i;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) idx.push(V(i, j), V(i, j + 1), V(i + 1, j), V(i + 1, j), V(i, j + 1), V(i + 1, j + 1));
    // skirts hide LOD cracks
    const skirt = (list: number[]) => {
      const base = verts.length / 3;
      for (const k of list) {
        verts.push(verts[k * 3], verts[k * 3 + 1] - 3, verts[k * 3 + 2]);
        norms.push(norms[k * 3], norms[k * 3 + 1], norms[k * 3 + 2]);
      }
      for (let m = 0; m < list.length - 1; m++) idx.push(list[m], base + m, list[m + 1], list[m + 1], base + m, base + m + 1, list[m], list[m + 1], base + m, list[m + 1], base + m + 1, base + m);
    };
    const top: number[] = [], bot: number[] = [], left: number[] = [], right: number[] = [];
    for (let i = 0; i <= nx; i++) {
      top.push(V(i, 0));
      bot.push(V(i, nz));
    }
    for (let j = 0; j <= nz; j++) {
      left.push(V(0, j));
      right.push(V(nx, j));
    }
    [top, bot, left, right].forEach(skirt);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  /** Choose chunk LODs for the camera position (deterministic). */
  update(cam: THREE.Vector3) {
    const b = this.a.bounds;
    for (const c of this.chunks) {
      const dist = Math.hypot(cam.x - c.cx, cam.z - c.cz);
      const want = dist < 200 ? 1 : 0;
      if (want === 1 && !c.lod[1]) {
        const x0 = b.x0 + c.i * CHUNK, z0 = b.z0 + c.j * CHUNK;
        c.lod[1] = this.chunkGeo(x0, z0, Math.min(CHUNK, b.x1 - x0), Math.min(CHUNK, b.z1 - z0), 2);
      }
      c.mesh.geometry = c.lod[want];
    }
  }
}

function makeGroundMaterial(uniforms: Record<string, THREE.IUniform>) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        precision highp sampler2DArray;
        varying vec3 vWP; varying vec3 vWN;
        uniform sampler2DArray uAlb; uniform sampler2DArray uNrm;
        uniform sampler2D uCA, uCB, uCC, uFA, uFB, uFC;
        uniform vec4 uCRect, uFRect;
        uniform float uScale[8];
        uniform float uWet;
        uniform vec3 uGrassTint, uTrackCol;
        uniform sampler2D uNoise;
        vec3 gN; float gR; float gAO; float gShade;`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec2 wp = vWP.xz;
        vec2 cu = (wp - uCRect.xy) / uCRect.zw;
        vec2 fu = (wp - uFRect.xy) / uFRect.zw;
        vec2 fe = min(fu, 1.0 - fu);
        float fw = smoothstep(0.0, 0.04, min(fe.x, fe.y));
        vec4 sa, sb, sc;
        if (fw >= 1.0) { sa = texture2D(uFA, fu); sb = texture2D(uFB, fu); sc = texture2D(uFC, fu); }
        else {
          sa = texture2D(uCA, cu); sb = texture2D(uCB, cu); sc = texture2D(uCC, cu);
          if (fw > 0.0) { sa = mix(sa, texture2D(uFA, fu), fw); sb = mix(sb, texture2D(uFB, fu), fw); sc = mix(sc, texture2D(uFC, fu), fw); }
        }
        vec4 nz = texture2D(uNoise, wp * (1.0 / 128.0));
        vec4 nzL = texture2D(uNoise, wp * (1.0 / 1400.0) + 0.37);
        float n1 = nz.r, n2 = nz.g, n3 = nzL.r;
        float w[7];
        w[1] = sa.r; w[2] = sa.g; w[3] = sa.b; w[4] = sb.r; w[5] = sb.g; w[6] = sb.b;
        float sum = 0.0;
        for (int i = 1; i < 7; i++) { w[i] = clamp(w[i] + (n2 - 0.5) * 0.35 * w[i] * (1.0 - w[i]) * 4.0, 0.0, 1.0); sum += w[i]; }
        if (sum > 1.0) { for (int i = 1; i < 7; i++) w[i] /= sum; sum = 1.0; }
        w[0] = 1.0 - sum;
        vec3 alb = vec3(0.0); vec2 nxy = vec2(0.0); float rough = 0.0; float ao = 0.0;
        // grass: two scales + dry-grass variation to break tiling
        if (w[0] > 0.004) {
          vec4 a0 = texture(uAlb, vec3(wp * uScale[0], 0.0));
          vec4 a7 = texture(uAlb, vec3(wp * uScale[7] * 0.37 + 0.21, 7.0));
          vec4 b0 = texture(uNrm, vec3(wp * uScale[0], 0.0));
          float dry = smoothstep(0.45, 0.8, n1 * 0.7 + n3 * 0.6);
          vec4 g = mix(a0, a7, dry * 0.55);
          alb += g.rgb * uGrassTint * w[0]; rough += g.a * w[0]; nxy += (b0.xy * 2.0 - 1.0) * w[0]; ao += b0.z * w[0];
        }
        for (int i = 1; i < 7; i++) {
          if (w[i] < 0.004) continue;
          vec2 uv = wp * uScale[i];
          vec4 a = texture(uAlb, vec3(uv, float(i)));
          vec4 b = texture(uNrm, vec3(uv, float(i)));
          vec3 c = a.rgb;
          if (i == 6) c = uTrackCol * (0.75 + 0.5 * dot(a.rgb, vec3(0.333)));
          alb += c * w[i]; rough += a.a * w[i]; nxy += (b.xy * 2.0 - 1.0) * w[i]; ao += b.z * w[i];
        }
        alb *= 0.86 + 0.28 * n1;
        // road paint
        float paintW = sc.r, paintY = sc.g;
        alb = mix(alb, vec3(0.78, 0.78, 0.74), paintW * 0.92);
        alb = mix(alb, vec3(0.75, 0.6, 0.12), paintY * 0.9);
        rough = mix(rough, 0.55, max(paintW, paintY));
        gShade = 1.0 - sc.b * 0.8;
        gAO = ao * (1.0 - sc.b * 0.6);
        rough = mix(rough, 0.18, uWet * (1.0 - w[0] * 0.7));
        alb *= mix(1.0, 0.6, uWet * (1.0 - w[0] * 0.5));
        gR = rough;
        gN = normalize(vWN * 1.0 + vec3(nxy.x, 0.0, nxy.y) * 0.9);
        diffuseColor.rgb *= alb;`,
      )
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = gR;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace(
        '#include <aomap_fragment>',
        `reflectedLight.indirectDiffuse *= gAO; reflectedLight.indirectSpecular *= gAO; reflectedLight.directDiffuse *= gShade; reflectedLight.directSpecular *= gShade;`,
      );
  };
  m.customProgramCacheKey = () => 'rm-ground';
  return m;
}
