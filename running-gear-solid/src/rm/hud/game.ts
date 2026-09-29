// Game UI: the layer that makes the film read as someone PLAYING a tactical-espionage game.
// LIFE/STAMINA gauges, equipped item/weapon boxes, a boss health bar, controller button prompts,
// ITEM GET, the "!" alert, mission banners, damage pop-ups, CONTINUE?, save and rank screens.
// Everything is a pure function of time (t = seconds since the element appeared).
import { Hud, COL, clamp01, smooth, env } from './Hud';

export type Button = 'X' | 'O' | 'T' | 'S' | 'R1' | 'L1';
const BTN_COL: Record<Button, string> = { X: '#8fb8ff', O: '#ff6b6b', T: '#6dffb0', S: '#ff8fe0', R1: '#e8e8e8', L1: '#e8e8e8' };

/** a controller button glyph (drawn, not a font glyph) */
export function button(h: Hud, b: Button, x: number, y: number, r = 30, alpha = 1, pressed = 0) {
  const g = h.g;
  g.save();
  g.globalAlpha = alpha;
  const rr = r * (1 - 0.12 * pressed);
  g.fillStyle = `rgba(10,14,20,${0.85})`;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 3;
  if (b === 'R1' || b === 'L1') {
    const w = rr * 2.2, hh = rr * 1.3;
    g.beginPath();
    g.roundRect(x - w / 2, y - hh / 2, w, hh, 8);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    g.font = `700 ${Math.round(rr * 0.9)}px Rajdhani`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(b, x, y + 2);
    g.restore();
    return;
  }
  g.beginPath();
  g.arc(x, y, rr, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = BTN_COL[b];
  g.lineWidth = rr * 0.16;
  g.shadowColor = BTN_COL[b];
  g.shadowBlur = 10;
  const s = rr * 0.48;
  g.beginPath();
  if (b === 'X') {
    g.moveTo(x - s, y - s); g.lineTo(x + s, y + s); g.moveTo(x + s, y - s); g.lineTo(x - s, y + s);
  } else if (b === 'O') {
    g.arc(x, y, s, 0, Math.PI * 2);
  } else if (b === 'T') {
    g.moveTo(x, y - s * 1.05); g.lineTo(x + s * 1.05, y + s * 0.75); g.lineTo(x - s * 1.05, y + s * 0.75); g.closePath();
  } else {
    g.rect(x - s * 0.85, y - s * 0.85, s * 1.7, s * 1.7);
  }
  g.stroke();
  g.restore();
}

/**
 * On-screen prompt, e.g. [X] SPRINT. mash: the button flickers as if hammered; hold: a ring fills.
 * t: seconds since the prompt appeared.
 */
export function prompt(h: Hud, o: { b: Button; text: string; t: number; x?: number; y?: number; mash?: boolean; hold?: number; alpha?: number; ok?: boolean }) {
  const a = (o.alpha ?? 1) * smooth(0, 0.2, o.t);
  if (a <= 0) return;
  const x = o.x ?? 960, y = o.y ?? 820;
  const pressed = o.mash ? (Math.floor(o.t * 14) % 2) : 0;
  const pulse = 1 + 0.06 * Math.sin(o.t * 8);
  const tw = h.measure(o.text, { font: 'head', size: 46, weight: 700, tracking: 4 });
  const w = 90 + tw + 40;
  h.rect(x - w / 2, y - 42, w, 84, 'rgba(0,0,0,0.55)', a);
  button(h, o.b, x - w / 2 + 50, y, 30 * pulse, a, pressed);
  if (o.hold !== undefined) {
    const g = h.g;
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = COL.ui;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(x - w / 2 + 50, y, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp01(o.hold));
    g.stroke();
    g.restore();
  }
  h.text(o.text, x - w / 2 + 96, y + 16, { font: 'head', size: 46, weight: 700, color: o.ok ? COL.green : COL.white, alpha: a, tracking: 4 });
  if (o.mash) h.text('x' + (1 + Math.floor(o.t * 7)), x + w / 2 + 16, y + 14, { font: 'mono', size: 36, color: COL.amber, alpha: a * 0.9 });
}

/** MGS-style LIFE and STAMINA gauges, top-left */
export function lifeHud(h: Hud, o: { life: number; stamina?: number; name?: string; alpha?: number; hurt?: number; x?: number; y?: number }) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const x = o.x ?? 96, y = o.y ?? 70;
  h.text(o.name ?? 'STRIDE', x, y, { font: 'head', size: 34, weight: 700, color: COL.white, alpha: a, tracking: 6, shadow: true });
  h.text('LIFE', x, y + 44, { font: 'mono', size: 28, color: COL.ui, alpha: a, tracking: 4, shadow: true });
  const lf = clamp01(o.life);
  const lc = lf < 0.25 ? COL.red : lf < 0.5 ? COL.amber : COL.green;
  const shake = (o.hurt ?? 0) > 0 ? Math.sin(h.time * 60) * 6 * o.hurt! : 0;
  h.rect(x + 90 + shake, y + 22, 440, 26, 'rgba(0,0,0,0.6)', a);
  h.rect(x + 92 + shake, y + 24, 436 * lf, 22, lc, a);
  if ((o.hurt ?? 0) > 0) h.rect(x + 92 + 436 * lf + shake, y + 24, 436 * 0.08 * o.hurt!, 22, '#fff', a * o.hurt!);
  h.stroke(x + 90 + shake, y + 22, 440, 26, COL.ui, 2, a);
  if (o.stamina !== undefined) {
    const sf = clamp01(o.stamina);
    h.text('STAMINA', x, y + 88, { font: 'mono', size: 24, color: COL.ui, alpha: a, tracking: 3, shadow: true });
    h.rect(x + 150, y + 70, 380, 16, 'rgba(0,0,0,0.6)', a);
    h.rect(x + 152, y + 72, 376 * sf, 12, sf < 0.2 ? COL.red : COL.cyan, a * (sf < 0.2 ? 0.6 + 0.4 * Math.sin(h.time * 12) : 1));
  }
}

