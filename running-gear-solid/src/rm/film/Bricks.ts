// The 18-week Manchester build as rising brick columns (one per week, height = real km).
// The same bricks will become THE WALL.
import * as THREE from 'three';
import { Scene, Stage, Ctx, Cue, ease, lerp } from './core';
import { BrickWall } from './fx';
import { pbr } from '../engine/assets';
import { COL, env, smooth, clamp01 } from '../hud/Hud';

export const WEEK_KM = [52.6, 33.4, 81.1, 69.2, 64.3, 61.1, 83.0, 41.2, 75.0, 46.6, 86.8, 80.5, 62.1, 80.8, 44.4, 59.9, 43.3, 54.3];
const KM_PER_ROW = 2;
const WEEK_T = 1.35;

export class BricksScene extends Scene {
  readonly id = 'c7-bricks';
  readonly dur = 36;
  private wall!: BrickWall;
  private notes: [number, string][] = [
    [2, 'WEEK 2   "10k @ aspirational marathon pace"'],
    [5, '"Fred Hughes 10 - happy with that on tired legs"'],
    [8, 'WEEK 8   SHIN'],
    [10, '"19km at around Marathon pace - was dreading this session all week. Felt very strong."'],
    [13, '"Attempted 40 min LT - It\'s not looking good bruv"'],
    [15, 'LONG RUNS   32 KM  x2'],
  ];
  async load(ctx: Ctx) {
    const st = (this.stage = new Stage());
    await st.sky(ctx.r, { hdri: 'moonless_golf', env: 0.5, sun: 1.6, sunDir: [-0.5, 0.6, 0.6], bgIntensity: 0, shadowSize: 20, fog: 0.03, fogColor: 0x05070a });
    st.scene.background = new THREE.Color(0x05070a);
    const tex = await pbr('brick_wall_02');
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, normalMap: tex.normalMap });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.9 }));
    floor.receiveShadow = true;
    const cells: { x: number; y: number; z: number; delay: number }[] = [];
    WEEK_KM.forEach((km, w) => {
      const rows = Math.round(km / KM_PER_ROW);
      for (let r = 0; r < rows; r++) for (let c = 0; c < 2; c++) cells.push({ x: w * 1.3 + (c + (r % 2) * 0.5) * 0.44 - 0.22, y: 0.1 + r * 0.2, z: 0, delay: 1 + w * WEEK_T + r * 0.018 });
    });
    this.wall = new BrickWall(mat, cells);
    st.scene.add(floor, this.wall.mesh);
    st.camera.fov = 38;
  }
  frame(t: number, ctx: Ctx) {
    const st = this.stage!;
    this.wall.set(t);
    const wk = clamp01((t - 1) / (WEEK_KM.length * WEEK_T));
    // follow the column being built, then pull back to see all 18
    const x = Math.min(17, Math.max(0, (t - 1.4) / WEEK_T)) * 1.3;
    const pull = smooth(25, 33, t);
    const top = WEEK_KM[Math.min(17, Math.max(0, Math.floor((t - 1) / WEEK_T)))] / KM_PER_ROW * 0.2;
    st.camera.position.set(lerp(x + 3.5, 11, pull), lerp(2.5 + top * 0.5, 7, pull), lerp(8.5, 26, pull));
    st.camera.lookAt(lerp(x - 0.8, 11, pull), lerp(1.5 + top * 0.5, 4, pull), 0);
    st.atmos.follow(new THREE.Vector3(11, 0, 0));
    const h = ctx.hud, g = ctx.r.grade;
    g.saturation = 0.8;
    g.fade = Math.max(g.fade, 1 - smooth(0, 1, t), smooth(34.8, 36, t));
    const wi = Math.min(WEEK_KM.length, Math.floor((t - 1) / WEEK_T) + 1);
    const total = WEEK_KM.slice(0, Math.max(0, wi)).reduce((a, b) => a + b, 0);
    h.text('MANCHESTER BLOCK  -  18 WEEKS', 96, 90, { font: 'mono', size: 28, color: COL.ui, tracking: 6, glow: 6 });
    if (wi >= 1 && t < 26) {
      h.text(`WEEK ${wi}`, 1824, 100, { font: 'mono', size: 56, color: COL.white, align: 'right', glow: 8 });
      h.text(`${WEEK_KM[wi - 1].toFixed(1)} KM`, 1824, 150, { font: 'mono', size: 32, color: COL.ui, align: 'right', tracking: 2 });
    }
    h.text(`${total.toFixed(1)} KM`, 1824, 1010, { font: 'mono', size: 44, color: COL.white, align: 'right', alpha: smooth(1, 2, t) });
    for (const [w, s] of this.notes) {
      const t0 = 1 + (w - 1) * WEEK_T;
      const a = env(t, t0, t0 + 3.8, 0.3, 0.5);
      if (a > 0) h.text(s, 96, 1010, { font: 'mono', size: 26, color: COL.amber, alpha: a, tracking: 1, shadow: true, maxWidth: 1400 });
    }
    if (t > 26) {
      h.text('MARCH 2026  -  311 KM  -  BIGGEST MONTH ON RECORD', 960, 880, { font: 'mono', size: 30, color: COL.white, align: 'center', alpha: env(t, 27, 36, 0.6, 0.6), tracking: 4, shadow: true });
      h.text('1,120 KM', 960, 960, { font: 'head', size: 64, weight: 700, color: COL.ui, align: 'center', alpha: env(t, 28.5, 36, 0.6, 0.6), tracking: 10, glow: 10 });
    }
    void wk;
  }
  cues(): Cue[] {
    const c: Cue[] = [{ t: 0, kind: 'music', id: 'build-long', dur: 36 }];
    WEEK_KM.forEach((_, w) => c.push({ t: 1 + w * WEEK_T, kind: 'bricks', dur: 0.8 }));
    return c;
  }
}
