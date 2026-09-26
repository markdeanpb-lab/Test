// Scene, camera and per-frame presentation. Rendering reads simulation state and never writes it:
// frame rate, camera and effects cannot change sporting outcomes.
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { buildCity, type CityData, type CityMeshes } from './city';
import { dressTrack, type TrackDressing } from './trackMesh';
import { buildStreetLife } from './life';
import { buildCar, selectionRing, type CarLook } from './cars';
import type { Track } from '../sim/track';
import { Rng } from '../sim/rng';

export type CamMode = 'overview' | 'follow' | 'battle' | 'free';
export interface CarFrame { s0: number; s1: number; lat0: number; lat1: number; spin: number; visible: boolean; inPit: boolean; pitX?: number; pitZ?: number }
export interface Conditions { cloud: number; rain: number; water: number; vis: number; snow: boolean; hour: number; month: number; flagState: 'green' | 'yellow' | 'sc' | 'red' | 'chequered'; yellows: { s0: number; s1: number }[] }

export class Renderer {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: MapControls;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  city: CityMeshes | null = null;
  track: Track | null = null;
  dress: TrackDressing | null = null;
  life: THREE.Group | null = null;
  private cityData: CityData | null = null;
  cars: THREE.Group[] = [];
  ring: THREE.Mesh | null = null;
  rain: THREE.LineSegments | null = null;
  mode: CamMode = 'overview';
  focus: number[] = [];
  quality: 'low' | 'medium' | 'high';
  reducedMotion = false;
  private camTarget = new THREE.Vector3();
  private camPos = new THREE.Vector3(0, 900, 900);
  private lastT = performance.now();
  private tmp = { x: 0, y: 0, z: 0, h: 0 };
  private cosmetic = new Rng('cosmetic:frame');
  onPick?: (carIndex: number) => void;

