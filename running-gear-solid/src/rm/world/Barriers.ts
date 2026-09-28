// OSM barriers: park railings/fences (alpha-tested bars), brick walls and hedges.
// Segments that cross a course are dropped (OSM rarely maps the gates we run through).
import * as THREE from 'three';
import { ArenaData } from './ArenaData';
import { pbr, hash } from '../engine/assets';

function railTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    g.fillRect(i * 32 + 13, 14, 6, 242);
    // finials
    g.beginPath();
    g.moveTo(i * 32 + 10, 16);
    g.lineTo(i * 32 + 16, 0);
    g.lineTo(i * 32 + 22, 16);
    g.fill();
  }
  g.fillRect(0, 34, 128, 7);
  g.fillRect(0, 226, 128, 7);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function hedgeTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1b2a14';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = hash(i, 1) * S, y = hash(i, 2) * S, r = 2 + hash(i, 3) * 5;
    const l = 22 + hash(i, 4) * 40;
    g.fillStyle = `hsl(${85 + hash(i, 5) * 30}, ${35 + hash(i, 6) * 25}%, ${l}%)`;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.6, hash(i, 7) * 3.14, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Barriers {
  readonly group = new THREE.Group();
  private constructor(a: ArenaData, brick: Awaited<ReturnType<typeof pbr>>) {
    const rail: number[] = [], railUv: number[] = [], railN: number[] = [];
    const walls = { p: [] as number[], n: [] as number[], uv: [] as number[] };
    const hedge = { p: [] as number[], n: [] as number[], uv: [] as number[] };
    const quad = (o: { p: number[]; n: number[]; uv: number[] }, ax: number, az: number, bx: number, bz: number, y0a: number, y0b: number, y1a: number, y1b: number, nx: number, nz: number, u0: number, u1: number, v0: number, v1: number, ny = 0) => {
      const P = [[ax, y0a, az, u0, v0], [bx, y0b, bz, u1, v0], [bx, y1b, bz, u1, v1], [ax, y1a, az, u0, v1]];
      // winding so the face points along (nx, ny, nz)
      const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
      const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
      const ord = cx * nx + cy * ny + cz * nz >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of ord) {
        o.p.push(P[k][0], P[k][1], P[k][2]);
        o.n.push(nx, ny, nz);
        o.uv.push(P[k][3], P[k][4]);
      }
    };
    const extrude = (o: typeof walls, pts: number[], thick: number, h: number, uScale: number) => {
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.1) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz, nz = dx;
        const ha = a.heightAt(ax, az) - 0.3, hb = a.heightAt(bx, bz) - 0.3;
        const t = thick / 2;
        for (const s of [-1, 1]) quad(o, ax + nx * t * s, az + nz * t * s, bx + nx * t * s, bz + nz * t * s, ha, hb, ha + h + 0.3, hb + h + 0.3, nx * s, nz * s, 0, len / uScale, 0, (h + 0.3) / uScale);
        // top
        const P = [[ax - nx * t, az - nz * t], [bx - nx * t, bz - nz * t], [bx + nx * t, bz + nz * t], [ax + nx * t, az + nz * t]];
        const ys = [ha + h + 0.3, hb + h + 0.3, hb + h + 0.3, ha + h + 0.3];
        const e1x = P[1][0] - P[0][0], e1z = P[1][1] - P[0][1], e2x = P[2][0] - P[0][0], e2z = P[2][1] - P[0][1];
        const up = e1z * e2x - e1x * e2z; // y of cross product
        const ord = up >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const k of ord) {
          o.p.push(P[k][0], ys[k], P[k][1]);
          o.n.push(0, 1, 0);
          o.uv.push(P[k][0] / uScale, P[k][1] / uScale);
        }
      }
    };
    for (const [bi, b] of a.j.barriers.entries()) {
      const p = b.p;
      // split into runs that stay clear of the course
      let run: number[] = [];
      const flush = () => {
        if (run.length >= 4) {
          if (b.k === 'hedge') extrude(hedge, run, 1.1, 1.3 + hash(bi) * 0.5, 1.6);
          else if (b.k === 'wall') extrude(walls, run, 0.34, 1.4 + hash(bi) * 0.6, 2.2);
          else if (b.k === 'retaining_wall') extrude(walls, run, 0.4, 0.7, 2.2);
          else {
            const h = b.k === 'railing' ? 1.25 : 1.5;
            for (let i = 0; i + 3 < run.length; i += 2) {
              const ax = run[i], az = run[i + 1], bx = run[i + 2], bz = run[i + 3];
              const len = Math.hypot(bx - ax, bz - az);
              if (len < 0.1) continue;
              const ha = a.heightAt(ax, az), hb = a.heightAt(bx, bz);
              const o = { p: rail, n: railN, uv: railUv };
              quad(o, ax, az, bx, bz, ha - 0.05, hb - 0.05, ha + h, hb + h, -(bz - az) / len, (bx - ax) / len, 0, len / 0.55, 0, 1);
            }
          }
        }
        run = [];
      };
      for (let i = 0; i < p.length; i += 2) {
        // densify so course crossings are found on long segments
        if (i >= 2) {
          const px = p[i - 2], pz = p[i - 1], len = Math.hypot(p[i] - px, p[i + 1] - pz);
          const steps = Math.ceil(len / 2);
          for (let s = 1; s <= steps; s++) {
            const x = px + ((p[i] - px) * s) / steps, z = pz + ((p[i + 1] - pz) * s) / steps;
            if (a.courseDist(x, z, 4) < 2.5) flush();
            else run.push(x, z);
          }
        } else if (a.courseDist(p[0], p[1], 4) >= 2.5) run.push(p[0], p[1]);
      }
      flush();
    }
    const mk = (o: { p: number[]; n: number[]; uv: number[] }, m: THREE.Material, shadow = true) => {
      if (!o.p.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    };
    const railMat = new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.45, metalness: 0.7, alphaMap: railTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
    mk({ p: rail, n: railN, uv: railUv }, railMat);
    mk(walls, new THREE.MeshStandardMaterial({ ...brick, roughness: 1, color: 0xd8d0c8 }));
    const ht = hedgeTexture();
    mk(hedge, new THREE.MeshStandardMaterial({ map: ht, roughness: 0.85, color: 0xb8c8a8 }));
  }

  static async create(a: ArenaData) {
    return new Barriers(a, await pbr('brick_wall_02'));
  }
}
