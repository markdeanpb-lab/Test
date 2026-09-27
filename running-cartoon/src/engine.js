// Pixel engine v2: a 480×270 software framebuffer with render targets, dithered gradients, round-brush
// lines, outlined sprite layers, a bitmap font and film post-processing (letterbox, colour grading,
// heat haze, sepia flashback, vignette, fades). Everything lands on whole pixels, so the page and the
// rendered video are identical.
'use strict';
const PX = (() => {
  const W = 480, H = 270;
  const main = { w: W, h: H, buf: new Uint32Array(W * H) };
  let T = main;
  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
  };
  const PAL = {
    black: '#0b0c14', ink: '#16172a', night: '#1f2240', navy: '#232a55', deep: '#2c3c7a', blue: '#3a5cb0', sky: '#4f8ee0',
    skyL: '#7cb8f0', skyP: '#b4dcf7', haze: '#dcecf4',
    dawnP: '#5a3a78', dawnR: '#b44a6e', dawnO: '#e8785a', dawnY: '#f6b86b', dawnL: '#fde2a4',
    f0: '#14281f', f1: '#1f4a34', f2: '#2c6e40', f3: '#3f9a4c', f4: '#74c25a', f5: '#b4e07a',
    e0: '#3a2618', e1: '#5a3a26', e2: '#8a5a3a', e3: '#b88a5a', e4: '#dcb884', e5: '#f0dcae',
    g0: '#26283a', g1: '#393d56', g2: '#555b78', g3: '#7a829e', g4: '#a6aec6', g5: '#d2d8e6', white: '#f6f5ef',
    b0: '#4a2220', b1: '#6e3228', b2: '#96463a', b3: '#bc6446', b4: '#dc8c62',
    red: '#cc3e3a', redD: '#8a2830', strava: '#fc5200', orange: '#f08a3a', gold: '#ffcc40', goldD: '#c8902a', yellow: '#fff27a',
    skinL: '#ffd6b4', skin: '#f2b48c', skinM: '#dd9772', skinD: '#b8735a', skinDD: '#7e4b3e',
    hairL: '#a06e40', hair: '#6e4428', hairD: '#40261a',
    greyL: '#eeeeea', grey: '#bcbcc4', greyD: '#84848f',
    blondL: '#f6da86', blond: '#dcaa48', blondD: '#a6762c',
    pink: '#ff9ec4', pinkD: '#d0648c', purple: '#8e5cc9', purpleD: '#5e3a8e', plum: '#4a2352',
    teal: '#1f6a72', aqua: '#3fb6c6', cyan: '#8cf2f7', vis: '#d4ee3a', visD: '#98ac22',
    sep0: '#261b12', sep1: '#4a3624', sep2: '#76583a', sep3: '#a48254', sep4: '#cfae7c', sep5: '#f0e0b8',
    water: '#2f6fb0', waterL: '#6ab0e6', paella: '#e8b22c', paellaD: '#c07a18',
  };
  const C = {};
  for (const k in PAL) C[k] = hex(PAL[k]);
  const TRANSPARENT = 0;

  // ---------- maths ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeIn = (t) => t * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
  const smooth = (t) => t * t * (3 - 2 * t);
  const backOut = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function rnd(i, j = 0) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + 0x9e3779b9) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // ---------- targets ----------
  const layer = (w, h) => ({ w, h, buf: new Uint32Array(w * h) });
  const target = (L) => { const prev = T; T = L || main; return prev; };
  const clear = (c = TRANSPARENT) => T.buf.fill(c);

  // ---------- primitives (draw into the current target) ----------
  function px(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < T.w && y < T.h) T.buf[y * T.w + x] = c;
  }
  function rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(T.w, x + w), y1 = Math.min(T.h, y + h);
    if (x1 <= x0) return;
    for (let j = y0; j < y1; j++) T.buf.fill(c, j * T.w + x0, j * T.w + x1);
  }
  const hline = (x0, x1, y, c) => rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c);
  function box(x, y, w, h, c) { rect(x, y, w, 1, c); rect(x, y + h - 1, w, 1, c); rect(x, y, 1, h, c); rect(x + w - 1, y, 1, h, c); }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  function dither(x, y, w, h, c, level) {
    const L = Math.round(clamp(level, 0, 1) * 16);
    if (L <= 0) return;
    if (L >= 16) return rect(x, y, w, h, c);
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(T.w, x + w), y1 = Math.min(T.h, y + h);
    for (let j = y0; j < y1; j++) { const row = (j & 3) * 4, o = j * T.w; for (let i = x0; i < x1; i++) if (BAYER[row + (i & 3)] < L) T.buf[o + i] = c; }
  }
  // Vertical gradient through a colour ramp, ordered-dithered between neighbouring colours.
  function vgrad(y0, y1, ramp, x0 = 0, x1 = T.w) {
    const n = ramp.length - 1;
    y0 = Math.round(y0); y1 = Math.round(y1);
    for (let y = Math.max(0, y0); y < Math.min(T.h, y1); y++) {
      const t = ((y - y0) / Math.max(1, y1 - y0 - 1)) * n;
      const i = Math.min(n - 1, Math.floor(t)), f = Math.round((t - i) * 16);
      const a = ramp[i], b = ramp[Math.min(n, i + 1)], row = (y & 3) * 4, o = y * T.w;
      for (let x = Math.max(0, x0); x < Math.min(T.w, x1); x++) T.buf[o + x] = BAYER[row + (x & 3)] < f ? b : a;
    }
  }
  function line(x0, y0, x1, y1, c, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const o = th >> 1;
    for (;;) {
      if (th === 1) px(x0, y0, c); else if (th <= 2) rect(x0 - o, y0 - o, th, th, c); else disc(x0, y0, (th - 1) / 2, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function disc(cx, cy, r, c) {
    if (r <= 0.5) return px(cx, cy, c);
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const s = r * r - dy * dy;
      if (s < 0) continue;
      const dx = Math.sqrt(s + r * 0.5);
      rect(Math.round(cx - dx), Math.round(cy + dy), Math.round(cx + dx) - Math.round(cx - dx) + 1, 1, c);
    }
  }
  function ellipse(cx, cy, rx, ry, c) {
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      const f = 1 - (dy * dy) / (ry * ry + 0.0001);
      if (f < 0) continue;
      const dx = rx * Math.sqrt(f);
      rect(Math.round(cx - dx), Math.round(cy + dy), Math.round(cx + dx) - Math.round(cx - dx) + 1, 1, c);
    }
  }
  function ellipseDither(cx, cy, rx, ry, c, level) {
    const L = Math.round(clamp(level, 0, 1) * 16);
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      const f = 1 - (dy * dy) / (ry * ry + 0.0001);
      if (f < 0) continue;
      const dx = rx * Math.sqrt(f), y = Math.round(cy + dy);
      for (let x = Math.round(cx - dx); x <= Math.round(cx + dx); x++) if (bay(x, y) < L) px(x, y, c);
    }
  }
  function ring(cx, cy, r, c) {
    cx = Math.round(cx); cy = Math.round(cy);
    let x = r, y = 0, e = 1 - r;
    while (x >= y) {
      px(cx + x, cy + y, c); px(cx - x, cy + y, c); px(cx + x, cy - y, c); px(cx - x, cy - y, c);
      px(cx + y, cy + x, c); px(cx - y, cy + x, c); px(cx + y, cy - x, c); px(cx - y, cy - x, c);
      y++;
      if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; }
    }
  }
  function tri(ax, ay, bx, by, cx, cy, c) {
    const P = [[ax, ay], [bx, by], [cx, cy]].sort((a, b) => a[1] - b[1]);
    const [p0, p1, p2] = P;
    const edge = (a, b, y) => (b[1] === a[1] ? a[0] : a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
    for (let y = Math.ceil(p0[1]); y <= Math.floor(p2[1]); y++) {
      const xa = edge(p0, p2, y), xb = y < p1[1] ? edge(p0, p1, y) : edge(p1, p2, y);
      const l = Math.round(Math.min(xa, xb)), r = Math.round(Math.max(xa, xb));
      rect(l, y, r - l + 1, 1, c);
    }
  }
  function poly(pts, c) { for (let i = 1; i < pts.length - 1; i++) tri(pts[0][0], pts[0][1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c); }

  // ---------- string sprites ----------
  const sprCache = new Map();
  function spr(rows, x, y, map, o = {}) {
    let parsed = sprCache.get(rows);
    if (!parsed) {
      parsed = [];
      rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.' && r[i] !== ' ') parsed.push([i, j, r[i]]); });
      parsed.w = Math.max(...rows.map((r) => r.length)); parsed.h = rows.length;
      sprCache.set(rows, parsed);
    }
    const s = o.scale || 1, flip = !!o.flip;
    x = Math.round(x); y = Math.round(y);
    for (const [i, j, ch] of parsed) {
      const c = map[ch];
      if (c === undefined) continue;
      const ii = flip ? parsed.w - 1 - i : i;
      if (s === 1) px(x + ii, y + j, c); else rect(x + ii * s, y + j * s, s, s, c);
    }
    return parsed;
  }

  // ---------- layers: outline + blit ----------
  function outline(L, c) {
    const { w, h, buf } = L;
    const mark = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (buf[i] !== 0) continue;
      if ((x > 0 && buf[i - 1]) || (x < w - 1 && buf[i + 1]) || (y > 0 && buf[i - w]) || (y < h - 1 && buf[i + w])) mark[i] = 1;
    }
    for (let i = 0; i < w * h; i++) if (mark[i]) buf[i] = c;
  }
  function blit(L, dx, dy, o = {}) {
    const s = o.scale || 1, flip = !!o.flip;
    dx = Math.round(dx); dy = Math.round(dy);
    const { w, h, buf } = L;
    const map = o.map;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = buf[y * w + x];
      if (!c) continue;
      if (map) c = map(c);
      const xx = flip ? w - 1 - x : x;
      if (s === 1) px(dx + xx, dy + y, c); else rect(dx + xx * s, dy + y * s, s, s, c);
    }
  }

  // ---------- font: 5×7 proportional ----------
  const G = {
    A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.',
    C: '.###.|#...#|#....|#....|#....|#...#|.###.', D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
    E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
    G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    I: '###|.#.|.#.|.#.|.#.|.#.|###', J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
    K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
    M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
    O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.', P: '####.|#...#|#...#|####.|#....|#....|#....',
    Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    S: '.###.|#...#|#....|.###.|....#|#...#|.###.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.', V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
    0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '.#.|##.|.#.|.#.|.#.|.#.|###',
    2: '.###.|#...#|....#|...#.|..#..|.#...|#####', 3: '.###.|#...#|....#|..##.|....#|#...#|.###.',
    4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
    6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...',
    8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.', 9: '.###.|#...#|#...#|.####|....#|...#.|.##..',
    '.': '.|.|.|.|.|.|#', ',': '..|..|..|..|..|.#|.#|#.', ':': '.|.|#|.|.|#|.', ';': '..|..|.#|..|..|.#|#.',
    '!': '#|#|#|#|#|.|#', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', "'": '#|#|.|.|.|.|.',
    '"': '#.#|#.#|...|...|...|...|...', '-': '...|...|...|###|...|...|...', '–': '....|....|....|####|....|....|....',
    '+': '...|...|.#.|###|.#.|...|...', '/': '....#|...#.|...#.|..#..|.#...|.#...|#....', '(': '.#|#.|#.|#.|#.|#.|.#',
    ')': '#.|.#|.#|.#|.#|.#|#.', '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##', '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#',
    '#': '.#.#.|#####|.#.#.|.#.#.|#####|.#.#.|.....', '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.', '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
    '=': '...|...|###|...|###|...|...', '_': '.....|.....|.....|.....|.....|.....|#####', '·': '.|.|.|#|.|.|.',
    '<': '...#|..#.|.#..|#...|.#..|..#.|...#', '>': '#...|.#..|..#.|...#|..#.|.#..|#...', '°': '.#.|#.#|.#.|...|...|...|...',
    '×': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#', '→': '.....|..#..|...#.|#####|...#.|..#..|.....',
    '♥': '.....|.#.#.|#####|#####|.###.|..#..|.....', '✓': '.....|....#|...#.|#.#..|.#...|.....|.....',
    '☐': '#####|#...#|#...#|#...#|#####|.....|.....', '☑': '#####|#...#|#.#.#|##.##|#####|.....|.....',
    '▼': '.......|.......|#######|.#####.|..###..|...#...|.......', '…': '.....|.....|.....|.....|.....|.....|#.#.#',
    '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..', '[': '##|#.|#.|#.|#.|#.|##', ']': '##|.#|.#|.#|.#|.#|##',
  };
  const FONT = {};
  for (const ch in G) {
    const rows = G[ch].split('|'), pts = [];
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') pts.push([x, y]); });
    FONT[ch] = { w: Math.max(...rows.map((r) => r.length)), pts };
  }
  FONT[' '] = { w: 3, pts: [] };
  const glyph = (ch) => FONT[ch] || FONT[ch.toUpperCase()] || (ch === '—' ? FONT['–'] : ch === '’' || ch === '‘' ? FONT["'"] : ch === '“' || ch === '”' ? FONT['"'] : FONT['?']);
  function textW(s, scale = 1, sp = 1) { let w = 0; for (const ch of String(s)) w += (glyph(ch).w + sp) * scale; return Math.max(0, w - sp * scale); }
  function text(s, x, y, c, o = {}) {
    s = String(s);
    const sc = o.scale || 1, sp = o.spacing === undefined ? 1 : o.spacing;
    const chars = [...s];
    const n = o.chars === undefined ? chars.length : Math.max(0, Math.floor(o.chars));
    const w = textW(s, sc, sp);
    if (o.align === 'center') x -= Math.floor(w / 2); else if (o.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    let cx = x;
    for (let k = 0; k < chars.length && k < n; k++) {
      const g = glyph(chars[k]);
      const draw = (ox, oy, col) => { for (const [gx, gy] of g.pts) rect(cx + gx * sc + ox, y + gy * sc + oy, sc, sc, col); };
      if (o.outline !== undefined) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) draw(ox, oy, o.outline);
      if (o.shadow !== undefined) draw(sc > 1 ? Math.ceil(sc / 2) : 1, sc > 1 ? Math.ceil(sc / 2) : 1, o.shadow);
      draw(0, 0, c);
      cx += (g.w + sp) * sc;
    }
    return w;
  }
  function wrap(s, maxW, scale = 1) {
    const out = [];
    for (const para of String(s).split('\n')) {
      let cur = '';
      for (const word of para.split(' ')) { const t = cur ? cur + ' ' + word : word; if (textW(t, scale) > maxW && cur) { out.push(cur); cur = word; } else cur = t; }
      out.push(cur);
    }
    return out;
  }

  // ---------- post-processing on the main buffer ----------
  const R = (c) => c & 0xff, Gc = (c) => (c >>> 8) & 0xff, B = (c) => (c >>> 16) & 0xff;
  const rgb = (r, g, b) => (0xff000000 | (clamp(b, 0, 255) << 16) | (clamp(g, 0, 255) << 8) | clamp(r, 0, 255)) >>> 0;
  function grade(m, y0 = 0, y1 = H) {
    // m: {r, g, b} multipliers and optional {ar, ag, ab} adds
    const b = main.buf, ar = m.ar || 0, ag = m.ag || 0, ab = m.ab || 0;
    for (let i = y0 * W; i < y1 * W; i++) { const c = b[i]; b[i] = rgb(Math.round(R(c) * m.r + ar), Math.round(Gc(c) * m.g + ag), Math.round(B(c) * m.b + ab)); }
  }
  const SEPIA = ['sep0', 'sep1', 'sep2', 'sep3', 'sep4', 'sep5'].map((k) => C[k]);
  function sepia(amount = 1, y0 = 0, y1 = H) {
    const L = Math.round(clamp(amount, 0, 1) * 16), b = main.buf;
    if (L <= 0) return;
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
      if (bay(x, y) >= L) continue;
      const i = y * W + x, c = b[i];
      const lum = (R(c) * 0.3 + Gc(c) * 0.59 + B(c) * 0.11) / 255;
      const t = lum * 5.6, k = Math.floor(t);
      b[i] = SEPIA[Math.min(5, bay(y, x) < (t - k) * 16 ? k + 1 : k)];
    }
  }
  function heat(t, amp, y0 = 0, y1 = H) {
    const b = main.buf, row = new Uint32Array(W);
    for (let y = y0; y < y1; y++) {
      const dx = Math.round(Math.sin(y * 0.45 + t * 7) * amp + Math.sin(y * 0.13 - t * 3) * amp * 0.5);
      if (!dx) continue;
      row.set(b.subarray(y * W, y * W + W));
      for (let x = 0; x < W; x++) b[y * W + x] = row[clamp(x - dx, 0, W - 1)];
    }
  }
  const half = (c) => (((c >>> 1) & 0x7f7f7f) | 0xff000000) >>> 0;
  function darken(x, y, w, h, level) {
    const L = Math.round(clamp(level, 0, 1) * 16);
    if (L <= 0) return;
    for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(W, x + w); i++) if (bay(i, j) < L) main.buf[j * W + i] = half(main.buf[j * W + i]);
  }
  function vignette(strength = 0.6, y0 = 0, y1 = H) {
    const b = main.buf;
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
      const d = Math.sqrt(dx * dx * 0.8 + dy * dy * 1.1);
      const l = clamp((d - 0.72) / 0.45, 0, 1) * strength;
      if (l > 0 && bay(x, y) < l * 16) b[y * W + x] = half(b[y * W + x]);
    }
  }

  return {
    W, H, main, C, PAL, hex, rgb, clamp, lerp, inv, easeOut, easeIn, easeInOut, smooth, backOut, rnd, bay,
    layer, target, clear, px, rect, hline, box, dither, vgrad, line, disc, ellipse, ellipseDither, ring, tri, poly,
    spr, outline, blit, text, textW, wrap, grade, sepia, heat, darken, vignette, half,
    get buf() { return main.buf; },
  };
})();
if (typeof window !== 'undefined') window.PX = PX;
