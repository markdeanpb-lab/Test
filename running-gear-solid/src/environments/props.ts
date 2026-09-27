import * as THREE from 'three';
import { glow, ps1, PS1Options } from '../shaders/ps1';
import { TEX } from '../renderer/textures';
import { rng } from '../core/util';

// Reusable low-poly set dressing. Everything is built from boxes, prisms and
// crossed quads, textured with the 64x64 procedural textures.

export function ground(w: number, d: number, tex: THREE.Texture | null, repeat: [number, number], color = 0xffffff, segs = 16, extra: PS1Options = {}) {
  const g = new THREE.PlaneGeometry(w, d, segs, segs);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, ps1({ map: tex, color, uvScale: repeat, ...extra }));
  return m;
}

/** Box with world-scaled UVs so textures keep a constant texel size */
export function block(w: number, h: number, d: number, tex: THREE.Texture | null, color = 0xffffff, texel = 8, extra: PS1Options = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const sx = nx > 0.5 ? d : w;
    const sy = ny > 0.5 ? d : h;
    uv.setXY(i, (uv.getX(i) * sx) / texel, (uv.getY(i) * sy) / texel);
  }
  g.translate(0, h / 2, 0);
  return new THREE.Mesh(g, ps1({ map: tex, color, ...extra }));
}

export function skyDome(top: number, horizon: number, bottom = horizon, radius = 900) {
  const g = new THREE.SphereGeometry(radius, 16, 10);
  const c = new Float32Array(g.attributes.position.count * 3);
  const ct = new THREE.Color(top), ch = new THREE.Color(horizon), cb = new THREE.Color(bottom);
  const tmp = new THREE.Color();
  for (let i = 0; i < g.attributes.position.count; i++) {
    const y = g.attributes.position.getY(i) / radius;
    if (y >= 0) tmp.copy(ch).lerp(ct, Math.pow(y, 0.6));
    else tmp.copy(ch).lerp(cb, Math.min(1, -y * 3));
    c.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, ps1({ vertexColors: true, unlit: true, fog: 0, side: THREE.BackSide, depthWrite: false, snap: false }));
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

export function disc(r: number, color: number, opacity = 1) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), glow(color, opacity));
  return m;
}

export function lampPost(h = 5, color = 0xffc070, arm = 1.2, withCone = true) {
  const g = new THREE.Group();
  const pole = ps1({ color: 0x2a2c30 });
  g.add(block(0.14, h, 0.14, null, 0x2a2c30));
  const a = block(arm, 0.1, 0.1, null, 0x2a2c30);
  a.position.set(arm / 2, h - 0.1, 0);
  g.add(a);
  const head = block(0.4, 0.14, 0.25, null, 0xffffff, 8, { emissive: color, unlit: true });
  head.position.set(arm, h - 0.25, 0);
  g.add(head);
  if (withCone) {
    const cg = new THREE.ConeGeometry(2.2, h - 0.3, 8, 1, true);
    cg.translate(0, -(h - 0.3) / 2, 0);
    const cone = new THREE.Mesh(cg, glow(color, 0.07));
    cone.position.set(arm, h - 0.3, 0);
    g.add(cone);
  }
  void pole;
  return g;
}

export function tree(h = 6, seed = 1) {
  const g = new THREE.Group();
  const r = rng(seed);
  const tex = TEX.foliage();
  const m = ps1({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, color: new THREE.Color().setHSL(0.28 + r() * 0.06, 0.4, 0.45 + r() * 0.15) });
  const w = h * (0.7 + r() * 0.3);
  for (let i = 0; i < 2; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.y = h / 2;
    p.rotation.y = (i * Math.PI) / 2 + r();
    g.add(p);
  }
  return g;
}

export function barrier(len: number, tex = TEX.hazard()) {
  const g = new THREE.Group();
  const b = block(len, 0.35, 0.08, tex, 0xffffff, 0.7);
  b.position.y = 0.7;
  g.add(b);
  for (let x = -len / 2; x <= len / 2 + 0.01; x += len / Math.max(1, Math.round(len / 2.5))) {
    const leg = block(0.08, 1.05, 0.08, null, 0x9a9a9a);
    leg.position.x = x;
    g.add(leg);
  }
  return g;
}

