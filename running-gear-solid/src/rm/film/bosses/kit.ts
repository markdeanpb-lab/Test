// Boss construction kit: PBR machine parts with world-scaled UVs, LED displays, warning lamps and
// deterministic particles (steam, sparks, embers). Everything is a pure function of time, so any
// frame renders identically in any order.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { pbr, hash } from '../../engine/assets';

export type Metal = 'rust' | 'rust2' | 'plate' | 'coarse' | 'green' | 'blue' | 'grate' | 'container' | 'corrugated' | 'concrete' | 'brick' | 'castle' | 'rock' | 'stone';
const IDS: Record<Metal, string> = {
  rust: 'rusty_metal_02',
  rust2: 'rusty_metal_04',
  plate: 'metal_plate',
  coarse: 'rust_coarse_01',
  green: 'green_metal_rust',
  blue: 'blue_metal_plate',
  grate: 'metal_grate_rusty',
  container: 'container_side',
  corrugated: 'corrugated_iron',
  concrete: 'concrete_wall_003',
  brick: 'brick_wall_08',
  castle: 'castle_brick_02_white',
  rock: 'rock_face_03',
  stone: 'old_stone_wall',
};

/** PBR material for a machine surface (textures tile once every `tile` metres via world-scaled UVs). */
export async function metal(kind: Metal, o: { tint?: number; metalness?: number; rough?: number; emissive?: number } = {}) {
  const t = await pbr(IDS[kind]);
  return new THREE.MeshStandardMaterial({
    map: t.map,
    normalMap: t.normalMap,
    roughnessMap: t.roughnessMap,
    color: o.tint ?? 0xffffff,
    metalness: o.metalness ?? (['concrete', 'brick', 'castle', 'rock', 'stone'].includes(kind) ? 0 : 0.55),
    roughness: o.rough ?? 1,
    emissive: o.emissive ?? 0x000000,
  });
}

/** rescale a geometry's UVs so textures tile every `tile` metres (box/cylinder faces) */
function worldUV(g: THREE.BufferGeometry, sx: number, sy: number, tile: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * sx) / tile, (uv.getY(i) * sy) / tile);
  uv.needsUpdate = true;
  return g;
}

export function box(w: number, h: number, d: number, mat: THREE.Material, tile = 2, bevel = 0.07) {
  // bevelled edges catch the light (a hard-edged box reads as a toy at this scale)
  const r = Math.min(w, h, d) * bevel;
  const g = r > 0.01 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  // per-face scale: use the largest two dims so no face is badly stretched
  worldUV(g, Math.max(w, d), h, tile);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function cyl(rTop: number, rBot: number, h: number, mat: THREE.Material, seg = 24, tile = 2) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  worldUV(g, 2 * Math.PI * Math.max(rTop, rBot), h, tile);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** a hydraulic piston: barrel + chrome rod; set(len) extends it along +y */
export class Piston {
  readonly group = new THREE.Group();
  private rod: THREE.Mesh;
  private barrelLen: number;
  constructor(r: number, barrelLen: number, barrel: THREE.Material) {
    this.barrelLen = barrelLen;
    const b = cyl(r, r, barrelLen, barrel, 20);
    b.position.y = barrelLen / 2;
    this.group.add(b);
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.18 });
    this.rod = cyl(r * 0.55, r * 0.55, barrelLen, chrome, 16);
    this.group.add(this.rod);
    this.set(barrelLen * 1.4);
  }
  /** total length from base to rod tip */
  set(len: number) {
    const ext = Math.max(0, len - this.barrelLen);
    this.rod.position.y = this.barrelLen / 2 + ext;
  }
  /** point the piston from a to b (world or parent space) */
  span(a: THREE.Vector3, b: THREE.Vector3) {
    this.group.position.copy(a);
    const d = b.clone().sub(a);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    this.set(d.length());
  }
}

/** a warning lamp: emissive sphere + additive halo sprite */
export class Lamp {
  readonly group = new THREE.Group();
  private mat: THREE.MeshStandardMaterial;
  private halo: THREE.Sprite;
  private col = new THREE.Color();
  constructor(r: number, col = 0xff3020) {
    this.mat = new THREE.MeshStandardMaterial({ color: 0x220806, emissive: col, emissiveIntensity: 0, roughness: 0.3 });
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), this.mat);
    this.group.add(s);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    this.halo.scale.setScalar(r * 9);
    this.group.add(this.halo);
    this.color = col;
  }
  set color(c: number) {
    this.col.setHex(c);
    this.mat.emissive.copy(this.col);
    (this.halo.material as THREE.SpriteMaterial).color.copy(this.col);
  }
  set level(v: number) {
    this.mat.emissiveIntensity = v * 6;
    (this.halo.material as THREE.SpriteMaterial).opacity = Math.min(1, v) * 0.85;
  }
}

