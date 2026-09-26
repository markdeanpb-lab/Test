// Pixel engine: a 320×180 software framebuffer (Uint32 RGBA), drawing primitives, a bitmap font,
// string-map sprites and a jointed "runner" puppet. Everything is integer pixels, so the cartoon looks
// the same in any browser and when rendered frame-by-frame to video.
'use strict';
const PX = (() => {
  const W = 320, H = 180;
  const buf = new Uint32Array(W * H);
  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
  };
  // Sweetie-16 base palette plus a few story colours.
  const PAL = {
    ink: '#1a1c2c', plum: '#5d275d', red: '#b13e53', orange: '#ef7d57', sand: '#ffcd75', lime: '#a7f070',
    green: '#38b764', teal: '#257179', navy: '#29366f', blue: '#3b5dc9', sky: '#41a6f6', cyan: '#73eff7',
    white: '#f4f4f4', silver: '#94b0c2', slate: '#566c86', dark: '#333c57',
    strava: '#fc5200', skin: '#f2b68b', skinD: '#c7855c', hair: '#6b3d23', hairD: '#40241a', gold: '#ffd23f',
    black: '#0d0e17', brick: '#a4553f', brickD: '#6e2f26', grass: '#5ab552', grassD: '#2f7d3a', pink: '#ff9ec4',
    apricot: '#ffa94d', track: '#c4553b', trackD: '#96402d', snow: '#e8f1ff', mud: '#7a5230', blond: '#d9a441',
    purple: '#8e5cc9', yellow: '#fff27a',
  };
  const C = {};
  for (const k in PAL) C[k] = hex(PAL[k]);

  // ---------- maths ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const inv = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeIn = (t) => t * t;
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));
  const backOut = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  function rnd(i, j = 0) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + 0x9e3779b9) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // ---------- primitives ----------
  const clear = (c) => buf.fill(c);
  function px(x, y, c) {
    x = Math.floor(x); y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = c;
  }
  function rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
    if (x1 <= x0) return;
    for (let j = y0; j < y1; j++) buf.fill(c, j * W + x0, j * W + x1);
  }
  function box(x, y, w, h, c) {
    rect(x, y, w, 1, c); rect(x, y + h - 1, w, 1, c); rect(x, y, 1, h, c); rect(x + w - 1, y, 1, h, c);
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // Ordered-dither fill: level 0 draws nothing, 1 fills solid.
  function dither(x, y, w, h, c, level) {
    const L = Math.round(clamp(level, 0, 1) * 16);
    if (L <= 0) return;
    if (L >= 16) return rect(x, y, w, h, c);
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
    for (let j = y0; j < y1; j++) {
      const row = (j & 3) * 4, o = j * W;
      for (let i = x0; i < x1; i++) if (BAYER[row + (i & 3)] < L) buf[o + i] = c;
    }
  }
  function line(x0, y0, x1, y1, c, th = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const o = th >> 1;
    for (;;) {
      if (th === 1) px(x0, y0, c); else rect(x0 - o, y0 - o, th, th, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function disc(cx, cy, r, c) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy + r * 0.8));
      rect(cx - dx, cy + dy, dx * 2 + 1, 1, c);
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
  // Filled triangle (scanline).
  function tri(ax, ay, bx, by, cx, cy, c) {
    const P = [[ax, ay], [bx, by], [cx, cy]].sort((a, b) => a[1] - b[1]);
    const [p0, p1, p2] = P;
    const edge = (a, b, y) => (b[1] === a[1] ? a[0] : a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
    for (let y = Math.ceil(p0[1]); y <= Math.floor(p2[1]); y++) {
      const xa = edge(p0, p2, y);
      const xb = y < p1[1] ? edge(p0, p1, y) : edge(p1, p2, y);
      const l = Math.round(Math.min(xa, xb)), r = Math.round(Math.max(xa, xb));
      rect(l, y, r - l + 1, 1, c);
    }
  }

  // ---------- sprites: arrays of strings, one char per pixel, '.' transparent ----------
  const sprCache = new Map();
  function spr(rows, x, y, map, o = {}) {
    let parsed = sprCache.get(rows);
    if (!parsed) {
      parsed = [];
      rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.' && r[i] !== ' ') parsed.push([i, j, r[i]]); });
      parsed.w = Math.max(...rows.map((r) => r.length));
      parsed.h = rows.length;
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

  // ---------- 5×7 bitmap font (proportional) ----------
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
    '.': '.|.|.|.|.|.|#', ',': '..|..|..|..|..|.#|.#|#.', '–': '....|....|....|####|....|....|....',
    '×': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#', '▼': '.......|.......|#######|.#####.|..###..|...#...|.......', ':': '.|.|#|.|.|#|.', ';': '..|..|.#|..|..|.#|#.',
    '!': '#|#|#|#|#|.|#', '?': '.###.|#...#|....#|...#.|..#..|.....|..#..', "'": '#|#|.|.|.|.|.',
    '"': '#.#|#.#|...|...|...|...|...', '-': '...|...|...|###|...|...|...', '+': '...|...|.#.|###|.#.|...|...',
    '/': '....#|...#.|...#.|..#..|.#...|.#...|#....', '(': '.#|#.|#.|#.|#.|#.|.#', ')': '#.|.#|.#|.#|.#|.#|#.',
    '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##', '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#',
    '#': '.#.#.|#####|.#.#.|.#.#.|#####|.#.#.|.....', '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
    '=': '...|...|###|...|###|...|...', '_': '.....|.....|.....|.....|.....|.....|#####',
    '<': '...#|..#.|.#..|#...|.#..|..#.|...#', '>': '#...|.#..|..#.|...#|..#.|.#..|#...',
    '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.', '·': '.|.|.|#|.|.|.', '°': '.#.|#.#|.#.|...|...|...|...',
    '♥': '.....|.#.#.|#####|#####|.###.|..#..|.....', '✓': '.....|....#|...#.|#.#..|.#...|.....|.....',
    '→': '.....|..#..|...#.|#####|...#.|..#..|.....', '★': '..#..|..#..|#####|.###.|.#.#.|#...#|.....',
    '☺': '.#####.|#.....#|#.#.#.#|#.....#|#.###.#|#.....#|.#####.', '☐': '#####|#...#|#...#|#...#|#####|.....|.....',
    '☑': '#####|#...#|#.#.#|##.##|#####|.....|.....', '~': '.....|.....|.#...|#.#.#|...#.|.....|.....',
    '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..', '[': '##|#.|#.|#.|#.|#.|##', ']': '##|.#|.#|.#|.#|.#|##',
  };
  const FONT = {};
  for (const ch in G) {
    const rows = G[ch].split('|');
    const pts = [];
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') pts.push([x, y]); });
    const w = Math.max(...rows.map((r) => r.length));
    FONT[ch] = { w, pts };
  }
  FONT[' '] = { w: 3, pts: [] };
  const glyph = (ch) => FONT[ch] || FONT[ch.toUpperCase()] || (ch === '—' ? FONT['–'] : FONT['?']);
  function textW(s, scale = 1) {
    let w = 0;
    for (const ch of String(s)) w += (glyph(ch).w + 1) * scale;
    return Math.max(0, w - scale);
  }
  // text(s, x, y, colour, {scale, shadow, outline, align, chars (typewriter), wave, waveT})
  function text(s, x, y, c, o = {}) {
    s = String(s);
    const sc = o.scale || 1;
    const chars = [...s];
    const n = o.chars === undefined ? chars.length : Math.max(0, Math.floor(o.chars));
    let w = textW(s, sc);
    if (o.align === 'center') x -= Math.floor(w / 2);
    else if (o.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    let cx = x;
    for (let k = 0; k < chars.length && k < n; k++) {
      const g = glyph(chars[k]);
      const dy = o.wave ? Math.round(Math.sin((o.waveT || 0) * 6 + k * 0.6) * o.wave) : 0;
      const draw = (ox, oy, col) => { for (const [gx, gy] of g.pts) rect(cx + gx * sc + ox, y + dy + gy * sc + oy, sc, sc, col); };
      if (o.outline !== undefined) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) draw(ox, oy, o.outline);
      if (o.shadow !== undefined) draw(sc > 1 ? sc : 1, sc > 1 ? sc : 1, o.shadow);
      draw(0, 0, c);
      cx += (g.w + 1) * sc;
    }
    return w;
  }
  function wrap(s, maxW, scale = 1) {
    const out = [];
    for (const para of String(s).split('\n')) {
      let cur = '';
      for (const word of para.split(' ')) {
        const t = cur ? cur + ' ' + word : word;
        if (textW(t, scale) > maxW && cur) { out.push(cur); cur = word; } else cur = t;
      }
      out.push(cur);
    }
    return out;
  }

  // ---------- the runner puppet ----------
  // (x, y) is the point between the feet on the ground. Angles are measured from straight down,
  // positive = in the facing direction. Poses: run jog walk idle cheer wave limp crutch lift ski sit
  // point fall tired.
  const MARK = { top: C.strava, top2: C.red, shorts: C.ink, skin: C.skin, skinD: C.skinD, hair: C.hair, shoe: C.white, shoe2: C.cyan, bib: true };
  function limb(x, y, a1, l1, a2, l2, c1, c2, dir, th = 2, cMid) {
    const kx = x + Math.sin(a1) * l1 * dir, ky = y + Math.cos(a1) * l1;
    const fx = kx + Math.sin(a2) * l2 * dir, fy = ky + Math.cos(a2) * l2;
    if (cMid !== undefined) {
      const mx = lerp(x, kx, 0.55), my = lerp(y, ky, 0.55);
      line(x, y, mx, my, cMid, th); line(mx, my, kx, ky, c1, th);
    } else line(x, y, kx, ky, c1, th);
    line(kx, ky, fx, fy, c2, th);
    return [fx, fy];
  }
  function dude(x, y, o = {}) {
    const dir = o.dir === -1 ? -1 : 1;
    const p = Object.assign({}, MARK, o.pal || {});
    const pose = o.pose || 'run';
    const q = o.phase || 0;
    x = Math.round(x); y = Math.round(y);
    let hip = [x, y - 10], lean = 0, bob = 0;
    let L = [[0, 0], [0, 0]], A = [[0.15, 0.4], [-0.1, 0.3]];
    const runLeg = (ph, amp) => { const th = amp * Math.sin(ph); return [th, th - (0.2 + 1.3 * amp * Math.max(0, Math.cos(ph)))]; };
    switch (pose) {
      case 'run': case 'jog': case 'sprint': {
        const amp = pose === 'jog' ? 0.55 : pose === 'sprint' ? 1.05 : 0.85;
        L = [runLeg(q + Math.PI, amp), runLeg(q, amp)];
        A = [[0.8 * amp * Math.sin(q), 0.8 * amp * Math.sin(q) + 1.5], [-0.8 * amp * Math.sin(q), -0.8 * amp * Math.sin(q) + 1.5]];
        bob = Math.abs(Math.sin(q)) > 0.7 ? -1 : 0;
        lean = pose === 'sprint' ? 2 : 1;
        break;
      }
      case 'walk': case 'tired': {
        const amp = pose === 'tired' ? 0.3 : 0.4;
        L = [[amp * Math.sin(q + Math.PI), amp * Math.sin(q + Math.PI) - 0.1], [amp * Math.sin(q), amp * Math.sin(q) - 0.1]];
        A = [[0.35 * Math.sin(q), 0.35 * Math.sin(q) + 0.2], [-0.35 * Math.sin(q), -0.35 * Math.sin(q) + 0.2]];
        if (pose === 'tired') { lean = 2; A = [[0.2, 0.1], [0.1, 0]]; }
        break;
      }
      case 'limp': {
        const s = Math.sin(q);
        L = [[0.35 * s, 0.35 * s], [-0.2 * s, -0.2 * s - 0.5 * Math.max(0, s)]];
        A = [[0.5, 1.4], [0.9, 2.3]];
        bob = s > 0 ? 1 : 0;
        lean = 1;
        break;
      }
      case 'idle': default:
        L = [[-0.12, -0.08], [0.12, 0.08]];
        A = [[-0.12, 0.1], [0.12, 0.2]];
        bob = Math.sin(q) > 0.6 ? -1 : 0;
        break;
      case 'cheer': {
        const j = Math.abs(Math.sin(q));
        bob = -Math.round(j * 4);
        L = [[-0.25, 0.1], [0.3, -0.2]];
        A = [[Math.PI - 0.5, Math.PI - 0.35], [Math.PI + 0.45, Math.PI + 0.3]];
        break;
      }
      case 'wave':
        L = [[-0.1, -0.05], [0.1, 0.05]];
        A = [[-0.1, 0.1], [Math.PI - 0.6 + 0.35 * Math.sin(q * 2), Math.PI - 0.2 + 0.35 * Math.sin(q * 2)]];
        break;
      case 'point':
        L = [[-0.15, -0.1], [0.15, 0.1]];
        A = [[-0.1, 0.1], [1.7, 1.6]];
        break;
      case 'crutch': {
        const s = Math.sin(q);
        L = [[0.1, 0.1], [0.45 + 0.3 * s, 0.9 + 0.3 * s]];
        A = [[0.35 + 0.25 * s, 0.3 + 0.25 * s], [0.45 + 0.25 * s, 0.4 + 0.25 * s]];
        lean = 1;
        bob = s > 0 ? -1 : 0;
        break;
      }
      case 'lift': {
        const up = (Math.sin(q) + 1) / 2;
        L = [[-0.3, 0], [0.3, 0]];
        A = [[Math.PI - 0.6 * (1 - up) - 0.2, Math.PI - 0.2 * up], [Math.PI + 0.6 * (1 - up) + 0.2, Math.PI + 0.2 * up]];
        break;
      }
      case 'ski':
        L = [[0.7, -0.3], [0.7, -0.3]];
        A = [[0.9, 1.7], [0.7, 1.5]];
        hip = [x - dir, y - 8];
        lean = 2;
        break;
      case 'fall':
        break;
      case 'sit':
        L = [[1.57, 0], [1.57, 0.1]];
        A = [[0.4, 1.2], [0.5, 1.3]];
        hip = [x, y - 3];
        break;
    }
    hip = [hip[0], hip[1] + bob];
    const sh = [hip[0] + lean * dir, hip[1] - 7];
    const back = { skin: p.skinD, shorts: p.shorts, shoe: p.shoe2 };
    // back limbs
    const f0 = limb(hip[0], hip[1], L[0][0], 5, L[0][1], 5, back.skin, back.skin, dir, 2, p.shorts);
    rect(f0[0] - 1 + dir, f0[1] - 1, 3, 2, back.shoe);
    limb(sh[0], sh[1] + 1, A[0][0], 4, A[0][1], 4, back.skin, back.skin, dir, 2);
    // torso
    const tx = Math.min(hip[0], sh[0]) - 2;
    for (let k = 0; k < 8; k++) {
      const xx = Math.round(lerp(hip[0], sh[0], k / 7)) - 2;
      rect(xx, hip[1] - k, 5, 1, k < 2 ? p.shorts : p.top);
    }
    if (p.stripe !== undefined) rect(Math.round(lerp(hip[0], sh[0], 0.6)) - 2, hip[1] - 5, 5, 1, p.stripe);
    if (p.bib && pose !== 'ski') {
      const bx = Math.round(lerp(hip[0], sh[0], 0.5)) - 1 + (dir > 0 ? 1 : -1);
      rect(bx, hip[1] - 5, 3, 2, C.white); px(bx + 1, hip[1] - 5, C.ink);
    }
    void tx;
    // head
    const hx = sh[0] - 2 + (dir > 0 ? 0 : 0), hy = sh[1] - 6;
    rect(hx, hy, 5, 5, p.skin);
    const hairStyle = p.hairStyle || 'short';
    if (hairStyle !== 'bald') {
      rect(hx, hy - 1, 5, 2, p.hair);
      rect(dir > 0 ? hx : hx + 4, hy, 1, 3, p.hair);
      if (hairStyle === 'pony') {
        const sw = Math.round(Math.sin(q) * 1.5);
        const bx = dir > 0 ? hx - 1 : hx + 5;
        rect(bx - dir, hy + 1 + sw, 2, 2, p.hair); rect(bx - 2 * dir, hy + 2 + sw, 2, 2, p.hair);
      }
      if (hairStyle === 'long') rect(dir > 0 ? hx - 1 : hx + 4, hy, 2, 6, p.hair);
    }
    px(dir > 0 ? hx + 3 : hx + 1, hy + 2, o.eye !== undefined ? o.eye : C.ink);
    if (o.swollen) { px(dir > 0 ? hx + 3 : hx + 1, hy + 2, C.plum); px(dir > 0 ? hx + 4 : hx, hy + 2, C.plum); px(dir > 0 ? hx + 3 : hx + 1, hy + 1, C.plum); }
    if (o.mouth) px(dir > 0 ? hx + 3 : hx + 1, hy + 4, C.ink);
    // hats
    const hat = o.hat;
    if (hat === 'santa') {
      rect(hx - 1, hy - 1, 7, 1, C.white); rect(hx, hy - 3, 5, 2, C.red); rect(hx + (dir > 0 ? -1 : 4), hy - 4, 3, 1, C.red); px(hx + (dir > 0 ? -2 : 6), hy - 4, C.white);
    } else if (hat === 'robin') {
      rect(hx - 1, hy - 2, 7, 2, C.green); rect(hx + 1, hy - 3, 3, 1, C.green); line(hx + (dir > 0 ? 0 : 4), hy - 3, hx + (dir > 0 ? -4 : 8), hy - 7, C.red, 1);
    } else if (hat === 'cap') {
      rect(hx, hy - 2, 5, 2, p.cap || C.navy); rect(dir > 0 ? hx + 3 : hx - 2, hy - 1, 4, 1, p.cap || C.navy);
    } else if (hat === 'halo') {
      rect(hx, hy - 4, 5, 1, C.gold);
    } else if (hat === 'crown') {
      rect(hx, hy - 3, 5, 2, C.gold); px(hx, hy - 4, C.gold); px(hx + 2, hy - 4, C.gold); px(hx + 4, hy - 4, C.gold);
    }
    // front limbs
    const f1 = limb(hip[0], hip[1], L[1][0], 5, L[1][1], 5, p.skin, p.skin, dir, 2, p.shorts);
    rect(f1[0] - 1 + dir, f1[1] - 1, 3, 2, p.shoe);
    const hand = limb(sh[0], sh[1] + 1, A[1][0], 4, A[1][1], 4, p.skin, p.skin, dir, 2);
    if (pose === 'crutch') {
      for (const s of [-1, 1]) {
        const top = [sh[0] + dir * (1 + s), sh[1] + 2];
        const foot = [x + dir * (6 + s) + Math.round(Math.sin(q) * 2) * dir, y];
        line(top[0], top[1], foot[0], foot[1], C.silver, 1);
        px(top[0], top[1], C.slate);
      }
    }
    if (pose === 'lift') {
      const up = (Math.sin(q) + 1) / 2;
      const by = Math.round(sh[1] - 4 - up * 5);
      rect(x - 9, by, 19, 1, C.silver); rect(x - 11, by - 2, 2, 5, C.dark); rect(x + 10, by - 2, 2, 5, C.dark);
    }
    if (pose === 'ski') {
      rect(x - 9, y + 1, 20, 1, C.red);
      line(hand[0], hand[1], hand[0] - dir * 7, y + 1, C.silver, 1);
    }
    return { head: [hx + 2, hy], hand };
  }

  // ---------- small helpers used by many scenes ----------
  function panel(x, y, w, h, bg = C.ink, border = C.white, border2 = C.slate) {
    rect(x + 1, y + 1, w - 2, h - 2, bg);
    box(x, y, w, h, border);
    rect(x + 1, y + h - 1, w - 2, 1, border2);
  }

  return {
    W, H, buf, C, PAL, hex, clamp, lerp, inv, easeOut, easeIn, easeInOut, backOut, rnd,
    clear, px, rect, box, dither, line, disc, ring, tri, spr, text, textW, wrap, dude, panel, MARK,
  };
})();
if (typeof window !== 'undefined') window.PX = PX;