/** Instanced crowd of billboard silhouettes along a line (x from -len/2..len/2) */
export function crowd(count: number, len: number, depth: number, seed = 3) {
  const r = rng(seed);
  const tex = TEX.crowd();
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(r() * 8);
    const pg = new THREE.PlaneGeometry(0.75, 1.6 + r() * 0.25);
    const uv = pg.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (idx + uv.getX(k)) / 8);
    pg.translate((r() - 0.5) * len, 0.85, (r() - 0.5) * depth);
    geos.push(pg);
  }
  const merged = mergeGeos(geos);
  const mesh = new THREE.Mesh(merged, ps1({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
  return mesh;
}

export function mergeGeos(geos: THREE.BufferGeometry[]) {
  let total = 0;
  let idxTotal = 0;
  for (const g of geos) {
    total += g.attributes.position.count;
    idxTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const hasColor = geos.every((g) => g.attributes.color);
  const col = hasColor ? new Float32Array(total * 3) : null;
  const index: number[] = [];
  let off = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array as Float32Array, off * 3);
    nor.set(g.attributes.normal.array as Float32Array, off * 3);
    uv.set(g.attributes.uv.array as Float32Array, off * 2);
    if (col) col.set(g.attributes.color.array as Float32Array, off * 3);
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(g.index.getX(i) + off);
    else for (let i = 0; i < n; i++) index.push(i + off);
    off += n;
  }
  void idxTotal;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(index);
  return out;
}

/** City block skyline: n boxes around a centre, windows texture */
export function skyline(n: number, radius: number, spread: number, seed = 5, minH = 10, maxH = 60, tex = TEX.windows()) {
  const r = rng(seed);
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.2;
    const d = radius + r() * spread;
    const h = minH + r() * (maxH - minH);
    const b = block(8 + r() * 14, h, 8 + r() * 14, tex, new THREE.Color().setHSL(0.6, 0.05, 0.35 + r() * 0.3).getHex(), 8);
    b.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    b.rotation.y = r() * Math.PI;
    g.add(b);
  }
  return g;
}

export function containerStack(seed = 1, rows = 3, cols = 4, tiers = 3) {
  const r = rng(seed);
  const g = new THREE.Group();
  for (let x = 0; x < cols; x++)
    for (let z = 0; z < rows; z++) {
      const h = 1 + Math.floor(r() * tiers);
      for (let y = 0; y < h; y++) {
        const c = block(6, 2.6, 2.44, TEX.corrugated(Math.floor(r() * 5)), 0xffffff, 3);
        c.position.set(x * 6.3, y * 2.6, z * 2.6);
        g.add(c);
      }
    }
  return g;
}

export function crane(h = 30, jib = 28, color = 0xd8b020) {
  const g = new THREE.Group();
  const m = ps1({ color });
  const legW = 6;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = block(0.5, h, 0.5, null, color);
    leg.position.set((x * legW) / 2, 0, (z * legW) / 2);
    g.add(leg);
  }
  for (let y = 4; y < h; y += 6) {
    for (const [w, d, x, z] of [[legW, 0.3, 0, -legW / 2], [legW, 0.3, 0, legW / 2], [0.3, legW, -legW / 2, 0], [0.3, legW, legW / 2, 0]]) {
      const b = block(w, 0.3, d, null, color);
      b.position.set(x, y, z);
      g.add(b);
    }
  }
  const cab = block(5, 4, 4, TEX.metal(), 0xe0e0e0, 4);
  cab.position.y = h;
  g.add(cab);
  const boom = block(jib, 1.2, 1.2, null, color);
  boom.position.set(jib / 2 - 4, h + 3, 0);
  g.add(boom);
  const back = block(10, 1, 1, null, color);
  back.position.set(-8, h + 3, 0);
  g.add(back);
  const cable = block(0.08, h * 0.6, 0.08, null, 0x202020);
  cable.position.set(jib - 8, h + 3 - h * 0.6, 0);
  g.add(cable);
  void m;
  return g;
}

