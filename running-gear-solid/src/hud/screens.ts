import { blink, clamp, easeOutBack, easeOutExpo, fmtTime, hash1, ramp } from '../core/util';
import { CHARACTERS, CharId, portrait } from './portraits';
import { textWidth } from './font';
import { COL, UI } from './UI';
import type { LogEntry } from '../data/career';

// ---------------------------------------------------------------------------
// CODEC: radio conversation screen. Lines are [speaker, text, startTime].
// ---------------------------------------------------------------------------
export interface CodecLine {
  who: CharId;
  text: string;
  at: number; // local seconds
}
export interface CodecSpec {
  caller: CharId; // right-hand portrait
  lines: CodecLine[];
  open: number; // time the screen opens
  close: number; // time it closes
}

export const CHARS_PER_SEC = 34;

export function speakingAt(spec: CodecSpec, t: number): CodecLine | null {
  let cur: CodecLine | null = null;
  for (const l of spec.lines) if (t >= l.at) cur = l;
  return cur;
}

export function drawCodec(ui: UI, spec: CodecSpec, t: number) {
  const open = clamp((t - spec.open) / 0.35);
  const close = clamp((spec.close - t) / 0.3);
  const k = Math.min(open, close);
  if (k <= 0) return;
  const g = ui.g;
  // backdrop
  ui.rect(0, 0, ui.W, ui.H, '#000', 1);
  for (let x = 0; x < ui.W; x += 24) ui.rect(x, 0, 1, ui.H, COL.greenDark, 0.6);
  for (let y = 0; y < ui.H; y += 24) ui.rect(0, y, ui.W, 1, COL.greenDark, 0.6);

  const line = speakingAt(spec, t);
  const localLine = line ? t - line.at : 0;
  const chars = localLine * CHARS_PER_SEC;
  const talking = line && chars < line.text.length + 2;
  const mouthFor = (who: CharId) => (talking && line!.who === who ? [0, 1, 2, 1][Math.floor(t * 12 + hash1(Math.floor(t * 6)) * 3) % 4] : 0);
  const blinkFor = (seed: number) => ((t + seed) % 3.7) < 0.12;

  const ph = Math.round(200 * k);
  const drawPortrait = (who: CharId, x: number, seed: number) => {
    const y = 96 + (200 - ph) / 2;
    ui.frame(x - 6, 90, 172, 212, COL.greenDim, 2);
    if (ph < 4) {
      ui.rect(x, 96 + 99, 160, 2, COL.green);
      return;
    }
    const img = portrait(who, mouthFor(who), blinkFor(seed));
    g.drawImage(img, 0, (100 - ph / 2) / 2, 80, ph / 2, x, y, 160, ph);
    // speaking highlight
    if (line && line.who === who) ui.frame(x - 6, 90, 172, 212, COL.green, 2);
  };
  drawPortrait('stride', 112, 0.3);
  drawPortrait(spec.caller, 688, 1.7);

  // centre: frequency + signal meter
  const freq = CHARACTERS[spec.caller].freq;
  ui.text('PTT', 480, 104, { scale: 2, color: COL.green, align: 'center', shadow: null });
  ui.frame(356, 128, 248, 70, COL.green, 2);
  ui.text(freq, 480, 142, { scale: 6, color: COL.green, align: 'center', shadow: null, spacing: 2 });
  ui.text('MEMORY', 480, 210, { scale: 1, color: COL.greenDim, align: 'center', shadow: null });
  const lvl = talking ? 0.4 + 0.6 * Math.abs(Math.sin(t * 9)) : 0.15;
  for (let i = 0; i < 12; i++) {
    const on = i / 12 < lvl;
    ui.rect(372 + i * 18, 232 + (12 - i) * 2, 12, 36 - (12 - i) * 2, on ? COL.green : COL.greenDark);
  }
  // names
  ui.text(CHARACTERS.stride.name, 192, 312, { scale: 2, color: COL.green, align: 'center', shadow: null });
  ui.text(CHARACTERS[spec.caller].name, 768, 312, { scale: 2, color: COL.green, align: 'center', shadow: null });

  // dialogue box
  if (line) {
    ui.frame(96, 348, 768, 150, COL.greenDim, 2);
    ui.text(CHARACTERS[line.who].name + ':', 116, 364, { scale: 2, color: COL.green, shadow: null });
    ui.paragraph(line.text, 116, 392, 730, chars, { scale: 2, color: COL.white, shadow: '#0a3a14' });
  }
  ui.scanlines(0, 0, ui.W, ui.H, 0.18);
  if (k < 1) ui.rect(0, 0, ui.W, ui.H, '#000', 1 - k);
}

