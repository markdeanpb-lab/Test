import * as THREE from 'three';
import { block, crowd, barrier, ground, lampPost, tree, skyline, mergeGeos } from './props';
import { TEX, signTexture } from '../renderer/textures';
import { ps1, glow } from '../shaders/ps1';
import { rng } from '../core/util';
import type { Route } from '../routes/Route';

// ---------------------------------------------------------------------------
// Finsbury Park style parkrun set: a loop path around a grassy hill.
// Path is a closed loop; returns a sampler for positions on it.
// ---------------------------------------------------------------------------
export function parkSet(seed = 11) {
  const g = new THREE.Group();
  const r = rng(seed);
  g.add(ground(400, 400, TEX.grass(), [80, 80], 0xffffff, 30));
  // hill: a smooth mound
  const hillGeo = new THREE.CircleGeometry(45, 24, 0, Math.PI * 2);
  hillGeo.rotateX(-Math.PI / 2);
  const hp = hillGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), z = hp.getZ(i);
    const d = Math.sqrt(x * x + z * z) / 45;
    hp.setY(i, Math.max(0, Math.cos(Math.min(1, d) * Math.PI) * 0.5 + 0.5) * 11);
  }
  hillGeo.computeVertexNormals();
  const hill = new THREE.Mesh(hillGeo, ps1({ map: TEX.grass(), color: 0xe8f0e0, uvScale: [10, 10] }));
  hill.position.set(0, 0, -60);
  g.add(hill);
  // loop path: stadium shape passing over the hill shoulder
  const pts: THREE.Vector3[] = [];
  const N = 180;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = Math.cos(a) * 70;
    const z = Math.sin(a) * 40 - 30;
    const dh = Math.sqrt(x * x + (z + 60) ** 2) / 45;
    const y = dh < 1 ? (Math.cos(dh * Math.PI) * 0.5 + 0.5) * 11 : 0;
    pts.push(new THREE.Vector3(x, y + 0.05, z));
  }
  const curve = new THREE.CatmullRomCurve3(pts, true);
  const tube = pathRibbon(curve, 3.2, TEX.asphalt(), 0xb8b4ac);
  g.add(tube);
  // trees, lamps, benches
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const rr = 85 + r() * 80;
    const t = tree(7 + r() * 7, 100 + i);
    t.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr * 0.8 - 30);
    g.add(t);
  }
  for (let i = 0; i < 20; i++) {
    const p = curve.getPointAt(i / 20);
    const tan = curve.getTangentAt(i / 20);
    const l = lampPost(4.5, 0xfff0c8, 0.6, false);
    l.position.set(p.x + tan.z * 3, p.y, p.z - tan.x * 3);
    g.add(l);
  }
  // gate with sign
  const gate = new THREE.Group();
  for (const x of [-4, 4]) {
    const pillar = block(1, 4, 1, TEX.brick(), 0xffffff, 2);
    pillar.position.x = x;
    gate.add(pillar);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.9), ps1({ map: signTexture('FINSBURY PARK', '#f0e8c0', '#1a3a1a', 128, 16), color: 0xffffff }));
  sign.position.set(0, 3.6, 0.51);
  gate.add(sign);
  const bar = block(9, 0.3, 0.3, null, 0x1a1a1a);
  bar.position.y = 4;
  gate.add(bar);
  const gp = curve.getPointAt(0.25);
  gate.position.set(gp.x, 0, gp.z + 6);
  g.add(gate);
  g.add(skyline(22, 230, 60, 9, 12, 40, TEX.darkWindows()));
  return { group: g, curve };
}

/** flat ribbon along an arbitrary curve */
export function pathRibbon(curve: THREE.Curve<THREE.Vector3>, width: number, tex: THREE.Texture, color = 0xffffff, samples = 300) {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  let len = 0;
  let prev = curve.getPointAt(0);
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u % 1);
    const t = curve.getTangentAt(u % 1);
    len += p.distanceTo(prev);
    prev = p;
    const sx = -t.z, sz = t.x;
    const n = Math.hypot(sx, sz) || 1;
    pos.push(p.x - (sx / n) * width / 2, p.y + 0.03, p.z - (sz / n) * width / 2, p.x + (sx / n) * width / 2, p.y + 0.03, p.z + (sz / n) * width / 2);
    uv.push(0, len / 4, 1, len / 4);
    nor.push(0, 1, 0, 0, 1, 0);
    if (i < samples) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, ps1({ map: tex, color, side: THREE.DoubleSide }));
}

// ---------------------------------------------------------------------------
// Street corridor along a 1:1 GPS route, dressed only near the distances that
// the cameras actually visit (fog hides the rest).
// ---------------------------------------------------------------------------
export type CorridorStyle = 'terrace' | 'city' | 'riverside';

