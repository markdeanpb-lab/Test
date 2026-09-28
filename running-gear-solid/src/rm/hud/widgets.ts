// Reusable HUD widgets for race scenes. Each takes an alpha so scenes can fade them in/out.
import { Hud, COL, fmt, pace } from './Hud';

/** Top-right race clock with distance and pace under it. */
export function raceClock(h: Hud, o: { T: number; d?: number; pace?: number; alpha?: number; hours?: boolean; label?: string; col?: string }) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const x = 1824, y = 120;
  h.text(o.label ?? 'ELAPSED', x, y - 64, { font: 'mono', size: 20, color: COL.uiDim, align: 'right', alpha: a, tracking: 4 });
  h.text(fmt(Math.max(0, o.T), { hours: o.hours }), x, y, { font: 'mono', size: 72, color: o.col ?? COL.white, align: 'right', alpha: a, glow: 10, shadow: true });
  if (o.d !== undefined) h.text(`${(o.d / 1000).toFixed(2)} KM`, x, y + 44, { font: 'mono', size: 30, color: COL.ui, align: 'right', alpha: a, shadow: true, tracking: 2 });
  if (o.pace !== undefined && isFinite(o.pace)) h.text(`${pace(o.pace)} /KM`, x, y + 82, { font: 'mono', size: 26, color: COL.uiDim, align: 'right', alpha: a, shadow: true, tracking: 2 });
}

/** The contextual target block: TARGET / PROJECTION / DELTA. */
export function targetBlock(h: Hud, o: { target: number; projection?: number; alpha?: number; hours?: boolean; label?: string; x?: number; y?: number; result?: number }) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const x = o.x ?? 116, y = o.y ?? 230;
  h.panel(x - 20, y - 58, 470, o.projection !== undefined || o.result !== undefined ? 206 : 110, { alpha: a * 0.9 });
  h.text(o.label ?? 'TARGET', x, y - 22, { font: 'mono', size: 20, color: COL.uiDim, alpha: a, tracking: 4 });
  h.text(fmt(o.target, { hours: o.hours }), x, y + 30, { font: 'mono', size: 56, color: COL.ui, alpha: a, glow: 8 });
  const v = o.result ?? o.projection;
  if (v !== undefined && isFinite(v)) {
    const delta = v - o.target;
    const col = delta < 0 ? COL.green : delta < 3 ? COL.amber : COL.red;
    h.text(o.result !== undefined ? 'RESULT' : 'PROJECTION', x, y + 76, { font: 'mono', size: 20, color: COL.uiDim, alpha: a, tracking: 4 });
    h.text(fmt(v, { hours: o.hours }), x, y + 124, { font: 'mono', size: 48, color: COL.white, alpha: a });
    h.text(fmt(Math.round(delta), { sign: true }), x + 420, y + 124, { font: 'mono', size: 40, color: col, alpha: a, align: 'right', glow: 8 });
  }
}

/** Boss nameplate with a segmented gauge (lower centre). */
export function bossPlate(h: Hud, o: { name: string; sub?: string; frac?: number; alpha?: number; col?: string; phase?: string }) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const col = o.col ?? COL.red;
  const x = 560, y = 968, w = 800;
  h.text(o.name, x, y - 22, { font: 'head', size: 38, weight: 700, color: col, alpha: a, tracking: 6, glow: 12, shadow: true });
  if (o.phase) h.text(o.phase, x + w, y - 24, { font: 'mono', size: 22, color: COL.white, alpha: a, align: 'right', tracking: 3, shadow: true });
  if (o.frac !== undefined) h.segBar(x, y - 6, w, 12, o.frac, 40, col, a);
  if (o.sub) h.text(o.sub, x, y + 34, { font: 'mono', size: 20, color: COL.uiDim, alpha: a, tracking: 3, shadow: true });
}