export function chimney(r1: number, r2: number, h: number, color = 0x8a8078) {
  const g = new THREE.CylinderGeometry(r2, r1, h, 8, 3, true);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * (h / 8));
  return new THREE.Mesh(g, ps1({ map: TEX.concrete(), color }));
}

export function arch(w: number, h: number, d: number, tex: THREE.Texture) {
  // brick arch (viaduct span) built from a box with an arched opening approximated by stacked boxes
  const g = new THREE.Group();
  const pierW = 2.2;
  const left = block(pierW, h, d, tex, 0xffffff, 3);
  left.position.x = -w / 2 + pierW / 2;
  const right = left.clone();
  right.position.x = w / 2 - pierW / 2;
  g.add(left, right);
  const top = block(w, h * 0.22, d, tex, 0xffffff, 3);
  top.position.y = h * 0.78;
  g.add(top);
  const span = w - pierW * 2;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const f = i / steps;
    const ww = (span / 2) * (1 - Math.cos((f * Math.PI) / 2)) + 0.01;
    const hh = (h * 0.78 - h * 0.55) / steps;
    for (const s of [-1, 1]) {
      const b = block(ww, hh + 0.02, d, tex, 0xffffff, 3);
      b.position.set(s * (span / 2 - ww / 2), h * 0.55 + i * hh, 0);
      g.add(b);
    }
  }
  return g;
}

/** Seven segment digit made from 7 box segments; returns group + setter */
export function sevenSeg(size = 1, depth = 0.3, onColor = 0xff3020, offColor = 0x301010) {
  const g = new THREE.Group();
  const L = size, T = size * 0.18;
  const segs: THREE.Mesh[] = [];
  const onM = ps1({ color: onColor, emissive: onColor, unlit: true });
  const offM = ps1({ color: offColor });
  const defs: [number, number, number, number][] = [
    [0, L, L, T], // a top
    [L / 2, L / 2, T, L], // b
    [L / 2, -L / 2, T, L], // c
    [0, -L, L, T], // d
    [-L / 2, -L / 2, T, L], // e
    [-L / 2, L / 2, T, L], // f
    [0, 0, L, T], // g
  ];
  for (const [x, y, w, h] of defs) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), offM);
    m.position.set(x, y, 0);
    g.add(m);
    segs.push(m);
  }
  const MAP: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcfgd', '-': 'g', ' ': '' };
  const set = (ch: string) => {
    const on = MAP[ch] ?? '';
    'abcdefg'.split('').forEach((s, i) => (segs[i].material = on.includes(s) ? onM : offM));
  };
  return { group: g, set, onM, offM };
}

export function gravestone(seed: number) {
  const r = rng(seed);
  const g = new THREE.Group();
  const h = 0.8 + r() * 0.8;
  const s = block(0.6 + r() * 0.3, h, 0.18, TEX.cemetery(), 0xd0d0c8, 1);
  s.rotation.z = (r() - 0.5) * 0.2;
  s.rotation.x = (r() - 0.5) * 0.15;
  g.add(s);
  if (r() > 0.6) {
    const c = block(0.12, 0.6, 0.12, TEX.stone(), 0xd0d0c8, 1);
    c.position.y = h;
    g.add(c);
    const bar = block(0.4, 0.1, 0.12, TEX.stone(), 0xd0d0c8, 1);
    bar.position.y = h + 0.35;
    g.add(bar);
  }
  return g;
}

export function searchlight(color = 0xfff0c0, len = 40, radius = 5, opacity = 0.08) {
  const cg = new THREE.ConeGeometry(radius, len, 10, 1, true);
  cg.translate(0, -len / 2, 0);
  cg.rotateX(Math.PI);
  return new THREE.Mesh(cg, glow(color, opacity));
}

export function crt(w = 1.2, h = 0.9, screen: THREE.Texture | null = null, screenColor = 0x40ff60) {
  const g = new THREE.Group();
  g.add(block(w, h, w * 0.9, null, 0x3a3c40));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.72), ps1({ map: screen, color: screenColor, unlit: true }));
  s.position.set(0, h / 2, w * 0.451);
  g.add(s);
  return { group: g, screen: s };
}
