import * as THREE from 'three';
import type { RouteData } from '../data/activities';
import { ps1 } from '../shaders/ps1';
import { TEX } from '../renderer/textures';

// Converts a Strava GPS stream (lat/lng + altitude) into scene geometry:
// a smoothed centre line, a road ribbon, terrain heights and a normalised
// 2D polyline for the radar / tactical-map UI.

export interface RouteOpts {
  scale: number; // scene units per metre
  altScale?: number; // vertical exaggeration (scene units per metre of altitude)
  samples?: number;
}

export class Route {
  readonly pts: THREE.Vector3[] = [];
  readonly cum: number[] = [];
  readonly total: number;
  readonly radar: [number, number][] = [];
  readonly bounds = new THREE.Box3();
  readonly minAlt: number;

  constructor(readonly data: RouteData, o: RouteOpts) {
    const lat0 = data.latlng[0][0];
    const lon0 = data.latlng[0][1];
    const k = Math.cos((lat0 * Math.PI) / 180);
    this.minAlt = Math.min(...data.altitude);
    const raw = data.latlng.map(([lat, lon], i) => {
      const x = (lon - lon0) * k * 111320 * o.scale;
      const z = -(lat - lat0) * 110540 * o.scale;
      const y = (data.altitude[i] - this.minAlt) * (o.altScale ?? o.scale);
      return new THREE.Vector3(x, y, z);
    });
    // drop duplicate points (curve needs distinct points)
    const dedup = raw.filter((p, i) => i === 0 || p.distanceTo(raw[i - 1]) > 1e-3);
    const curve = new THREE.CatmullRomCurve3(dedup, false, 'centripetal');
    const n = o.samples ?? 400;
    const sp = curve.getSpacedPoints(n);
    let acc = 0;
    sp.forEach((p, i) => {
      if (i > 0) acc += p.distanceTo(sp[i - 1]);
      this.pts.push(p);
      this.cum.push(acc);
      this.bounds.expandByPoint(p);
    });
    this.total = acc;
    // radar polyline, normalised to [-1,1] keeping aspect, screen y down = south
    const w = this.bounds.max.x - this.bounds.min.x;
    const d = this.bounds.max.z - this.bounds.min.z;
    const s = 2 / Math.max(w, d, 1e-6);
    const cx = (this.bounds.max.x + this.bounds.min.x) / 2;
    const cz = (this.bounds.max.z + this.bounds.min.z) / 2;
    for (let i = 0; i < this.pts.length; i += 2) {
      const p = this.pts[i];
      this.radar.push([(p.x - cx) * s, (p.z - cz) * s]);
    }
  }

  /** position + tangent at arc-length fraction u in [0,1] */
  at(u: number, out = new THREE.Vector3(), dir = new THREE.Vector3()) {
    const target = Math.max(0, Math.min(1, u)) * this.total;
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] <= target) lo = m;
      else hi = m;
    }
    const seg = this.cum[hi] - this.cum[lo] || 1;
    const f = (target - this.cum[lo]) / seg;
    out.lerpVectors(this.pts[lo], this.pts[hi], f);
    dir.subVectors(this.pts[hi], this.pts[lo]).normalize();
    return { pos: out, dir };
  }

  /** Flat ribbon (road) following the route. */
  ribbon(width: number, tex = TEX.road(), color = 0xffffff, lift = 0.02, texLen = 8) {
    const n = this.pts.length;
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const nor = new Float32Array(n * 2 * 3);
    const idx: number[] = [];
    const side = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = this.pts[Math.max(0, i - 1)];
      const b = this.pts[Math.min(n - 1, i + 1)];
      const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
      side.set(-dir.z, 0, dir.x).multiplyScalar(width / 2);
      const p = this.pts[i];
      pos.set([p.x - side.x, p.y + lift, p.z - side.z, p.x + side.x, p.y + lift, p.z + side.z], i * 6);
      nor.set([0, 1, 0, 0, 1, 0], i * 6);
      const v = this.cum[i] / texLen;
      uv.set([0, v, 1, v], i * 4);
      if (i < n - 1) {
        const k = i * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    return new THREE.Mesh(g, ps1({ map: tex, color, side: THREE.DoubleSide }));
  }

  /** Glowing polyline for the tactical map */
  line(color = 0x6cf07a, y = 0.1) {
    const g = new THREE.BufferGeometry().setFromPoints(this.pts.map((p) => new THREE.Vector3(p.x, p.y + y, p.z)));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 }));
  }

  /** Height of the route at the nearest point (for terrain generation) */
  nearest(x: number, z: number) {
    let best = Infinity, bi = 0;
    for (let i = 0; i < this.pts.length; i += 2) {
      const p = this.pts[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    return { dist: Math.sqrt(best), y: this.pts[bi].y, i: bi };
  }

  center() {
    return this.bounds.getCenter(new THREE.Vector3());
  }
}