// ---------------------------------------------------------------------------
// Boss title card: quiet -> name stamps in letter by letter -> real activity.
// ---------------------------------------------------------------------------
export interface TitleCardSpec {
  name: string;
  subtitle: string;
  info: string[]; // real activity facts, shown small
  label?: string;
}

export function drawBossTitle(ui: UI, s: TitleCardSpec, t: number, dur: number) {
  const out = clamp((dur - t) / 0.4);
  if (out <= 0 || t < 0) return;
  ui.alpha(out);
  // red band
  const band = easeOutExpo(t / 0.5);
  const bandH = 150;
  const y0 = 190;
  ui.rect(0, y0, ui.W * band, bandH, '#000', 0.78);
  ui.rect(0, y0 - 3, ui.W * band, 3, COL.red);
  ui.rect(ui.W * (1 - band), y0 + bandH, ui.W * band, 3, COL.red);
  ui.text(s.label ?? 'BOSS', 480, y0 + 12, { scale: 2, color: COL.red, align: 'center', shadow: null, alpha: ramp(t, 0.2, 0.4) });
  // name letter by letter
  const scale = s.name.length > 10 ? 8 : 10;
  const n = Math.floor(clamp((t - 0.35) / 0.07, 0, s.name.length));
  const full = textWidth(s.name, scale, 2);
  let x = 480 - full / 2;
  for (let i = 0; i < s.name.length; i++) {
    const ch = s.name[i];
    const w = textWidth(ch, scale, 2) + 2 * scale;
    if (i < n) {
      const age = t - 0.35 - i * 0.07;
      const pop = easeOutBack(clamp(age / 0.18));
      const yy = y0 + 40 + (1 - pop) * -30;
      ui.text(ch, x, yy, { scale, color: COL.white, shadow: COL.redDim, alpha: clamp(age / 0.1) });
    }
    x += w;
  }
  const subT = 0.35 + s.name.length * 0.07 + 0.2;
  ui.text(s.subtitle, 480, y0 + 118, { scale: 2, color: COL.amber, align: 'center', shadow: null, alpha: ramp(t, subT, subT + 0.3) });
  const infoT = subT + 0.5;
  s.info.forEach((line, i) => {
    ui.text(line, 480, y0 + bandH + 22 + i * 16, { scale: 1, color: COL.grey, align: 'center', alpha: ramp(t, infoT + i * 0.15, infoT + i * 0.15 + 0.2) });
  });
  ui.alpha(1);
}

// ---------------------------------------------------------------------------
// MISSION DATA panel
// ---------------------------------------------------------------------------
export function drawDataPanel(ui: UI, x: number, y: number, title: string, rows: [string, string][], t: number, opts: { w?: number; color?: string; valueScale?: number } = {}) {
  if (t < 0) return;
  const w = opts.w ?? 300;
  const vs = opts.valueScale ?? 2;
  const rowH = 12 + 8 * vs;
  const h = 34 + rows.length * rowH;
  const open = easeOutExpo(t / 0.35);
  const color = opts.color ?? COL.green;
  ui.rect(x, y, w, h * open, '#000', 0.72);
  ui.brackets(x, y, w, h * open, color, 12, 2);
  if (open < 0.95) return;
  ui.text(title, x + 12, y + 10, { scale: 2, color, shadow: null });
  ui.rect(x + 12, y + 28, w - 24, 1, color, 0.6);
  rows.forEach(([k, v], i) => {
    const rt = t - 0.3 - i * 0.18;
    if (rt < 0) return;
    const yy = y + 38 + i * rowH;
    ui.text(k, x + 12, yy + 2, { scale: 1, color: COL.grey, shadow: null });
    const chars = Math.floor(rt * 40);
    ui.text(v.slice(0, chars), x + w - 12, yy + 10, { scale: vs, color: COL.white, align: 'right' });
  });
}

// ---------------------------------------------------------------------------
// Running HUD
// ---------------------------------------------------------------------------
export interface RunHUD {
  life: number; // 0..1
  pace: number; // s/km
  hr: number;
  clock: number; // s
  km: number;
  totalKm: number;
  boss?: { name: string; hp: number };
  phase?: string;
  delta?: { label: string; value: string; color: string };
  alerts?: string[];
  hrZoneMax?: number;
}

