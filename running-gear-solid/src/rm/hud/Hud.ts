// 1080p HUD / UI drawing on a 2D canvas that the renderer composites over the picture.
// Visual language: late-90s tactical espionage UI rebuilt with modern restraint - thin rules,
// corner brackets, soft phosphor glow, mono data type, condensed display type.

export const COL = {
  ui: '#bdf5d6',
  uiDim: 'rgba(189,245,214,0.45)',
  uiFaint: 'rgba(189,245,214,0.16)',
  white: '#f3f6f3',
  amber: '#ffb54a',
  red: '#ff4436',
  redDim: 'rgba(255,68,54,0.35)',
  green: '#6dff9c',
  cyan: '#7fe3ff',
  black: '#000',
  panel: 'rgba(4,10,8,0.62)',
};

export type Font = 'head' | 'mono' | 'body';
const FAMILY: Record<Font, string> = { head: 'Rajdhani', mono: 'Share Tech Mono', body: 'Rajdhani' };

export interface TextOpts {
  font?: Font;
  size?: number;
  weight?: number;
  color?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  alpha?: number;
  tracking?: number; // px between letters
  glow?: number; // blur radius
  shadow?: boolean;
  glitch?: number; // 0..1 channel split
  maxWidth?: number;
}

let fontsReady: Promise<void> | null = null;
export function loadFonts() {
  fontsReady ??= (async () => {
    const faces = [
      new FontFace('Rajdhani', 'url(/fonts/Rajdhani-Medium.ttf)', { weight: '500' }),
      new FontFace('Rajdhani', 'url(/fonts/Rajdhani-SemiBold.ttf)', { weight: '600' }),
      new FontFace('Rajdhani', 'url(/fonts/Rajdhani-Bold.ttf)', { weight: '700' }),
      new FontFace('Share Tech Mono', 'url(/fonts/ShareTechMono-Regular.ttf)', { weight: '400' }),
    ];
    for (const f of faces) document.fonts.add(await f.load());
  })();
  return fontsReady;
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** 0 -> 1 -> 0 envelope: fade in over [a, a+fi], hold, fade out over [b-fo, b] */
export const env = (t: number, a: number, b: number, fi = 0.4, fo = 0.4) => Math.min(smooth(a, a + fi, t), 1 - smooth(b - fo, b, t));

/** m:ss or h:mm:ss (seconds, floored) */
export function fmt(sec: number, o: { hours?: boolean; tenths?: boolean; sign?: boolean } = {}) {
  const neg = sec < 0;
  let s = Math.abs(sec);
  const tenths = Math.floor((s * 10) % 10);
  s = Math.floor(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  let out = o.hours || h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
  if (o.tenths) out += `.${tenths}`;
  return (neg ? '-' : o.sign ? '+' : '') + out;
}
export const pace = (secPerKm: number) => `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`;

export class Hud {
  readonly g: CanvasRenderingContext2D;
  readonly W = 1920;
  readonly H = 1080;
  /** global time (for flicker/animated details) */
  time = 0;

  constructor(g: CanvasRenderingContext2D) {
    this.g = g;
  }

  clear() {
    this.g.setTransform(1, 0, 0, 1, 0, 0);
    this.g.globalAlpha = 1;
    this.g.clearRect(0, 0, this.W, this.H);
  }

  font(o: TextOpts) {
    return `${o.weight ?? (o.font === 'mono' ? 400 : 600)} ${o.size ?? 28}px "${FAMILY[o.font ?? 'head']}"`;
  }

  measure(s: string, o: TextOpts = {}) {
    const g = this.g;
    g.font = this.font(o);
    (g as any).letterSpacing = `${o.tracking ?? 0}px`;
    return g.measureText(s).width;
  }

  text(s: string, x: number, y: number, o: TextOpts = {}) {
    const g = this.g;
    const a = o.alpha ?? 1;
    if (a <= 0.001 || !s) return;
    g.save();
    g.font = this.font(o);
    (g as any).letterSpacing = `${o.tracking ?? 0}px`;
    g.textAlign = o.align ?? 'left';
    g.textBaseline = o.base ?? 'alphabetic';
    g.globalAlpha = a;
    const col = o.color ?? COL.ui;
    if (o.shadow) {
      g.fillStyle = 'rgba(0,0,0,0.75)';
      g.shadowColor = 'rgba(0,0,0,0.9)';
      g.shadowBlur = 8;
      g.fillText(s, x + 2, y + 2, o.maxWidth);
      g.shadowBlur = 0;
    }
    if (o.glitch && o.glitch > 0) {
      const d = o.glitch * 6;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,40,40,0.8)';
      g.fillText(s, x - d, y, o.maxWidth);
      g.fillStyle = 'rgba(40,200,255,0.8)';
      g.fillText(s, x + d, y, o.maxWidth);
      g.globalCompositeOperation = 'source-over';
    }
    if (o.glow) {
      g.shadowColor = col;
      g.shadowBlur = o.glow;
    }
    g.fillStyle = col;
    g.fillText(s, x, y, o.maxWidth);
    g.restore();
  }

  /** multi-line text, returns total height */
  para(lines: string[], x: number, y: number, lh: number, o: TextOpts = {}) {
    lines.forEach((l, i) => this.text(l, x, y + i * lh, o));
    return lines.length * lh;
  }

  wrap(s: string, maxW: number, o: TextOpts = {}): string[] {
    const words = s.split(' ');
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (this.measure(t, o) > maxW && cur) {
        out.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  }

  rect(x: number, y: number, w: number, h: number, fill: string, alpha = 1) {
    const g = this.g;
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
    g.restore();
  }

  stroke(x: number, y: number, w: number, h: number, col = COL.ui, lw = 1.5, alpha = 1) {
    const g = this.g;
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.strokeRect(x + 0.5, y + 0.5, w, h);
    g.restore();
  }

  line(x0: number, y0: number, x1: number, y1: number, col = COL.ui, lw = 1.5, alpha = 1) {
    const g = this.g;
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
    g.restore();
  }

  /** corner brackets around a box */
  brackets(x: number, y: number, w: number, h: number, len = 18, col = COL.ui, lw = 2, alpha = 1) {
    const g = this.g;
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.beginPath();
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      g.moveTo(cx + sx * len, cy);
      g.lineTo(cx, cy);
      g.lineTo(cx, cy + sy * len);
    }
    g.stroke();
    g.restore();
  }

  /** translucent panel with a thin frame, brackets and faint scanlines */
  panel(x: number, y: number, w: number, h: number, o: { alpha?: number; col?: string; fill?: string; scan?: boolean } = {}) {
    const a = o.alpha ?? 1;
    if (a <= 0) return;
    this.rect(x, y, w, h, o.fill ?? COL.panel, a);
    if (o.scan !== false) {
      const g = this.g;
      g.save();
      g.globalAlpha = 0.05 * a;
      g.fillStyle = '#fff';
      for (let yy = y; yy < y + h; yy += 4) g.fillRect(x, yy, w, 1);
      g.restore();
    }
    this.stroke(x, y, w, h, o.col ?? COL.uiFaint, 1, a);
    this.brackets(x - 3, y - 3, w + 6, h + 6, 14, o.col ?? COL.ui, 2, a);
  }

  bar(x: number, y: number, w: number, h: number, frac: number, col = COL.ui, alpha = 1, bg = COL.uiFaint) {
    this.rect(x, y, w, h, bg, alpha);
    this.rect(x, y, w * clamp01(frac), h, col, alpha);
  }

  /** segmented bar (like a life gauge) */
  segBar(x: number, y: number, w: number, h: number, frac: number, n: number, col = COL.ui, alpha = 1) {
    const gap = 3, sw = (w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const f = clamp01(frac * n - i);
      this.rect(x + i * (sw + gap), y, sw, h, COL.uiFaint, alpha);
      if (f > 0) this.rect(x + i * (sw + gap), y, sw * f, h, col, alpha);
    }
  }

  /** a typewriter substring at `cps` characters per second from t0 */
  type(s: string, t: number, t0: number, cps = 38) {
    const n = Math.max(0, Math.floor((t - t0) * cps));
    return s.slice(0, n);
  }

  /** full-screen vignette-style dark gradient at the bottom (for subtitles) */
  shade(y0: number, y1: number, alpha = 0.6, up = false) {
    const g = this.g;
    const grd = g.createLinearGradient(0, up ? y1 : y0, 0, up ? y0 : y1);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${alpha})`);
    g.fillStyle = grd;
    g.fillRect(0, Math.min(y0, y1), this.W, Math.abs(y1 - y0));
  }

  /** subtitle line centred low on screen */
  subtitle(s: string, alpha = 1, o: { y?: number; color?: string; speaker?: string } = {}) {
    if (alpha <= 0) return;
    const y = o.y ?? 960;
    const t = (o.speaker ? o.speaker + ': ' : '') + s;
    this.text(t, 960, y, { font: 'body', size: 40, weight: 600, color: o.color ?? COL.white, align: 'center', alpha, shadow: true, tracking: 0.5 });
  }

  /** small caption block: location/date lower-left, typed on */
  caption(lines: string[], t: number, t0: number, alpha = 1, x = 96, y = 900) {
    lines.forEach((l, i) => {
      const s = this.type(l, t, t0 + i * 0.5, 30);
      this.text(s, x, y + i * 42, { font: 'mono', size: i === 0 ? 34 : 26, color: i === 0 ? COL.white : COL.ui, alpha, shadow: true, tracking: 2 });
    });
  }
}
