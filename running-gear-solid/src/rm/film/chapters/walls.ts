// A free-standing brick wall segment with a chalked number on it (quiet-scene prop).
import * as THREE from 'three';
import { pbr } from '../../engine/assets';

export async function pbrArrayWall(text: string, w = 4.2, h = 2.3) {
  const grp = new THREE.Group();
  const tex = await pbr('brick_wall_02');
  for (const t of Object.values(tex)) {
    const c = (t as THREE.Texture).clone();
    c.repeat.set(w / 2.2, h / 2.2);
    c.needsUpdate = true;
  }
  const mat = new THREE.MeshStandardMaterial({ ...tex, roughness: 1 });
  mat.map!.repeat.set(w / 2.2, h / 2.2);
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.34), mat);
  box.position.y = h / 2 - 0.1;
  box.castShadow = box.receiveShadow = true;
  grp.add(box);
  // chalk
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(240,240,232,0.85)';
  g.font = '400 200px "Share Tech Mono"';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.save();
  g.translate(512, 250);
  g.rotate(-0.04);
  g.fillText(text, 0, 0);
  g.restore();
  // chalk grain
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`;
    g.fillRect(Math.random() * 1024, Math.random() * 512, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
  decal.position.set(0, 1.25, 0.175);
  grp.add(decal);
  return grp as unknown as THREE.Mesh;
}
