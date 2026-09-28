// Water surfaces: a 3 m grid over the carved water mask, draped on the DEM just below the
// banks, with a glossy dark material and animated ripple normals (deterministic in time).
import * as THREE from 'three';
import { ArenaData } from './ArenaData';

export class Water {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uTime: { value: 0 }, uRipple: { value: 1 } };
  constructor(a: ArenaData) {
    const R = 3;
    const b = a.bounds;
    const nx = Math.ceil((b.x1 - b.x0) / R), nz = Math.ceil((b.z1 - b.z0) / R);
    const pos: number[] = [], idx: number[] = [];
    const vid = new Map<number, number>();
    const V = (i: number, j: number) => {
      const k = j * (nx + 1) + i;
      let v = vid.get(k);
      if (v === undefined) {
        const x = b.x0 + i * R, z = b.z0 + j * R;
        v = pos.length / 3;
        pos.push(x, a.waterAt(x, z), z);
        vid.set(k, v);
      }
      return v;
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = b.x0 + (i + 0.5) * R, z = b.z0 + (j + 0.5) * R;
      if (a.maskAt(x, z) < 0.12) continue;
      const v00 = V(i, j), v10 = V(i + 1, j), v01 = V(i, j + 1), v11 = V(i + 1, j + 1);
      idx.push(v00, v01, v10, v10, v01, v11);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.MeshStandardMaterial({ color: 0x0b1410, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.3 });
    const u = this.uniforms;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP2;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP2 = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWP2; uniform float uTime, uRipple;')
        .replace(
          '#include <normal_fragment_maps>',
          `vec2 p = vWP2.xz; float t = uTime;
          vec2 d = vec2(0.0);
          d += vec2(cos(p.x * 0.9 + t * 1.1 + p.y * 0.3), sin(p.y * 1.1 - t * 0.9)) * 0.05;
          d += vec2(sin(p.x * 2.7 - p.y * 1.3 + t * 2.1), cos(p.y * 3.1 + p.x * 0.7 + t * 1.7)) * 0.025;
          d += vec2(sin(p.x * 7.3 + p.y * 5.1 + t * 3.3), cos(p.x * 6.1 - p.y * 7.7 + t * 2.9)) * 0.012;
          vec3 wn = normalize(vec3(d.x * uRipple, 1.0, d.y * uRipple));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`,
        );
    };
    m.customProgramCacheKey = () => 'rm-water';
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
  }
}