  constructor(canvas: HTMLCanvasElement, quality: 'low' | 'medium' | 'high') {
    this.canvas = canvas;
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1));
    this.renderer.shadowMap.enabled = quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(32, 1, 2, 12000);
    this.camera.position.copy(this.camPos);
    this.scene.background = new THREE.Color('#bcd3e0');
    this.scene.fog = new THREE.Fog('#bcd3e0', 1800, 6500);
    this.hemi = new THREE.HemisphereLight('#e8f0ff', '#8a7d62', 1.25);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.1);
    this.sun.castShadow = quality !== 'low';
    this.sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun, this.sun.target);
    this.controls = new MapControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 5000;
    this.controls.enabled = false;
    this.controls.addEventListener('start', () => { if (this.mode !== 'free') this.onUserCamera?.(); });
    canvas.addEventListener('pointerup', (e) => this.pick(e));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  onUserCamera?: () => void;

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth, h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loadCity(data: CityData, focus?: { x: number; z: number; r: number }) {
    if (this.city) this.scene.remove(this.city.group);
    this.cityData = data;
    this.city = buildCity(data, this.quality, focus);
    this.scene.add(this.city.group);
  }

  setTrack(tr: Track, opts: Parameters<typeof dressTrack>[2]) {
    if (!this.city) return;
    if (this.dress) { this.scene.remove(this.dress.group); disposeGroup(this.dress.group); }
    this.track = tr;
    this.dress = dressTrack(tr, this.city.terrain, opts);
    this.scene.add(this.dress.group);
    if (this.life) { this.scene.remove(this.life); disposeGroup(this.life); }
    this.life = this.cityData ? buildStreetLife(this.cityData, this.city.terrain, tr, opts.year, opts.quality ?? this.quality) : null;
    if (this.life) this.scene.add(this.life);
    this.fitOverview(true);
  }

  setCars(looks: CarLook[]) {
    for (const c of this.cars) { this.scene.remove(c); disposeGroup(c); }
    this.cars = looks.map((l, i) => { const g = buildCar(l); g.userData.index = i; g.userData.colour = l.colour; this.scene.add(g); return g; });
    if (!this.ring) { this.ring = selectionRing('#ffffff'); this.scene.add(this.ring); }
  }

  setMode(mode: CamMode, focus: number[] = []) {
    this.mode = mode;
    this.focus = focus;
    this.controls.enabled = mode === 'free';
    if (mode === 'free') { this.controls.target.copy(this.camTarget); this.camera.position.copy(this.camPos); this.controls.update(); }
    if (mode === 'overview') this.fitOverview(false);
  }

  setModeIfChanged(mode: CamMode, focus: number[] = []) { if (mode !== this.mode || focus.join() !== this.focus.join()) this.setMode(mode, focus); }

  private overviewPos = new THREE.Vector3();
  private overviewTarget = new THREE.Vector3();
  fitOverview(snap: boolean) {
    if (!this.track || !this.city) return;
    const tr = this.track;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < tr.n; i += 4) { x0 = Math.min(x0, tr.x[i]); x1 = Math.max(x1, tr.x[i]); z0 = Math.min(z0, tr.z[i]); z1 = Math.max(z1, tr.z[i]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, span = Math.max(x1 - x0, (z1 - z0) * this.camera.aspect * 0.9, 300);
    const y = this.city.terrain.y(cx, cz);
    const dist = span / (2 * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(0.6, this.camera.aspect) * 1.05;
    this.overviewTarget.set(cx, y, cz);
    this.overviewPos.set(cx, y + dist * 0.82, cz + dist * 0.58);
    if (snap) { this.camTarget.copy(this.overviewTarget); this.camPos.copy(this.overviewPos); this.camera.position.copy(this.camPos); this.camera.lookAt(this.camTarget); }
  }

  /** Where car k is drawn (interpolated between sim steps). */
  carWorld(f: CarFrame, alpha: number, out: THREE.Vector3): number {
    const tr = this.track!;
    let s = f.s0 + ((f.s1 - f.s0 + tr.length * 1.5) % tr.length - tr.length * 0.5) * alpha;
    const lat = f.lat0 + (f.lat1 - f.lat0) * alpha;
    tr.pos(s, lat, this.tmp);
    const y = this.city!.terrain.y(this.tmp.x, this.tmp.z) + 0.3;
    out.set(this.tmp.x, y, this.tmp.z);
    return this.tmp.h;
  }

  frame(cars: CarFrame[], alpha: number, cond: Conditions, simSpeed: number) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    const tr = this.track;
    const camDist = this.camera.position.distanceTo(this.camTarget);
    const scale = THREE.MathUtils.clamp(camDist / 150, 1, 3.4);
    const p = new THREE.Vector3();
    const positions: THREE.Vector3[] = [];
    if (tr) cars.forEach((f, k) => {
      const g = this.cars[k]; if (!g) return;
      g.visible = f.visible;
      if (!f.visible) { positions.push(new THREE.Vector3()); return; }
      const h = this.carWorld(f, alpha, p);
      if (f.inPit && f.pitX !== undefined) { p.x = f.pitX; p.z = f.pitZ!; p.y = this.city!.terrain.y(p.x, p.z) + 0.3; }
      g.position.copy(p);
      g.rotation.set(0, h + f.spin, 0);
      g.scale.setScalar(scale);
      positions.push(p.clone());
    });
    // selection ring follows the first focus car
    if (this.ring) {
      const k = this.focus[0];
      const show = this.mode !== 'overview' && k !== undefined && positions[k] && cars[k]?.visible;
      this.ring.visible = !!show;
      if (show) { this.ring.position.copy(positions[k]).add(new THREE.Vector3(0, 0.1, 0)); this.ring.scale.setScalar(scale); (this.ring.material as THREE.MeshBasicMaterial).color.set(this.cars[k].userData.colour); }
    }
    this.updateCamera(positions, dt);
    this.updateConditions(cond, dt, simSpeed);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(positions: THREE.Vector3[], dt: number) {
    if (this.mode === 'free') { this.controls.update(); this.camTarget.copy(this.controls.target); this.camPos.copy(this.camera.position); this.updateShadowFrustum(); return; }
    const k = 1 - Math.exp(-dt * (this.reducedMotion ? 1.6 : 2.6));
    let tgt: THREE.Vector3, pos: THREE.Vector3;
    if (this.mode === 'overview' || !positions.length) { tgt = this.overviewTarget; pos = this.overviewPos; }
    else if (this.mode === 'follow' && positions[this.focus[0]]) {
      const c = this.cars[this.focus[0]];
      const h = c.rotation.y;
      tgt = positions[this.focus[0]].clone();
      const back = 55, up = 42;
      pos = tgt.clone().add(new THREE.Vector3(-Math.sin(h) * back, up, -Math.cos(h) * back));
    } else {
      const pts = this.focus.map((i) => positions[i]).filter(Boolean);
      if (!pts.length) { tgt = this.overviewTarget; pos = this.overviewPos; }
      else {
        tgt = pts.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / pts.length);
        const spread = Math.max(30, ...pts.map((q) => q.distanceTo(tgt)));
        const c = this.cars[this.focus[0]]; const h = c?.rotation.y ?? 0;
        pos = tgt.clone().add(new THREE.Vector3(-Math.sin(h) * (50 + spread), 45 + spread * 0.9, -Math.cos(h) * (50 + spread)));
      }
    }
    this.camTarget.lerp(tgt, k);
    this.camPos.lerp(pos, k * 0.8);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.updateShadowFrustum();
  }

  private updateShadowFrustum() {
    const d = THREE.MathUtils.clamp(this.camPos.distanceTo(this.camTarget) * 0.9, 120, 1600);
    const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -d; cam.right = d; cam.top = d; cam.bottom = -d; cam.near = 1; cam.far = 4000; cam.updateProjectionMatrix();
    this.sun.target.position.copy(this.camTarget);
    this.sun.position.copy(this.camTarget).add(this.sunDir.clone().multiplyScalar(1500));
  }
  private sunDir = new THREE.Vector3(-0.5, 0.8, 0.35).normalize();

  private updateConditions(c: Conditions, dt: number, simSpeed: number) {
    // sun path by hour and season (southern sky), dimmed by cloud
    const hourAngle = ((c.hour - 12) / 12) * Math.PI;
    const decl = Math.cos(((c.month - 6) / 12) * 2 * Math.PI) * 0.4;
    const elev = Math.max(0.08, 0.95 * Math.cos(hourAngle) * 0.6 + decl);
    this.sunDir.set(Math.sin(hourAngle) * 0.9, elev, 0.6).normalize();
    const overcast = Math.max(c.cloud, c.rain > 0 ? 0.9 : 0);
    const dusk = Math.max(0, 0.35 - elev) * 2;
    this.sun.intensity = (2.3 - overcast * 1.6) * (1 - dusk * 0.5);
    this.sun.color.setHSL(0.1, 0.5, 0.92 - dusk * 0.2);
    this.hemi.intensity = 1.1 + overcast * 0.35;
    const sky = new THREE.Color().setHSL(0.56, 0.35 - overcast * 0.3, 0.8 - overcast * 0.12 - dusk * 0.2);
    (this.scene.background as THREE.Color).copy(sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(sky);
    const vis = Math.min(c.vis, 10000);
    fog.near = Math.min(1600, vis * 0.25);
    fog.far = Math.min(7000, Math.max(400, vis * 0.9));
    // wet surface darkens and gains sheen
    if (this.dress) {
      const m = this.dress.surfaceMat;
      const wet = Math.min(1, c.water / 0.6);
      m.roughness = 0.92 - wet * 0.55;
      m.metalness = wet * 0.15;
      if (m.userData.base === undefined) m.userData.base = m.color.getHSL({ h: 0, s: 0, l: 0 });
      const b = m.userData.base; m.color.setHSL(b.h, b.s, b.l * (1 - wet * 0.35));
      for (const fp of this.dress.flagPosts) {
        const mat = fp.mesh.material as THREE.MeshBasicMaterial;
        let colr = '#2e7d32';
        if (c.flagState === 'red') colr = '#d32f2f';
        else if (c.flagState === 'sc') colr = '#f2c200';
        else if (c.yellows.some((y) => (y.s0 <= y.s1 ? fp.s >= y.s0 - 150 && fp.s <= y.s1 : fp.s >= y.s0 - 150 || fp.s <= y.s1))) colr = '#f2c200';
        else if (c.flagState === 'chequered') colr = '#f4f1ea';
        mat.color.set(colr);
        if (!this.reducedMotion) fp.mesh.rotation.z = Math.sin(performance.now() / 180 + fp.s) * 0.12;
      }
      // crowd: gentle bobbing (cosmetic stream only)
      if (this.dress.crowd && this.dress.crowdBase && !this.reducedMotion && this.quality !== 'low') {
        const cr = this.dress.crowd, base = this.dress.crowdBase;
        const m4 = new THREE.Matrix4();
        const t = performance.now() / 400;
        const step = Math.max(1, Math.floor(cr.count / 600));
        const off = Math.floor(this.cosmetic.next() * step);
        for (let i = off; i < cr.count; i += step) { m4.makeTranslation(base[i * 3], base[i * 3 + 1] + Math.max(0, Math.sin(t + i * 1.7)) * 0.12, base[i * 3 + 2]); cr.setMatrixAt(i, m4); }
        cr.instanceMatrix.needsUpdate = true;
      }
    }
    this.updateRain(c, dt, simSpeed);
  }

  private updateRain(c: Conditions, dt: number, simSpeed: number) {
    const intensity = c.snow ? Math.min(1, c.rain / 3) : Math.min(1, c.rain / 6);
    if (intensity <= 0.02 || this.quality === 'low') { if (this.rain) this.rain.visible = false; return; }
    const N = this.quality === 'high' ? 6000 : 2500;
    if (!this.rain) {
      const pos = new Float32Array(N * 6);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#dfe8f0', transparent: true, opacity: 0.45 }));
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
      for (let i = 0; i < N; i++) this.resetDrop(i, true);
    }
    this.rain.visible = true;
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const n = Math.floor(N * intensity);
    const fall = (c.snow ? 25 : 180) * dt * Math.min(3, Math.max(0.5, simSpeed));
    for (let i = 0; i < N; i++) {
      if (i >= n) { arr[i * 6 + 1] = arr[i * 6 + 4] = -9999; continue; }
      arr[i * 6 + 1] -= fall; arr[i * 6 + 4] -= fall;
      if (arr[i * 6 + 4] < this.camTarget.y - 20) this.resetDrop(i, false);
    }
    pos.needsUpdate = true;
  }
  private resetDrop(i: number, initial: boolean) {
    const arr = (this.rain!.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const r = Math.max(120, this.camPos.distanceTo(this.camTarget) * 0.8);
    const x = this.camTarget.x + (this.cosmetic.next() - 0.5) * r * 2, z = this.camTarget.z + (this.cosmetic.next() - 0.5) * r * 2;
    const y = this.camTarget.y + (initial ? this.cosmetic.next() * 300 : 250 + this.cosmetic.next() * 50);
    arr[i * 6] = x; arr[i * 6 + 1] = y; arr[i * 6 + 2] = z; arr[i * 6 + 3] = x + 0.3; arr[i * 6 + 4] = y - 4; arr[i * 6 + 5] = z;
  }

  private pick(e: PointerEvent) {
    if (!this.onPick || !this.cars.length) return;
    const rect = this.canvas.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    let best = -1, bd = 40;
    const p = new THREE.Vector3();
    for (let i = 0; i < this.cars.length; i++) {
      if (!this.cars[i].visible) continue;
      p.copy(this.cars[i].position).project(this.camera);
      const dx = (p.x - v.x) * rect.width / 2, dy = (p.y - v.y) * rect.height / 2;
      const d = Math.hypot(dx, dy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) this.onPick(best);
  }

  project(k: number): { x: number; y: number; visible: boolean } {
    const c = this.cars[k]; if (!c || !c.visible) return { x: 0, y: 0, visible: false };
    const p = c.position.clone().add(new THREE.Vector3(0, 3 * c.scale.x, 0)).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height, visible: p.z < 1 };
  }
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o: any) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => m.dispose()); });
}