export function drawRunHUD(ui: UI, h: RunHUD, t: number, alpha = 1) {
  if (alpha <= 0) return;
  ui.alpha(alpha);
  // LIFE
  ui.text('LIFE', 24, 20, { scale: 2, color: COL.white });
  const lifeCol = h.life > 0.5 ? COL.cyan : h.life > 0.25 ? COL.amber : COL.red;
  const lifeBlink = h.life < 0.25 && blink(t, 0.3);
  ui.segBar(76, 20, 190, 12, h.life, lifeBlink ? '#fff' : lifeCol, 24);
  // pace + HR
  ui.text('PACE', 24, 44, { scale: 1, color: COL.grey });
  ui.text(`${fmtTime(h.pace)}/KM`, 24, 54, { scale: 2, color: COL.white });
  ui.text('HR', 150, 44, { scale: 1, color: COL.grey });
  const hrCol = h.hr >= (h.hrZoneMax ?? 186) ? COL.red : h.hr >= 170 ? COL.amber : COL.green;
  ui.text(String(Math.round(h.hr)), 150, 54, { scale: 2, color: hrCol });
  const beat = (t * h.hr) / 60;
  if (beat % 1 < 0.35) ui.text('$', 196, 54, { scale: 2, color: COL.red, shadow: null });
  // ECG strip
  const ex = 222, ey = 54, ew = 60;
  ui.rect(ex, ey - 2, ew, 18, '#000', 0.5);
  for (let i = 0; i < ew; i += 2) {
    const ph = ((t * h.hr) / 60 - i / 30) % 1;
    const v = ph < 0.08 ? -7 : ph < 0.12 ? 6 : 0;
    ui.rect(ex + ew - i - 2, ey + 7 + v, 2, 2, hrCol);
  }
  // clock + km (top right)
  ui.text(fmtTime(h.clock, true), 936, 18, { scale: 3, color: COL.white, align: 'right' });
  ui.text(`KM ${h.km.toFixed(1)} / ${h.totalKm.toFixed(1)}`, 936, 48, { scale: 2, color: COL.grey, align: 'right' });
  // boss
  if (h.boss) {
    ui.text(h.boss.name, 480, 480, { scale: 2, color: COL.red, align: 'center' });
    ui.segBar(300, 500, 360, 10, h.boss.hp, COL.red, 36);
    ui.text('DISTANCE REMAINING', 480, 516, { scale: 1, color: COL.grey, align: 'center' });
  }
  if (h.phase) {
    ui.text('PHASE', 936, 72, { scale: 1, color: COL.grey, align: 'right' });
    ui.text(h.phase, 936, 82, { scale: 2, color: COL.amber, align: 'right' });
  }
  if (h.delta) {
    ui.text(h.delta.label, 936, 106, { scale: 1, color: COL.grey, align: 'right' });
    ui.text(h.delta.value, 936, 116, { scale: 2, color: h.delta.color, align: 'right' });
  }
  (h.alerts ?? []).forEach((a, i) => {
    if (blink(t + i * 0.13, 0.5, 0.7)) ui.text(a, 24, 84 + i * 16, { scale: 1, color: COL.red });
  });
  ui.alpha(1);
}

/** Radar: route polyline in a circle with a rotating sweep */
export function drawRadar(ui: UI, cx: number, cy: number, r: number, pts: [number, number][], pos: number, t: number, alpha = 1, extra?: (x: number, y: number) => void) {
  if (alpha <= 0 || pts.length < 2) return;
  const g = ui.g;
  ui.alpha(alpha);
  g.fillStyle = 'rgba(0,30,10,0.75)';
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = COL.green;
  g.lineWidth = 2;
  g.stroke();
  g.lineWidth = 1;
  g.strokeStyle = COL.greenDim;
  g.beginPath();
  g.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
  g.moveTo(cx - r, cy);
  g.lineTo(cx + r, cy);
  g.moveTo(cx, cy - r);
  g.lineTo(cx, cy + r);
  g.stroke();
  // sweep
  const a = t * 2.4;
  for (let i = 0; i < 18; i++) {
    const aa = a - i * 0.04;
    g.strokeStyle = `rgba(108,240,122,${0.35 * (1 - i / 18)})`;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r);
    g.stroke();
  }
  // route (pts normalised to -1..1)
  g.strokeStyle = COL.green;
  g.lineWidth = 2;
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const px = cx + x * r * 0.85, py = cy + y * r * 0.85;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.stroke();
  g.lineWidth = 1;
  const idx = Math.min(pts.length - 1, Math.max(0, Math.floor(pos * (pts.length - 1))));
  const [px, py] = pts[idx];
  const bx = cx + px * r * 0.85, by = cy + py * r * 0.85;
  if (blink(t, 0.4, 0.7)) ui.rect(bx - 3, by - 3, 6, 6, COL.white);
  extra?.(bx, by);
  ui.alpha(1);
}

