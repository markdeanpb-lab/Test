// Sky, image-based light, sun (with a shadow frustum that follows the action) and fog.
import * as THREE from 'three';
import { hdri } from './assets';

export interface AtmosSpec {
  hdri: string;
  /** rotate the sky (radians about +y) so the sun sits where the shot needs it */
  rot?: number;
  env?: number; // environment (IBL) intensity
  sun?: number; // sun intensity (0 = overcast)
  sunColor?: number;
  /** override the sun direction (else the brightest point of the HDRI) */
  sunDir?: [number, number, number];
  fog?: number; // FogExp2 density
  fogColor?: number;
  bgBlur?: number;
  bgIntensity?: number;
  shadowSize?: number; // half-extent of the sun's shadow frustum (m)
}

const sunCache = new Map<string, THREE.Vector3>();
function findSun(id: string, t: THREE.DataTexture): THREE.Vector3 {
  let v = sunCache.get(id);
  if (v) return v.clone();
  const { width: W, height: H, data } = t.image as { width: number; height: number; data: Uint16Array | Float32Array };
  const half = data instanceof Uint16Array;
  const get = (i: number) => (half ? THREE.DataUtils.fromHalfFloat((data as Uint16Array)[i]) : (data as Float32Array)[i]);
  let best = -1, bx = 0, by = 0;
  for (let y = 0; y < H / 2; y += 2) for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * 4;
    const l = get(i) * 0.2126 + get(i + 1) * 0.7152 + get(i + 2) * 0.0722;
    if (l > best) {
      best = l;
      bx = x;
      by = y;
    }
  }
  // equirect: row 0 = straight up (image top); u = atan(z, x) / 2pi + 0.5
  const el = (0.5 - (by + 0.5) / H) * Math.PI;
  const phi = ((bx + 0.5) / W - 0.5) * Math.PI * 2;
  v = new THREE.Vector3(Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el)).normalize();
  sunCache.set(id, v);
  return v.clone();
}

export class Atmos {
  readonly sun = new THREE.DirectionalLight(0xffffff, 2);
  readonly sunDir = new THREE.Vector3(0.3, 0.8, 0.3);
  private size = 40;

  constructor() {
    const s = this.sun;
    s.castShadow = true;
    s.shadow.mapSize.set(2048, 2048);
    s.shadow.bias = -0.0002;
    s.shadow.normalBias = 0.03;
    s.shadow.radius = 2;
  }

  async apply(renderer: THREE.WebGLRenderer, scene: THREE.Scene, spec: AtmosSpec) {
    const { equirect, env } = await hdri(renderer, spec.hdri);
    const rot = spec.rot ?? 0;
    scene.environment = env;
    scene.environmentIntensity = spec.env ?? 1;
    scene.environmentRotation.set(0, rot, 0);
    scene.background = equirect;
    scene.backgroundRotation.set(0, rot, 0);
    scene.backgroundBlurriness = spec.bgBlur ?? 0;
    scene.backgroundIntensity = spec.bgIntensity ?? 1;
    const d = spec.sunDir ? new THREE.Vector3(...spec.sunDir).normalize() : findSun(spec.hdri, equirect).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    if (d.y < 0.08) d.y = 0.08;
    this.sunDir.copy(d.normalize());
    this.sun.intensity = spec.sun ?? 2.5;
    this.sun.color.setHex(spec.sunColor ?? 0xfff1e0);
    this.sun.castShadow = (spec.sun ?? 2.5) > 0.05;
    this.size = spec.shadowSize ?? 40;
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -this.size;
    c.right = c.top = this.size;
    c.near = 1;
    c.far = 800;
    c.updateProjectionMatrix();
    scene.fog = spec.fog ? new THREE.FogExp2(spec.fogColor ?? 0x9aa3a8, spec.fog) : null;
    if (!this.sun.parent) scene.add(this.sun, this.sun.target);
  }

  /** Keep the shadow frustum centred on the action, snapped to texels to avoid shimmer. */
  follow(p: THREE.Vector3) {
    const texel = (this.size * 2) / this.sun.shadow.mapSize.x;
    // snap in light space
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.sunDir);
    const inv = q.clone().invert();
    const l = p.clone().applyQuaternion(inv);
    l.x = Math.round(l.x / texel) * texel;
    l.y = Math.round(l.y / texel) * texel;
    const c = l.applyQuaternion(q);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(this.sunDir, 400);
    this.sun.target.updateMatrixWorld();
    this.sun.updateMatrixWorld();
  }
}
