// CODEC: two live 3D portraits (STRIDE and a support-team member) in phosphor windows,
// a frequency readout, and typed dialogue. Text only, no voices, as in the originals.
import * as THREE from 'three';
import { Scene, Stage, Ctx, Cue, ease } from './core';
import { Runner, Kit } from '../char/Runner';
import { COL, clamp01 } from '../hud/Hud';

export type Who = 'STRIDE' | 'TEMPO' | 'LACTATE' | 'GEARBOX';
export interface Line {
  who: Who | 'PAUSE';
  text?: string;
  /** seconds this line holds (default from length) */
  dur?: number;
}

const CAST: Record<Who, { model: string; kit: Kit; title: string }> = {
  STRIDE: { model: 'runner.glb', kit: { singlet: 0x1d3f6e, shorts: 0x141417, socks: 0xe6e6e0, shoes: 0xff5a1f, hair: 0x2a1d14 }, title: 'STRIDE' },
  TEMPO: { model: 'tempo.glb', kit: { singlet: 0x2b3326, shorts: 0x1a1d18, socks: 0x333333, shoes: 0x222222, hair: 0x6e6a64 }, title: 'MAJOR TEMPO' },
  LACTATE: { model: 'lactate.glb', kit: { singlet: 0xdedede, shorts: 0x2a2a2a, socks: 0xeeeeee, shoes: 0xdddddd, hair: 0x3a2618 }, title: 'DR. LACTATE' },
  GEARBOX: { model: 'runner_m2.glb', kit: { singlet: 0x6b4a22, shorts: 0x222222, socks: 0x999999, shoes: 0xd7e84a, hair: 0x1a1410 }, title: 'GEARBOX' },
};

// window rects (1080p) and the matching 3D placement
const WIN = { l: { x: 300, y: 150, w: 400, h: 520 }, r: { x: 1220, y: 150, w: 400, h: 520 } };
const CAM_D = 2.2, FOV = 30, CAM_Y = 1.62;

export interface CodecOpts {
  id: string;
  chapter?: string;
  freq?: string;
  lines: Line[];
  /** ring + open animation at the start (default true) */
  ring?: boolean;
  /** tail after the last line before the window closes */
  tail?: number;
  /** tint: 'green' (default), 'amber' (warning), 'red' (alarm) */
  tint?: 'green' | 'amber' | 'red';
}

interface Timed extends Line {
  t0: number;
  t1: number;
}

export class CodecScene extends Scene {
  readonly id: string;
  readonly dur: number;
  private o: CodecOpts;
  private timed: Timed[] = [];
  private chars = new Map<Who, Runner>();
  private open0: number;
  private headY = new Map<Who, number>();

  constructor(o: CodecOpts) {
    super();
    this.o = o;
    this.id = o.id;
    this.chapter = o.chapter ?? '';
    this.open0 = o.ring === false ? 0.2 : 2.0;
    let t = this.open0 + 0.5;
    for (const l of o.lines) {
      const n = l.text?.length ?? 0;
      const d = l.dur ?? (l.who === 'PAUSE' ? 1.5 : Math.min(7.5, Math.max(2.6, 1.4 + n * 0.062)));
      this.timed.push({ ...l, t0: t, t1: t + d });
      t += d;
    }
    this.dur = t + (o.tail ?? 1.0) + 0.6;
  }

