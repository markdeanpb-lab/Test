// Scene kit: backgrounds, props and UI pieces shared by the scenes.
'use strict';
const KIT = (() => {
  const { W, H, C, rect, dither, px, line, disc, tri, text, textW, wrap, dude, panel, spr, rnd, clamp, lerp, inv, easeOut, backOut, box, ring } = PX;
  const TAU = Math.PI * 2;
  const mod = (a, n) => ((a % n) + n) % n;

  // ---------- skies & scenery ----------
  function sky(cols, y0 = 0, y1 = H) {
    const n = cols.length, bh = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const ya = Math.round(y0 + i * bh), yb = Math.round(y0 + (i + 1) * bh);
      rect(0, ya, W, yb - ya, cols[i]);
      if (i < n - 1) { dither(0, yb - 3, W, 3, cols[i + 1], 0.25); dither(0, yb - 1, W, 1, cols[i + 1], 0.5); }
    }
  }
  function stars(t, n, y1, seed = 1) {
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd(i, seed) * W), y = Math.floor(rnd(i, seed + 1) * y1);
      const tw = Math.sin(t * (2 + rnd(i, seed + 2) * 4) + i) > 0.3;
      px(x, y, tw ? C.white : C.silver);
    }
  }
  function sun(x, y, r, c = C.gold, glow = C.sand, shades = false) {
    disc(x, y, r + 3, glow); disc(x, y, r, c);
    if (shades) {
      rect(x - r + 2, y - 2, r - 1, 3, C.ink); rect(x + 1, y - 2, r - 1, 3, C.ink); rect(x - 2, y - 2, 4, 1, C.ink);
      rect(x - r + 3, y - 2, 1, 1, C.slate); rect(x + 2, y - 2, 1, 1, C.slate);
      rect(x - 4, y + r - 5, 9, 1, C.brickD); px(x - 5, y + r - 6, C.brickD); px(x + 5, y + r - 6, C.brickD);
    }
  }
  function cloud(x, y, s = 1, c = C.white, c2 = C.silver) {
    x = Math.round(x); y = Math.round(y);
    disc(x, y, 5 * s, c); disc(x + 7 * s, y - 3 * s, 6 * s, c); disc(x + 15 * s, y, 5 * s, c);
    rect(x - 4 * s, y + 1, 24 * s, 4 * s, c); rect(x - 3 * s, y + 4 * s, 22 * s, 1, c2);
  }
  function clouds(t, speed, y, seed = 3, n = 4, c) {
    for (let i = 0; i < n; i++) {
      const span = W + 80;
      const x = mod(rnd(i, seed) * span - t * speed * (0.6 + rnd(i, seed + 1) * 0.4), span) - 40;
      cloud(x, y + rnd(i, seed + 2) * 24, rnd(i, seed + 3) > 0.6 ? 2 : 1, c || C.white, c ? c : C.silver);
    }
  }
  function hills(t, speed, baseY, amp, c, seed = 1, wl = 50, bottom = H) {
    const off = t * speed;
    for (let x = 0; x < W; x++) {
      const u = x + off;
      const h = amp * (0.55 * Math.sin(u / wl + seed) + 0.3 * Math.sin(u / (wl * 0.43) + seed * 2.1) + 0.15 * Math.sin(u / (wl * 0.19) + seed * 3.7));
      const top = Math.round(baseY - amp - h);
      rect(x, top, 1, bottom - top, c);
    }
  }
  function tree(x, gy, s = 1, c = C.grassD, c2 = C.green, trunk = C.hairD) {
    x = Math.round(x);
    rect(x - 1, gy - 6 * s, 2 * s, 6 * s, trunk);
    disc(x, gy - 10 * s, 5 * s, c); disc(x - 3 * s, gy - 8 * s, 3 * s, c); disc(x + 3 * s, gy - 8 * s, 3 * s, c);
    disc(x - 1, gy - 12 * s, 2 * s, c2);
  }
  function trees(t, speed, gy, spacing, seed = 1, s = 1, c, c2) {
    const off = t * speed;
    const i0 = Math.floor(off / spacing) - 1;
    for (let i = i0; i < i0 + W / spacing + 3; i++) {
      const x = i * spacing - off + rnd(i, seed) * spacing * 0.6;
      tree(x, gy, s, c, c2);
    }
  }
  function ground(y, c1 = C.grass, c2 = C.grassD, t = 0, speed = 0, bottom = H) {
    rect(0, y, W, bottom - y, c1);
    rect(0, y, W, 1, C.lime);
    const off = t * speed;
    for (let i = Math.floor(off / 9) - 1; i < off / 9 + W / 9 + 1; i++) {
      const x = Math.round(i * 9 - off), yy = y + 3 + Math.floor(rnd(i, 7) * (bottom - y - 6));
      px(x, yy, c2); px(x + 1, yy - 1, c2); px(x + 2, yy, c2);
    }
  }
  function path(y, h, c = C.sand, edge = C.orange, t = 0, speed = 0) {
    rect(0, y, W, h, c); rect(0, y, W, 1, edge); rect(0, y + h - 1, W, 1, edge);
    const off = t * speed;
    for (let i = Math.floor(off / 13) - 1; i < off / 13 + W / 13 + 1; i++) px(Math.round(i * 13 - off), y + 2 + (i & 1), edge);
  }
  function road(y, h, t = 0, speed = 0, c = C.dark, lane = C.white) {
    rect(0, y, W, h, c); rect(0, y, W, 1, C.slate);
    const off = t * speed;
    for (let i = Math.floor(off / 24) - 1; i < off / 24 + W / 24 + 1; i++) rect(Math.round(i * 24 - off), y + (h >> 1), 12, 1, lane);
  }

  // London: Shard, Gherkin, St Paul's dome, BT Tower, Big Ben, the Eye.
  function london(xoff, baseY, c = C.navy, win = C.sand, winOn = true) {
    const b = (x, w, h) => { rect(x + xoff, baseY - h, w, h, c); };
    const X = (x) => Math.round(x + xoff);
    const wins = (x, y, w, h) => { if (!winOn) return; for (let j = y + 2; j < y + h - 1; j += 4) for (let i = x + 2; i < x + w - 1; i += 3) if (rnd(i * 7 + j, 5) > 0.55) px(X(i), j, win); };
    b(0, 18, 26); wins(0, baseY - 26, 18, 26);
    // Eye
    ring(X(40), baseY - 22, 16, c); ring(X(40), baseY - 22, 15, c);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; line(X(40), baseY - 22, X(40 + Math.cos(a) * 15), baseY - 22 + Math.sin(a) * 15, c); }
    line(X(40), baseY - 22, X(33), baseY, c, 2); line(X(40), baseY - 22, X(47), baseY, c, 2);
    // Big Ben
    b(62, 8, 44); tri(X(62), baseY - 44, X(69), baseY - 44, X(65.5), baseY - 56, c); rect(X(64), baseY - 40, 4, 4, win); px(X(66), baseY - 39, c);
    b(70, 30, 18); wins(70, baseY - 18, 30, 18);
    // St Paul's
    b(106, 22, 14); disc(X(117), baseY - 17, 7, c); rect(X(116), baseY - 28, 2, 5, c);
    b(132, 12, 34); wins(132, baseY - 34, 12, 34);
    // BT tower
    rect(X(150), baseY - 50, 5, 50, c); rect(X(148), baseY - 44, 9, 6, c); rect(X(149), baseY - 54, 3, 4, c);
    b(158, 20, 22); wins(158, baseY - 22, 20, 22);
    // Gherkin
    for (let j = 0; j < 36; j++) { const w = Math.round(9 * Math.sin((j / 36) * Math.PI * 0.95 + 0.1)); rect(X(190 - w / 2), baseY - j, w, 1, c); }
    b(202, 14, 28); wins(202, baseY - 28, 14, 28);
    // Shard
    tri(X(222), baseY, X(246), baseY, X(236), baseY - 66, c);
    for (let j = 8; j < 60; j += 5) px(X(236 - (60 - j) * 0.02), baseY - j, win);
    b(250, 24, 20); wins(250, baseY - 20, 24, 20);
    b(278, 16, 32); wins(278, baseY - 32, 16, 32);
    b(298, 26, 16); wins(298, baseY - 16, 26, 16);
  }
  // St Albans: the cathedral (long nave, square tower), the clock tower, trees.
  function stAlbans(xoff, baseY, c = C.navy, win = C.sand) {
    const X = (x) => Math.round(x + xoff);
    // cathedral
    rect(X(40), baseY - 22, 120, 22, c);
    rect(X(40), baseY - 26, 120, 4, c);
    for (let i = 44; i < 156; i += 8) { rect(X(i), baseY - 18, 2, 6, win); }
    rect(X(86), baseY - 50, 22, 28, c);
    for (let i = 0; i < 4; i++) rect(X(86 + i * 6), baseY - 53, 3, 3, c);
    rect(X(92), baseY - 44, 3, 7, win); rect(X(99), baseY - 44, 3, 7, win);
    tri(X(36), baseY - 22, X(46), baseY - 22, X(41), baseY - 34, c);
    rect(X(150), baseY - 30, 10, 8, c);
    // clock tower
    rect(X(210), baseY - 42, 12, 42, c);
    rect(X(208), baseY - 46, 16, 4, c);
    for (let i = 0; i < 4; i++) rect(X(208 + i * 4), baseY - 49, 2, 3, c);
    disc(X(216), baseY - 34, 3, win); px(X(216), baseY - 35, c); px(X(217), baseY - 34, c);
    // houses
    for (let i = 0; i < 6; i++) { const hx = 232 + i * 15; rect(X(hx), baseY - 12, 13, 12, c); tri(X(hx - 1), baseY - 12, X(hx + 13), baseY - 12, X(hx + 6), baseY - 19, c); if (i % 2) rect(X(hx + 4), baseY - 8, 3, 3, win); }
    for (let i = 0; i < 3; i++) { const hx = 2 + i * 12; rect(X(hx), baseY - 10, 10, 10, c); tri(X(hx - 1), baseY - 10, X(hx + 10), baseY - 10, X(hx + 5), baseY - 16, c); }
  }
  function mancMills(xoff, baseY) {
    for (let i = 0; i < 6; i++) {
      const x = Math.round(xoff + i * 60);
      rect(x, baseY - 30, 44, 30, C.brick);
      for (let j = baseY - 26; j < baseY - 4; j += 6) for (let k = x + 3; k < x + 42; k += 6) rect(k, j, 3, 3, C.brickD);
      rect(x + 36, baseY - 52, 6, 22, C.brickD); rect(x + 35, baseY - 54, 8, 2, C.brickD);
    }
  }

  function crowd(t, y, x0, x1, seed = 1, dense = 5) {
    const cols = [C.red, C.blue, C.gold, C.green, C.pink, C.cyan, C.orange, C.purple, C.white];
    for (let x = x0; x < x1; x += dense) {
      const i = Math.round(x / dense) + 1000;
      const col = cols[Math.floor(rnd(i, seed) * cols.length)];
      const jump = Math.sin(t * 9 + rnd(i, seed + 1) * 20) > 0.6 ? -1 : 0;
      const yy = y + Math.floor(rnd(i, seed + 2) * 3) + jump;
      rect(x, yy, 4, 6, col);
      rect(x + 1, yy - 3, 3, 3, rnd(i, seed + 3) > 0.5 ? C.skin : C.skinD);
      if (jump) { px(x - 1, yy - 2, C.skin); px(x + 4, yy - 2, C.skin); }
    }
  }
  function barrier(y, t = 0, speed = 0, c = C.white, c2 = C.strava) {
    rect(0, y, W, 6, c);
    const off = t * speed;
    for (let i = Math.floor(off / 16) - 1; i < off / 16 + W / 16 + 1; i++) rect(Math.round(i * 16 - off), y + 1, 8, 4, c2);
  }
  function finishArch(x, gy, label = 'FINISH', c = C.strava) {
    x = Math.round(x);
    rect(x - 34, gy - 44, 6, 44, c); rect(x + 28, gy - 44, 6, 44, c);
    rect(x - 34, gy - 50, 68, 12, c);
    rect(x - 32, gy - 48, 64, 8, C.white);
    text(label, x, gy - 47, C.ink, { align: 'center' });
    for (let i = 0; i < 12; i++) px(x - 28 + i * 5, gy - 1, i % 2 ? C.white : C.ink);
  }
  function flagPole(x, gy, t, c = C.red, h = 30) {
    rect(x, gy - h, 1, h, C.silver);
    for (let j = 0; j < 6; j++) { const w = 9 + Math.round(Math.sin(t * 8 + j) * 1); rect(x + 1, gy - h + j, w, 1, c); }
  }
  function snow(t, n = 70, seed = 9) {
    for (let i = 0; i < n; i++) {
      const sp = 12 + rnd(i, seed) * 20;
      const x = mod(rnd(i, seed + 1) * W + Math.sin(t * 1.5 + i) * 6 - t * 6, W);
      const y = mod(rnd(i, seed + 2) * H + t * sp, H);
      px(x, y, C.snow); if (rnd(i, seed + 3) > 0.7) px(x + 1, y, C.snow);
    }
  }
  function confetti(t, n = 80, seed = 4, t0 = 0) {
    const cols = [C.red, C.gold, C.cyan, C.lime, C.pink, C.white, C.strava];
    const age = t - t0;
    if (age < 0) return;
    for (let i = 0; i < n; i++) {
      const x = mod(rnd(i, seed) * W + Math.sin(age * 3 + i) * 5, W);
      const y = -10 + (age * (30 + rnd(i, seed + 1) * 40)) + rnd(i, seed + 2) * -60;
      if (y > H || y < 0) continue;
      const c = cols[i % cols.length];
      if ((Math.floor(age * 8) + i) % 2) rect(x, y, 2, 1, c); else rect(x, y, 1, 2, c);
    }
  }
  function firework(x, y, age, c = C.gold, n = 16, seed = 1) {
    if (age < 0) return;
    if (age < 0.6) { const yy = y + (1 - age / 0.6) * 80; px(x, yy, C.white); px(x, yy + 1, C.sand); return; }
    const a = age - 0.6;
    if (a > 1.4) return;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + seed, r = easeOut(Math.min(1, a / 0.8)) * (18 + rnd(i, seed) * 6);
      const fx = x + Math.cos(ang) * r, fy = y + Math.sin(ang) * r + a * a * 10;
      if (a > 1.0 && (i + Math.floor(a * 20)) % 2) continue;
      px(fx, fy, c); px(fx - Math.cos(ang) * 2, fy - Math.sin(ang) * 2, a < 0.5 ? C.white : c);
    }
  }
  function speedLines(t, n = 14, speed = 400, cy = 90, spread = 120, c = C.white) {
    for (let i = 0; i < n; i++) {
      const y = cy - spread / 2 + rnd(i, 21) * spread;
      const len = 14 + rnd(i, 22) * 30;
      const x = mod(W - t * speed * (0.7 + rnd(i, 23) * 0.6) + rnd(i, 24) * W, W + 60) - 30;
      rect(x, y, len, 1, c);
    }
  }
  function heatShimmer(t, y0, y1) {
    for (let y = y0; y < y1; y += 5) for (let x = 0; x < W; x += 2) {
      if (Math.sin(x * 0.12 + t * 6 + y) > 0.94) px(x, y + Math.round(Math.sin(t * 5 + x * 0.3) * 1), C.sand);
    }
  }
  function sweat(x, y, t, n = 3) {
    for (let i = 0; i < n; i++) {
      const a = mod(t * 1.6 + i / n, 1);
      const dx = (i - 1) * 4 * a, dy = -3 + a * 10;
      px(x + dx, y + dy, C.cyan); px(x + dx, y + dy + 1, C.sky);
    }
  }

  // ---------- icons (string sprites) ----------
  const ICON = {
    trophy: ['.yyyyy.', 'yyyyyyy', 'yyyyyyy', '.yyyyy.', '..yyy..', '...y...', '..yyy..', '.ooooo.'],
    medal: ['r...r', '.r.r.', '..r..', '.yyy.', 'yyyyy', 'yyoyy', 'yyyyy', '.yyy.'],
    shoe: ['...ww....', '..wwwr...', '.wwwwrrr.', 'wwwwwwwww', 'ccccccccc'],
    heart: ['.rr.rr.', 'rrrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'],
    pint: ['wwwwww.', 'yyyyyy.', 'yyyyyyww', 'yyyyyy.w', 'yyyyyyww', 'yyyyyy.', '.yyyy..'],
    thumb: ['...o...', '..oo...', '..oo...', 'ooooooo', 'ooooooo', 'ooooooo', '.oooooo'],
    coin: ['.yyy.', 'yyoyy', 'yyoyy', 'yyoyy', '.yyy.'],
    watch: ['.kkk.', 'kcccK', 'kcwck', 'kcccK', '.kkk.'],
    barbell: ['kk.......kk', 'kk.......kk', 'kkwwwwwwwkk', 'kk.......kk', 'kk.......kk'],
    bed: ['w.........', 'wppp......', 'wpppbbbbbb', 'wwwwwwwwww', 'w........w'],
    toilet: ['..wwww', '..wwww', 'wwwwww', 'wwwww.', '.www..', '.www..'],
    lock: ['.yyy.', 'y...y', 'yyyyy', 'yykyy', 'yyyyy'],
    bike: ['.....kk...', '....k.....', '.kkkkkk...', 'k.k..k.k..', 'kk....kkk.', 'k......k..'],
    volcano: ['....ww....', '...w..w...', '....rr....', '...rbbr...', '..bbbbbb..', '.bbbbbbbb.', 'bbbbbbbbbb'],
    zzz: ['kkk', '..k', '.k.', 'kkk'],
    puppy: [
      '..........bb.',
      'b........bbbb',
      '.b.......bkbbk',
      '..bbbbbbbbbbb.',
      '..bbbbbbbbb...',
      '..bbwbbbbbb...',
      '..b.b....b.b..',
      '..b.b....b.b..',
    ],
    puppy2: [
      '..........bb.',
      'b........bbbb',
      '.b.......bkbbk',
      '..bbbbbbbbbbb.',
      '..bbbbbbbbb...',
      '..bbwbbbbbb...',
      '.b...b..b...b.',
      'b.....b.b....b',
    ],
    ironman: ['.rrr.', 'rryrr', 'ryyyr', 'rrrrr'],
    clock: ['.kkkkk.', 'kwwwwwk', 'kwwkwwk', 'kwwkkwk', 'kwwwwwk', 'kwwwwwk', '.kkkkk.'],
    wheel: ['.kkk.', 'kwkwk', 'kkkkk', 'kwkwk', '.kkk.'],
    balloon: ['.ppp.', 'ppppp', 'ppppp', '.ppp.', '..k..', '..k..', '..k..'],
  };
  const ICONPAL = { y: C.gold, o: C.orange, r: C.red, w: C.white, c: C.slate, k: C.ink, K: C.ink, p: C.pink, b: C.sand, s: C.silver };
  function icon(name, x, y, scale = 1, pal) { return spr(ICON[name], x, y, Object.assign({}, ICONPAL, pal || {}), { scale }); }

  // ---------- UI ----------
  // Level / world title card sliding in from the top.
  function banner(st, kicker, title, sub, o = {}) {
    const t0 = o.t0 || 0, t1 = o.t1 === undefined ? 1e9 : o.t1;
    if (st < t0 || st > t1 + 0.4) return;
    const a = easeOut(clamp((st - t0) / 0.45, 0, 1)), b = clamp((st - t1) / 0.4, 0, 1);
    const scale = o.scale || 2;
    const w = Math.max(textW(title, scale), textW(kicker || ''), textW(sub || '')) + 20;
    const h = 12 + 7 * scale + (sub ? 11 : 0) + (kicker ? 9 : 0);
    const x = (W - w) >> 1, y = Math.round(lerp(-h - 2, o.y || 14, a) - b * (h + 20));
    panel(x, y, w, h, o.bg || C.ink, o.border || C.gold, C.plum);
    let yy = y + 5;
    if (kicker) { text(kicker, W / 2, yy, o.kc || C.sand, { align: 'center' }); yy += 9; }
    text(title, W / 2, yy, o.tc || C.white, { align: 'center', scale, shadow: C.plum });
    yy += 7 * scale + 4;
    if (sub) text(sub, W / 2, yy, o.sc || C.cyan, { align: 'center' });
  }
  // Bottom dialogue box with typewriter text.
  function caption(st, t0, str, o = {}) {
    if (st < t0) return;
    if (o.t1 !== undefined && st > o.t1) return;
    const y = o.y || 139, x = o.x || 6, w = o.w || W - 12;
    const lines = wrap(str, w - 14);
    const h = o.h || Math.max(22, lines.length * 10 + 8);
    panel(x, y, w, h, o.bg || C.ink, o.border || C.white, C.slate);
    if (o.who) {
      const ww = textW(o.who) + 8;
      panel(x + 6, y - 9, ww, 11, o.whoBg || C.strava, C.white, C.white);
      text(o.who, x + 10, y - 7, C.white);
    }
    let n = Math.floor((st - t0) * (o.cps || 38));
    lines.forEach((ln, i) => {
      text(ln, x + 7, y + 6 + i * 10, o.c || C.white, { chars: n });
      n -= [...ln].length;
    });
    if (n > 8 && Math.floor(st * 3) % 2) tri(x + w - 10, y + h - 7, x + w - 5, y + h - 7, x + w - 7.5, y + h - 4, C.sand);
  }
  // Card quoting an activity from Mark's log.
  function logCard(st, t0, x, y, w, o) {
    if (st < t0 || (o.t1 !== undefined && st > o.t1)) return;
    const a = backOut(clamp((st - t0) / 0.35, 0, 1));
    const titleLines = wrap(o.title, w - 12);
    const descLines = o.desc ? wrap(o.desc, w - 12) : [];
    const h = 14 + titleLines.length * 9 + descLines.length * 9 + (o.stat ? 11 : 0) + 4;
    const yy = Math.round(lerp(y + 30, y, a));
    if (a < 0.02) return;
    panel(x, yy, w, h, C.white, C.ink, C.silver);
    rect(x + 1, yy + 1, w - 2, 10, C.strava);
    icon('shoe', x + 4, yy + 3, 1, { w: C.white, r: C.ink, c: C.white });
    text(o.head || "MARK'S LOG", x + 16, yy + 3, C.white);
    if (o.date) text(o.date, x + w - 5, yy + 3, C.white, { align: 'right' });
    let ly = yy + 14;
    const n0 = Math.floor((st - t0) * 45);
    let n = n0;
    for (const ln of titleLines) { text(ln, x + 6, ly, C.ink, { chars: n }); n -= [...ln].length; ly += 9; }
    for (const ln of descLines) { text(ln, x + 6, ly, C.slate, { chars: n }); n -= [...ln].length; ly += 9; }
    if (o.stat && n > 0) { rect(x + 5, ly, w - 10, 1, C.silver); text(o.stat, x + 6, ly + 3, C.strava); }
    return h;
  }
  // "Achievement unlocked" toast sliding in from the right.
  function toast(st, t0, dur, title, line2, o = {}) {
    if (st < t0 || st > t0 + dur) return;
    const a = easeOut(clamp((st - t0) / 0.3, 0, 1)), b = easeOut(clamp((st - (t0 + dur - 0.3)) / 0.3, 0, 1));
    const w = Math.max(textW(title), textW(line2 || '')) + 34, h = line2 ? 26 : 17;
    const x = Math.round(lerp(W + 2, W - w - 6, a) + b * (w + 10)), y = o.y || 20;
    panel(x, y, w, h, C.ink, o.border || C.gold, C.plum);
    disc(x + 12, y + h / 2, 8, o.circle || C.gold);
    icon(o.icon || 'trophy', x + 9, y + h / 2 - 4, 1, { y: C.white, o: C.sand });
    text(title, x + 24, y + 4, o.c || C.gold);
    if (line2) text(line2, x + 24, y + 14, C.white);
  }
  function popup(st, t0, x, y, str, c = C.gold, o = {}) {
    const age = st - t0;
    const life = o.life || 1.2;
    if (age < 0 || age > life) return;
    const yy = y - easeOut(Math.min(1, age / 0.6)) * (o.rise || 14);
    if (age > life - 0.3 && Math.floor(age * 20) % 2) return;
    text(str, x, yy, c, { align: 'center', outline: C.ink, scale: o.scale || 1 });
  }
  function bigText(st, t0, str, y, scale, c, o = {}) {
    if (st < t0 || (o.t1 !== undefined && st > o.t1)) return;
    const a = clamp((st - t0) / 0.4, 0, 1);
    const yy = Math.round(y - (1 - backOut(a)) * 30);
    if (a < 0.05) return;
    text(str, o.x === undefined ? W / 2 : o.x, yy, c, { align: o.align || 'center', scale, outline: o.outline === undefined ? C.ink : o.outline, shadow: o.shadow, wave: o.wave, waveT: st });
  }
  function bubble(st, t0, x, y, str, o = {}) {
    if (st < t0 || (o.t1 !== undefined && st > o.t1)) return;
    const lines = wrap(str, o.maxW || 120);
    const w = Math.max(...lines.map((l) => textW(l))) + 8, h = lines.length * 9 + 5;
    const bx = Math.round(clamp(x - w / 2, 2, W - w - 2)), by = Math.round(y - h - 5);
    rect(bx + 1, by, w - 2, h, C.white); rect(bx, by + 1, w, h - 2, C.white);
    box(bx + 1, by - 1, w - 2, 1, C.ink);
    tri(x - 3, by + h - 1, x + 2, by + h - 1, x - 2, by + h + 4, C.white);
    let n = Math.floor((st - t0) * 40);
    lines.forEach((ln, i) => { text(ln, bx + 4, by + 3 + i * 9, o.c || C.ink, { chars: n }); n -= [...ln].length; });
  }
  function hud(s) {
    rect(0, 0, W, 10, C.black);
    rect(0, 10, W, 1, C.dark);
    text(s.date, 4, 2, C.sand);
    const parts = [['RUNS', String(s.runs)], ['KM', s.km.toLocaleString('en-GB')], ['PARKRUNS', String(s.parkruns)]];
    let x = W - 4;
    for (let i = parts.length - 1; i >= 0; i--) {
      const [k, v] = parts[i];
      x -= textW(v); text(v, x, 2, C.white); x -= 4 + textW(k); text(k, x, 2, C.cyan); x -= 12;
      if (i > 0) px(x + 6, 5, C.slate);
    }
  }
  function filmFrame(t) {
    rect(0, 11, 14, H - 11, C.black); rect(W - 14, 11, 14, H - 11, C.black);
    const off = Math.floor((t * 60) % 14);
    for (let y = 11 - off; y < H; y += 14) { rect(4, y + 3, 6, 8, C.dark); rect(W - 10, y + 3, 6, 8, C.dark); }
  }
  function checker(x, y, w, h, s, c1, c2) {
    for (let j = 0; j < h; j += s) for (let i = 0; i < w; i += s) rect(x + i, y + j, s, s, ((i + j) / s) % 2 ? c1 : c2);
  }

  return {
    TAU, mod, sky, stars, sun, cloud, clouds, hills, tree, trees, ground, path, road, london, stAlbans, mancMills, crowd, barrier,
    finishArch, flagPole, snow, confetti, firework, speedLines, heatShimmer, sweat, ICON, icon, banner, caption, logCard, toast,
    popup, bigText, bubble, hud, filmFrame, checker,
  };
})();
if (typeof window !== 'undefined') window.KIT = KIT;