let HALO: THREE.CanvasTexture | null = null;
export function haloTex() {
  if (HALO) return HALO;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  HALO = new THREE.CanvasTexture(c);
  return HALO;
}

/**
 * LED/segment display panel: a canvas texture on an emissive plane. Each character sits in its own
 * cell so digits can be animated (and flung apart) individually.
 */
export class LedDisplay {
  readonly group = new THREE.Group();
  readonly cells: THREE.Mesh[] = [];
  private canvases: HTMLCanvasElement[] = [];
  private texs: THREE.CanvasTexture[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];
  private chars: string[] = [];
  private col: string;
  constructor(n: number, cellW: number, cellH: number, o: { col?: string; gap?: number } = {}) {
    this.col = o.col ?? '#ff3a20';
    const gap = o.gap ?? cellW * 0.08;
    const total = n * cellW + (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 192;
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(cellW, cellH), m);
      mesh.position.x = -total / 2 + cellW / 2 + i * (cellW + gap);
      this.group.add(mesh);
      this.cells.push(mesh);
      this.canvases.push(c);
      this.texs.push(t);
      this.mats.push(m);
      this.chars.push('\u0000');
    }
  }
  set(text: string, col = this.col) {
    const s = text.padStart(this.cells.length, ' ').slice(-this.cells.length);
    for (let i = 0; i < this.cells.length; i++) {
      const key = s[i] + col;
      if (this.chars[i] === key) continue;
      this.chars[i] = key;
      const g = this.canvases[i].getContext('2d')!;
      g.clearRect(0, 0, 128, 192);
      // unlit segments ghosted behind, like a real LED clock
      g.font = '700 170px "Share Tech Mono"';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      if (s[i] !== ':' && s[i] !== ' ') {
        g.fillStyle = 'rgba(255,255,255,0.07)';
        g.fillText('8', 64, 100);
      }
      g.shadowColor = col;
      g.shadowBlur = 18;
      g.fillStyle = col;
      g.fillText(s[i], 64, 100);
      this.texs[i].needsUpdate = true;
    }
  }
  set level(v: number) {
    for (const m of this.mats) m.opacity = v;
  }
}

/**
 * Deterministic particle emitter (points). Each particle loops with its own seed: position is a
 * closed-form function of time, so there is no simulation state.
 */