/** Event tag top-left: name + date (typed on). */
export function eventTag(h: Hud, o: { name: string; date: string; t: number; t0?: number; alpha?: number }) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  h.text(h.type(o.name, o.t, o.t0 ?? 0, 30), 96, 70, { font: 'mono', size: 26, color: COL.white, alpha: a, tracking: 3, shadow: true });
  h.text(h.type(o.date, o.t, (o.t0 ?? 0) + 0.6, 30), 96, 104, { font: 'mono', size: 22, color: COL.uiDim, alpha: a, tracking: 3, shadow: true });
}

/** Big centred stamp (e.g. SUB 20 - COMPLETE) */
export function stamp(h: Hud, s: string, o: { alpha?: number; col?: string; size?: number; y?: number; sub?: string; glitch?: number } = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const y = o.y ?? 560;
  h.text(s, 960, y, { font: 'head', size: o.size ?? 120, weight: 700, color: o.col ?? COL.white, align: 'center', alpha: a, tracking: 10, glow: 24, glitch: o.glitch, shadow: true });
  if (o.sub) h.text(o.sub, 960, y + 64, { font: 'mono', size: 30, color: COL.ui, align: 'center', alpha: a, tracking: 6, shadow: true });
}

/** A single split readout that pops in on each km (bottom-left). */
export function splitPop(h: Hud, o: { km: number; split: number; since: number; alpha?: number; col?: string }) {
  const a = (o.alpha ?? 1) * Math.min(1, Math.max(0, 1 - (o.since - 3) / 0.6)) * Math.min(1, o.since / 0.25);
  if (a <= 0) return;
  h.text(`KM ${o.km}`, 96, 1000, { font: 'mono', size: 22, color: COL.uiDim, alpha: a, tracking: 3, shadow: true });
  h.text(pace(o.split), 210, 1002, { font: 'mono', size: 34, color: o.col ?? COL.white, alpha: a, shadow: true });
}

/** Large circular watch-face inset (for "checking the watch" beats). */
export function watchInset(h: Hud, o: { main: string; sub?: string; top?: string; alpha?: number; x?: number; y?: number; r?: number; col?: string; progress?: number }) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const x = o.x ?? 960, y = o.y ?? 540, r = o.r ?? 260;
  const g = h.g;
  const col = o.col ?? COL.ui;
  g.save();
  g.globalAlpha = a;
  // bezel
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.12);
  grd.addColorStop(0, '#3a3d40');
  grd.addColorStop(1, '#0b0c0d');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r * 1.12, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#030504';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  // ticks
  g.strokeStyle = col;
  for (let i = 0; i < 60; i++) {
    const ang = (i / 60) * Math.PI * 2;
    const l = i % 5 === 0 ? 18 : 8;
    g.globalAlpha = a * (i % 5 === 0 ? 0.7 : 0.3);
    g.lineWidth = i % 5 === 0 ? 3 : 1.5;
    g.beginPath();
    g.moveTo(x + Math.sin(ang) * (r - 14), y - Math.cos(ang) * (r - 14));
    g.lineTo(x + Math.sin(ang) * (r - 14 - l), y - Math.cos(ang) * (r - 14 - l));
    g.stroke();
  }
  // progress arc
  if (o.progress !== undefined) {
    g.globalAlpha = a;
    g.lineWidth = 8;
    g.shadowColor = col;
    g.shadowBlur = 16;
    g.beginPath();
    g.arc(x, y, r - 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, o.progress));
    g.stroke();
    g.shadowBlur = 0;
  }
  g.restore();
  if (o.top) h.text(o.top, x, y - r * 0.32, { font: 'mono', size: r * 0.1, color: COL.uiDim, align: 'center', alpha: a, tracking: 6 });
  h.text(o.main, x, y + r * 0.12, { font: 'mono', size: r * 0.34, color: col, align: 'center', alpha: a, glow: 18 });
  if (o.sub) h.text(o.sub, x, y + r * 0.36, { font: 'mono', size: r * 0.1, color: COL.ui, align: 'center', alpha: a, tracking: 6 });
  // glass highlight
  g.save();
  g.globalAlpha = a * 0.08;
  g.fillStyle = '#fff';
  g.beginPath();
  g.ellipse(x - r * 0.25, y - r * 0.45, r * 0.55, r * 0.22, -0.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
