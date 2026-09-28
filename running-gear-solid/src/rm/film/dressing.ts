// Race-day dressing placed along a course: steel crowd barriers, start/finish arches with
// printed banners, parkrun finish funnels, km boards and cones. All procedural.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RaceScene } from './RaceScene';

const steel = new THREE.MeshStandardMaterial({ color: 0xb9bdc2, metalness: 0.85, roughness: 0.35 });

function tube(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 6, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** one 2.3 m steel crowd-barrier panel, along +x, feet at y=0 */
let panelGeo: THREE.BufferGeometry | null = null;
function barrierPanel() {
  if (panelGeo) return panelGeo;
  const V = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  const parts: THREE.BufferGeometry[] = [];
  const W = 2.2, H = 1.1;
  parts.push(tube(V(0, 0.12), V(0, H), 0.022), tube(V(W, 0.12), V(W, H), 0.022), tube(V(0, H), V(W, H), 0.022), tube(V(0, 0.2), V(W, 0.2), 0.018));
  for (let i = 1; i < 14; i++) parts.push(tube(V((W * i) / 14, 0.2), V((W * i) / 14, H), 0.009));
  for (const x of [0.1, W - 0.1]) parts.push(tube(V(x, 0.02, -0.35), V(x, 0.02, 0.35), 0.02), tube(V(x, 0.02, 0), V(x, 0.2, 0), 0.015));
  panelGeo = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  return panelGeo;
}

/** Steel barriers along a course stretch, on one side (+1 right, -1 left) at lateral offset. */
export function barriers(race: RaceScene, s0: number, s1: number, side: 1 | -1, off: number) {
  const g = barrierPanel();
  const n = Math.max(1, Math.floor((s1 - s0) / 2.3));
  const m = new THREE.InstancedMesh(g, steel, n);
  const q = new THREE.Quaternion(), mat = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const a = race.place(s0 + i * 2.3, side * off), b = race.place(s0 + (i + 1) * 2.3, side * off);
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    mat.compose(new THREE.Vector3(a.x, Math.min(a.y, b.y), a.z), q, new THREE.Vector3(Math.hypot(b.x - a.x, b.z - a.z) / 2.2, 1, 1));
    m.setMatrixAt(i, mat);
  }
  m.castShadow = true;
  m.receiveShadow = true;
  race.extras.add(m);
  return m;
}

function bannerTexture(lines: string[], o: { bg?: string; fg?: string; accent?: string } = {}) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = o.bg ?? '#10151c';
  g.fillRect(0, 0, 2048, 256);
  g.fillStyle = o.accent ?? '#ff5a1f';
  g.fillRect(0, 0, 2048, 18);
  g.fillRect(0, 238, 2048, 18);
  g.fillStyle = o.fg ?? '#f2f2f2';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 150px Rajdhani';
  (g as any).letterSpacing = '24px';
  g.fillText(lines[0], 1024, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

/** Inflatable-style arch across the course at arc s with a banner (START / FINISH). */
export function arch(race: RaceScene, s: number, text: string, width = 9, o: { bg?: string; accent?: string } = {}) {
  const p = race.place(s, 0);
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: o.bg ? new THREE.Color(o.bg) : 0x1a212b, roughness: 0.6 });
  const legGeo = new THREE.CylinderGeometry(0.45, 0.55, 5, 16);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, mat);
    leg.position.set((sx * width) / 2, 2.5, 0);
    leg.castShadow = true;
    grp.add(leg);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 1.1, 1.3, 0.9), mat);
  beam.position.y = 5.2;
  beam.castShadow = true;
  grp.add(beam);
  const tex = bannerTexture([text], o);
  const bm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 });
  for (const z of [-0.46, 0.46]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width + 1.0, 1.15), bm);
    face.position.set(0, 5.2, z);
    if (z < 0) face.rotation.y = Math.PI;
    grp.add(face);
  }
  grp.position.set(p.x, p.y, p.z);
  grp.rotation.y = Math.atan2(p.dx, p.dz);
  race.extras.add(grp);
  return grp;
}

/** parkrun finish funnel: stakes with tape lining the last metres, flags. */
export function funnel(race: RaceScene, s: number, len = 30, half = 1.3) {
  const stakeGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.05, 6);
  stakeGeo.translate(0, 0.52, 0);
  const stakeMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });
  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, map: tapeTexture() });
  for (const side of [-1, 1] as const) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= len; k += 2.5) {
      const p = race.place(s - len + k, side * half);
      const st = new THREE.Mesh(stakeGeo, stakeMat);
      st.position.set(p.x, p.y, p.z);
      st.castShadow = true;
      race.extras.add(st);
      pts.push(new THREE.Vector3(p.x, p.y + 0.95, p.z));
    }
    const pos: number[] = [], uv: number[] = [];
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const l = a.distanceTo(b);
      const q = [a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y - 0.07, b.z, a.x, a.y - 0.07, a.z];
      for (const k of [0, 1, 2, 0, 2, 3]) pos.push(q[k * 3], q[k * 3 + 1], q[k * 3 + 2]);
      const us = [acc, acc + l, acc + l, acc];
      const vs = [1, 1, 0, 0];
      for (const k of [0, 1, 2, 0, 2, 3]) uv.push(us[k] / 1.2, vs[k]);
      acc += l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    race.extras.add(new THREE.Mesh(g, tapeMat));
  }
  // finish flags
  flag(race, s, -half - 0.3, '#5c2a86');
  flag(race, s, half + 0.3, '#5c2a86');
}

function tapeTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#e8e8e8' : '#d8261c';
    g.beginPath();
    g.moveTo(i * 16, 16);
    g.lineTo(i * 16 + 8, 0);
    g.lineTo(i * 16 + 24, 0);
    g.lineTo(i * 16 + 16, 16);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** feather flag on a pole */
export function flag(race: RaceScene, s: number, off: number, col: string, text = '') {
  const p = race.place(s, off);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.2, 6), steel);
  pole.position.set(p.x, p.y + 1.6, p.z);
  race.extras.add(pole);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = col;
  g.fillRect(0, 0, 128, 512);
  if (text) {
    g.fillStyle = '#fff';
    g.font = '700 64px Rajdhani';
    g.translate(64, 256);
    g.rotate(-Math.PI / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 2.2), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
  f.position.set(p.x + 0.3 * p.dx, p.y + 2.05, p.z + 0.3 * p.dz);
  f.rotation.y = Math.atan2(p.dx, p.dz) - Math.PI / 2;
  f.castShadow = true;
  race.extras.add(f);
}

/** km board (A-frame sign) at the side of the course */
export function kmBoard(race: RaceScene, s: number, label: string, off = 3) {
  const p = race.place(s, off);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 256, 320);
  g.fillStyle = '#ff5a1f';
  g.fillRect(0, 0, 256, 40);
  g.fillStyle = '#111';
  g.textAlign = 'center';
  g.font = '700 150px Rajdhani';
  g.fillText(label, 128, 230);
  g.font = '600 44px Rajdhani';
  g.fillText('KM', 128, 295);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.04), [steel, steel, steel, steel, new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })]);
  m.position.set(p.x, p.y + 1.25, p.z);
  m.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI;
  m.castShadow = true;
  race.extras.add(m);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), steel);
  legs.position.set(p.x, p.y + 0.45, p.z);
  race.extras.add(legs);
}

/**
 * A through-arch bridge carrying the course over water between arcs s0..s1 (Tyne Bridge style):
 * deck at the approach heights, a green steel arch with hangers. Returns the deck-height function.
 */