export class Particles {
  readonly points: THREE.Points;
  private mat: THREE.ShaderMaterial;
  constructor(o: { n: number; box: [number, number, number]; vel: [number, number, number]; life: number; size: number; color: number; opacity?: number; additive?: boolean; swirl?: number; grow?: number; seed?: number }) {
    const n = o.n;
    const seedA = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      seedA[i * 4] = hash(i, o.seed ?? 1, 1);
      seedA[i * 4 + 1] = hash(i, o.seed ?? 1, 2);
      seedA[i * 4 + 2] = hash(i, o.seed ?? 1, 3);
      seedA[i * 4 + 3] = hash(i, o.seed ?? 1, 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seedA, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uBox: { value: new THREE.Vector3(...o.box) },
        uVel: { value: new THREE.Vector3(...o.vel) },
        uLife: { value: o.life },
        uSize: { value: o.size },
        uColor: { value: new THREE.Color(o.color) },
        uOpacity: { value: o.opacity ?? 1 },
        uRate: { value: 1 },
        uSwirl: { value: o.swirl ?? 0 },
        uGrow: { value: o.grow ?? 0 },
        uTex: { value: haloTex() },
      },
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        uniform float uTime, uLife, uSize, uSwirl, uGrow, uRate;
        uniform vec3 uBox, uVel;
        varying float vA;
        void main() {
          float t = uTime / uLife + seed.w;
          float k = fract(t);
          float alive = step(seed.x, uRate); // fraction of particles emitted
          vec3 p = (seed.xyz - 0.5) * uBox;
          p += uVel * k * uLife;
          float a = seed.y * 6.2831 + k * 3.0;
          p.xz += vec2(cos(a), sin(a)) * uSwirl * k;
          vA = alive * sin(k * 3.14159);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (1.0 + uGrow * k) * 540.0 / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uOpacity; uniform sampler2D uTex;
        varying float vA;
        void main() {
          float a = texture2D(uTex, gl_PointCoord).a * vA * uOpacity;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  update(t: number, rate = 1, opacity?: number) {
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uRate.value = rate;
    if (opacity !== undefined) this.mat.uniforms.uOpacity.value = opacity;
    this.points.visible = rate > 0.001;
  }
}

/** hazard stripe material (canvas) */
let HAZ: THREE.CanvasTexture | null = null;
export function hazard() {
  if (!HAZ) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#e8b818';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#141414';
    for (let i = -128; i < 256; i += 48) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 24, 0);
      g.lineTo(i + 24 + 128, 128);
      g.lineTo(i + 128, 128);
      g.fill();
    }
    HAZ = new THREE.CanvasTexture(c);
    HAZ.wrapS = HAZ.wrapT = THREE.RepeatWrapping;
    HAZ.colorSpace = THREE.SRGBColorSpace;
  }
  return new THREE.MeshStandardMaterial({ map: HAZ, roughness: 0.7, metalness: 0.2 });
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Surface detail on one face of a w*h*d box centred at the origin: raised panels, rivet rows,
 * vents and pipe runs, all deterministic from `seed`. face: +z front by default.
 */
export function greeble(w: number, h: number, d: number, mats: { panel: THREE.Material; dark: THREE.Material; pipe?: THREE.Material }, o: { seed?: number; face?: 'front' | 'back' | 'left' | 'right'; n?: number; pipes?: number } = {}) {
  const g = new THREE.Group();
  const seed = o.seed ?? 1;
  const face = o.face ?? 'front';
  const fw = face === 'left' || face === 'right' ? d : w;
  const depth = face === 'left' || face === 'right' ? w : d;
  const n = o.n ?? 6;
  const rivet = new THREE.SphereGeometry(1, 6, 4);
  for (let i = 0; i < n; i++) {
    const pw = fw * (0.18 + hash(i, seed, 1) * 0.3), ph = h * (0.1 + hash(i, seed, 2) * 0.22);
    const px = (hash(i, seed, 3) - 0.5) * (fw - pw), py = (hash(i, seed, 4) - 0.5) * (h - ph);
    const kind = hash(i, seed, 5);
    const t = 0.06 + hash(i, seed, 6) * 0.1;
    const m = box(pw, ph, t, kind < 0.3 ? mats.dark : mats.panel, 1.5, 0.2);
    m.position.set(px, py, t / 2);
    g.add(m);
    // rivets along the panel's top and bottom edges
    const rv = new THREE.InstancedMesh(rivet, mats.dark, 24);
    let k = 0;
    const cols = Math.max(2, Math.floor(pw / 0.45));
    for (const ey of [py + ph / 2 - 0.12, py - ph / 2 + 0.12])
      for (let c = 0; c < cols && k < 24; c++, k++) rv.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(px - pw / 2 + 0.15 + (c * (pw - 0.3)) / (cols - 1), ey, t + 0.01), new THREE.Quaternion(), new THREE.Vector3(0.06, 0.06, 0.04)));
    rv.count = k;
    g.add(rv);
    if (kind > 0.75) {
      // vent slats
      for (let v = 0; v < 5; v++) {
        const sl = box(pw * 0.8, ph * 0.08, 0.05, mats.dark, 1, 0);
        sl.position.set(px, py - ph * 0.3 + v * ph * 0.15, t + 0.04);
        g.add(sl);
      }
    }
  }
  const pipe = mats.pipe ?? mats.dark;
  for (let p = 0; p < (o.pipes ?? 2); p++) {
    const r = 0.08 + hash(p, seed, 9) * 0.12;
    const vertical = hash(p, seed, 10) > 0.5;
    const len = vertical ? h * 0.9 : fw * 0.9;
    const c = cyl(r, r, len, pipe, 10);
    if (!vertical) c.rotation.z = Math.PI / 2;
    c.position.set(vertical ? (hash(p, seed, 11) - 0.5) * fw * 0.8 : 0, vertical ? 0 : (hash(p, seed, 11) - 0.5) * h * 0.8, r + 0.12);
    g.add(c);
  }
  // orient onto the requested face
  const off = depth / 2;
  if (face === 'front') g.position.z = off;
  if (face === 'back') {
    g.rotation.y = Math.PI;
    g.position.z = -off;
  }
  if (face === 'left') {
    g.rotation.y = -Math.PI / 2;
    g.position.x = -off;
  }
  if (face === 'right') {
    g.rotation.y = Math.PI / 2;
    g.position.x = off;
  }
  return g;
}