/** equipped item (bottom-left) / weapon (bottom-right) boxes */
export function equip(h: Hud, o: { item?: string; weapon?: string; alpha?: number; itemSub?: string; weaponSub?: string }) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const box = (x: number, label: string, name: string, sub?: string) => {
    h.panel(x, 900, 360, 110, { alpha: a * 0.95 });
    h.text(label, x + 16, 934, { font: 'mono', size: 24, color: COL.uiDim, alpha: a, tracking: 4 });
    h.text(name, x + 16, 980, { font: 'head', size: 40, weight: 700, color: COL.white, alpha: a, tracking: 2, maxWidth: 330 });
    if (sub) h.text(sub, x + 344, 934, { font: 'mono', size: 24, color: COL.amber, alpha: a, align: 'right' });
  };
  if (o.item) box(96, 'ITEM', o.item, o.itemSub);
  if (o.weapon) box(1920 - 96 - 360, 'EQUIP', o.weapon, o.weaponSub);
}

/** boss health bar across the top, with name */
export function bossHp(h: Hud, o: { name: string; hp: number; sub?: string; alpha?: number; col?: string; phase?: string; hit?: number }) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const col = o.col ?? COL.red;
  // bottom centre, between the ITEM and EQUIP boxes
  const x = 520, y = 944, w = 880;
  h.text(o.name, x, y, { font: 'head', size: 44, weight: 700, color: col, alpha: a, tracking: 10, shadow: true, glow: 8 });
  if (o.phase) h.text(o.phase, x + w, y, { font: 'mono', size: 30, color: COL.white, alpha: a, align: 'right', tracking: 3, shadow: true });
  const hp = clamp01(o.hp);
  const shake = (o.hit ?? 0) > 0 ? Math.sin(h.time * 70) * 8 * o.hit! : 0;
  h.rect(x + shake, y + 16, w, 26, 'rgba(0,0,0,0.65)', a);
  h.rect(x + 3 + shake, y + 19, (w - 6) * hp, 20, col, a);
  if ((o.hit ?? 0) > 0) h.rect(x + 3 + (w - 6) * hp + shake, y + 19, (w - 6) * 0.05 * o.hit!, 20, '#fff', a * o.hit!);
  h.stroke(x + shake, y + 16, w, 26, col, 2, a);
  if (o.sub) h.text(o.sub, x + w, y + 80, { font: 'mono', size: 28, color: COL.uiDim, alpha: a, align: 'right', tracking: 3, shadow: true });
}

