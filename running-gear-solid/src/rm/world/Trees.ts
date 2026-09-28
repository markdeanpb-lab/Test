// Tree impostors: 8-view Cycles-baked atlases on camera-facing (cylindrical) billboards,
// cross-faded between neighbouring views. They cast shadows (billboards face the sun in the
// shadow pass, so the shadow is the silhouette seen from the sun).
import * as THREE from 'three';
import { loadImage, loadJSON, hash } from '../engine/assets';
import { ArenaData } from './ArenaData';

export const TREE_TYPES = ['jacaranda_tree', 'island_tree_01', 'tree_small_02', 'island_tree_02'];
const AW = 4096, AH = 512;

async function atlasArray() {
  const metas = await Promise.all(TREE_TYPES.map((t) => loadJSON<{ height: number; width: number }>(`/assets/impostors/${t}.json`)));
  const ims = await Promise.all(TREE_TYPES.map((t) => loadImage(`/assets/impostors/${t}.png`)));
  const data = new Uint8Array(AW * AH * 4 * ims.length);
  const c = document.createElement('canvas');
  c.width = AW;
  c.height = AH;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  ims.forEach((im, k) => {
    g.clearRect(0, 0, AW, AH);
    g.drawImage(im, 0, 0, AW, AH);
    const px = g.getImageData(0, 0, AW, AH).data;
    dilate(px, AW, AH, 6);
    data.set(px, AW * AH * 4 * k);
  });
  const t = new THREE.DataArrayTexture(data, AW, AH, ims.length);
  t.format = THREE.RGBAFormat;
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.flipY = false;
  t.needsUpdate = true;
  return { tex: t, metas };
}

const VERT = /* glsl */ `
  attribute vec3 iPos; attribute vec2 iSize; attribute vec3 iMisc; // type, yaw, tint
  varying vec2 vUv; varying float vType; varying float vK; varying float vTint;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vec3 toCam = cameraPosition - iPos; toCam.y = 0.0;
    float l = length(toCam); toCam = l > 1e-4 ? toCam / l : vec3(0.0, 0.0, 1.0);
    vec3 right = vec3(toCam.z, 0.0, -toCam.x);
    vec3 p = iPos + right * position.x * iSize.x + vec3(0.0, position.y * iSize.y, 0.0);
    float a = atan(-toCam.x, toCam.z) - iMisc.y;
    vK = mod(a / (PI2 / 8.0) + 80.0, 8.0);
    vUv = vec2(position.x + 0.5, position.y);
    vType = iMisc.x; vTint = iMisc.z;
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;

const FRAG = /* glsl */ `
  precision highp sampler2DArray;
  uniform sampler2DArray uAtlas; uniform vec3 uLight; uniform float uCut; uniform float uGain[4];
  varying vec2 vUv; varying float vType; varying float vK; varying float vTint;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float k0 = floor(vK), f = vK - k0, k1 = mod(k0 + 1.0, 8.0);
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec4 c0 = texture(uAtlas, vec3((k0 + uv.x) / 8.0, uv.y, vType));
    vec4 c1 = texture(uAtlas, vec3((k1 + uv.x) / 8.0, uv.y, vType));
    vec4 c = mix(c0, c1, smoothstep(0.25, 0.75, f));
    if (c.a < uCut) discard;
    vec3 col = c.rgb;
    float gain = uGain[0];
    for (int i = 1; i < 4; i++) if (float(i) == vType) gain = uGain[i];
    col *= uLight * gain * (0.72 + 0.28 * smoothstep(0.0, 0.6, vUv.y)) * vTint;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

const DEPTH_FRAG = /* glsl */ `
  precision highp sampler2DArray;
  uniform sampler2DArray uAtlas; uniform float uCut;
  varying vec2 vUv; varying float vType; varying float vK; varying float vTint;
  void main() {
    float k0 = floor(vK + 0.5);
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    float a = texture(uAtlas, vec3((mod(k0, 8.0) + uv.x) / 8.0, uv.y, vType)).a;
    if (a < 0.5) discard;
    gl_FragColor = vec4(1.0);
  }`;

export interface TreeOpts {
  /** keep trees this far from any course line (m) */
  clear?: number;
  /** scatter density in wood areas (trees per m^2) */
  wood?: number;
  /** extra tree positions */
  extra?: number[];
  sizeMin?: number;
  sizeMax?: number;
}

