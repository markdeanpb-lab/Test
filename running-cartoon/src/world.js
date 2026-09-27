// Environments: skies, light, parallax landscapes, cities and interiors, weather and crowds.
'use strict';
const WORLD = (() => {
  const { W, H, C, rect, hline, dither, px, line, disc, ellipse, ellipseDither, tri, poly, text, textW, rnd, clamp, lerp, vgrad, box, ring } = PX;
  const mod = (a, n) => ((a % n) + n) % n;
  const TAU = Math.PI * 2;

  const SKY = {
    dawn: [C.night, C.dawnP, C.dawnR, C.dawnO, C.dawnY, C.dawnL],
    blue: [C.deep, C.blue, C.sky, C.skyL, C.skyP],
    morning: [C.sky, C.skyL, C.skyP, C.haze, C.dawnL],
    hot: [C.skyL, C.skyP, C.haze, C.dawnL, C.dawnY, C.yellow],
    dusk: [C.navy, C.dawnP, C.dawnR, C.dawnO, C.dawnY],
    night: [C.black, C.ink, C.night, C.navy],
    grey: [C.g2, C.g3, C.g4, C.g5],
    storm: [C.g1, C.g2, C.g3, C.g4],
    spain: [C.blue, C.sky, C.skyL, C.skyP, C.haze],
    autumn: [C.sky, C.skyL, C.skyP, C.dawnL],
    winter: [C.g3, C.g4, C.g5, C.haze],
    golden: [C.sky, C.skyL, C.dawnL, C.dawnY, C.dawnO],
  };
  const sky = (kind, y0 = 0, y1 = 200) => vgrad(y0, y1, SKY[kind] || SKY.blue);
  function stars(t, n, y1, seed = 1) {
    for (let i = 0; i < n; i++) { const x = Math.floor(rnd(i, seed) * W), y = Math.floor(rnd(i, seed + 1) * y1); px(x, y, Math.sin(t * (2 + rnd(i, seed + 2) * 3) + i) > 0.2 ? C.white : C.g3); }
  }
  function sun(x, y, r, core = C.yellow, glow = [C.dawnL, C.dawnY]) {
    ellipseDither(x, y, r * 3.2, r * 3.2, glow[0], 0.18);
    ellipseDither(x, y, r * 2.2, r * 2.2, glow[0], 0.35);
    ellipseDither(x, y, r * 1.5, r * 1.5, glow[1], 0.6);
    disc(x, y, r, core); disc(x - r * 0.3, y - r * 0.3, r * 0.5, C.white);
  }
  function cloud(x, y, s, top = C.white, mid = C.haze, under = C.g5) {
    x = Math.round(x); y = Math.round(y);
    ellipse(x, y + 3 * s, 22 * s, 6 * s, under);
    ellipse(x - 10 * s, y, 10 * s, 7 * s, mid); ellipse(x + 2 * s, y - 4 * s, 12 * s, 9 * s, mid); ellipse(x + 13 * s, y, 9 * s, 6 * s, mid);
    ellipse(x - 9 * s, y - 2 * s, 7 * s, 4 * s, top); ellipse(x + 2 * s, y - 7 * s, 8 * s, 5 * s, top); ellipse(x + 12 * s, y - 2 * s, 5 * s, 3 * s, top);
  }
  function clouds(t, speed, y, seed = 3, n = 4, tones) {
    const span = W + 160;
    for (let i = 0; i < n; i++) {
      const x = mod(rnd(i, seed) * span - t * speed * (0.6 + rnd(i, seed + 1) * 0.4), span) - 80;
      const s = 0.8 + rnd(i, seed + 3) * 1.1;
      if (tones) cloud(x, y + rnd(i, seed + 2) * 40, s, tones[0], tones[1], tones[2]); else cloud(x, y + rnd(i, seed + 2) * 40, s);
    }
  }
  function hills(t, speed, baseY, amp, c, seed = 1, wl = 60, bottom = H, rim) {
    const off = t * speed;
    for (let x = 0; x < W; x++) {
      const u = x + off;
      const h = amp * (0.55 * Math.sin(u / wl + seed) + 0.3 * Math.sin(u / (wl * 0.43) + seed * 2.1) + 0.15 * Math.sin(u / (wl * 0.19) + seed * 3.7));
      const top = Math.round(baseY - amp - h);
      rect(x, top, 1, bottom - top, c);
      if (rim !== undefined) px(x, top, rim);
    }
  }
  function treeline(t, speed, y, h, c, seed = 5, c2) {
    const off = t * speed;
    for (let x = 0; x < W; x++) {
      const u = (x + off) / 7;
      const bump = Math.abs(Math.sin(u + seed)) * h * 0.6 + Math.abs(Math.sin(u * 0.37 + seed * 2)) * h * 0.5;
      const top = Math.round(y - bump);
      rect(x, top, 1, y - top + 1, c);
      if (c2 !== undefined && (x + Math.floor(off)) % 3 === 0) px(x, top + 1, c2);
    }
  }
  // A detailed deciduous tree. pal: [dark, mid, light, highlight, trunk, trunkDark]
  const TREE_PAL = {
    summer: () => [C.f1, C.f2, C.f3, C.f4, C.e1, C.e0],
    spring: () => [C.f2, C.f3, C.f4, C.f5, C.e1, C.e0],
    autumn: () => [C.b1, C.b3, C.orange, C.gold, C.e1, C.e0],
    winter: () => [C.e1, C.e2, C.e2, C.e3, C.e1, C.e0],
    blossom: () => [C.pinkD, C.pink, C.white, C.white, C.e1, C.e0],
    dark: () => [C.f0, C.f1, C.f1, C.f2, C.e0, C.black],
    dusk: () => [C.plum, C.dawnP, C.dawnR, C.dawnO, C.ink, C.black],
    night: () => [C.ink, C.night, C.navy, C.deep, C.black, C.black],
  };
  function tree(x, gy, s = 1, season = 'summer', seed = 1) {
    const [d, m, l, hl, tk, tkd] = TREE_PAL[season]();
    x = Math.round(x);
    const th = 22 * s;
    rect(x - 2 * s, gy - th, 4 * s, th, tk); rect(x - 2 * s, gy - th, 1.5 * s, th, tkd);
    line(x, gy - th * 0.7, x - 8 * s, gy - th * 1.1, tk, Math.max(1, Math.round(2 * s)));
    line(x, gy - th * 0.8, x + 7 * s, gy - th * 1.15, tk, Math.max(1, Math.round(2 * s)));
    if (season === 'winter') {
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (rnd(i, seed) - 0.5) * 2.2, L = (10 + rnd(i, seed + 1) * 12) * s; line(x, gy - th * 0.9, x + Math.cos(a) * L, gy - th * 0.9 + Math.sin(a) * L, tk, 1); }
      return;
    }
    const cy = gy - th - 10 * s;
    const blobs = [[0, 0, 16], [-11, 5, 11], [11, 4, 12], [-5, -9, 11], [7, -8, 10], [0, 8, 12]];
    for (const [bx, by, r] of blobs) ellipse(x + bx * s, cy + by * s, r * s, r * 0.85 * s, d);
    for (const [bx, by, r] of blobs) ellipse(x + bx * s + 1.5 * s, cy + by * s - 1.5 * s, r * 0.8 * s, r * 0.68 * s, m);
    for (const [bx, by, r] of blobs.slice(3)) ellipse(x + bx * s + 3 * s, cy + by * s - 3 * s, r * 0.55 * s, r * 0.45 * s, l);
    ellipseDither(x + 6 * s, cy - 8 * s, 6 * s, 4 * s, hl, 0.5);
    ellipseDither(x - 8 * s, cy + 8 * s, 10 * s, 6 * s, d, 0.4);
  }
  function trees(t, speed, gy, spacing, seed = 1, s = 1, season = 'summer') {
    const off = t * speed;
    const i0 = Math.floor(off / spacing) - 2;
    for (let i = i0; i < i0 + W / spacing + 4; i++) tree(i * spacing - off + rnd(i, seed) * spacing * 0.5, gy + Math.round(rnd(i, seed + 3) * 3), s * (0.85 + rnd(i, seed + 2) * 0.3), season, i);
  }
  function grass(y0, y1, t, speed, pal = [C.f2, C.f3, C.f4]) {
    vgrad(y0, y1, [pal[1], pal[0]]);
    rect(0, y0, W, 1, pal[2]);
    const off = t * speed;
    for (let i = Math.floor(off / 6) - 1; i < off / 6 + W / 6 + 1; i++) {
      const x = Math.round(i * 6 - off + rnd(i, 7) * 4), yy = y0 + 2 + Math.floor(rnd(i, 8) * (y1 - y0 - 4));
      px(x, yy, pal[2]); px(x + 1, yy - 1, pal[2]); px(x - 1, yy - 1, pal[0]);
    }
  }
  function path(y, h, t, speed, pal = [C.e3, C.e4, C.e2]) {
    rect(0, y, W, h, pal[1]); rect(0, y, W, 1, pal[2]); rect(0, y + h - 1, W, 1, pal[2]);
    dither(0, y + h - 4, W, 3, pal[0], 0.3);
    const off = t * speed;
    for (let i = Math.floor(off / 11) - 1; i < off / 11 + W / 11 + 1; i++) { const x = Math.round(i * 11 - off); px(x, y + 2 + (i & 3), pal[0]); px(x + 5, y + h - 3 - (i & 1), pal[2]); }
  }
  function road(y, h, t, speed, pal = [C.g1, C.g2, C.white]) {
    rect(0, y, W, h, pal[0]); rect(0, y, W, 2, pal[1]);
    dither(0, y + 2, W, h - 2, pal[1], 0.1);
    const off = t * speed;
    for (let i = Math.floor(off / 40) - 1; i < off / 40 + W / 40 + 1; i++) rect(Math.round(i * 40 - off), y + (h >> 1), 20, 2, pal[2]);
  }
  function fgBushes(t, speed, y, c = C.f0, seed = 11) {
    const off = t * speed, sp = 90;
    for (let i = Math.floor(off / sp) - 1; i < off / sp + W / sp + 2; i++) {
      const x = i * sp - off + rnd(i, seed) * 50;
      if (rnd(i, seed + 1) < 0.35) continue;
      ellipse(x, y, 30 + rnd(i, seed + 2) * 20, 22, c); ellipse(x + 22, y + 6, 20, 16, c);
    }
  }
  function mist(y0, y1, c, level = 0.25) { dither(0, y0, W, y1 - y0, c, level); }

  // ---------- landmarks ----------
  function bandstand(x, gy, pal = { roof: C.f1, roofL: C.f3, col: C.white, base: C.g4, baseD: C.g3 }) {
    x = Math.round(x);
    rect(x - 40, gy - 8, 80, 8, pal.base); rect(x - 40, gy - 8, 80, 2, C.white); rect(x - 40, gy - 2, 80, 2, pal.baseD);
    rect(x - 36, gy - 36, 72, 3, pal.col);
    for (let i = 0; i < 7; i++) rect(x - 34 + i * 11, gy - 34, 3, 26, pal.col);
    rect(x - 36, gy - 17, 72, 1, pal.col);
    for (let i = 0; i < 12; i++) px(x - 34 + i * 6, gy - 15, pal.col);
    tri(x - 42, gy - 36, x + 42, gy - 36, x, gy - 62, pal.roof);
    ellipse(x, gy - 44, 32, 10, pal.roof);
    ellipseDither(x + 10, gy - 48, 18, 6, pal.roofL, 0.5);
    rect(x - 1, gy - 72, 2, 12, pal.col); disc(x, gy - 73, 2, C.gold);
  }
  function london(xoff, baseY, c = C.g3, win = C.dawnL, winOn = false, d = C.g2) {
    const X = (x) => Math.round(x + xoff);
    const b = (x, w, h, cc = c) => rect(X(x), baseY - h, w, h, cc);
    const wins = (x, y, w, h) => { if (!winOn) return; for (let j = y + 3; j < y + h - 2; j += 5) for (let i = x + 2; i < x + w - 2; i += 4) if (rnd(i * 7 + j, 5) > 0.5) rect(X(i), j, 2, 2, win); };
    b(0, 30, 34); wins(0, baseY - 34, 30, 34);
    ring(X(62), baseY - 30, 22, c); ring(X(62), baseY - 30, 21, c);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; line(X(62), baseY - 30, X(62 + Math.cos(a) * 21), baseY - 30 + Math.sin(a) * 21, c); px(X(62 + Math.cos(a) * 22), baseY - 30 + Math.sin(a) * 22, d); }
    line(X(62), baseY - 30, X(52), baseY, c, 2); line(X(62), baseY - 30, X(72), baseY, c, 2);
    b(92, 11, 62); tri(X(92), baseY - 62, X(102), baseY - 62, X(97), baseY - 78, c); rect(X(94), baseY - 56, 7, 7, win); px(X(97), baseY - 53, c);
    b(104, 44, 26); wins(104, baseY - 26, 44, 26);
    b(152, 32, 20); disc(X(168), baseY - 26, 11, c); rect(X(166), baseY - 42, 4, 8, c); disc(X(168), baseY - 44, 2, c);
    b(190, 16, 48); wins(190, baseY - 48, 16, 48);
    rect(X(214), baseY - 70, 7, 70, c); rect(X(211), baseY - 62, 13, 8, c); rect(X(213), baseY - 76, 4, 6, c);
    b(228, 30, 32); wins(228, baseY - 32, 30, 32);
    for (let j = 0; j < 50; j++) { const w = Math.round(13 * Math.sin((j / 50) * Math.PI * 0.95 + 0.1)); rect(X(270 - w / 2), baseY - j, w, 1, c); }
    b(290, 20, 40); wins(290, baseY - 40, 20, 40);
    tri(X(318), baseY, X(352), baseY, X(338), baseY - 96, c);
    line(X(338), baseY - 96, X(335), baseY - 10, d);
    b(356, 34, 28); wins(356, baseY - 28, 34, 28);
    b(396, 22, 46); wins(396, baseY - 46, 22, 46);
    b(424, 38, 22); wins(424, baseY - 22, 38, 22);
    b(466, 30, 36); wins(466, baseY - 36, 30, 36);
  }
  function stAlbans(xoff, baseY, c = C.g2, win = C.dawnL, d = C.g1) {
    const X = (x) => Math.round(x + xoff);
    // the abbey: long nave, transepts, Norman central tower
    rect(X(40), baseY - 30, 190, 30, c);
    tri(X(40), baseY - 30, X(230), baseY - 30, X(135), baseY - 44, c);
    rect(X(40), baseY - 40, 190, 10, c);
    for (let i = 46; i < 226; i += 10) { rect(X(i), baseY - 24, 3, 10, d); rect(X(i), baseY - 25, 3, 1, win); }
    rect(X(118), baseY - 78, 34, 48, c);
    for (let i = 0; i < 5; i++) rect(X(118 + i * 7), baseY - 82, 4, 4, c);
    for (let i = 0; i < 3; i++) { rect(X(124 + i * 9), baseY - 70, 4, 12, d); disc(X(126 + i * 9), baseY - 70, 2, d); }
    rect(X(34), baseY - 50, 14, 50, c); tri(X(32), baseY - 50, X(50), baseY - 50, X(41), baseY - 62, c);
    rect(X(100), baseY - 46, 10, 16, c); rect(X(160), baseY - 46, 10, 16, c);
    // clock tower
    rect(X(300), baseY - 64, 16, 64, c); rect(X(297), baseY - 70, 22, 6, c);
    for (let i = 0; i < 4; i++) rect(X(297 + i * 6), baseY - 74, 3, 4, c);
    disc(X(308), baseY - 52, 4, win); px(X(308), baseY - 54, c); px(X(309), baseY - 52, c);
    // rooftops
    for (let i = 0; i < 9; i++) { const hx = 330 + i * 17; rect(X(hx), baseY - 16, 15, 16, c); tri(X(hx - 1), baseY - 16, X(hx + 15), baseY - 16, X(hx + 7), baseY - 25, c); if (i % 2) rect(X(hx + 5), baseY - 11, 3, 4, win); rect(X(hx + 11), baseY - 28, 2, 6, c); }
    for (let i = 0; i < 2; i++) { const hx = 2 + i * 15; rect(X(hx), baseY - 14, 13, 14, c); tri(X(hx - 1), baseY - 14, X(hx + 13), baseY - 14, X(hx + 6), baseY - 22, c); }
  }
  function terraces(t, speed, baseY, seed = 3) {
    const off = t * speed, w = 46;
    for (let i = Math.floor(off / w) - 1; i < off / w + W / w + 2; i++) {
      const x = Math.round(i * w - off), r = rnd(i, seed);
      const brick = r > 0.66 ? C.b2 : r > 0.33 ? C.b1 : C.e2;
      rect(x, baseY - 70, w, 70, brick);
      for (let y = baseY - 68; y < baseY; y += 4) for (let xx = x + ((y >> 2) & 1) * 3; xx < x + w; xx += 6) px(xx, y, C.b0);
      rect(x, baseY - 74, w, 4, C.g1); rect(x + w - 8, baseY - 84, 6, 10, C.b1); rect(x + w - 9, baseY - 86, 8, 2, C.g1);
      rect(x + 5, baseY - 62, 12, 16, C.g5); rect(x + 6, baseY - 61, 10, 14, C.night); rect(x + 11, baseY - 61, 1, 14, C.g5); rect(x + 6, baseY - 54, 10, 1, C.g5);
      rect(x + 26, baseY - 62, 12, 16, C.g5); rect(x + 27, baseY - 61, 10, 14, C.night); rect(x + 32, baseY - 61, 1, 14, C.g5);
      rect(x + 4, baseY - 38, 22, 24, C.g5); rect(x + 5, baseY - 37, 20, 22, C.night); rect(x + 12, baseY - 37, 1, 22, C.g5); rect(x + 18, baseY - 37, 1, 22, C.g5);
      const door = [C.red, C.blue, C.f2, C.ink, C.gold][Math.floor(rnd(i, seed + 1) * 5)];
      rect(x + 30, baseY - 34, 10, 34, door); px(x + 38, baseY - 18, C.gold); rect(x + 30, baseY - 38, 10, 4, C.g5);
      rect(x, baseY - 14, w, 2, C.b0);
    }
  }
  function bunting(t, y, speed = 0) {
    const cols = [C.red, C.gold, C.blue, C.f3, C.pink, C.white];
    const off = (t * speed) % 16;
    for (let x = -16 - off; x < W; x += 16) {
      const sag = (i) => Math.sin(((x + i) / 96) * Math.PI) * 4;
      line(x, y + sag(0), x + 16, y + sag(16), C.g4);
      const cc = cols[mod(Math.round((x + off) / 16), cols.length)];
      tri(x + 3, y + sag(3) + 1, x + 11, y + sag(11) + 1, x + 7, y + sag(7) + 9, cc);
    }
  }
  function tyneBridge(xoff, baseY, c = C.g2) {
    const X = (x) => Math.round(x + xoff);
    rect(X(0), baseY - 30, 420, 5, c);
    for (let a = 0; a <= 1; a += 0.01) { const x = lerp(60, 360, a), y = baseY - 26 - Math.sin(a * Math.PI) * 60; rect(X(x), y, 3, 4, c); }
    for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16; const x = lerp(60, 360, a), y = baseY - 26 - Math.sin(a * Math.PI) * 60; line(X(x), y, X(x), baseY - 28, c); }
    rect(X(40), baseY - 60, 20, 60, c); rect(X(360), baseY - 60, 20, 60, c);
  }
  function castleRock(xoff, baseY, c = C.g2, d = C.g1) {
    const X = (x) => Math.round(x + xoff);
    poly([[X(0), baseY], [X(20), baseY - 40], [X(60), baseY - 52], [X(120), baseY - 58], [X(170), baseY - 48], [X(200), baseY]], d);
    rect(X(50), baseY - 84, 110, 30, c);
    for (let i = 0; i < 14; i++) rect(X(52 + i * 8), baseY - 88, 4, 4, c);
    for (let i = 0; i < 9; i++) rect(X(58 + i * 11), baseY - 78, 5, 8, d);
    rect(X(150), baseY - 100, 14, 46, c); tri(X(148), baseY - 100, X(166), baseY - 100, X(157), baseY - 110, c);
  }
  function mills(xoff, baseY) {
    for (let i = -1; i < 8; i++) {
      const x = Math.round(xoff + i * 84);
      rect(x, baseY - 46, 66, 46, C.b2);
      for (let j = baseY - 42; j < baseY - 4; j += 8) for (let k = x + 4; k < x + 62; k += 8) { rect(k, j, 4, 5, C.b0); px(k, j, C.b3); }
      rect(x, baseY - 48, 66, 3, C.b1);
      rect(x + 52, baseY - 84, 8, 36, C.b1); rect(x + 50, baseY - 88, 12, 4, C.b0);
    }
  }
  function valencia(xoff, baseY) {
    const X = (x) => Math.round(x + xoff);
    // Palau de les Arts: a white shell with a sweeping crest
    ellipse(X(90), baseY - 34, 64, 34, C.white);
    rect(X(26), baseY - 34, 128, 34, C.white);
    ellipseDither(X(110), baseY - 30, 40, 24, C.g5, 0.5);
    poly([[X(40), baseY - 58], [X(150), baseY - 80], [X(170), baseY - 74], [X(60), baseY - 50]], C.g5);
    for (let i = 0; i < 10; i++) rect(X(40 + i * 11), baseY - 20, 6, 14, C.aqua);
    // Hemisfèric: the eye
    ellipse(X(250), baseY - 18, 56, 18, C.g5); ellipse(X(250), baseY - 18, 44, 13, C.aqua); ellipse(X(250), baseY - 18, 18, 11, C.white); ellipse(X(250), baseY - 18, 9, 9, C.blue);
    for (let i = -40; i <= 40; i += 8) line(X(250 + i), baseY - 33, X(250 + i * 0.95), baseY - 4, C.white);
    // bridge pylon
    line(X(370), baseY, X(392), baseY - 96, C.white, 3);
    for (let i = 0; i < 9; i++) line(X(392 - i * 2), baseY - 96 + i * 10, X(330 + i * 6), baseY - 6, C.g4);
    rect(X(320), baseY - 8, 120, 4, C.white);
  }
  function palm(x, gy, s = 1, t = 0) {
    const sway = Math.sin(t * 1.5 + x) * 2;
    for (let i = 0; i < 30 * s; i++) { const xx = x + Math.sin(i / (30 * s) * 1.2) * 6 * s; rect(xx, gy - i, 3 * s, 1, i % 4 ? C.e2 : C.e1); }
    const tx = x + 5 * s, ty = gy - 30 * s;
    for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + (k - 3) * 0.5; for (let j = 0; j < 16 * s; j++) { const r = j; px(tx + Math.cos(a) * r + sway * (j / 16), ty + Math.sin(a) * r * 0.5 + (j * j) / (18 * s), j % 2 ? C.f2 : C.f3); px(tx + Math.cos(a) * r + sway * (j / 16), ty + Math.sin(a) * r * 0.5 + (j * j) / (18 * s) + 1, C.f1); } }
  }

  // ---------- interiors ----------
  function studentRoom(t, lampOn = true) {
    rect(0, 0, W, H, C.night);
    vgrad(0, 240, [C.ink, C.night, C.navy]);
    // window with night sky
    rect(300, 50, 110, 90, C.g1); vgrad(54, 136, [C.black, C.ink, C.night], 304, 406); stars(t, 12, 0, 3);
    for (let i = 0; i < 10; i++) px(306 + rnd(i, 9) * 96, 58 + rnd(i, 10) * 60, C.white);
    disc(380, 76, 8, C.dawnL); disc(384, 73, 7, C.ink);
    rect(355, 54, 2, 82, C.g1); rect(304, 95, 102, 2, C.g1);
    // posters
    rect(40, 60, 46, 60, C.deep); rect(44, 64, 38, 34, C.dawnO); text('GIG', 63, 104, C.white, { align: 'center' });
    rect(100, 70, 40, 30, C.plum); rect(104, 74, 32, 22, C.f2);
    // shelf + books
    rect(170, 80, 90, 3, C.e1);
    for (let i = 0; i < 12; i++) rect(172 + i * 7, 60 + (i % 3) * 2, 5, 20 - (i % 3) * 2, [C.red, C.blue, C.gold, C.f3, C.purple][i % 5]);
    // desk, laptop, lamp, pizza box
    rect(20, 176, 250, 8, C.e2); rect(20, 184, 250, 4, C.e0); rect(40, 188, 8, 50, C.e0); rect(254, 188, 8, 50, C.e0);
    rect(150, 150, 70, 26, C.g1); rect(152, 152, 66, 22, C.g2); vgrad(153, 173, [C.deep, C.blue], 153, 217);
    rect(140, 174, 90, 3, C.g3);
    if (lampOn) ellipseDither(236, 150, 60, 36, C.dawnL, 0.12);
    line(236, 176, 246, 136, C.g3, 2); tri(236, 132, 264, 132, 250, 118, C.gold);
    rect(40, 166, 60, 10, C.e3); rect(40, 166, 60, 2, C.e4); text('PIZZA', 70, 168, C.red, { align: 'center' });
    // bed under the window: frame, mattress, duvet, pillow, headboard
    rect(466, 146, 6, 92, C.e1); rect(290, 184, 180, 54, C.e1); rect(290, 180, 176, 8, C.skyL);
    rect(290, 188, 150, 30, C.deep); rect(290, 188, 150, 2, C.blue); rect(428, 172, 34, 10, C.white); rect(428, 180, 34, 2, C.g4);
  }
  function underBed(t, dust) {
    rect(0, 0, W, H, C.ink);
    vgrad(32, 160, [C.black, C.ink, C.night]);
    rect(0, 150, W, 90, C.e1); vgrad(150, 238, [C.e2, C.e1, C.e0]);
    for (let x = 0; x < W; x += 24) rect(x, 150, 1, 88, C.e0);
    rect(0, 32, W, 18, C.deep); rect(0, 50, W, 4, C.navy);
    for (let x = 20; x < W; x += 60) rect(x, 32, 8, 118, C.e0);
    void t; void dust;
  }
  function hallway(t, open) {
    rect(0, 0, W, H, C.e1);
    vgrad(32, 238, [C.e2, C.e1, C.e0]);
    rect(0, 200, W, 38, C.e0);
    const dx = 170, dw = 140;
    rect(dx - 8, 50, dw + 16, 170, C.e3);
    const o = clamp(open, 0, 1);
    if (o > 0) {
      vgrad(56, 216, [C.skyL, C.haze, C.white], dx, dx + dw);
      ellipseDither(dx + dw / 2, 140, 120, 90, C.white, 0.6 * o);
      poly([[dx, 216], [dx + dw, 216], [dx + dw + 80 * o, 238], [dx - 80 * o, 238]], C.dawnL);
    }
    const doorW = Math.round(dw * (1 - o * 0.85));
    rect(dx, 56, doorW, 160, C.red); rect(dx + 6, 64, doorW - 12, 60, C.redD); rect(dx + 6, 132, doorW - 12, 76, C.redD);
    if (doorW > 20) disc(dx + doorW - 12, 140, 3, C.gold);
    rect(20, 120, 60, 80, C.e2); for (let i = 0; i < 4; i++) disc(30 + i * 14, 128, 4, [C.strava, C.blue, C.g4, C.f3][i]);
  }
  function livingRoom(t, rain = true) {
    rect(0, 0, W, H, C.g1);
    vgrad(32, 238, [C.g2, C.g1, C.g0]);
    rect(260, 50, 170, 110, C.g0); vgrad(54, 156, [C.g3, C.g2], 264, 426);
    if (rain) for (let i = 0; i < 60; i++) { const x = 264 + mod(rnd(i, 3) * 162 + t * 20, 162), y = 54 + mod(rnd(i, 4) * 102 + t * 160, 102); line(x, y, x - 1, y + 4, C.g4); }
    rect(344, 54, 3, 102, C.g0); rect(264, 104, 162, 3, C.g0);
    for (let i = 0; i < 8; i++) { const x = 270 + rnd(i, 7) * 150, y = 60 + mod(rnd(i, 8) * 90 + t * 14 * (1 + rnd(i, 9)), 96); disc(x, y, 1.5, C.g5); }
    // sofa
    rect(30, 150, 230, 60, C.purpleD); rect(30, 140, 230, 20, C.purple); rect(20, 150, 20, 60, C.purple); rect(250, 150, 20, 60, C.purple);
    rect(30, 196, 240, 10, C.plum);
    rect(0, 210, W, 28, C.e1);
    // lamp
    line(450, 210, 450, 110, C.g3, 2); tri(430, 110, 470, 110, 450, 90, C.dawnY); ellipseDither(450, 150, 50, 70, C.dawnL, 0.08);
  }
  function gym(t) {
    rect(0, 0, W, H, C.g1);
    vgrad(32, 200, [C.g1, C.g2]);
    for (let x = 0; x < W; x += 60) rect(x, 32, 2, 168, C.g0);
    rect(0, 200, W, 38, C.g0); for (let x = 0; x < W; x += 30) rect(x, 200, 1, 38, C.g1);
    for (let i = 0; i < 5; i++) { rect(30 + i * 20, 170, 12, 30, C.g0); disc(36 + i * 20, 168, 7, C.ink); }
    rect(380, 120, 70, 80, C.g0); rect(386, 126, 58, 40, C.g3);
    void t;
  }
  function track(t, speed, y0, lit = true) {
    vgrad(0, y0 - 40, [C.black, C.ink, C.night]);
    stars(t, 30, y0 - 60, 8);
    for (const lx of [60, 420]) { rect(lx, 40, 4, y0 - 40, C.g1); rect(lx - 12, 36, 28, 10, C.g4); if (lit) { ellipseDither(lx + 2, 42, 50, 22, C.dawnL, 0.25); rect(lx - 10, 38, 24, 6, C.white); } }
    rect(0, y0 - 40, W, 26, C.g0);
    for (let x = 0; x < W; x += 7) { const col = [C.red, C.blue, C.gold, C.f3, C.pink, C.white][Math.floor(rnd(x, 3) * 6)]; rect(x, y0 - 34 + (rnd(x, 4) > 0.5 ? 1 : 0), 5, 6, col); rect(x + 1, y0 - 37, 3, 3, C.skin); }
    rect(0, y0 - 14, W, 3, C.white);
    grass(y0 - 11, y0, t, speed * 0.2, [C.f1, C.f2, C.f3]);
    rect(0, y0, W, 70, C.b2);
    for (let l = 0; l < 8; l++) rect(0, y0 + 2 + l * 9, W, 1, C.white);
    const off = (t * speed) % 80;
    for (let x = -off; x < W; x += 80) text(String(1 + Math.floor(mod(x + t * speed, 640) / 80)), x + 30, y0 + 60, C.white);
  }
  function canal(t, speed, wy, sunY = 60, season = 'summer') {
    rect(0, wy, W, 30, C.water);
    for (let i = 0; i < 50; i++) { const x = mod(rnd(i, 3) * W - t * speed * 0.9, W), y = wy + 3 + rnd(i, 4) * 24; rect(x, y, 6, 1, C.waterL); }
    ellipseDither(W - 110, wy + 10, 30, 8, C.dawnL, 0.4);
    rect(0, wy, W, 2, C.e4);
    // narrowboat
    const bx = mod(300 - t * speed * 0.6, W + 300) - 150;
    rect(bx, wy - 14, 120, 16, C.f1); rect(bx + 10, wy - 22, 90, 10, C.red); for (let i = 0; i < 6; i++) rect(bx + 16 + i * 14, wy - 20, 6, 5, C.dawnL);
    rect(bx, wy - 2, 120, 3, C.gold);
    void sunY; void season;
  }
  function crowd(t, y, x0, x1, seed = 1, k = 0.62, dense = 12, pose = 'clap') {
    for (let x = x0; x < x1; x += dense) {
      const i = Math.round(x / dense) + seed * 100;
      ART.runner(x + rnd(i, 2) * 6, y + rnd(i, 3) * 3, { who: ART.crowdLook(i), k, pose: rnd(i, 5) > 0.5 ? pose : 'cheer', phase: t * 4 + i, dir: rnd(i, 4) > 0.5 ? 1 : -1 });
    }
  }
  function barrier(y, t, speed, c1 = C.white, c2 = C.strava) {
    rect(0, y, W, 10, c1);
    const off = t * speed;
    for (let i = Math.floor(off / 30) - 1; i < off / 30 + W / 30 + 1; i++) rect(Math.round(i * 30 - off), y + 2, 15, 6, c2);
    rect(0, y + 10, W, 2, C.g2);
  }
  function finishArch(x, gy, label = 'FINISH', c = C.strava, cl = C.white) {
    x = Math.round(x);
    rect(x - 56, gy - 76, 10, 76, c); rect(x + 46, gy - 76, 10, 76, c);
    rect(x - 56, gy - 86, 112, 18, c); rect(x - 52, gy - 83, 104, 12, cl);
    text(label, x, gy - 80, C.ink, { align: 'center' });
    for (let i = 0; i < 20; i++) rect(x - 46 + i * 5, gy - 2, 5, 3, i % 2 ? C.white : C.ink);
  }
  function waterTable(x, gy, empty = true, t = 0) {
    rect(x - 40, gy - 22, 80, 4, C.white); rect(x - 36, gy - 18, 3, 18, C.g3); rect(x + 33, gy - 18, 3, 18, C.g3);
    if (!empty) for (let i = 0; i < 10; i++) rect(x - 36 + i * 7, gy - 28, 5, 6, C.aqua);
    else for (let i = 0; i < 6; i++) { const cx = x - 60 + i * 20 + Math.sin(t * 3 + i) * 6 + ((t * 20 + i * 40) % 120); ellipse(cx, gy + 2 - (i % 2), 3, 2, C.white); }
    rect(x - 20, gy - 48, 40, 16, C.white); box(x - 20, gy - 48, 40, 16, C.red); text('WATER', x, gy - 44, C.red, { align: 'center' });
    if (empty) line(x - 22, gy - 50, x + 22, gy - 30, C.red, 2);
  }
  function ambulance(x, gy, t) {
    rect(x, gy - 34, 80, 30, C.white); rect(x + 56, gy - 26, 26, 22, C.white); rect(x + 60, gy - 24, 18, 10, C.skyL);
    for (let i = 0; i < 8; i++) rect(x + i * 10, gy - 16, 5, 6, i % 2 ? C.vis : C.blue);
    rect(x + 10, gy - 38, 12, 4, Math.floor(t * 6) % 2 ? C.blue : C.skyL); rect(x + 40, gy - 38, 12, 4, Math.floor(t * 6) % 2 ? C.skyL : C.blue);
    disc(x + 16, gy - 3, 6, C.ink); disc(x + 66, gy - 3, 6, C.ink); disc(x + 16, gy - 3, 2, C.g3); disc(x + 66, gy - 3, 2, C.g3);
  }
  function van(x, gy, t, label = 'MOVING DAY') {
    const b = Math.floor(t * 8) % 2;
    rect(x - 70, gy - 52 + b, 96, 44, C.white); rect(x - 70, gy - 52 + b, 96, 3, C.g5); rect(x - 70, gy - 12 + b, 96, 4, C.g4);
    text(label, x - 22, gy - 34 + b, C.strava, { align: 'center' });
    rect(x + 26, gy - 40 + b, 34, 32, C.strava); rect(x + 36, gy - 36 + b, 20, 14, C.skyL); rect(x + 26, gy - 40 + b, 34, 3, C.orange);
    rect(x + 40, gy - 33 + b, 7, 7, C.skin); rect(x + 40, gy - 35 + b, 7, 3, C.hair); px(x + 45, gy - 31 + b, C.ink);
    for (const wx of [x - 48, x + 42]) { disc(wx, gy - 6, 9, C.ink); disc(wx, gy - 6, 4, C.g3); const a = t * 20; px(wx + Math.cos(a) * 6, gy - 6 + Math.sin(a) * 6, C.g4); }
  }

  // ---------- weather & particles ----------
  function rain(t, n = 120, c = C.g4, slant = -3) {
    for (let i = 0; i < n; i++) { const x = mod(rnd(i, 5) * W + t * 60 * -slant * 0.3, W), y = mod(rnd(i, 6) * H + t * 420, H); line(x, y, x + slant, y + 8, c); }
  }
  function leaves(t, n = 40, cols = [C.orange, C.gold, C.b3], seed = 12) {
    for (let i = 0; i < n; i++) {
      const x = mod(rnd(i, seed) * W - t * (30 + rnd(i, seed + 1) * 30) + Math.sin(t * 2 + i) * 10, W);
      const y = mod(rnd(i, seed + 2) * H + t * (18 + rnd(i, seed + 3) * 18), H);
      const c = cols[i % cols.length];
      if (Math.floor(t * 6 + i) % 2) rect(x, y, 2, 1, c); else rect(x, y, 1, 2, c);
    }
  }
  function frost(t, n = 60, seed = 13) { for (let i = 0; i < n; i++) { const x = rnd(i, seed) * W, y = 150 + rnd(i, seed + 1) * 90; if (Math.sin(t * 5 + i * 3) > 0.7) px(x, y, C.white); } }
  function dustMotes(t, x0, y0, w, h, n = 30, c = C.dawnL) { for (let i = 0; i < n; i++) px(x0 + mod(rnd(i, 21) * w + Math.sin(t * 0.7 + i) * 8, w), y0 + mod(rnd(i, 22) * h - t * 6 * (0.5 + rnd(i, 23)), h), c); }
  function confetti(t, t0, n = 120, seed = 4) {
    const cols = [C.red, C.gold, C.cyan, C.f4, C.pink, C.white, C.strava];
    const age = t - t0; if (age < 0) return;
    for (let i = 0; i < n; i++) {
      const x = mod(rnd(i, seed) * W + Math.sin(age * 3 + i) * 8, W), y = -10 + age * (40 + rnd(i, seed + 1) * 50) - rnd(i, seed + 2) * 80;
      if (y < 0 || y > H) continue;
      if ((Math.floor(age * 8) + i) % 2) rect(x, y, 3, 1, cols[i % cols.length]); else rect(x, y, 1, 3, cols[i % cols.length]);
    }
  }
  function firework(x, y, age, c = C.gold, n = 22, seed = 1) {
    if (age < 0) return;
    if (age < 0.6) { const yy = y + (1 - age / 0.6) * 110; px(x, yy, C.white); px(x, yy + 1, C.dawnL); return; }
    const a = age - 0.6; if (a > 1.5) return;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + seed, r = PX.easeOut(Math.min(1, a / 0.8)) * (26 + rnd(i, seed) * 8);
      const fx = x + Math.cos(ang) * r, fy = y + Math.sin(ang) * r + a * a * 12;
      if (a > 1.0 && (i + Math.floor(a * 20)) % 2) continue;
      rect(fx, fy, 2, 2, c); px(fx - Math.cos(ang) * 3, fy - Math.sin(ang) * 3, a < 0.5 ? C.white : c);
    }
  }
  function speedLines(t, n = 18, speed = 500, cy = 150, spread = 120, c = C.white) {
    for (let i = 0; i < n; i++) { const y = cy - spread / 2 + rnd(i, 21) * spread, len = 20 + rnd(i, 22) * 40, x = mod(W - t * speed * (0.7 + rnd(i, 23) * 0.6) + rnd(i, 24) * W, W + 80) - 40; rect(x, y, len, 1, c); }
  }
  function bokeh(t, cols, seed = 3, n = 14) {
    for (let i = 0; i < n; i++) { const x = mod(rnd(i, seed) * W + Math.sin(t * 0.3 + i) * 10, W), y = 40 + rnd(i, seed + 1) * 190, r = 6 + rnd(i, seed + 2) * 14; ellipseDither(x, y, r, r, cols[i % cols.length], 0.35); }
  }

  return {
    SKY, sky, stars, sun, cloud, clouds, hills, treeline, tree, trees, grass, path, road, fgBushes, mist, bandstand, london, stAlbans,
    terraces, bunting, tyneBridge, castleRock, mills, valencia, palm, studentRoom, underBed, hallway, livingRoom, gym, track, canal,
    crowd, barrier, finishArch, waterTable, ambulance, van, rain, leaves, frost, dustMotes, confetti, firework, speedLines, bokeh, mod,
  };
})();
if (typeof window !== 'undefined') window.WORLD = WORLD;