/** ITEM GET box (t = seconds since picked up) */
export function itemGet(h: Hud, name: string, t: number, sub?: string) {
  const a = env(t, 0, 3.2, 0.15, 0.5);
  if (a <= 0) return;
  const y = 300 - 20 * (1 - smooth(0, 0.3, t));
  h.panel(560, y, 800, sub ? 160 : 120, { alpha: a, col: COL.amber });
  h.text('ITEM GET', 600, y + 44, { font: 'mono', size: 30, color: COL.amber, alpha: a, tracking: 8 });
  h.text(name, 600, y + 96, { font: 'head', size: 54, weight: 700, color: COL.white, alpha: a, tracking: 4, glow: 6 });
  if (sub) h.text(sub, 600, y + 140, { font: 'body', size: 34, weight: 500, color: COL.ui, alpha: a });
}

/** the "!" alert over a point (screen coords) */
export function alertMark(h: Hud, x: number, y: number, t: number) {
  const a = env(t, 0, 1.6, 0.02, 0.4);
  if (a <= 0) return;
  const s = 1 + 0.6 * (1 - smooth(0, 0.18, t));
  h.text('!', x, y, { font: 'head', size: 170 * s, weight: 700, color: COL.red, align: 'center', alpha: a, glow: 20, shadow: true });
}

/** big centre banner: MISSION COMPLETE / FAILED / BOSS DEFEATED ... */
export function banner(h: Hud, title: string, t: number, o: { col?: string; sub?: string; dur?: number } = {}) {
  const a = env(t, 0, o.dur ?? 4, 0.25, 0.6);
  if (a <= 0) return;
  const w = 1920 * smooth(0, 0.35, t);
  h.rect(960 - w / 2, 440, w, 200, 'rgba(0,0,0,0.72)', a);
  h.line(960 - w / 2, 440, 960 + w / 2, 440, o.col ?? COL.ui, 2, a);
  h.line(960 - w / 2, 640, 960 + w / 2, 640, o.col ?? COL.ui, 2, a);
  h.text(title, 960, 560, { font: 'head', size: 96, weight: 700, color: o.col ?? COL.white, align: 'center', alpha: a * smooth(0.2, 0.4, t), tracking: 14, glow: 12 });
  if (o.sub) h.text(o.sub, 960, 618, { font: 'mono', size: 34, color: COL.white, align: 'center', alpha: a * smooth(0.5, 0.8, t), tracking: 6 });
}

/** floating damage / effect number at a screen point */
export function popup(h: Hud, s: string, x: number, y: number, t: number, col = COL.white, size = 60) {
  const a = env(t, 0, 1.4, 0.05, 0.5);
  if (a <= 0) return;
  h.text(s, x, y - 80 * smooth(0, 1.4, t), { font: 'head', size: size * (1 + 0.3 * (1 - smooth(0, 0.15, t))), weight: 700, color: col, align: 'center', alpha: a, shadow: true, glow: 6 });
}

/** a boss's attack rendered as flying words (excuses, taunts...), from (x0,y0) to (x1,y1) */
export function projectile(h: Hud, s: string, x0: number, y0: number, x1: number, y1: number, u: number, col = COL.red) {
  if (u <= 0 || u >= 1.2) return;
  const k = Math.min(1, u);
  const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 60;
  const a = u > 1 ? 1 - (u - 1) / 0.2 : 1;
  const size = 50 + 46 * k;
  h.text(s, x, y, { font: 'head', size, weight: 700, color: '#fff4f0', align: 'center', alpha: a, glow: 18, shadow: true, tracking: 4 });
  h.text(s, x, y, { font: 'head', size, weight: 700, color: col, align: 'center', alpha: a * 0.35, tracking: 4 });
}

