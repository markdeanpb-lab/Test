// Instanced crowds from baked poses (tools/blender/bake_crowd.py): other runners and spectators.
// Each person picks a baked mesh (pose/body/frame) per frame; kit colours are per instance.
import * as THREE from 'three';
import { loadGLTF, hash } from '../engine/assets';

export interface Person {
  /** baked mesh name, e.g. run_m_03 */
  mesh: string;
  x: number;
  y: number;
  z: number;
  /** heading (radians about +y, 0 = facing +z) */
  yaw: number;
  scale: number;
  top: number; // colours (hex)
  shorts: number;
  skin: number;
  shoes: number;
  hair: number;
  /** optional race bib (white patch on the top) */
}

export const SKIN = [0x8d5a3b, 0xc68a64, 0xe0b193, 0xf1c9a9, 0x5c3a24, 0xa8704a, 0xd9a07c];
export const TOPS = [0x1b1b1f, 0xd8d8d2, 0x2a4f8a, 0xc0392b, 0x1e7a55, 0xf2c14e, 0x6a3d9a, 0xe86f2c, 0x3fa7d6, 0x7d8a96, 0xe84a7f, 0x14365e, 0x9a1b1b, 0x2f2f35];
export const SHORTS = [0x121214, 0x1a1a1d, 0x23262d, 0x2a3a5a, 0x3a3a3a, 0x5a5f66];
export const SHOES = [0xf2f2f2, 0x1a1a1a, 0xff5a1f, 0x3fa7d6, 0xd7e84a, 0xe84a7f, 0x888888];
export const HAIR = [0x1a1410, 0x2a1d14, 0x4a3322, 0x6b4a2b, 0x8a8a8a, 0xb89060, 0x111111];

export function randomKit(seed: number) {
  const pick = (a: number[], k: number) => a[Math.floor(hash(seed, k) * a.length)];
  return { top: pick(TOPS, 1), shorts: pick(SHORTS, 2), skin: pick(SKIN, 3), shoes: pick(SHOES, 4), hair: pick(HAIR, 5) };
}

const MAX = 600;

export class Crowd {
  readonly group = new THREE.Group();
  private geos = new Map<string, THREE.BufferGeometry>();
  private meshes = new Map<string, THREE.InstancedMesh>();
  private material: THREE.MeshStandardMaterial;
  readonly names: string[];
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private col = new THREE.Color();
  private frustum = new THREE.Frustum();
  private sphere = new THREE.Sphere(new THREE.Vector3(), 1.2);

  private constructor(src: THREE.Object3D) {
    src.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.updateWorldMatrix(true, false);
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        this.geos.set(m.name, g);
      }
    });
    this.names = [...this.geos.keys()].filter((n) => !n.endsWith('_lo'));
    this.material = crowdMaterial();
  }

  static async create() {
    const g = await loadGLTF('/assets/char/crowd.glb');
    return new Crowd(g.scene);
  }

  /** count of frames available for a pose/body, e.g. frames('run', 'm') = 12 */
  frames(pose: string, body: string) {
    return this.names.filter((n) => n.startsWith(`${pose}_${body}_`)).length;
  }

  private meshFor(name: string) {
    let m = this.meshes.get(name);
    if (!m) {
      const base = this.geos.get(name);
      if (!base) throw new Error('crowd mesh missing: ' + name);
      const g = base.clone();
      for (const k of ['iTop', 'iShorts', 'iSkin', 'iShoes', 'iHair']) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3));
      m = new THREE.InstancedMesh(g, this.material, MAX);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      this.meshes.set(name, m);
      this.group.add(m);
    }
    return m;
  }

  /** Place everyone for this frame. Culls people outside the camera frustum. */
  set(people: Person[], camera?: THREE.Camera, lodDist = 16, subject?: THREE.Vector3) {
    for (const m of this.meshes.values()) m.count = 0;
    if (camera) {
      camera.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }
    for (const pp of people) {
      let name = pp.mesh;
      if (camera) {
        this.sphere.center.set(pp.x, pp.y + 0.9, pp.z);
        if (!this.frustum.intersectsSphere(this.sphere)) continue;
        const dc = camera.position.distanceTo(this.sphere.center);
        if (dc < 2.0) continue; // never let an extra fill the lens
        if (subject) {
          // nobody standing between the camera and the subject
          const ax = camera.position.x, az = camera.position.z, bx = subject.x, bz = subject.z;
          const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
          const u = l2 ? Math.max(0, Math.min(1, ((pp.x - ax) * vx + (pp.z - az) * vz) / l2)) : 0;
          if (u > 0 && u < 0.97 && Math.hypot(ax + vx * u - pp.x, az + vz * u - pp.z) < 0.5) continue;
        }
        if (dc > lodDist && this.geos.has(name + '_lo')) name += '_lo';
      }
      const m = this.meshFor(name);
      if (m.count >= MAX) continue;
      const i = m.count++;
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, pp.yaw);
      this.m4.compose(this.p.set(pp.x, pp.y, pp.z), this.q, this.s.setScalar(pp.scale));
      m.setMatrixAt(i, this.m4);
      const g = m.geometry;
      const put = (k: string, hex: number) => {
        this.col.setHex(hex);
        (g.getAttribute(k) as THREE.InstancedBufferAttribute).setXYZ(i, this.col.r, this.col.g, this.col.b);
      };
      put('iTop', pp.top);
      put('iShorts', pp.shorts);
      put('iSkin', pp.skin);
      put('iShoes', pp.shoes);
      put('iHair', pp.hair);
    }
    for (const m of this.meshes.values()) {
      m.instanceMatrix.needsUpdate = true;
      for (const k of ['iTop', 'iShorts', 'iSkin', 'iShoes', 'iHair']) (m.geometry.getAttribute(k) as THREE.InstancedBufferAttribute).needsUpdate = true;
      m.visible = m.count > 0;
    }
  }
}

function crowdMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 iTop, iShorts, iSkin, iShoes, iHair; varying vec3 vKit; varying float vRough;',
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        float part = floor(uv.x * 8.0);
        vKit = iSkin; vRough = 0.6;
        if (part > 0.5 && part < 1.5) { vKit = iTop; vRough = 0.8; }
        else if (part > 1.5 && part < 2.5) { vKit = iShorts; vRough = 0.75; }
        else if (part > 2.5 && part < 3.5) { vKit = vec3(0.85); vRough = 0.9; }
        else if (part > 3.5 && part < 4.5) { vKit = iShoes; vRough = 0.5; }
        else if (part > 4.5 && part < 5.5) { vKit = iHair; vRough = 0.55; }
        else if (part > 5.5 && part < 6.5) { vKit = vec3(0.06); vRough = 0.2; }
        else if (part > 6.5) { vKit = vec3(0.05); vRough = 0.3; }`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKit; varying float vRough;')
      .replace('#include <map_fragment>', 'diffuseColor.rgb *= vKit;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRough;');
  };
  m.customProgramCacheKey = () => 'rm-crowd';
  return m;
}
