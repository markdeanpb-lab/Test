import { COMP_H, COMP_W } from '../cinematics/schedule';
import { clamp } from '../core/util';
import { drawText, GLYPH_H, textWidth } from './font';

export const COL = {
  white: '#f0f0e8',
  grey: '#9a9a94',
  dim: '#5a5a58',
  green: '#6cf07a',
  greenDim: '#2c7a3a',
  greenDark: '#0c2412',
  red: '#ff3a2e',
  redDim: '#8a1a14',
  amber: '#ffb830',
  cyan: '#7ae0f0',
  blue: '#3a6ae0',
  black: '#000',
};

export type Align = 'left' | 'center' | 'right';

export interface TextOpts {
  scale?: number;
  color?: string;
  align?: Align;
  shadow?: string | null;
  alpha?: number;
  spacing?: number;
  outline?: string | null;
}

/** Thin wrapper over a 960x540 Canvas2D with pixel-exact helpers. */
export class UI {
  readonly W = COMP_W;
  readonly H = COMP_H;
  constructor(readonly g: CanvasRenderingContext2D) {}

  clear() {
    this.g.globalAlpha = 1;
    this.g.clearRect(0, 0, this.W, this.H);
  }

  alpha(a: number) {
    this.g.globalAlpha = clamp(a);
  }

  rect(x: number, y: number, w: number, h: number, color: string, a = 1) {
    const g = this.g;
    const prev = g.globalAlpha;
    g.globalAlpha = prev * clamp(a);
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    g.globalAlpha = prev;
  }

  frame(x: number, y: number, w: number, h: number, color: string, t = 1) {
    this.rect(x, y, w, t, color);
    this.rect(x, y + h - t, w, t, color);
    this.rect(x, y, t, h, color);
    this.rect(x + w - t, y, t, h, color);
  }

  /** tactical corner brackets */
  brackets(x: number, y: number, w: number, h: number, color: string, len = 10, t = 2) {
    const r = (a: number, b: number, c: number, d: number) => this.rect(a, b, c, d, color);
    r(x, y, len, t); r(x, y, t, len);
    r(x + w - len, y, len, t); r(x + w - t, y, t, len);
    r(x, y + h - t, len, t); r(x, y + h - len, t, len);
    r(x + w - len, y + h - t, len, t); r(x + w - t, y + h - len, t, len);
  }

  text(s: string, x: number, y: number, o: TextOpts = {}) {
    const scale = o.scale ?? 2;
    const spacing = o.spacing ?? 1;
    const w = textWidth(s, scale, spacing);
    let px = x;
    if (o.align === 'center') px = x - w / 2;
    else if (o.align === 'right') px = x - w;
    const g = this.g;
    const prev = g.globalAlpha;
    g.globalAlpha = prev * clamp(o.alpha ?? 1);
    if (o.outline) {
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]])
        drawText(g, s, px + dx * Math.max(1, scale / 2), y + dy * Math.max(1, scale / 2), scale, o.outline, spacing);
    }
    if (o.shadow !== null) drawText(g, s, px + Math.max(1, scale / 2), y + Math.max(1, scale / 2), scale, o.shadow ?? 'rgba(0,0,0,0.85)', spacing);
    drawText(g, s, px, y, scale, o.color ?? COL.white, spacing);
    g.globalAlpha = prev;
    return w;
  }

  /** word-wrap to a max width in pixels; returns lines */
  wrap(s: string, maxW: number, scale = 2) {
    const words = s.split(' ');
    const lines: string[] = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (textWidth(test, scale) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /** typewriter over wrapped lines; progress in characters */
  paragraph(s: string, x: number, y: number, maxW: number, chars: number, o: TextOpts = {}) {
    const scale = o.scale ?? 2;
    const lines = this.wrap(s, maxW, scale);
    let left = Math.floor(chars);
    let yy = y;
    for (const line of lines) {
      if (left <= 0) break;
      const part = line.slice(0, left);
      this.text(part, x, yy, o);
      left -= line.length + 1;
      yy += (GLYPH_H + 4) * scale;
    }
    return lines.length * (GLYPH_H + 4) * scale;
  }

  bar(x: number, y: number, w: number, h: number, frac: number, color: string, back = 'rgba(0,0,0,0.6)', border = COL.white) {
    this.rect(x - 2, y - 2, w + 4, h + 4, border);
    this.rect(x, y, w, h, back);
    this.rect(x, y, w * clamp(frac), h, color);
  }

  /** segmented bar (life bars in 90s games) */
  segBar(x: number, y: number, w: number, h: number, frac: number, color: string, segs = 20, border = COL.white) {
    this.rect(x - 2, y - 2, w + 4, h + 4, border);
    this.rect(x, y, w, h, '#101010');
    const sw = w / segs;
    const lit = Math.round(clamp(frac) * segs);
    for (let i = 0; i < lit; i++) this.rect(x + i * sw + 1, y + 1, sw - 2, h - 2, color);
  }

  letterbox(amount: number, h = 66) {
    const a = clamp(amount);
    if (a <= 0) return;
    const bh = Math.round(h * a);
    this.rect(0, 0, this.W, bh, '#000');
    this.rect(0, this.H - bh, this.W, bh, '#000');
  }

  scanlines(x: number, y: number, w: number, h: number, a = 0.25) {
    for (let yy = y; yy < y + h; yy += 2) this.rect(x, yy, w, 1, '#000', a);
  }
}