/** tactical radar (Soliton-style), top-right: course polyline around the player, enemy dots */
export function radar(h: Hud, o: { pts?: [number, number][]; enemies?: [number, number, string?][]; heading?: number; alpha?: number; jam?: number }) {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const x = 1920 - 96 - 300, y = 150, w = 300, hh = 220;
  h.panel(x, y, w, hh, { alpha: a });
  const g = h.g;
  g.save();
  g.beginPath();
  g.rect(x, y, w, hh);
  g.clip();
  g.globalAlpha = a;
  const cx = x + w / 2, cy = y + hh * 0.62, sc = 1.4;
  if (o.pts) {
    g.strokeStyle = COL.uiDim;
    g.lineWidth = 6;
    g.beginPath();
    o.pts.forEach(([px, py], i) => (i ? g.lineTo(cx + px * sc, cy + py * sc) : g.moveTo(cx + px * sc, cy + py * sc)));
    g.stroke();
  }
  // player: a green triangle
  g.fillStyle = COL.green;
  g.beginPath();
  g.moveTo(cx, cy - 12);
  g.lineTo(cx + 8, cy + 8);
  g.lineTo(cx - 8, cy + 8);
  g.closePath();
  g.fill();
  for (const [ex, ey, c] of o.enemies ?? []) {
    g.fillStyle = c ?? COL.red;
    g.beginPath();
    g.arc(cx + ex * sc, cy + ey * sc, 6, 0, Math.PI * 2);
    g.fill();
  }
  if (o.jam) {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(200,255,220,${0.4 * o.jam * ((i * 7919 + Math.floor(h.time * 30)) % 3) / 3})`;
      g.fillRect(x, y + ((i * 37 + Math.floor(h.time * 400)) % hh), w, 2);
    }
    h.text('JAMMING', cx, cy - 60, { font: 'mono', size: 30, color: COL.red, align: 'center', alpha: a * o.jam });
  }
  g.restore();
}

/** the end-of-mission results screen (MGS rank + codename). rows: [label, value] */
export function results(h: Hud, t: number, o: { title: string; rows: [string, string][]; rank?: string; codename?: string; alpha?: number }) {
  const a = (o.alpha ?? 1) * smooth(0, 0.4, t);
  if (a <= 0) return;
  h.rect(0, 0, 1920, 1080, 'rgba(0,0,0,0.78)', a);
  h.text(o.title, 960, 200, { font: 'head', size: 72, weight: 700, color: COL.white, align: 'center', alpha: a, tracking: 14, glow: 8 });
  o.rows.forEach(([k, v], i) => {
    const ra = a * smooth(0.5 + i * 0.35, 0.8 + i * 0.35, t);
    h.text(k, 900, 330 + i * 70, { font: 'mono', size: 38, color: COL.uiDim, align: 'right', alpha: ra, tracking: 4 });
    h.text(v, 960, 330 + i * 70, { font: 'head', size: 50, weight: 700, color: COL.white, alpha: ra, tracking: 2 });
  });
  if (o.codename) {
    const ta = 0.8 + o.rows.length * 0.35;
    const ra = a * smooth(ta, ta + 0.3, t);
    const s = 1 + 0.5 * (1 - smooth(ta, ta + 0.25, t));
    h.text('CODE NAME', 960, 330 + o.rows.length * 70 + 70, { font: 'mono', size: 34, color: COL.amber, align: 'center', alpha: ra, tracking: 10 });
    h.text(o.codename, 960, 330 + o.rows.length * 70 + 170, { font: 'head', size: 120 * s, weight: 700, color: COL.amber, align: 'center', alpha: ra, tracking: 16, glow: 18 });
    if (o.rank) h.text(o.rank, 960, 330 + o.rows.length * 70 + 230, { font: 'body', size: 36, weight: 500, color: COL.ui, align: 'center', alpha: ra });
  }
}
