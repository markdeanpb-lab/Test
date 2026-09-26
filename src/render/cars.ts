// Procedural car models per technical era with team liveries, patterns and number roundels.
// Cars are identifiable by number and pattern as well as colour.
import * as THREE from 'three';
import type { CarVisual } from '../sim/types';
import { mergeSimple } from './city';

export interface CarLook { visual: CarVisual; colour: string; colour2: string; accent: string; pattern: string; no: number }

const numberTex = new Map<string, THREE.CanvasTexture>();
function roundel(no: number, bg: string, fg: string): THREE.CanvasTexture {
  const key = `${no}|${bg}|${fg}`;
  let t = numberTex.get(key);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3; g.strokeStyle = fg; g.stroke();
  g.fillStyle = fg; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(no), 32, 34);
  t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  numberTex.set(key, t);
  return t;
}

function lum(hex: string) { const c = new THREE.Color(hex); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; }

/** Build a car. Model faces +z; origin at ground under the car's centre. */
export function buildCar(look: CarLook): THREE.Group {
  const v = look.visual;
  const L = v.length, W = v.width;
  const p1 = new THREE.Color(look.colour), p2 = new THREE.Color(look.colour2), acc = new THREE.Color(look.accent);
  const dark = new THREE.Color('#1c1c1e'), tyre = new THREE.Color('#141414'), helmet = acc.clone();
  const geos: THREE.BufferGeometry[] = [], cols: THREE.Color[] = [];
  const add = (g: THREE.BufferGeometry, c: THREE.Color, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => {
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); if (rz) g.rotateZ(rz);
    g.translate(x, y, z); geos.push(g); cols.push(c);
  };
  const wheelR = 0.33 * v.wheelScale * (v.era === 'vintage' ? 1.25 : 1);
  const wheelW = v.era === 'vintage' || v.era === 'streamliner' ? 0.16 : v.era === 'frontengine' ? 0.22 : v.era === 'cigar' ? 0.26 : 0.36;
  const track = W / 2 - wheelW / 2;
  const wbF = L * 0.33, wbR = -L * 0.33;
  const bodyW = v.era === 'vintage' ? 0.72 : v.era === 'streamliner' || v.era === 'frontengine' ? 0.85 : v.era === 'cigar' ? 0.7 : 0.9;
  const bodyH = v.era === 'vintage' ? 0.75 : v.era === 'frontengine' || v.era === 'streamliner' ? 0.62 : 0.5;
  const baseY = wheelR * 0.55;

  // --- wheels (enclosed on future cars)
  if (!v.enclosedWheels) for (const zz of [wbF, wbR]) for (const xx of [-track, track]) add(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 12), tyre, xx, wheelR, zz, 0, 0, Math.PI / 2);
  // --- main body
  if (v.era === 'vintage' || v.era === 'streamliner' || v.era === 'frontengine') {
    const nose = v.era === 'vintage' ? 0.55 : 0.45;
    add(new THREE.BoxGeometry(bodyW, bodyH, L * 0.78), p1, 0, baseY + bodyH / 2, L * 0.02);
    add(new THREE.CylinderGeometry(bodyW * 0.5, bodyW * 0.48, 0.3, 10), v.era === 'vintage' ? dark : p1, 0, baseY + bodyH * nose, L * 0.41, 0, Math.PI / 2);
    // tapered tail
    add(new THREE.ConeGeometry(bodyW * 0.5, L * 0.3, 8), p1, 0, baseY + bodyH * 0.5, -L * 0.48, 0, -Math.PI / 2);
    if (v.era === 'frontengine') add(new THREE.BoxGeometry(0.06, 0.35, 0.8), p1, 0, baseY + bodyH + 0.1, -L * 0.3);
  } else if (v.era === 'cigar') {
    add(new THREE.CylinderGeometry(bodyW * 0.45, bodyW * 0.3, L * 0.95, 10), p1, 0, baseY + 0.3, 0, 0, Math.PI / 2);
    add(new THREE.SphereGeometry(bodyW * 0.3, 8, 6), p1, 0, baseY + 0.3, L * 0.47);
  } else {
    // monocoque + sidepods
    const noseH = v.noseHeight;
    add(new THREE.BoxGeometry(0.55, 0.45, L * 0.55), p1, 0, baseY + 0.25 + noseH * 0.2, L * 0.12);
    add(new THREE.BoxGeometry(0.3, 0.25, L * 0.3), p1, 0, baseY + 0.12 + noseH * 0.35, L * 0.38, 0, noseH > 0.4 ? -0.12 : 0);
    if (v.sidepods > 0) add(new THREE.BoxGeometry(W * 0.75 * Math.min(1, v.sidepods + 0.2), 0.38, L * 0.4), v.era === 'groundeffect' || v.era === 'turbo' ? p1 : p1, 0, baseY + 0.19, -L * 0.05);
    add(new THREE.BoxGeometry(0.6, 0.55, L * 0.32), p1, 0, baseY + 0.35, -L * 0.28);
    if (v.enclosedWheels) for (const zz of [wbF, wbR]) for (const xx of [-track, track]) add(new THREE.BoxGeometry(wheelW + 0.1, wheelR * 2, wheelR * 2.4), p1, xx, wheelR, zz);
  }
  // --- wings
  if (v.wing > 0.05) {
    const fw = Math.min(W, 1.6 + v.wing * 0.3);
    add(new THREE.BoxGeometry(fw, 0.05, 0.35 + v.wing * 0.15), p2, 0, baseY + 0.08, L * 0.47);
    const rh = 0.8 + v.wing * 0.3;
    add(new THREE.BoxGeometry(Math.min(W * 0.9, 0.9 + v.wing * 0.3), 0.06, 0.35 + v.wing * 0.2), p2, 0, baseY + rh, -L * 0.46);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.04, rh * 0.7, 0.5), acc, s * Math.min(W * 0.45, 0.45 + v.wing * 0.15), baseY + rh * 0.7, -L * 0.46);
  }
  // --- pattern (livery) in the secondary colour
  const topY = v.era === 'vintage' || v.era === 'streamliner' || v.era === 'frontengine' ? baseY + bodyH + 0.01 : baseY + 0.63;
  if (look.pattern === 'stripe') add(new THREE.BoxGeometry(0.18, 0.02, L * 0.8), p2, 0, topY, 0);
  else if (look.pattern === 'band') add(new THREE.BoxGeometry(bodyW + 0.02, 0.02, 0.5), p2, 0, topY, L * 0.2);
  else if (look.pattern === 'hoops') { add(new THREE.BoxGeometry(bodyW + 0.02, 0.02, 0.3), p2, 0, topY, L * 0.25); add(new THREE.BoxGeometry(bodyW + 0.02, 0.02, 0.3), p2, 0, topY, -L * 0.1); }
  else if (look.pattern === 'chevron') { add(new THREE.BoxGeometry(0.14, 0.02, 0.9), p2, 0.18, topY, L * 0.22, -0.5); add(new THREE.BoxGeometry(0.14, 0.02, 0.9), p2, -0.18, topY, L * 0.22, 0.5); }
  else if (look.pattern === 'quarters') { add(new THREE.BoxGeometry(bodyW * 0.5, 0.02, L * 0.35), p2, bodyW * 0.25, topY, L * 0.15); add(new THREE.BoxGeometry(bodyW * 0.5, 0.02, L * 0.35), p2, -bodyW * 0.25, topY, -L * 0.2); }
  // --- cockpit, driver, halo/canopy
  const cockZ = v.era === 'vintage' ? -L * 0.12 : v.era === 'frontengine' || v.era === 'streamliner' ? -L * 0.15 : 0;
  const cockY = v.era === 'vintage' ? baseY + bodyH + 0.18 : v.era === 'frontengine' || v.era === 'streamliner' ? baseY + bodyH + 0.12 : baseY + 0.7;
  if (v.cockpit === 'canopy') add(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Color('#1d2733'), 0, cockY - 0.15, cockZ, 0, 0, 0);
  else {
    add(new THREE.SphereGeometry(0.19, 8, 6), helmet, 0, cockY, cockZ);
    if (v.era === 'vintage') add(new THREE.SphereGeometry(0.17, 8, 6), new THREE.Color('#8a6a4a'), 0.22, cockY - 0.02, cockZ - 0.05); // riding mechanic's cap
    if (v.cockpit === 'halo') add(new THREE.TorusGeometry(0.34, 0.035, 5, 12, Math.PI), dark, 0, cockY + 0.08, cockZ + 0.05, 0, -Math.PI / 2);
  }
  const body = new THREE.Mesh(mergeSimple(geos, cols), new THREE.MeshLambertMaterial({ vertexColors: true }));
  body.castShadow = true;
  const g = new THREE.Group();
  g.add(body);
  // number roundel on top, readable from above
  const light = lum(look.colour) > 0.55;
  const roundBg = v.era === 'vintage' || v.era === 'streamliner' || v.era === 'frontengine' || v.era === 'cigar' ? '#f4f1ea' : light ? '#111111' : '#f4f1ea';
  const roundFg = roundBg === '#f4f1ea' ? '#111111' : '#f4f1ea';
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), new THREE.MeshBasicMaterial({ map: roundel(look.no, roundBg, roundFg), transparent: true }));
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, topY + 0.02, v.era === 'cigar' || v.era === 'vintage' ? L * 0.22 : L * 0.3);
  g.add(plate);
  g.userData.body = body;
  return g;
}

/** A soft ring marking the followed car (identity beyond colour). */
export function selectionRing(colour: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.8, 32), new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.85, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
