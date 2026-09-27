import * as THREE from 'three';
import { clamp, noise1 } from '../core/util';
import { glow, ps1 } from '../shaders/ps1';
import { bibTexture, TEX } from '../renderer/textures';

// The protagonist, STRIDE: ~40 boxes, rigid hierarchy, procedural gait.
// Faces +Z. 1 unit = 1 metre.

export interface Kit {
  top: number;
  topTrim: number;
  sleeves: boolean;
  shorts: number;
  shoes: number;
  shoeTrim: number;
  socks: number;
  headband?: number;
  cap?: number;
  headTorch?: boolean;
  hydration?: boolean;
  bib?: string;
  watch?: boolean;
}

export const KITS: Record<string, Kit> = {
  // 2020: cotton tee, baggy shorts, old trainers
  rookie: { top: 0x6e7078, topTrim: 0x5a5c64, sleeves: true, shorts: 0x23252e, shoes: 0x8c8c90, shoeTrim: 0x5a5a5e, socks: 0xd8d8d8 },
  // 2022: first proper kit, race bib
  club: { top: 0x2a58b0, topTrim: 0xe8e8e8, sleeves: false, shorts: 0x121418, shoes: 0xe8e8e8, shoeTrim: 0xff6a20, socks: 0xf0f0f0, bib: 'RGS 22', watch: true },
  // 2023+: racer - black singlet, hi-vis stripe, bright racing shoes, cap
  racer: { top: 0x16181c, topTrim: 0xd8ff30, sleeves: false, shorts: 0x0c0c10, shoes: 0xff4a18, shoeTrim: 0xfff0e0, socks: 0xf8f8f8, headband: 0xd8ff30, bib: 'RGS 42', watch: true },
  marathon: { top: 0x16181c, topTrim: 0xd8ff30, sleeves: false, shorts: 0x0c0c10, shoes: 0xff4a18, shoeTrim: 0xfff0e0, socks: 0xf8f8f8, cap: 0xf0f0f0, hydration: true, bib: 'RGS 42', watch: true },
  night: { top: 0x16181c, topTrim: 0xd8ff30, sleeves: false, shorts: 0x0c0c10, shoes: 0xff4a18, shoeTrim: 0xfff0e0, socks: 0xf8f8f8, headband: 0x303030, headTorch: true, watch: true },
};

export type Mode = 'run' | 'walk' | 'idle' | 'handsOnKnees' | 'crutch' | 'victory' | 'collapse';

export interface Pose {
  mode: Mode;
  phase: number; // stride phase in radians
  speed: number; // 0..1 amplitude
  fatigue: number; // 0..1
  limp: number; // 0..1 right side
  breath?: number; // time for breathing / idle
}

