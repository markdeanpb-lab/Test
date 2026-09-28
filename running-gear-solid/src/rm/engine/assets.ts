// Cached asset loading for the remaster: images, PBR texture arrays, HDR environments, glTF.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/** anisotropic filtering is very expensive in SwiftShader; keep it low */
export let ANISO = Number(new URLSearchParams(location.search).get('aniso') ?? 2);
const cache = new Map<string, Promise<unknown>>();
function once<T>(key: string, f: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = f();
    cache.set(key, p);
  }
  return p;
}

export const loadImage = (url: string) =>
  once('img:' + url, () => new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('image failed: ' + url));
    im.src = url;
  }));

export const loadJSON = <T = unknown>(url: string) => once('json:' + url, () => fetch(url).then((r) => {
  if (!r.ok) throw new Error('fetch failed ' + url);
  return r.json() as Promise<T>;
}));
export const loadBin = (url: string) => once('bin:' + url, () => fetch(url).then((r) => {
  if (!r.ok) throw new Error('fetch failed ' + url);
  return r.arrayBuffer();
}));

const gltfLoader = new GLTFLoader();
export const loadGLTF = (url: string) => once('gltf:' + url, () => gltfLoader.loadAsync(url)) as Promise<GLTF>;

export function tex(url: string, srgb: boolean, repeat = 1): Promise<THREE.Texture> {
  return once(`tex:${url}:${srgb}:${repeat}`, async () => {
    const t = new THREE.Texture(await loadImage(url));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = ANISO;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  });
}

/** Load a Poly Haven PBR set: diffuse (srgb) + normal + roughness (+ ao). */
export async function pbr(id: string, repeat = 1) {
  const base = `/assets/tex/${id}_`;
  const [map, normalMap, roughnessMap] = await Promise.all([tex(base + 'diff_1k.jpg', true, repeat), tex(base + 'nor_gl_1k.jpg', false, repeat), tex(base + 'rough_1k.jpg', false, repeat)]);
  return { map, normalMap, roughnessMap };
}

const S = 1024;
function pixelsOf(im: HTMLImageElement): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(im, 0, 0, S, S);
  return g.getImageData(0, 0, S, S).data;
}

/**
 * Pack several PBR sets into two texture arrays (one sampler each for any number of layers):
 *   A: sRGB albedo RGB + roughness in alpha
 *   B: normal XY (GL convention) + AO in blue
 */
export function pbrArray(ids: string[]): Promise<{ albedo: THREE.DataArrayTexture; normal: THREE.DataArrayTexture }> {
  return once('pbrarr:' + ids.join(','), async () => {
    const n = ids.length;
    const A = new Uint8Array(S * S * 4 * n);
    const B = new Uint8Array(S * S * 4 * n);
    await Promise.all(ids.map(async (id, k) => {
      const base = `/assets/tex/${id}_`;
      const [d, nr, r, ao] = await Promise.all([
        loadImage(base + 'diff_1k.jpg'),
        loadImage(base + 'nor_gl_1k.jpg'),
        loadImage(base + 'rough_1k.jpg'),
        loadImage(base + 'ao_1k.jpg').catch(() => null),
      ]);
      const pd = pixelsOf(d), pn = pixelsOf(nr), pr = pixelsOf(r), pa = ao ? pixelsOf(ao) : null;
      const o = S * S * 4 * k;
      for (let i = 0; i < S * S * 4; i += 4) {
        A[o + i] = pd[i];
        A[o + i + 1] = pd[i + 1];
        A[o + i + 2] = pd[i + 2];
        A[o + i + 3] = pr[i];
        B[o + i] = pn[i];
        B[o + i + 1] = pn[i + 1];
        B[o + i + 2] = pa ? pa[i] : 255;
        B[o + i + 3] = 255;
      }
    }));
    const mk = (data: Uint8Array, srgb: boolean) => {
      const t = new THREE.DataArrayTexture(data, S, S, n);
      t.format = THREE.RGBAFormat;
      t.type = THREE.UnsignedByteType;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = ANISO;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { albedo: mk(A, true), normal: mk(B, false) };
  });
}

/** HDR environment: the equirect texture (for background) and a PMREM (for lighting). */
export function hdri(renderer: THREE.WebGLRenderer, id: string): Promise<{ equirect: THREE.DataTexture; env: THREE.Texture }> {
  return once('hdri:' + id, async () => {
    const equirect = await new HDRLoader().loadAsync(`/assets/hdri/${id}_2k.hdr`);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(equirect).texture;
    pm.dispose();
    return { equirect, env };
  });
}

/** Deterministic hash in [0,1). */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