export class Trees {
  readonly mesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly positions: number[] = [];

  private constructor(a: ArenaData, atlas: { tex: THREE.DataArrayTexture; metas: { height: number; width: number }[] }, o: TreeOpts) {
    const clear = o.clear ?? 3.5;
    const nearCourse = (x: number, z: number) => a.courseDist(x, z, clear + 1) < clear;
    const pts: number[] = [...a.j.trees, ...(o.extra ?? [])];
    // scatter in woods (deterministic jittered grid)
    const dens = o.wood ?? 1 / 55;
    const step = Math.sqrt(1 / dens);
    for (const ar of a.j.areas) {
      if (ar.k !== 'wood') continue;
      let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
      for (let i = 0; i < ar.p.length; i += 2) {
        mnx = Math.min(mnx, ar.p[i]); mxx = Math.max(mxx, ar.p[i]); mnz = Math.min(mnz, ar.p[i + 1]); mxz = Math.max(mxz, ar.p[i + 1]);
      }
      for (let z = Math.floor(mnz / step) * step; z < mxz; z += step) for (let x = Math.floor(mnx / step) * step; x < mxx; x += step) {
        const jx = x + (hash(x * 7, z * 3, 1) - 0.5) * step * 0.9, jz = z + (hash(x * 5, z * 11, 2) - 0.5) * step * 0.9;
        if (inPoly(ar.p, jx, jz) && !(ar.holes ?? []).some((h) => inPoly(h, jx, jz))) pts.push(jx, jz);
      }
      if (pts.length > 40000) break;
    }
    const iPos: number[] = [], iSize: number[] = [], iMisc: number[] = [];
    const smin = o.sizeMin ?? 12, smax = o.sizeMax ?? 22;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i], z = pts[i + 1];
      if (a.maskAt(x, z) > 0.3 || nearCourse(x, z)) continue;
      const r = hash(Math.round(x * 10), Math.round(z * 10), 5);
      const type = r < 0.62 ? 0 : r < 0.74 ? 1 : r < 0.92 ? 2 : 3;
      const m = atlas.metas[type];
      // natural heights: jacaranda stands in for mature planes/oaks; the others are smaller trees
      const hr = hash(Math.round(x * 10), Math.round(z * 10), 6);
      const H = type === 0 ? smin + (smax - smin) * hr : smin * 0.55 + (smin * 0.9 - smin * 0.55) * hr;
      const s = H / m.height;
      const w = m.width * s;
      iPos.push(x, a.heightAt(x, z) - 0.03 * w, z);
      iSize.push(w, w);
      iMisc.push(type, hash(Math.round(x * 10), Math.round(z * 10), 7) * Math.PI * 2, 0.8 + 0.35 * hash(Math.round(x), Math.round(z), 8));
      this.positions.push(x, z);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(iPos), 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(iSize), 2));
    g.setAttribute('iMisc', new THREE.InstancedBufferAttribute(new Float32Array(iMisc), 3));
    g.instanceCount = iPos.length / 3;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.uniforms = { uAtlas: { value: atlas.tex }, uLight: { value: new THREE.Color(1, 1, 1) }, uCut: { value: 0.45 }, uGain: { value: [1.7, 0.95, 1.0, 1.0] } };
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      side: THREE.DoubleSide,
    });
    Object.assign(mat.uniforms, this.uniforms);
    const depth = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT.replace('#include <fog_vertex>', '').replace('#include <fog_pars_vertex>', ''), fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.customDepthMaterial = depth;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
  }

  static async create(a: ArenaData, o: TreeOpts = {}) {
    return new Trees(a, await atlasArray(), o);
  }
}

export function inPoly(p: number[], x: number, z: number) {
  let c = false;
  for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], zi = p[i * 2 + 1], xj = p[j * 2], zj = p[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** Bleed opaque colours into transparent texels so mipmaps don't darken silhouettes. */
function dilate(px: Uint8ClampedArray, w: number, h: number, iters: number) {
  let solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = px[i * 4 + 3] > 20 ? 1 : 0;
  for (let it = 0; it < iters; it++) {
    const next = solid.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (solid[i]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!solid[j]) continue;
        r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++;
      }
      if (n) {
        px[i * 4] = r / n; px[i * 4 + 1] = g / n; px[i * 4 + 2] = b / n;
        next[i] = 1;
      }
    }
    solid = next;
  }
}
