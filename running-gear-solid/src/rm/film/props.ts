// Small props for quiet moments: street furniture (decimated CC0 models), the old shoes,
// a bin, and the watch face strapped to STRIDE's wrist.
import * as THREE from 'three';
import { loadGLTF } from '../engine/assets';
import type { Runner } from '../char/Runner';

export async function prop(name: string) {
  const g = await loadGLTF(`/assets/props/${name}.glb`);
  const o = g.scene.clone(true);
  o.traverse((m) => {
    if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
  });
  return o;
}

/** STRIDE's shoes as a standalone pair (the kit's shoes in rest pose). */
export async function shoesProp(color = 0xff5a1f, worn = 0.5) {
  const g = await loadGLTF('/assets/char/runner.glb');
  let shoes: THREE.SkinnedMesh | null = null;
  g.scene.traverse((o) => {
    if (o.name === 'Shoes') shoes = o as THREE.SkinnedMesh;
  });
  g.scene.updateMatrixWorld(true);
  const s = shoes as unknown as THREE.SkinnedMesh;
  const geo = s.geometry.clone();
  geo.applyMatrix4(s.matrixWorld);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  const c = new THREE.Color(color).lerp(new THREE.Color(0x6b6660), worn);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: c, roughness: 0.75 }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** a black council wheelie-style litter bin */
export function binProp() {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.55, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 20), mat);
  body.position.y = 0.45;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 20), mat);
  lid.position.y = 0.94;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.305, 0.305, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0xb58a2a, roughness: 0.4, metalness: 0.6 }));
  band.position.y = 0.8;
  for (const m of [body, lid, band]) {
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
  }
  return grp;
}

/** Glowing watch screen on the left wrist; call draw() to update its text. */
export class WatchFace {
  readonly mesh: THREE.Mesh;
  private c = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private last = '';
  constructor(runner: Runner) {
    this.c.width = this.c.height = 256;
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(0.023, 32), mat);
    // place from the bind pose: centre of the Watch garment, on the back of the wrist (+y in
    // the T-pose, palms down), expressed in the lower-arm bone's local space
    let watch: THREE.SkinnedMesh | null = null;
    runner.body.traverse((o) => {
      if (o.name === 'Watch') watch = o as THREE.SkinnedMesh;
    });
    const w = watch as unknown as THREE.SkinnedMesh;
    const arm = runner.bone('lowerarm_l');
    const bi = w.skeleton.bones.indexOf(arm);
    const inv = w.skeleton.boneInverses[bi];
    const pos = w.geometry.getAttribute('position');
    const cen = new THREE.Vector3();
    let top = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      cen.x += pos.getX(i);
      cen.y += pos.getY(i);
      cen.z += pos.getZ(i);
    }
    cen.divideScalar(pos.count);
    const vb = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) top = Math.max(top, vb.fromBufferAttribute(pos, i).applyMatrix4(w.bindMatrix).y);
    const cB = cen.clone().applyMatrix4(w.bindMatrix);
    cB.y = top + 0.002;
    const local = cB.applyMatrix4(inv);
    const nrm = new THREE.Vector3(0, 1, 0).transformDirection(new THREE.Matrix4().extractRotation(inv));
    arm.add(this.mesh);
    this.mesh.position.copy(local);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
  }
  draw(main: string, sub = '', col = '#bdf5d6') {
    const key = main + '|' + sub + col;
    if (key === this.last) return;
    this.last = key;
    const g = this.c.getContext('2d')!;
    g.fillStyle = '#050706';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = col;
    g.textAlign = 'center';
    g.font = '400 58px "Share Tech Mono"';
    g.fillText(main, 128, 146);
    g.font = '400 26px "Share Tech Mono"';
    g.fillText(sub, 128, 196);
    g.strokeStyle = col;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(128, 128, 118, -Math.PI / 2, Math.PI * 1.2);
    g.stroke();
    this.tex.needsUpdate = true;
  }
}