  async load(ctx: Ctx) {
    const st = (this.stage = new Stage());
    await st.sky(ctx.r, { hdri: 'moonless_golf', env: 0.35, sun: 0, bgIntensity: 0 });
    st.scene.background = new THREE.Color(0x000000);
    st.scene.fog = null;
    const whos = new Set<Who>(['STRIDE']);
    for (const l of this.o.lines) if (l.who !== 'PAUSE') whos.add(l.who);
    for (const w of whos) {
      const r = await Runner.create(CAST[w].kit, CAST[w].model);
      this.chars.set(w, r);
      st.scene.add(r.root);
      r.root.visible = false;
    }
    // key + rim lights (phosphor green rim)
    const key = new THREE.DirectionalLight(0xf2fff4, 2.2);
    key.position.set(0, 2.4, 3);
    const rimL = new THREE.PointLight(0x7dffb0, 6, 4);
    rimL.position.set(-1.4, 1.9, -0.8);
    const rimR = new THREE.PointLight(0x7dffb0, 6, 4);
    rimR.position.set(1.4, 1.9, -0.8);
    st.scene.add(key, rimL, rimR);
    const cam = st.camera;
    cam.fov = FOV;
    cam.near = 0.1;
    cam.far = 50;
    cam.position.set(0, CAM_Y, CAM_D);
    cam.lookAt(0, CAM_Y, 0);
    cam.updateProjectionMatrix();
    void ctx;
  }

  /** which support member is on the right window at time t */
  private rightAt(t: number): Who {
    let who: Who = 'TEMPO';
    let found = false;
    for (const l of this.timed) {
      if (l.who !== 'PAUSE' && l.who !== 'STRIDE') {
        if (!found || l.t0 <= t) who = l.who;
        found = true;
        if (l.t0 > t) break;
      }
    }
    return who;
  }

  private place(w: Who, side: 'l' | 'r', talking: boolean, t: number) {
    const r = this.chars.get(w)!;
    r.root.visible = true;
    const win = WIN[side];
    const cx = win.x + win.w / 2, cy = win.y + win.h * 0.42;
    const halfH = Math.tan(((FOV / 2) * Math.PI) / 180) * CAM_D;
    const x = ((cx / 1920) * 2 - 1) * halfH * (16 / 9);
    const yOff = (1 - (cy / 1080) * 2) * halfH;
    r.pose({ phase: 0, speed: 1, locoWeight: 0, other: talking ? { Idle_Talking_Loop: [1, t + 3] } : { Idle_Loop: [1, t + 7] } });
    // keep the head framed: measure head height once
    if (!this.headY.has(w)) {
      r.root.position.set(0, 0, 0);
      r.root.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      r.bone('Head').getWorldPosition(v);
      this.headY.set(w, v.y + 0.09);
    }
    r.root.position.set(x, CAM_Y + yOff - this.headY.get(w)!, 0);
    r.root.rotation.y = side === 'l' ? 0.38 : -0.38;
  }

