// 2D scenes (title cards, chapter cards, briefings, logs) drawn on the HUD canvas over black
// (or over a softly animated grid). Cheap to render: the 3D pass is skipped.
import { Scene, Ctx, Cue } from './core';
import { Hud, COL } from '../hud/Hud';
import type { Grade } from '../engine/Renderer';

export interface CardOpts {
  id: string;
  chapter?: string;
  dur: number;
  draw: (t: number, h: Hud, g: Grade) => void;
  cues?: Cue[];
}

export class Card extends Scene {
  readonly id: string;
  readonly dur: number;
  private o: CardOpts;
  constructor(o: CardOpts) {
    super();
    this.o = o;
    this.id = o.id;
    this.dur = o.dur;
    this.chapter = o.chapter ?? '';
  }
  async load() {}
  frame(t: number, ctx: Ctx) {
    ctx.r.grade.fade = 1; // picture black; HUD only
    ctx.r.grade.grain = 0.03;
    this.o.draw(t, ctx.hud, ctx.r.grade);
  }
  cues() {
    return this.o.cues ?? [];
  }
}

/** faint tactical grid background */
export function grid(h: Hud, alpha = 1, step = 60) {
  const g = h.g;
  g.save();
  g.globalAlpha = 0.07 * alpha;
  g.strokeStyle = COL.ui;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= 1920; x += step) {
    g.moveTo(x + 0.5, 0);
    g.lineTo(x + 0.5, 1080);
  }
  for (let y = 0; y <= 1080; y += step) {
    g.moveTo(0, y + 0.5);
    g.lineTo(1920, y + 0.5);
  }
  g.stroke();
  g.restore();
}

/** a vector course map (from arena course points) fitted into a box */
export function courseMap(h: Hud, pts: number[], x: number, y: number, w: number, hgt: number, o: { alpha?: number; col?: string; progress?: number; lw?: number; marker?: boolean } = {}) {
  let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    mnx = Math.min(mnx, pts[i]); mxx = Math.max(mxx, pts[i]); mnz = Math.min(mnz, pts[i + 1]); mxz = Math.max(mxz, pts[i + 1]);
  }
  const sc = Math.min(w / (mxx - mnx || 1), hgt / (mxz - mnz || 1));
  const ox = x + (w - (mxx - mnx) * sc) / 2, oy = y + (hgt - (mxz - mnz) * sc) / 2;
  const P = (i: number) => [ox + (pts[i] - mnx) * sc, oy + (pts[i + 1] - mnz) * sc];
  const g = h.g;
  const n = pts.length / 2;
  const upto = Math.max(1, Math.floor(n * (o.progress ?? 1)));
  g.save();
  g.globalAlpha = o.alpha ?? 1;
  g.strokeStyle = o.col ?? COL.ui;
  g.lineWidth = o.lw ?? 3;
  g.lineJoin = g.lineCap = 'round';
  g.shadowColor = o.col ?? COL.ui;
  g.shadowBlur = 10;
  g.beginPath();
  for (let i = 0; i < upto; i++) {
    const [px, py] = P(i * 2);
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.stroke();
  if (o.marker !== false) {
    const [px, py] = P((upto - 1) * 2);
    g.fillStyle = COL.white;
    g.beginPath();
    g.arc(px, py, 7, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