const SKIN = 0xd8a882;
const HAIR = 0x3a2418;

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], y = -h / 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, y, 0);
  return new THREE.Mesh(g, mat);
}
function taper(top: number, bottom: number, h: number, depth: number, mat: THREE.Material, y = -h / 2) {
  const g = new THREE.CylinderGeometry(top, bottom, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(1, 1, depth / Math.max(top, bottom));
  g.translate(0, y, 0);
  return new THREE.Mesh(g, mat);
}

export class Runner {
  readonly root = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly legs: { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group }[] = [];
  readonly arms: { shoulder: THREE.Group; elbow: THREE.Group }[] = [];
  readonly crutches = new THREE.Group();
  readonly torchBeam: THREE.Mesh | null = null;
  private kit: Kit;

  constructor(kitName: keyof typeof KITS | Kit = 'club') {
    this.kit = typeof kitName === 'string' ? KITS[kitName] : kitName;
    const k = this.kit;
    const skin = ps1({ color: SKIN });
    const topM = ps1({ color: k.top });
    const trimM = ps1({ color: k.topTrim });
    const shortsM = ps1({ color: k.shorts });
    const shoeM = ps1({ color: k.shoes });
    const shoeTrimM = ps1({ color: k.shoeTrim });
    const sockM = ps1({ color: k.socks });
    const hairM = ps1({ color: HAIR });

    this.root.add(this.hips);
    this.hips.position.y = 0.96;
    // pelvis / shorts
    const pelvis = box(0.34, 0.2, 0.21, shortsM, -0.06);
    this.hips.add(pelvis);
    // torso
    this.hips.add(this.torso);
    this.torso.position.y = 0.02;
    const chest = taper(0.25, 0.2, 0.52, 0.22, topM, 0.28);
    this.torso.add(chest);
    const stripe = box(0.41, 0.05, 0.235, trimM, 0.42);
    this.torso.add(stripe);
    if (k.sleeves) {
      // tee: wider shoulders block
      this.torso.add(box(0.46, 0.14, 0.23, topM, 0.49));
    }
    if (k.bib) {
      const bib = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), ps1({ map: bibTexture(k.bib), color: 0xffffff }));
      bib.position.set(0, 0.24, 0.121);
      this.torso.add(bib);
    }
    if (k.hydration) {
      const vestM = ps1({ color: 0x2a2c30 });
      this.torso.add(box(0.36, 0.3, 0.06, vestM, 0.38).translateZ(-0.13));
      const flaskM = ps1({ color: 0xb0e0f0, emissive: 0x102830 });
      const f1 = box(0.07, 0.14, 0.05, flaskM, 0.4);
      f1.position.set(-0.09, 0, 0.13);
      const f2 = f1.clone();
      f2.position.x = 0.09;
      this.torso.add(f1, f2);
    }
    // neck + head
    this.torso.add(box(0.09, 0.08, 0.09, skin, 0.6));
    this.torso.add(this.head);
    this.head.position.y = 0.64;
    const headGeo = new THREE.SphereGeometry(0.118, 8, 6);
    headGeo.scale(0.84, 1.05, 0.95);
    headGeo.translate(0, 0.12, 0);
    const headMesh = new THREE.Mesh(headGeo, ps1({ map: TEX.head(), color: 0xffffff }));
    this.head.add(headMesh);
    const nose = box(0.03, 0.045, 0.04, skin, 0.115);
    nose.position.z = 0.11;
    this.head.add(nose);
    if (k.headband) this.head.add(box(0.2, 0.04, 0.22, ps1({ color: k.headband }), 0.2));
    if (k.cap) {
      const capM = ps1({ color: k.cap });
      this.head.add(box(0.21, 0.07, 0.23, capM, 0.25));
      const brim = box(0.18, 0.02, 0.12, capM, 0.22);
      brim.position.z = 0.15;
      this.head.add(brim);
    }
    if (k.headTorch) {
      this.head.add(box(0.2, 0.035, 0.22, ps1({ color: 0x303030 }), 0.2));
      const lamp = box(0.06, 0.05, 0.03, ps1({ color: 0xffffff, emissive: 0xfff6c0, unlit: true }), 0.2);
      lamp.position.z = 0.12;
      this.head.add(lamp);
      const beamGeo = new THREE.ConeGeometry(1.4, 7, 8, 1, true);
      beamGeo.rotateX(-Math.PI / 2);
      beamGeo.translate(0, 0.16, 3.6);
      const beam = new THREE.Mesh(beamGeo, glow(0xfff0b0, 0.1));
      this.head.add(beam);
      (this as { torchBeam: THREE.Mesh | null }).torchBeam = beam;
    }

    // arms
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.24, 0.47, 0);
      this.torso.add(shoulder);
      shoulder.add(box(0.085, 0.28, 0.09, k.sleeves ? topM : skin, -0.14));
      const elbow = new THREE.Group();
      elbow.position.y = -0.28;
      shoulder.add(elbow);
      elbow.add(box(0.075, 0.26, 0.08, skin, -0.13));
      elbow.add(box(0.07, 0.08, 0.08, skin, -0.29)); // hand
      if (k.watch && side < 0) {
        const w = box(0.085, 0.05, 0.09, ps1({ color: 0x101010, emissive: 0x20a040 }), -0.22);
        elbow.add(w);
      }
      this.arms.push({ shoulder, elbow });
    }
    // legs
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.1, -0.08, 0);
      this.hips.add(hip);
      hip.add(taper(0.085, 0.07, 0.2, 0.15, shortsM, -0.1));
      hip.add(taper(0.07, 0.055, 0.24, 0.13, skin, -0.31));
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);
      knee.add(taper(0.06, 0.04, 0.32, 0.11, skin, -0.16));
      knee.add(box(0.085, 0.1, 0.09, sockM, -0.36));
      const ankle = new THREE.Group();
      ankle.position.y = -0.42;
      knee.add(ankle);
      const shoe = box(0.11, 0.08, 0.27, shoeM, -0.03);
      shoe.position.z = 0.05;
      ankle.add(shoe);
      const sole = box(0.115, 0.025, 0.28, shoeTrimM, -0.075);
      sole.position.z = 0.05;
      ankle.add(sole);
      this.legs.push({ hip, knee, ankle });
    }
    // crutches (hidden unless mode crutch)
    const crM = ps1({ color: 0x9aa0a8 });
    for (const side of [-1, 1]) {
      const c = box(0.035, 1.25, 0.035, crM, -0.62);
      c.position.set(side * 0.33, 1.28, 0.05);
      const cuff = box(0.08, 0.04, 0.08, ps1({ color: 0x303030 }), 0);
      cuff.position.copy(c.position);
      this.crutches.add(c, cuff);
    }
    this.crutches.visible = false;
    this.root.add(this.crutches);

    this.root.traverse((o) => {
      o.frustumCulled = false;
    });
  }

  /** Apply a pose. Pure function of the inputs. */
  pose(p: Pose) {
    const { phase: ph, fatigue: f, limp } = p;
    const sp = clamp(p.speed, 0, 1.4);
    const [L, R] = this.legs;
    const [AL, AR] = this.arms;
    const br = p.breath ?? 0;
    this.crutches.visible = p.mode === 'crutch';
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.hips.position.set(0, 0.96, 0);
    for (const l of [L, R]) {
      l.hip.rotation.set(0, 0, 0);
      l.knee.rotation.set(0, 0, 0);
      l.ankle.rotation.set(0, 0, 0);
    }
    for (const a of [AL, AR]) {
      a.shoulder.rotation.set(0, 0, 0);
      a.elbow.rotation.set(0, 0, 0);
    }

    if (p.mode === 'run' || p.mode === 'walk') {
      const walk = p.mode === 'walk';
      const ampH = (walk ? 0.45 : 0.62 + 0.28 * sp) * (1 - 0.25 * f);
      const ampK = walk ? 0.55 : 0.9 + 0.8 * sp;
      const legPose = (leg: typeof L, phi: number, weak: number) => {
        const s = Math.sin(phi);
        leg.hip.rotation.x = -(0.12 + ampH * s) * (1 - 0.45 * weak);
        const swing = Math.max(0, Math.sin(phi + 1.9));
        leg.knee.rotation.x = 0.18 + ampK * Math.pow(swing, 1.4) * (1 - 0.6 * weak);
        leg.ankle.rotation.x = -0.25 * Math.sin(phi - 0.6);
      };
      legPose(L, ph + Math.PI, 0);
      legPose(R, ph, limp);
      const bob = walk ? 0.02 : 0.045 * (0.6 + sp * 0.5);
      this.hips.position.y = 0.94 - bob + bob * Math.abs(Math.cos(ph)) * 2 - (walk ? 0 : 0.02) - limp * 0.03 * Math.max(0, Math.sin(ph));
      const lean = (walk ? 0.04 : 0.1 + 0.06 * sp) + f * 0.32;
      this.torso.rotation.x = lean;
      this.torso.rotation.y = 0.13 * Math.sin(ph) * (walk ? 0.5 : 1);
      this.hips.rotation.y = -0.08 * Math.sin(ph);
      this.hips.rotation.z = limp * 0.06 * Math.sin(ph) + f * 0.03 * noise1(br * 0.9);
      const ampA = (walk ? 0.35 : 0.55 + 0.35 * sp) * (1 - 0.5 * f);
      AR.shoulder.rotation.x = ampA * Math.sin(ph) - 0.05;
      AL.shoulder.rotation.x = -ampA * Math.sin(ph) - 0.05;
      AR.shoulder.rotation.z = 0.12 + f * 0.1;
      AL.shoulder.rotation.z = -0.12 - f * 0.1;
      const elbow = walk ? -0.4 : -1.45 + f * 0.55;
      AR.elbow.rotation.x = elbow - 0.15 * Math.sin(ph);
      AL.elbow.rotation.x = elbow + 0.15 * Math.sin(ph);
      this.head.rotation.x = -lean * 0.55 + f * 0.35 + 0.03 * Math.sin(ph * 2);
      this.head.rotation.z = f * 0.1 * noise1(br * 0.7 + 3);
    } else if (p.mode === 'idle') {
      const b = Math.sin(br * 2.2);
      this.hips.position.y = 0.96 + b * 0.004;
      this.torso.rotation.x = 0.03 + b * 0.015;
      AR.shoulder.rotation.z = 0.08;
      AL.shoulder.rotation.z = -0.08;
      AR.elbow.rotation.x = -0.15;
      AL.elbow.rotation.x = -0.15;
      this.head.rotation.x = -0.05 + b * 0.02;
      this.head.rotation.y = 0.2 * noise1(br * 0.3);
    } else if (p.mode === 'handsOnKnees') {
      const b = Math.sin(br * 4.4); // heavy breathing
      this.hips.position.y = 0.86;
      this.torso.rotation.x = 1.05 + b * 0.05;
      for (const l of [L, R]) {
        l.hip.rotation.x = -0.35;
        l.knee.rotation.x = 0.45;
        l.ankle.rotation.x = -0.1;
      }
      L.hip.rotation.z = -0.06;
      R.hip.rotation.z = 0.06;
      AR.shoulder.rotation.x = -0.75;
      AL.shoulder.rotation.x = -0.75;
      AR.shoulder.rotation.z = 0.25;
      AL.shoulder.rotation.z = -0.25;
      AR.elbow.rotation.x = -0.2;
      AL.elbow.rotation.x = -0.2;
      this.head.rotation.x = -0.6 + b * 0.08;
    } else if (p.mode === 'crutch') {
      // swing-through gait on crutches, right foot off the ground
      const c = (ph / (Math.PI * 2)) % 1;
      const swing = Math.sin(c * Math.PI * 2);
      this.crutches.rotation.x = -0.25 * swing;
      this.hips.position.y = 0.92 + 0.03 * Math.abs(swing);
      this.torso.rotation.x = 0.18 + 0.08 * swing;
      AR.shoulder.rotation.z = 0.35;
      AL.shoulder.rotation.z = -0.35;
      AR.shoulder.rotation.x = -0.15 - 0.2 * swing;
      AL.shoulder.rotation.x = -0.15 - 0.2 * swing;
      AR.elbow.rotation.x = -0.35;
      AL.elbow.rotation.x = -0.35;
      L.hip.rotation.x = 0.25 * swing;
      R.hip.rotation.x = -0.35;
      R.knee.rotation.x = 1.2;
      this.head.rotation.x = 0.25;
    } else if (p.mode === 'victory') {
      const b = Math.sin(br * 3);
      AR.shoulder.rotation.x = -2.9;
      AL.shoulder.rotation.x = -2.9;
      AR.shoulder.rotation.z = -0.35;
      AL.shoulder.rotation.z = 0.35;
      AR.elbow.rotation.x = -0.3 + b * 0.1;
      AL.elbow.rotation.x = -0.3 - b * 0.1;
      this.head.rotation.x = -0.3;
    } else if (p.mode === 'collapse') {
      this.hips.position.y = 0.55;
      this.torso.rotation.x = 0.5;
      L.hip.rotation.x = -1.3;
      R.hip.rotation.x = -1.1;
      L.knee.rotation.x = 1.9;
      R.knee.rotation.x = 1.6;
      AR.shoulder.rotation.x = -0.4;
      AL.shoulder.rotation.x = -0.4;
      this.head.rotation.x = 0.4;
    }
  }
}

/** Stride phase for a runner that has covered `dist` metres with a given stride length (m per full cycle). */
export const stridePhase = (dist: number, strideLen = 2.6) => (dist / strideLen) * Math.PI * 2;