  frame(t: number, ctx: Ctx) {
    const h = ctx.hud;
    const g = ctx.r.grade;
    const tint = this.o.tint ?? 'green';
    g.saturation = 0.2;
    g.gain = tint === 'green' ? [0.78, 1.06, 0.86] : tint === 'amber' ? [1.08, 0.86, 0.55] : [1.12, 0.62, 0.55];
    g.lift = [0, 0.01, 0.005];
    g.scan = 0.7;
    g.grain = 0.06;
    g.bloom = 0.35;
    g.vignette = 0.2;
    g.ca = 0.0015;
    const openU = ease((t - this.open0) / 0.45);
    const closeU = 1 - ease((t - (this.dur - 0.6)) / 0.4);
    const k = Math.min(openU, closeU);
    // characters
    for (const r of this.chars.values()) r.root.visible = false;
    const cur = this.timed.find((l) => t >= l.t0 && t < l.t1);
    const right = this.rightAt(t);
    this.place('STRIDE', 'l', cur?.who === 'STRIDE', t);
    this.place(right, 'r', cur?.who === right, t);
    // HUD: mask everything but the windows
    const col = tint === 'green' ? COL.ui : tint === 'amber' ? COL.amber : COL.red;
    const gg = h.g;
    gg.save();
    gg.fillStyle = '#000';
    gg.beginPath();
    gg.rect(0, 0, 1920, 1080);
    for (const w of [WIN.l, WIN.r]) {
      const hh = w.h * k;
      gg.rect(w.x, w.y + (w.h - hh) / 2, w.w, hh);
    }
    gg.fill('evenodd');
    gg.restore();
    // ring phase
    if (t < this.open0 && this.o.ring !== false) {
      const blink = Math.floor(t * 2.5) % 2 === 0;
      if (blink) h.text('CALL', 960, 470, { font: 'head', size: 64, weight: 700, color: col, align: 'center', glow: 20, tracking: 18 });
      h.text(this.o.freq ?? '140.85', 960, 560, { font: 'mono', size: 80, color: col, align: 'center', glow: 16, alpha: 0.9 });
      return;
    }
    for (const [side, w] of [['l', WIN.l], ['r', WIN.r]] as const) {
      const hh = w.h * k;
      const y = w.y + (w.h - hh) / 2;
      const active = cur && ((side === 'l' && cur.who === 'STRIDE') || (side === 'r' && cur.who === right));
      h.stroke(w.x - 6, y - 6, w.w + 12, hh + 12, col, 2, k);
      h.stroke(w.x - 12, y - 12, w.w + 24, hh + 24, col, 1, k * 0.35);
      h.brackets(w.x - 20, y - 20, w.w + 40, hh + 40, 26, col, 3, k);
      if (!active && cur && cur.who !== 'PAUSE') h.rect(w.x, y, w.w, hh, '#000', 0.45 * k);
      h.text(side === 'l' ? CAST.STRIDE.title : CAST[right].title, w.x + w.w / 2, w.y + w.h + 52, { font: 'head', size: 36, weight: 700, color: col, align: 'center', alpha: k, tracking: 6 });
    }
    // centre: frequency + signal meter
    const f = this.o.freq ?? '140.85';
    h.text('PTT', 960, 330, { font: 'mono', size: 28, color: col, align: 'center', alpha: k * 0.7, tracking: 8 });
    h.text(f, 960, 440, { font: 'mono', size: 92, color: col, align: 'center', alpha: k, glow: 14 });
    h.text('MEMORY', 960, 500, { font: 'mono', size: 22, color: col, align: 'center', alpha: k * 0.55, tracking: 6 });
    const talking = cur && cur.who !== 'PAUSE' && t < cur.t0 + (cur.text!.length / 30) + 0.3;
    for (let i = 0; i < 12; i++) {
      const lvl = talking ? 0.35 + 0.65 * Math.abs(Math.sin(t * 9 + i * 1.7) * Math.sin(t * 3.1 + i)) : 0.12;
      h.rect(900 + i * 10, 600 - lvl * 60, 6, lvl * 60, col, k * (i / 12 < lvl ? 0.9 : 0.25));
    }
    // dialogue
    if (cur && cur.who !== 'PAUSE' && cur.text) {
      // the line sits under the portrait of whoever is speaking
      const a = clamp01((t - cur.t0) / 0.15) * clamp01((cur.t1 - t) / 0.2) * k;
      const w = cur.who === 'STRIDE' ? WIN.l : WIN.r;
      const cx = w.x + w.w / 2;
      const opts = { font: 'body' as const, size: 50, weight: 600 };
      const full = h.wrap(cur.text, 800, opts);
      const s = h.type(cur.text, t, cur.t0, 30);
      // wrap the typed prefix exactly as the full line wraps, so words don't jump between lines
      let left = s.length;
      full.forEach((ln, i) => {
        const part = ln.slice(0, Math.max(0, left));
        left -= ln.length + 1;
        if (part) h.text(part, cx - h.measure(ln, opts) / 2, 830 + i * 60, { ...opts, color: COL.white, alpha: a, tracking: 0.5, shadow: true });
      });
    }
  }

  cues(): Cue[] {
    const c: Cue[] = [];
    if (this.o.ring !== false) c.push({ t: 0.05, kind: 'codec-ring', dur: this.open0 - 0.1 });
    c.push({ t: this.open0, kind: 'codec-open' });
    for (const l of this.timed) if (l.who !== 'PAUSE' && l.text) c.push({ t: l.t0, kind: 'codec-line', who: l.who, chars: l.text.length });
    c.push({ t: this.dur - 0.6, kind: 'codec-close' });
    return c;
  }
}