export function archBridge(race: RaceScene, s0: number, s1: number, o: { rise?: number; col?: number; width?: number; approach?: number } = {}) {
  const y0 = race.arena.heightAt(race.courseAt(s0).x, race.courseAt(s0).z);
  const y1 = race.arena.heightAt(race.courseAt(s1).x, race.courseAt(s1).z);
  const ap = o.approach ?? 30;
  // approaches ramp from the road surface up to the abutments, so the deck meets the street flush
  const road = (s: number) => race.arena.heightAt(race.courseAt(s).x, race.courseAt(s).z);
  const ramp = (u: number) => u * u * (3 - 2 * u);
  const deckY = (s: number) => {
    if (s < s0 - ap || s > s1 + ap) return null;
    if (s < s0) return road(s) + (y0 - road(s)) * ramp((s - (s0 - ap)) / ap);
    if (s > s1) return road(s) + (y1 - road(s)) * ramp(1 - (s - s1) / ap);
    return y0 + (y1 - y0) * ((s - s0) / (s1 - s0));
  };
  const W = o.width ?? 14;
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.85, side: THREE.DoubleSide });
  const steelMat = new THREE.MeshStandardMaterial({ color: o.col ?? 0x2f5d3a, roughness: 0.5, metalness: 0.6 });
  const n = Math.ceil((s1 - s0 + 2 * ap) / 4);
  const parts: THREE.BufferGeometry[] = [];
  const arches: THREE.BufferGeometry[] = [];
  const rise = o.rise ?? 30;
  const P0 = race.courseAt(s0), P1 = race.courseAt(s1);
  const cl = Math.hypot(P1.x - P0.x, P1.z - P0.z) || 1;
  const cd = { x: (P1.x - P0.x) / cl, z: (P1.z - P0.z) / cl };
  const chord = (u: number) => ({ x: P0.x + (P1.x - P0.x) * u, z: P0.z + (P1.z - P0.z) * u });
  // deck: one continuous ribbon along the course (per-segment boxes left sawtooth seams on bends)
  {
    const pos: number[] = [];
    const edge = (s: number) => {
      const q = race.courseAt(s);
      const y = deckY(s)! + 0.02;
      return { lx: q.x - q.dz * (W / 2), lz: q.z + q.dx * (W / 2), rx: q.x + q.dz * (W / 2), rz: q.z - q.dx * (W / 2), y };
    };
    const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < n; i++) {
      const A = edge(s0 - ap + i * 4), B = edge(s0 - ap + (i + 1) * 4);
      quad([A.lx, A.y, A.lz], [A.rx, A.y, A.rz], [B.rx, B.y, B.rz], [B.lx, B.y, B.lz]); // top
      quad([A.lx, A.y - 1.4, A.lz], [B.lx, B.y - 1.4, B.lz], [B.rx, B.y - 1.4, B.rz], [A.rx, A.y - 1.4, A.rz]); // underside
      quad([A.lx, A.y, A.lz], [B.lx, B.y, B.lz], [B.lx, B.y - 1.4, B.lz], [A.lx, A.y - 1.4, A.lz]); // left fascia
      quad([A.rx, A.y, A.rz], [A.rx, A.y - 1.4, A.rz], [B.rx, B.y - 1.4, B.rz], [B.rx, B.y, B.rz]); // right fascia
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  for (let i = 0; i < n; i++) {
    const sa = s0 - ap + i * 4, sb = sa + 4;
    const a = race.courseAt(sa), b = race.courseAt(sb);
    const ya = deckY(sa)!, yb = deckY(sb)!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const m = new THREE.Matrix4().makeRotationY(Math.atan2(b.x - a.x, b.z - a.z));
    m.setPosition(a.x, (ya + yb) / 2 + 0.02, a.z);
    // parapets
    for (const side of [-1, 1]) {
      const p = new THREE.BoxGeometry(0.3, 1.1, len + 0.05);
      p.translate((side * W) / 2, 0.55, len / 2);
      p.applyMatrix4(m);
      parts.push(p.toNonIndexed());
    }
    // arch over the water span
    if (sa >= s0 && sb <= s1) {
      const u0 = (sa - s0) / (s1 - s0), u1 = (sb - s0) / (s1 - s0);
      const h0 = 4 * rise * u0 * (1 - u0), h1 = 4 * rise * u1 * (1 - u1);
      // the arch rides the straight chord between the abutments (GPS wiggle would kink it)
      const ca = chord(u0), cb = chord(u1);
      for (const side of [-1, 1]) {
        const off = side * (W / 2 + 0.6);
        const A = new THREE.Vector3(ca.x - cd.z * off, ya + h0, ca.z + cd.x * off), B = new THREE.Vector3(cb.x - cd.z * off, yb + h1, cb.z + cd.x * off);
        const g = new THREE.BoxGeometry(1.2, 1.6, A.distanceTo(B) + 0.3);
        g.lookAt(B.clone().sub(A));
        g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
        arches.push(g.toNonIndexed());
        if (h0 > 2 && i % 2 === 0) {
          const hg = new THREE.CylinderGeometry(0.08, 0.08, h0, 5);
          hg.translate(A.x, ya + h0 / 2, A.z);
          arches.push(hg.toNonIndexed());
        }
      }
      if (i % 3 === 0 && h0 > 8) {
        const tie = new THREE.BoxGeometry(W + 1.2, 0.6, 0.6);
        tie.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.atan2(cd.x, cd.z)).setPosition(ca.x, ya + h0, ca.z));
        arches.push(tie.toNonIndexed());
      }
    }
  }
  for (const p of parts) p.deleteAttribute('uv');
  const deck = new THREE.Mesh(mergeGeometries(parts), deckMat);
  deck.castShadow = deck.receiveShadow = true;
  race.extras.add(deck);
  if (arches.length) {
    const arch = new THREE.Mesh(mergeGeometries(arches), steelMat);
    arch.castShadow = arch.receiveShadow = true;
    race.extras.add(arch);
  }
  return deckY;
}

/** Simple flat bridges wherever the course crosses water (river/canal/lake). Returns a deck fn. */
export function autoBridges(race: RaceScene, width = 9) {
  const spans: [number, number][] = [];
  const L = race.course.length;
  let a = -1;
  for (let s = 0; s <= L; s += 2) {
    const q = race.courseAt(s);
    const wet = race.arena.data.maskAt(q.x, q.z) > 0.25;
    if (wet && a < 0) a = s;
    if (!wet && a >= 0) {
      spans.push([a - 8, s + 8]);
      a = -1;
    }
  }
  const decks = spans.map(([s0, s1]) => archBridge(race, s0, s1, { rise: 0, col: 0x55575a, width, approach: 4 }));
  if (!decks.length) return undefined;
  return (s: number) => {
    for (const d of decks) {
      const y = d(s);
      if (y !== null) return y;
    }
    return null;
  };
}