export interface CorridorOpts {
  style: CorridorStyle;
  centers: number[]; // arc-length positions (m) to dress
  radius?: number;
  seed?: number;
  lamp?: number;
  crowd?: boolean;
  roadWidth?: number;
  night?: boolean;
}

export function corridor(route: Route, o: CorridorOpts) {
  const g = new THREE.Group();
  const r = rng(o.seed ?? 21);
  const W = o.roadWidth ?? 9;
  g.add(route.ribbon(W, TEX.road(), o.night ? 0x9098a8 : 0xffffff, 0.04, 10));
  // pavement strips
  const pave = new THREE.Group();
  g.add(pave);
  const radius = o.radius ?? 260;
  const facadeGeos: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const placed: THREE.Vector3[] = [];
  for (const c of o.centers) {
    const s0 = Math.max(0, c - radius), s1 = Math.min(route.total, c + radius);
    for (let s = s0; s < s1; s += 9 + r() * 5) {
      const { pos, dir } = route.at(s / route.total);
      const side = new THREE.Vector3().crossVectors(dir, up).normalize();
      for (const sgn of [-1, 1]) {
        const base = pos.clone().addScaledVector(side, sgn * (W / 2 + 4.5 + r() * 2));
        if (placed.some((p) => p.distanceToSquared(base) < 36)) continue;
        placed.push(base);
        const yaw = Math.atan2(dir.x, dir.z);
        if (o.style === 'riverside') {
          if (sgn < 0) continue; // river on the other side
          if (r() < 0.45) {
            const t = tree(7 + r() * 6, Math.floor(s));
            t.position.copy(base).addScaledVector(side, 3);
            g.add(t);
          }
          continue;
        }
        const h = o.style === 'terrace' ? 7 + r() * 2.5 : 10 + r() * 22;
        const w = o.style === 'terrace' ? 8 : 10 + r() * 6;
        const bg = new THREE.BoxGeometry(w, h, 9);
        const uv = bg.attributes.uv as THREE.BufferAttribute;
        const n = bg.attributes.normal as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          const ny = Math.abs(n.getY(i));
          uv.setXY(i, uv.getX(i) * (Math.abs(n.getX(i)) > 0.5 ? 9 : w) / 8, uv.getY(i) * (ny > 0.5 ? 9 : h) / 8);
        }
        bg.translate(0, h / 2, 0);
        const m = new THREE.Matrix4().makeRotationY(yaw);
        m.setPosition(base.x + side.x * sgn * 4.5, base.y, base.z + side.z * sgn * 4.5);
        bg.applyMatrix4(m);
        facadeGeos.push(bg);
      }
      if (r() < 0.35) {
        const l = lampPost(5.5, o.lamp ?? 0xffb860, 1.4, !!o.night);
        const sgn = r() < 0.5 ? -1 : 1;
        l.position.copy(pos).addScaledVector(side, sgn * (W / 2 + 0.6));
        l.rotation.y = Math.atan2(dir.x, dir.z) + (sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
        g.add(l);
      }
      if (o.crowd && r() < 0.8) {
        for (const sgn of [-1, 1]) {
          const cr = crowd(6, 7, 1.2, Math.floor(s * 7 + sgn));
          cr.position.copy(pos).addScaledVector(side, sgn * (W / 2 + 1.6));
          cr.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
          g.add(cr);
          const b = barrier(7);
          b.position.copy(pos).addScaledVector(side, sgn * (W / 2 + 0.5));
          b.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
          g.add(b);
        }
      }
    }
  }
  if (facadeGeos.length) {
    const tex = o.style === 'terrace' ? TEX.terrace() : o.night ? TEX.windows() : TEX.darkWindows();
    const merged = mergeGeos(facadeGeos.map((x) => x.toNonIndexed()));
    g.add(new THREE.Mesh(merged, ps1({ map: tex, color: o.night ? 0xb0b0c0 : 0xffffff })));
  }
  return g;
}

// ---------------------------------------------------------------------------
// Tactical map: glowing grid + route polyline, used for dive transitions.
// ---------------------------------------------------------------------------
export function tacticalMap(route: Route, color = 0x6cf07a) {
  const g = new THREE.Group();
  const size = 260;
  const grid = new THREE.GridHelper(size, 26, color, 0x1c5a28);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material & { opacity: number }).opacity = 0.6;
  g.add(grid);
  const base = new THREE.Mesh(new THREE.PlaneGeometry(size, size), ps1({ color: 0x031208, unlit: true, fog: 0 }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.05;
  g.add(base);
  const line = route.line(color, 0.2);
  g.add(line);
  // thick glow under the line
  const glowRibbon = route.ribbon(2.2, TEX.road(), 0xffffff, 0.1, 10);
  glowRibbon.material = glow(color, 0.35);
  g.add(glowRibbon);
  return { group: g, line };
}

export { glow };