// ---------------------------------------------------------------------------
// Results / debrief screen
// ---------------------------------------------------------------------------
export function drawResults(ui: UI, title: string, rows: [string, string, string?][], t: number, footer?: string, footerColor = COL.amber) {
  if (t < 0) return;
  ui.rect(0, 0, ui.W, ui.H, '#000', clamp(t / 0.3) * 0.82);
  const tt = easeOutExpo(t / 0.5);
  ui.text(title, 480, 70 - (1 - tt) * 30, { scale: 5, color: COL.white, align: 'center', shadow: COL.redDim, alpha: tt });
  ui.rect(480 - 300 * tt, 120, 600 * tt, 2, COL.red);
  rows.forEach(([k, v, c], i) => {
    const rt = t - 0.5 - i * 0.28;
    if (rt < 0) return;
    const y = 150 + i * 40;
    ui.text(k, 200, y + 6, { scale: 2, color: COL.grey, alpha: clamp(rt / 0.15) });
    const chars = Math.floor(rt * 30);
    ui.text(v.slice(0, chars), 760, y, { scale: 3, color: c ?? COL.white, align: 'right' });
    ui.rect(200, y + 30, 560, 1, COL.dim, 0.6);
  });
  if (footer) {
    const ft = t - 0.6 - rows.length * 0.28;
    if (ft > 0) {
      const lines = ui.wrap(footer, 800, 2);
      lines.forEach((l, i) => ui.text(l, 480, 170 + rows.length * 40 + 10 + i * 22, { scale: 2, color: footerColor, align: 'center', alpha: clamp(ft / 0.3) }));
    }
  }
}

// ---------------------------------------------------------------------------
// Log card (montage beats): date tab, headline, big stat, quote
// ---------------------------------------------------------------------------
export function drawLogCard(ui: UI, e: LogEntry, t: number, dur: number, x = 40, y = 330, w = 520) {
  const k = Math.min(easeOutExpo(t / 0.25), clamp((dur - t) / 0.2));
  if (k <= 0) return;
  const off = (1 - k) * -60;
  ui.alpha(k);
  ui.rect(x + off, y, w, 140, '#000', 0.78);
  ui.rect(x + off, y, 4, 140, COL.green);
  ui.rect(x + off + 14, y + 12, 120, 20, COL.green);
  ui.text(e.date, x + off + 20, y + 16, { scale: 2, color: '#000', shadow: null });
  ui.text(e.headline, x + off + 146, y + 16, { scale: 2, color: COL.white });
  if (e.stat) ui.text(e.stat, x + off + 14, y + 46, { scale: 7, color: COL.white, shadow: COL.greenDim });
  if (e.quote) {
    const lines = ui.wrap(`"${e.quote}"`, w - 30, 2);
    lines.slice(0, 2).forEach((l, i) => ui.text(l, x + off + 14, y + (e.stat ? 104 : 50) + i * 18, { scale: 2, color: COL.amber }));
  }
  ui.alpha(1);
}

/** Big centred stamp text with drop and shake */
export function drawStamp(ui: UI, text: string, t: number, dur: number, color = COL.red, y = 240, scale = 8, sub?: string) {
  if (t < 0 || t > dur) return;
  const k = clamp((dur - t) / 0.25);
  const drop = easeOutBack(clamp(t / 0.22));
  const sc = Math.round(scale * (1.6 - 0.6 * drop));
  const shake = t < 0.3 ? Math.round(Math.sin(t * 90) * 4 * (1 - t / 0.3)) : 0;
  ui.text(text, 480 + shake, y - (sc * 7) / 2, { scale: sc, color, align: 'center', outline: '#000', alpha: k * clamp(t / 0.08) });
  if (sub) ui.text(sub, 480, y + (scale * 7) / 2 + 14, { scale: 2, color: COL.white, align: 'center', alpha: k * ramp(t, 0.3, 0.5) });
}

/** Small caption bottom-left (location / date subtitles) */
export function drawCaption(ui: UI, lines: string[], t: number, dur: number, x = 28, y = 440) {
  const k = Math.min(clamp(t / 0.3), clamp((dur - t) / 0.3));
  if (k <= 0) return;
  lines.forEach((l, i) => {
    const chars = Math.floor((t - i * 0.25) * 40);
    if (chars > 0) ui.text(l.slice(0, chars), x, y + i * 20, { scale: 2, color: i === 0 ? COL.white : COL.grey, alpha: k });
  });
}
