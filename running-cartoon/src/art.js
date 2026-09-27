// Characters and props: the outlined runner puppet (any size, many poses), head templates with
// expressions, close-up portraits, and hand-built props for insert shots.
'use strict';
const ART = (() => {
  const { C, rect, hline, dither, px, line, disc, ellipse, ellipseDither, tri, poly, spr, text, textW, rnd, clamp, lerp, layer, target, clear, outline, blit, box, ring } = PX;

  // ---------- cast ----------
  const CAST = {
    mark: { top: C.strava, topD: C.redD, topL: C.orange, shorts: C.ink, shortsL: C.g1, shoe: C.white, sole: C.aqua, hair: 'messy', hc: [C.hairL, C.hair, C.hairD], bib: false, sleeves: false },
    mark16: { top: C.g3, topD: C.g2, topL: C.g4, shorts: C.navy, shortsL: C.deep, shoe: C.g4, sole: C.g2, hair: 'messy', hc: [C.hairL, C.hair, C.hairD], sleeves: true },
    mentor: { top: C.teal, topD: C.f0, topL: C.aqua, shorts: C.ink, shortsL: C.g1, shoe: C.red, sole: C.white, hair: 'mentor', hc: [C.greyL, C.grey, C.greyD], band: C.red, sleeves: true },
    megan: { top: C.purple, topD: C.purpleD, topL: C.pink, shorts: C.ink, shortsL: C.g1, shoe: C.pink, sole: C.white, hair: 'pony', hc: [C.blondL, C.blond, C.blondD] },
    david: { top: C.blue, topD: C.deep, topL: C.skyL, shorts: C.ink, shortsL: C.g1, shoe: C.white, sole: C.red, hair: 'short', hc: [C.hair, C.hairD, C.e0] },
    louis: { top: C.f3, topD: C.f2, topL: C.f4, shorts: C.ink, shortsL: C.g1, shoe: C.white, sole: C.gold, hair: 'curly', hc: [C.hairD, C.e0, C.black] },
    lad1: { top: C.gold, topD: C.goldD, topL: C.yellow, shorts: C.ink, shortsL: C.g1, shoe: C.white, sole: C.blue, hair: 'short', hc: [C.blondL, C.blond, C.blondD] },
    lad2: { top: C.red, topD: C.redD, topL: C.b4, shorts: C.ink, shortsL: C.g1, shoe: C.g5, sole: C.g2, hair: 'cap', hc: [C.hair, C.hairD, C.e0], cap: C.ink },
    lad3: { top: C.white, topD: C.g4, topL: C.white, shorts: C.navy, shortsL: C.deep, shoe: C.strava, sole: C.white, hair: 'bald', hc: [C.hairD, C.e0, C.black] },
    vis: { top: C.vis, topD: C.visD, topL: C.yellow, shorts: C.navy, shortsL: C.deep, shoe: C.g2, sole: C.g1, hair: 'short', hc: [C.grey, C.greyD, C.g2], sleeves: true },
    suit: { top: C.navy, topD: C.night, topL: C.deep, shorts: C.navy, shortsL: C.deep, shoe: C.black, sole: C.g1, hair: 'short', hc: [C.hairD, C.e0, C.black], sleeves: true, tie: true },
    iron: { top: C.red, topD: C.redD, topL: C.b4, shorts: C.ink, shortsL: C.g1, shoe: C.gold, sole: C.white, hair: 'short', hc: [C.hairD, C.e0, C.black] },
  };
  const CROWD = ['lad1', 'lad2', 'lad3', 'david', 'louis', 'megan', 'iron', 'vis'];
  const crowdLook = (i) => {
    const base = CAST[CROWD[i % CROWD.length]];
    const tops = [[C.blue, C.deep, C.skyL], [C.f3, C.f2, C.f4], [C.pink, C.pinkD, C.white], [C.gold, C.goldD, C.yellow], [C.purple, C.purpleD, C.pink], [C.red, C.redD, C.b4], [C.aqua, C.teal, C.cyan], [C.white, C.g4, C.white], [C.g2, C.g1, C.g3]];
    const tp = tops[Math.floor(rnd(i, 71) * tops.length)];
    const hairs = ['short', 'pony', 'curly', 'bald', 'messy', 'cap', 'long'];
    const hcs = [[C.hairL, C.hair, C.hairD], [C.blondL, C.blond, C.blondD], [C.hairD, C.e0, C.black], [C.greyL, C.grey, C.greyD], [C.b4, C.b3, C.b1]];
    return { ...base, top: tp[0], topD: tp[1], topL: tp[2], hair: hairs[Math.floor(rnd(i, 72) * hairs.length)], hc: hcs[Math.floor(rnd(i, 73) * hcs.length)], skinTone: Math.floor(rnd(i, 74) * 3), cap: tp[1], band: undefined, tie: false, sleeves: rnd(i, 75) > 0.6 };
  };
  const SKINS = [
    [C.skinL, C.skin, C.skinM, C.skinD, C.skinDD],
    [C.skin, C.skinM, C.skinD, C.skinDD, C.e1],
    [C.skinD, C.skinDD, C.e1, C.e0, C.black],
  ];

  // ---------- head templates (facing right). Letters: H/h/L hair mid/dark/light, S/s/d skin mid/shade/dark,
  // E eye, B brow, N nose, M mouth, e ear, R band, G/g beard ----------
  const HEADS = {
    messy: [
      '...L.HL.L..', '..HHLHHHHL.', '.hHHHHHHHHL', 'hhHHHHHHHHH', 'hhHHHLHHLHS', 'hhhsSSSBBSS',
      'hhdeSSSSESS', '.hdeSSSSSSN', '.hdSSSSSSSS', '..dsSSSSMSS', '...dsSSSSS.', '....ddds...'],
    short: [
      '...........', '...HHHHHH..', '..hHHHHHHH.', '.hHHHHHHHHH', '.hHHHHHHHHS', '.hhsSSSBBSS',
      '.hdeSSSSESS', '.hdeSSSSSSN', '..dSSSSSSSS', '..dsSSSSMSS', '...dsSSSSS.', '....ddds...'],
    curly: [
      '..L.L.L.L..', '.LHLHLHLHL.', 'hHHHHHHHHHL', 'hHHLHHLHHHH', 'hhHHHHHHHHS', 'hhhsSSSBBSS',
      'hhdeSSSSESS', '.hdeSSSSSSN', '.hdSSSSSSSS', '..dsSSSSMSS', '...dsSSSSS.', '....ddds...'],
    bald: [
      '...........', '...sSSSSs..', '..sSSSSSSS.', '.sSSSSSSSSS', '.dSSSSSSSSS', '.ddsSSSBBSS',
      '.ddeSSSSESS', '.ddeSSSSSSN', '..dSSSSSSSS', '..dsSSSSMSS', '...dsSSSSS.', '....ddds...'],
    pony: [
      '...LLHHL...', '..HHHHHHHL.', '.hHHHHHHHHL', 'hhHHHHHHHHH', 'hhHHHHHHHSS', 'hhhsSSSBBSS',
      'hhdeSSSSESS', '.hdeSSSSSSN', '.hdSSSSSSSS', '..dsSSSSMSS', '...dsSSSSS.', '....ddds...'],
    long: [
      '...LLHHL...', '..HHHHHHHL.', '.hHHHHHHHHL', 'hhHHHHHHHHH', 'hhHHHHHHHHS', 'hhhHSSSBBSS',
      'hhhHSSSSESS', 'hhhdSSSSSSN', 'hhhdSSSSSSS', 'hhhsSSSSMSS', '.hh.sSSSSS.', '....ddds...'],
    mentor: [
      '...gGGGGg..', '..gGGGGGGG.', '.gGGGGGGGGG', 'gGRRRRRRRRR', 'gGsSSSSSSSS', 'ggsSSSSbbSS',
      'gdeSSSSSESS', '.deSSSSSSSN', '.dGGSSSGGGG', '..dGGGGGMGG', '...GGGGGGG.', '....GGGG...'],
    cap: [
      '...........', '..CCCCCC...', '.CCCCCCCCC.', '.CCCCCCCCCCC', '.hHHCCCCCCCCC', '.hhsSSSBBSS',
      '.hdeSSSSESS', '.hdeSSSSSSN', '..dSSSSSSSS', '..dsSSSSMSS', '...dsSSSSS.', '....ddds...'],
  };
  function headMap(p, skin) {
    return {
      H: p.hc[1], h: p.hc[2], L: p.hc[0], S: skin[1], s: skin[2], d: skin[3], E: C.ink, B: p.hc[2], b: C.greyD, N: skin[1], M: skin[4], e: skin[3],
      R: p.band || C.red, G: C.grey, g: C.greyD, C: p.cap || C.navy,
    };
  }
  function drawHead(hx, hy, k, dir, p, skin, o) {
    const rows = HEADS[p.hair] || HEADS.short;
    const map = headMap(p, skin);
    const cell = Math.max(1, Math.ceil(k - 0.01));
    const put = (i, j, c) => { const ii = dir > 0 ? i : 10 - i; rect(hx + Math.floor(ii * k), hy + Math.floor(j * k), cell, cell, c); };
    // ponytail swings behind the head
    if (p.hair === 'pony') {
      const sw = Math.sin(o.phase || 0) * 1.6;
      for (let s2 = 0; s2 < 6; s2++) put(-1 - s2 * 0.7, 3 + s2 * 0.9 + sw * (s2 / 5), s2 < 2 ? p.hc[1] : p.hc[s2 % 2 ? 2 : 1]);
      put(-1, 2.5, p.band || C.pink);
    }
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.') continue; const c = map[ch]; if (c !== undefined) put(i, j, c); } });
    const ex = 8, ey = 6;
    const expr = o.expr || 'neutral';
    if (expr === 'gasp' || expr === 'shout') { put(ex, 9, skin[4]); put(ex - 1, 9, skin[4]); put(ex, 10, C.b0); put(ex - 1, 10, C.b0); }
    else if (expr === 'smile' || expr === 'laugh') { put(ex, 9, skin[4]); put(ex - 1, 9, skin[4]); put(ex + 1, 8, skin[4]); if (expr === 'laugh') put(ex - 1, 10, C.b0); }
    if (expr === 'squint' || expr === 'pain' || expr === 'laugh' || (o.blink)) { put(ex, ey, map.B); put(ex, ey - 1, skin[1]); }
    if (expr === 'pain') { put(ex - 1, ey - 1, map.B); }
    if (o.flush) { put(ex - 1, 8, C.pinkD); }
    if (o.sweat) { put(10.6, 3 + ((o.phase || 0) * 0.6) % 5, C.cyan); }
    // hats
    const hat = o.hat;
    if (hat === 'santa') { for (let i = -1; i < 11; i++) put(i, 2, C.white); for (let i = 0; i < 10; i++) { put(i, 1, C.red); put(i, 0, C.red); } for (let i = 1; i < 7; i++) put(i - 3, -1 - i * 0.3, C.red); put(-3.2, -3, C.white); }
    else if (hat === 'robin') { for (let i = -1; i < 11; i++) put(i, 2, C.f2); for (let i = 1; i < 9; i++) put(i, 1, C.f2); for (let i = 3; i < 7; i++) put(i, 0, C.f3); put(1, -1, C.red); put(0, -2, C.red); put(-1, -3, C.red); }
    else if (hat === 'headband') { for (let i = 0; i < 11; i++) put(i, 4, o.band || C.white); }
  }

  // ---------- the runner ----------
  // (x, y) = ground point between the feet. o: {who|pal, k (size, 1 ≈ 47 px tall), pose, phase, dir, expr, hat, bib, medal, sweat, flush, knee}
  const scratch = layer(140, 140);
  const OX = 70, OY = 128;
  function runLeg(ph, amp) { const th = amp * Math.sin(ph); return [th, th - (0.2 + 1.3 * amp * Math.max(0, Math.cos(ph)))]; }
  function body(x, y, o) {
    const k = o.k || 1, dir = o.dir === -1 ? -1 : 1, q = o.phase || 0, pose = o.pose || 'run';
    const p = typeof o.who === 'string' ? CAST[o.who] : o.who || CAST.mark;
    const skin = SKINS[p.skinTone || 0];
    const K = (v) => v * k;
    let hipX = x, hipY = y - K(21.5), lean = 0, bob = 0, headTilt = 0;
    let L = [[-0.12, -0.08], [0.12, 0.08]], A = [[-0.15, 0.1], [0.15, 0.25]];
    const legs = (amp, ph) => { L = [runLeg(ph + Math.PI, amp), runLeg(ph, amp)]; };
    switch (pose) {
      case 'run': case 'jog': case 'sprint': case 'glide': {
        const amp = pose === 'jog' ? 0.55 : pose === 'sprint' ? 1.05 : pose === 'glide' ? 0.7 : 0.85;
        legs(amp, q);
        const as = Math.sin(q) * 0.8 * amp;
        A = [[as, as + 1.5], [-as, -as + 1.5]];
        bob = Math.abs(Math.sin(q)) > 0.7 ? -K(1) : 0;
        lean = pose === 'sprint' ? K(3) : K(1.5);
        break;
      }
      case 'walk': case 'tired': case 'hobble': {
        const amp = pose === 'tired' ? 0.32 : pose === 'hobble' ? 0.25 : 0.4;
        L = [[amp * Math.sin(q + Math.PI), amp * Math.sin(q + Math.PI) - 0.1], [amp * Math.sin(q), amp * Math.sin(q) - 0.15]];
        A = [[0.35 * Math.sin(q), 0.35 * Math.sin(q) + 0.3], [-0.35 * Math.sin(q), -0.35 * Math.sin(q) + 0.3]];
        if (pose === 'tired') { lean = K(3); A = [[0.25, 0.15], [0.15, 0.05]]; headTilt = 1; }
        if (pose === 'hobble') { L[1] = [0.15 * Math.sin(q), 0.15 * Math.sin(q)]; bob = Math.sin(q) > 0 ? K(1) : 0; A = [[0.4, 1.3], [0.9, 2.2]]; lean = K(1); }
        break;
      }
      case 'limp': {
        const s = Math.sin(q);
        L = [[0.35 * s, 0.35 * s], [-0.2 * s, -0.2 * s - 0.5 * Math.max(0, s)]];
        A = [[0.5, 1.4], [0.9, 2.3]];
        bob = s > 0 ? K(1) : 0; lean = K(1);
        break;
      }
      case 'cheer': {
        bob = -Math.round(Math.abs(Math.sin(q)) * K(5));
        L = [[-0.25, 0.1], [0.3, -0.2]];
        A = [[Math.PI - 0.5, Math.PI - 0.35], [Math.PI + 0.45, Math.PI + 0.3]];
        break;
      }
      case 'clap': {
        const c2 = Math.sin(q * 2) > 0 ? 0.2 : 0;
        A = [[0.9, 2.1 + c2], [1.0, 2.2 - c2]];
        break;
      }
      case 'wave':
        A = [[-0.1, 0.1], [Math.PI - 0.6 + 0.35 * Math.sin(q * 2), Math.PI - 0.2 + 0.35 * Math.sin(q * 2)]];
        break;
      case 'drink':
        A = [[0.2, 0.3], [1.2, 2.9]];
        break;
      case 'megaphone':
        A = [[0.2, 0.2], [1.4, 1.6]];
        break;
      case 'crutch': {
        const s = Math.sin(q);
        L = [[0.1, 0.1], [0.45 + 0.3 * s, 0.9 + 0.3 * s]];
        A = [[0.35 + 0.25 * s, 0.3 + 0.25 * s], [0.45 + 0.25 * s, 0.4 + 0.25 * s]];
        lean = K(1.5); bob = s > 0 ? -K(1) : 0;
        break;
      }
      case 'lift': {
        const up = (Math.sin(q) + 1) / 2;
        L = [[-0.3, 0], [0.3, 0]];
        A = [[Math.PI - 0.6 * (1 - up) - 0.2, Math.PI - 0.2 * up], [Math.PI + 0.6 * (1 - up) + 0.2, Math.PI + 0.2 * up]];
        break;
      }
      case 'crouch':
        L = [[1.3, -0.9], [1.1, -1.0]];
        hipY = y - K(11); lean = K(5);
        A = [[1.2, 1.4], [1.3, 1.5]];
        break;
      case 'sit':
        L = [[1.57, 0], [1.57, 0.1]];
        hipY = y - K(10);
        A = [[0.4, 1.2], [0.5, 1.3]];
        break;
      default: break;
    }
    if (pose === 'lie') return lying(x, y, k, dir, p, skin, o);
    hipY += bob;
    const shX = hipX + lean * dir, shY = hipY - K(13.5);
    const th = { thigh: Math.max(2, Math.round(K(4))), shin: Math.max(2, Math.round(K(3.2))), arm: Math.max(1, Math.round(K(2.8))) };
    const limb = (x0, y0, a1, l1, a2, l2, c1, c2, t1, t2, cTop) => {
      const kx = x0 + Math.sin(a1) * l1 * dir, ky = y0 + Math.cos(a1) * l1;
      const fx = kx + Math.sin(a2) * l2 * dir, fy = ky + Math.cos(a2) * l2;
      if (cTop !== undefined) { const mx = lerp(x0, kx, 0.5), my = lerp(y0, ky, 0.5); line(x0, y0, mx, my, cTop, t1 + 1); line(mx, my, kx, ky, c1, t1); }
      else line(x0, y0, kx, ky, c1, t1);
      line(kx, ky, fx, fy, c2, t2);
      return { kx, ky, fx, fy };
    };
    const shoe = (fx, fy, c, sole) => { const w = Math.max(3, Math.round(K(7))), h = Math.max(2, Math.round(K(3))); const sx = dir > 0 ? fx - K(2) : fx - w + K(2); rect(sx, fy - h + K(1), w, h, c); rect(sx, fy + K(1) - 1, w, Math.max(1, Math.round(K(1))), sole); };
    // back leg + back arm (shaded)
    const b0 = limb(hipX, hipY, L[0][0], K(10.5), L[0][1], K(10.5), skin[2], skin[2], th.thigh, th.shin, p.shorts);
    shoe(b0.fx, b0.fy, p.shoe === C.white ? C.g4 : p.shoe, p.sole);
    const ba = limb(shX, shY + K(1.5), A[0][0], K(8), A[0][1], K(7.5), p.sleeves ? p.topD : skin[2], skin[2], th.arm, th.arm, p.sleeves ? p.topD : undefined);
    disc(ba.fx, ba.fy, Math.max(0.5, K(1.4)), skin[2]);
    // torso
    const rows = Math.max(4, Math.round(K(14)));
    for (let r = 0; r <= rows; r++) {
      const f = r / rows, cxr = lerp(hipX, shX, f), yy = Math.round(lerp(hipY + K(1), shY, f));
      const w = Math.round(lerp(K(8), K(9.5), f));
      const x0 = Math.round(cxr - w / 2);
      const isShorts = f < 0.22;
      rect(x0, yy, w, 1, isShorts ? p.shorts : p.top);
      const backX = dir > 0 ? x0 : x0 + w - Math.max(1, Math.round(K(2)));
      rect(backX, yy, Math.max(1, Math.round(K(2))), 1, isShorts ? p.shorts : p.topD);
      const frontX = dir > 0 ? x0 + w - 1 : x0;
      if (!isShorts && f > 0.3) px(frontX, yy, p.topL);
      if (isShorts && r === 0) rect(x0, yy + 1, w, Math.max(1, Math.round(K(2))), p.shorts);
    }
    if (p.tie) { const tx = Math.round(lerp(hipX, shX, 0.7)) + dir; line(tx, shY + K(1), tx, shY + K(8), C.red, Math.max(1, Math.round(K(1.5)))); rect(tx - K(1.5), shY, K(3), K(1.5), C.white); }
    if (o.bib) { const bx = Math.round(lerp(hipX, shX, 0.5)) - K(2) + dir * K(1); rect(bx, hipY - K(9), K(5), K(4), C.white); rect(bx + K(1), hipY - K(8), K(3), Math.max(1, K(1)), C.ink); }
    if (o.medal) { const mx = Math.round(lerp(hipX, shX, 0.75)) + dir * K(1); line(shX - K(2), shY + K(1), mx, shY + K(6), C.red); line(shX + K(2), shY + K(1), mx, shY + K(6), C.blue); disc(mx, shY + K(7.5), Math.max(1, K(2)), C.gold); }
    // head
    const hx = Math.round(shX - K(5) + (dir > 0 ? K(1) : -K(1))), hy = Math.round(shY - K(12.5) + headTilt * K(1));
    rect(Math.round(shX - K(1.5)), shY - K(2), Math.max(1, Math.round(K(3))), Math.max(1, Math.round(K(3))), skin[2]);
    drawHead(hx, hy, k, dir, p, skin, o);
    // front leg + front arm
    const f0 = limb(hipX, hipY, L[1][0], K(10.5), L[1][1], K(10.5), skin[1], skin[1], th.thigh, th.shin, p.shortsL);
    shoe(f0.fx, f0.fy, p.shoe, p.sole);
    if (o.knee) disc(f0.kx, f0.ky, Math.max(1, K(2)), C.red);
    const fa = limb(shX, shY + K(1.5), A[1][0], K(8), A[1][1], K(7.5), p.sleeves ? p.top : skin[1], skin[1], th.arm, th.arm, p.sleeves ? p.top : undefined);
    disc(fa.fx, fa.fy, Math.max(0.5, K(1.4)), skin[1]);
    if (pose === 'crutch') for (const s2 of [-1, 1]) { const top = [shX + dir * K(1 + s2), shY + K(3)]; const foot = [x + dir * K(8 + s2 * 1.5) + Math.sin(q) * K(3) * dir, y]; line(top[0], top[1], foot[0], foot[1], C.g4, Math.max(1, Math.round(K(1.2)))); rect(top[0] - K(1.5), top[1] - K(0.5), K(3), K(1.5), C.g2); }
    if (pose === 'lift') { const up = (Math.sin(q) + 1) / 2, by = Math.round(shY - K(5) - up * K(6)); rect(x - K(13), by, K(27), Math.max(1, K(1.5)), C.g4); rect(x - K(16), by - K(3), K(3), K(7), C.g1); rect(x + K(13), by - K(3), K(3), K(7), C.g1); }
    if (pose === 'drink') { rect(fa.fx - K(2), fa.fy - K(6), K(4), K(6), C.gold); rect(fa.fx - K(2), fa.fy - K(7), K(4), K(1.5), C.white); }
    if (pose === 'megaphone') { tri(fa.fx, fa.fy - K(2), fa.fx + dir * K(8), fa.fy - K(5), fa.fx + dir * K(8), fa.fy + K(2), C.white); }
    if (o.balloon) { const bxx = fa.fx + dir * K(1), top = fa.fy - K(26); line(fa.fx, fa.fy, bxx, top + K(6), C.g2); ellipse(bxx, top, K(5), K(6), o.balloonC || C.red); px(bxx - K(2), top - K(3), C.white); if (o.balloon !== true) text(o.balloon, bxx, top - K(2), C.white, { align: 'center' }); }
    if (o.stopwatch) { disc(fa.fx + dir * K(1), fa.fy - K(1), K(2.5), C.g4); px(fa.fx + dir * K(1), fa.fy - K(2), C.ink); }
    return { head: [hx + K(5), hy], hand: [fa.fx, fa.fy], hip: [hipX, hipY] };
  }
  function lying(x, y, k, dir, p, skin, o) {
    const K = (v) => v * k;
    const gy = y - K(2);
    line(x - K(20), gy - K(1), x - K(2), gy - K(1), skin[1], Math.round(K(3)));   // legs
    line(x - K(20), gy + K(1), x - K(2), gy + K(1), skin[2], Math.round(K(3)));
    rect(x - K(24), gy - K(3), K(4), K(6), p.shoe);
    rect(x - K(4), gy - K(4), K(6), K(8), p.shorts);
    rect(x + K(2), gy - K(4), K(14), K(8), p.top); rect(x + K(2), gy - K(4), K(14), K(2), p.topL);
    line(x + K(8), gy - K(4), x + K(16), gy - K(12), skin[1], Math.round(K(3)));
    const hx = x + K(17), hy = gy - K(6);
    rect(hx, hy, K(10), K(10), skin[1]); rect(hx + K(6), hy, K(4), K(10), p.hc[1]); px(hx + K(3), hy + K(2), C.ink); px(hx + K(3), hy + K(6), C.ink);
    if (o.medal) disc(x + K(9), gy - K(5), K(2.2), C.gold);
    return {};
  }
  function runner(x, y, o = {}) {
    const prev = target(scratch);
    clear();
    const r = body(OX, OY, o);
    outline(scratch, o.outline === undefined ? C.ink : o.outline);
    target(prev);
    blit(scratch, Math.round(x) - OX, Math.round(y) - OY, o.map ? { map: o.map } : {});
    return r;
  }
  const phase = (t, rate = 1.5) => t * rate * Math.PI * 2;

  // ---------- close-up portraits ----------
  // A head-and-shoulders drawn at close-up scale. who: 'mark' | 'mentor' | 'megan' | 'david'.
  const FACE = {
    mark: { skin: SKINS[0], hc: [C.hairL, C.hair, C.hairD], hair: 'messy', eye: C.e2, top: C.strava, topD: C.redD, topL: C.orange },
    mark16: { skin: SKINS[0], hc: [C.hairL, C.hair, C.hairD], hair: 'messy', eye: C.e2, top: C.g3, topD: C.g2, topL: C.g4 },
    mentor: { skin: SKINS[0], hc: [C.greyL, C.grey, C.greyD], hair: 'mentor', eye: C.blue, top: C.teal, topD: C.f0, topL: C.aqua, beard: true, band: C.red, age: true },
    megan: { skin: SKINS[0], hc: [C.blondL, C.blond, C.blondD], hair: 'pony', eye: C.f2, top: C.purple, topD: C.purpleD, topL: C.pink },
  };
  function portrait(cx, top, whoKey, o = {}) {
    const f = FACE[whoKey], S = f.skin, dir = o.dir === -1 ? -1 : 1, t = o.t || 0;
    const s = o.s || 1.45, Q = (v) => Math.round(v * s);
    const expr = o.expr || 'neutral';
    const bottom = o.bottom || 238;
    const fx = cx + dir * Q(3);
    // shoulders
    const sy = top + Q(62);
    poly([[cx - Q(13), sy], [cx + Q(13), sy], [cx + Q(38), sy + Q(12)], [cx + Q(44), bottom], [cx - Q(44), bottom], [cx - Q(38), sy + Q(12)]], f.top);
    const farX = dir > 0 ? cx - Q(44) : cx + Q(18);
    dither(farX, sy + Q(4), Q(26), bottom - sy, f.topD, 0.5);
    line(cx - dir * Q(12), sy + Q(1), cx - dir * Q(36), sy + Q(12), f.topD, 2);
    line(cx + dir * Q(12), sy, cx + dir * Q(36), sy + Q(11), f.topL, 1);
    if (o.medal) { line(cx - Q(9), sy, cx, sy + Q(28), C.red, 3); line(cx + Q(9), sy, cx, sy + Q(28), C.blue, 3); disc(cx, sy + Q(34), Q(7), C.goldD); disc(cx, sy + Q(33), Q(6), C.gold); disc(cx - Q(2), sy + Q(31), Q(2), C.yellow); }
    // neck
    rect(cx - Q(9), top + Q(44), Q(18), Q(20), S[2]);
    rect(cx - Q(9), top + Q(44), Q(18), Q(5), S[3]);
    poly([[cx - Q(8), sy], [cx + Q(8), sy], [cx, sy + Q(8)]], S[2]);
    // ponytail behind
    if (f.hair === 'pony') {
      const sw = Math.sin(t * 5) * 3;
      ellipse(cx - dir * Q(21), top + Q(22), Q(7), Q(11), f.hc[2]);
      ellipse(cx - dir * Q(26) - sw, top + Q(36), Q(6), Q(12), f.hc[1]);
      ellipse(cx - dir * Q(28) - sw * 1.2, top + Q(48), Q(4), Q(8), f.hc[2]);
    }
    // ears
    ellipse(cx - dir * Q(19), top + Q(30), Q(4), Q(6), S[2]); ellipse(cx - dir * Q(19), top + Q(30), Q(2), Q(3), S[3]);
    // face
    ellipse(cx, top + Q(26), Q(19), Q(24), S[1]);
    ellipse(cx + dir * Q(2), top + Q(40), Q(14), Q(10), S[1]);
    ellipseDither(cx - dir * Q(13), top + Q(30), Q(8), Q(20), S[2], 0.3);
    ellipse(cx - dir * Q(15), top + Q(31), Q(4), Q(16), S[2]);
    ellipseDither(cx + dir * Q(1), top + Q(48), Q(12), Q(3), S[2], 0.5);
    ellipseDither(fx + dir * Q(9), top + Q(33), Q(4), Q(3), S[0], 0.45);
    // exertion: three short blush strokes on the near cheek, two on the far one
    if (o.flush) for (const [bx, n] of [[fx + dir * Q(8), 3], [fx - dir * Q(10), 2]]) for (let k = 0; k < n; k++) line(bx + k * Q(2.2), top + Q(35), bx + k * Q(2.2) - Q(1.2), top + Q(37.5), C.pinkD);
    if (f.beard) {
      ellipse(cx + dir, top + Q(42), Q(17), Q(11), f.hc[1]);
      rect(cx - Q(19), top + Q(30), Q(5), Q(12), f.hc[1]); rect(cx + Q(14), top + Q(30), Q(5), Q(12), f.hc[1]);
      ellipseDither(cx + dir, top + Q(44), Q(16), Q(10), f.hc[2], 0.35);
      ellipseDither(cx + dir * Q(5), top + Q(39), Q(8), Q(4), f.hc[0], 0.5);
    }
    // eyes
    const blink = o.blink !== undefined ? o.blink : (t % 3.7) < 0.12;
    const eyeY = top + Q(27);
    for (const side of [-1, 1]) {
      const ex = fx + side * Q(8), near = side === dir;
      const ew = near ? Q(4) : Q(3.4);
      if (blink || expr === 'laugh' || expr === 'squint') { line(ex - ew, eyeY, ex + ew - 1, eyeY + (expr === 'laugh' ? -1 : 0), f.hc[2], 2); continue; }
      const eh = expr === 'gasp' ? Q(2.6) : expr === 'tired' || expr === 'sleepy' ? Q(1) : Q(1.8);
      ellipse(ex, eyeY, ew, eh, C.white);
      const lookX = Math.round((o.look || 0) * 2 + dir);
      disc(ex + lookX, eyeY, Math.min(Q(1.8), eh), f.eye);
      disc(ex + lookX, eyeY, 1, C.ink); px(ex + lookX + 1, eyeY - 1, C.white);
      line(ex - ew, eyeY - eh - 1, ex + ew - 1, eyeY - eh - 1, C.ink, 2);
      if (expr === 'tired' || expr === 'sleepy') rect(ex - ew, eyeY - Q(3), ew * 2, Q(3), S[2]);
      if (f.age) { px(ex + side * (ew + 2), eyeY - 1, S[3]); px(ex + side * (ew + 3), eyeY + 1, S[3]); px(ex + side * (ew + 2), eyeY + 3, S[3]); }
    }
    // brows
    const browLift = expr === 'gasp' ? -Q(3) : expr === 'pain' || expr === 'determined' ? Q(1) : expr === 'smile' || expr === 'laugh' ? -Q(1) : 0;
    for (const side of [-1, 1]) {
      const bx = fx + side * Q(8), by = eyeY - Q(6) + browLift;
      const inner = expr === 'pain' || expr === 'determined' ? Q(2) : expr === 'gasp' ? -Q(1) : 0;
      line(bx - Q(5), by + (side < 0 ? 0 : inner), bx + Q(4), by + (side < 0 ? inner : 0), f.hc[2], Q(2));
    }
    if (f.age) { line(fx - Q(9), top + Q(12), fx + Q(7), top + Q(12), S[2]); line(fx - Q(7), top + Q(15), fx + Q(5), top + Q(15), S[2]); }
    // nose
    line(fx + dir * Q(3), top + Q(31), fx + dir * Q(4), top + Q(35), S[2], 2);
    rect(fx + dir * Q(1) - Q(2), top + Q(36), Q(6), Q(2), S[3]);
    px(fx + dir * Q(3), top + Q(29), S[0]);
    // mouth
    const my = top + Q(43);
    const talk = expr === 'talk' ? Math.floor(t * 8) % 3 !== 0 : false;
    if (expr === 'gasp' || expr === 'shout') { ellipse(fx, my + 1, Q(4), Q(4) + Math.round(Math.sin(t * 6)), C.b0); rect(fx - Q(3), my + Q(3), Q(6), Q(2), C.redD); }
    else if (expr === 'laugh') { ellipse(fx, my + 1, Q(7), Q(4), C.b0); rect(fx - Q(6), my - Q(2), Q(12), Q(2), C.white); rect(fx - Q(4), my + Q(3), Q(8), 2, C.redD); }
    else if (expr === 'smile') { line(fx - Q(7), my, fx + Q(7), my, S[4], 2); px(fx - Q(8), my - 2, S[4]); px(fx + Q(8), my - 2, S[4]); rect(fx - Q(5), my + 2, Q(10), 2, C.white); rect(fx - Q(5), my + 4, Q(10), 2, S[3]); }
    else if (talk) { ellipse(fx, my + 1, Q(4), Q(2), C.b0); rect(fx - Q(3), my - 1, Q(6), 2, C.white); }
    else if (expr === 'tired' || expr === 'pain') { line(fx - Q(5), my + 1, fx + Q(5), my + 1, S[4], 2); px(fx - Q(6), my + 3, S[4]); px(fx + Q(6), my + 3, S[4]); }
    else { line(fx - Q(5), my, fx + Q(5), my, S[4], 2); rect(fx - Q(4), my + 3, Q(8), 2, S[3]); }
    if (f.beard) { line(fx - Q(8), my - Q(3), fx + Q(8), my - Q(3), f.hc[1], Q(2)); }
    // hair on top
    if (f.hair === 'messy') {
      ellipse(cx - dir * Q(1), top + Q(5), Q(22), Q(13), f.hc[1]);
      ellipse(cx - dir * Q(14), top + Q(14), Q(8), Q(10), f.hc[1]);
      for (let i = -20; i <= 18; i += 2.5) {
        const xx = cx + dir * Q(i);
        const len = Q(9 + rnd(Math.round(i * 4) + 40, 3) * 6 - (i > 8 ? 4 : 0));
        line(xx, top + Q(6), xx + dir * Q(2), top + Q(6) + len, f.hc[rnd(Math.round(i * 4) + 40, 4) > 0.75 ? 2 : 1], Q(2.2));
      }
      for (let i = -16; i <= 16; i += 5) { const hh = Q(3 + rnd(i + 60, 5) * 4); line(cx + Q(i), top - Q(4), cx + Q(i) + dir * Q(3), top - Q(4) - hh, f.hc[1], Q(2.5)); }
      for (let i = -12; i <= 12; i += 6) line(cx + Q(i), top - Q(3), cx + Q(i) + dir * Q(5), top + Q(6), f.hc[0], 1);
    } else if (f.hair === 'pony') {
      ellipse(cx, top + Q(5), Q(21), Q(11), f.hc[1]);
      poly([[cx - Q(21), top + Q(5)], [cx + Q(21), top + Q(5)], [cx + dir * Q(18), top + Q(18)], [cx + dir * Q(4), top + Q(10)], [cx - dir * Q(19), top + Q(20)]], f.hc[1]);
      for (let i = -16; i <= 16; i += 4) line(cx + Q(i), top - Q(4), cx + Q(i) + dir * Q(6), top + Q(10), f.hc[0], 1);
      rect(cx - dir * Q(20) - 2, top + Q(14), Q(5), Q(5), C.pink);
    } else if (f.hair === 'mentor') {
      ellipse(cx - dir * Q(4), top + Q(6), Q(20), Q(9), f.hc[0]);
      ellipseDither(cx - dir * Q(4), top + Q(6), Q(20), Q(9), f.hc[1], 0.45);
      rect(cx - Q(21), top + Q(8), Q(6), Q(20), f.hc[1]); rect(cx + Q(15), top + Q(8), Q(6), Q(20), f.hc[1]);
      rect(cx - Q(21), top + Q(12), Q(42), Q(6), f.band); rect(cx - Q(21), top + Q(12), Q(42), 1, C.b4); rect(cx - dir * Q(22), top + Q(14), Q(4), Q(10), f.band);
    }
    if (o.hat === 'santa') { poly([[cx - Q(22), top + Q(6)], [cx + Q(22), top + Q(6)], [cx + dir * Q(26), top - Q(26)]], C.red); rect(cx - Q(24), top + Q(2), Q(48), Q(7), C.white); disc(cx + dir * Q(27), top - Q(26), Q(5), C.white); }
    if (o.sweat) for (let i = 0; i < 3; i++) { const a = ((t * 0.7 + i / 3) % 1); const sx2 = cx + dir * Q(8 - i * 9), sy2 = top + Q(16) + a * Q(22); disc(sx2, sy2, 2, C.cyan); px(sx2, sy2 - 1, C.white); }
  }

  // ---------- props ----------
  function alarmClock(cx, cy, t, ringing) {
    const sh = ringing ? Math.round(Math.sin(t * 60) * 2) : 0;
    cx += sh;
    for (const s of [-1, 1]) { disc(cx + s * 22, cy - 34, 11, C.g4); disc(cx + s * 22, cy - 35, 9, C.g5); }
    rect(cx - 2, cy - 44, 4, 8, C.g3);
    disc(cx, cy, 38, C.red); disc(cx, cy, 34, C.redD); disc(cx, cy, 31, C.white);
    ellipseDither(cx + 10, cy - 12, 14, 10, C.g5, 0.5);
    for (let h = 0; h < 12; h++) { const a = (h / 12) * Math.PI * 2; rect(cx + Math.sin(a) * 26 - 1, cy - Math.cos(a) * 26 - 1, h % 3 ? 2 : 3, h % 3 ? 2 : 3, C.ink); }
    line(cx, cy, cx + Math.sin(7.75 / 12 * Math.PI * 2) * 15, cy - Math.cos(7.75 / 12 * Math.PI * 2) * 15, C.ink, 3);
    line(cx, cy, cx + Math.sin(0.75 * Math.PI * 2) * 23, cy - Math.cos(0.75 * Math.PI * 2) * 23, C.ink, 2);
    disc(cx, cy, 3, C.gold);
    rect(cx - 30, cy + 34, 10, 10, C.g2); rect(cx + 20, cy + 34, 10, 10, C.g2);
    if (ringing) for (const s of [-1, 1]) for (let k2 = 0; k2 < 3; k2++) { const r = 44 + k2 * 8 + (t * 40) % 8; line(cx + s * r * 0.7, cy - r * 0.7, cx + s * (r + 5) * 0.7, cy - (r + 5) * 0.7, C.white, 2); }
  }
  function phone(x, y, w, h, msgs, t, t0) {
    rect(x - 4, y - 4, w + 8, h + 8, C.ink); rect(x - 3, y - 3, w + 6, h + 6, C.g1);
    PX.vgrad(y, y + h, [C.g5, C.white], x, x + w);
    rect(x, y, w, 12, C.g4); text('9:41 PM', x + 4, y + 3, C.ink);
    let yy = y + 18;
    msgs.forEach(([from, str, at], i) => {
      if (t - t0 < at) return;
      const lines = PX.wrap(str, w - 30);
      const bw = Math.max(...lines.map((l) => textW(l))) + 10, bh = lines.length * 9 + 6;
      const mine = from === 'me';
      const bx = mine ? x + w - bw - 4 : x + 4;
      rect(bx, yy, bw, bh, mine ? C.sky : C.g4);
      lines.forEach((l, j) => text(l, bx + 5, yy + 4 + j * 9, mine ? C.white : C.ink));
      yy += bh + 5;
      void i;
    });
  }
  function trainers(cx, gy, dust = 0, t = 0) {
    for (const [ox, c1, c2] of [[-26, C.g4, C.g3], [18, C.g5, C.g4]]) {
      const x = cx + ox;
      poly([[x - 22, gy], [x + 26, gy], [x + 26, gy - 8], [x + 12, gy - 14], [x - 4, gy - 22], [x - 20, gy - 20]], c1);
      rect(x - 22, gy - 4, 48, 4, C.white); rect(x - 22, gy - 1, 48, 2, C.g2);
      poly([[x - 4, gy - 22], [x + 12, gy - 14], [x + 4, gy - 12], [x - 8, gy - 19]], c2);
      for (let i = 0; i < 4; i++) line(x - 2 + i * 4, gy - 19 + i * 2, x + 3 + i * 4, gy - 18 + i * 2, C.white);
      rect(x - 20, gy - 18, 6, 8, c2);
    }
    if (dust > 0) {
      dither(cx - 52, gy - 26, 104, 26, C.g3, dust * 0.5);
      for (let i = 0; i < 30 * dust; i++) px(cx - 50 + rnd(i, 3) * 100, gy - 30 + rnd(i, 4) * 30 + Math.sin(t + i) * 2, C.g5);
    }
  }
  function watch(cx, cy, lines2, t) {
    rect(cx - 70, cy - 14, 140, 28, C.g1); rect(cx - 70, cy - 12, 140, 24, C.g2);
    for (let x = cx - 66; x < cx + 66; x += 6) rect(x, cy - 12, 1, 24, C.g1);
    disc(cx, cy, 34, C.g0); disc(cx, cy, 31, C.black); ring(cx, cy, 32, C.g3);
    lines2.forEach(([s, c, sc], i) => text(s, cx, cy - 16 + i * 12, c || C.white, { align: 'center', scale: sc || 1 }));
    rect(cx + 33, cy - 6, 4, 4, C.g3);
    void t;
  }
  function calendarPage(cx, cy, top, big, sub, torn = 0) {
    const w = 110, h = 120, x = cx - w / 2, y = cy - h / 2 + torn * 40;
    rect(x + 4, y + 4, w, h, C.g1);
    rect(x, y, w, h, C.white); rect(x, y, w, 26, C.red);
    for (let i = 0; i < 6; i++) disc(x + 12 + i * 17, y + 2, 3, C.g3);
    text(top, cx, y + 9, C.white, { align: 'center' });
    text(big, cx, y + 40, C.ink, { align: 'center', scale: 5 });
    if (sub) text(sub, cx, y + 90, C.g2, { align: 'center' });
  }
  function balloon(x, y, label, c = C.red) {
    line(x, y, x, y + 26, C.g3);
    ellipse(x, y - 8, 9, 11, c); ellipse(x - 3, y - 12, 3, 4, c === C.red ? C.b4 : C.white);
    tri(x - 2, y + 2, x + 2, y + 2, x, y - 1, c);
    text(label, x, y - 11, C.white, { align: 'center' });
  }
  function puppy(x, y, t, k = 1, sleeping = false) {
    const K = (v) => v * k;
    const legs = sleeping ? 0 : Math.sin(t * 16) * K(2);
    ellipse(x, y - K(8), K(10), K(6), C.e4);
    ellipseDither(x, y - K(5), K(9), K(3), C.e3, 0.6);
    if (!sleeping) for (const [lx, s] of [[-7, 1], [-3, -1], [4, 1], [8, -1]]) rect(x + K(lx) + s * legs, y - K(4), K(2), K(4), C.e3);
    const hx = x + K(10), hy = y - K(14) + (sleeping ? K(6) : 0);
    ellipse(hx, hy, K(6), K(5), C.e4);
    ellipse(hx + K(5), hy + K(2), K(3), K(2), C.e5);
    px(hx + K(7), hy + K(1), C.ink);
    ellipse(hx - K(3), hy + K(1), K(3), K(5), C.e2);
    if (!sleeping) { px(hx + K(2), hy - K(1), C.ink); } else line(hx, hy - K(1), hx + K(3), hy - K(1), C.ink);
    const tw = sleeping ? 0 : Math.sin(t * 20) * K(3);
    line(x - K(10), y - K(10), x - K(15), y - K(15) + tw, C.e4, Math.max(1, Math.round(K(2))));
  }
  function wall(x, gy, hgt, t, face = true) {
    const w = 60;
    rect(x, gy - hgt, w, hgt, C.b2);
    for (let y = gy - hgt; y < gy; y += 7) for (let xx = x + (((y - gy) / 7) & 1 ? 0 : 7); xx < x + w; xx += 14) { rect(xx, y, 13, 1, C.b0); rect(xx, y, 1, 7, C.b0); }
    rect(x, gy - hgt, w, 3, C.b3);
    if (face && hgt > 40) {
      const fy = gy - hgt + 16;
      rect(x + 12, fy, 12, 6, C.white); rect(x + 36, fy, 12, 6, C.white);
      rect(x + 18 + Math.round(Math.sin(t) * 2), fy + 2, 3, 3, C.ink); rect(x + 40 + Math.round(Math.sin(t) * 2), fy + 2, 3, 3, C.ink);
      line(x + 10, fy - 5, x + 25, fy - 1, C.ink, 2); line(x + 50, fy - 5, x + 35, fy - 1, C.ink, 2);
      rect(x + 18, fy + 18, 24, 4, C.ink); rect(x + 20, fy + 18, 4, 2, C.white); rect(x + 36, fy + 18, 4, 2, C.white);
    }
  }
  function paella(cx, cy, t) {
    ellipse(cx, cy + 4, 62, 20, C.g1);
    ellipse(cx, cy, 60, 18, C.g0); ellipse(cx, cy - 1, 55, 15, C.paella);
    ellipseDither(cx, cy - 1, 55, 15, C.paellaD, 0.35);
    rect(cx - 66, cy - 3, 8, 5, C.g0); rect(cx + 58, cy - 3, 8, 5, C.g0);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const px2 = cx + Math.cos(a) * 34, py = cy - 1 + Math.sin(a) * 9; ellipse(px2, py, 5, 3, C.orange); px(px2 - 3, py, C.red); }
    for (let i = 0; i < 14; i++) { const a = rnd(i, 9) * Math.PI * 2, r = rnd(i, 10); px(cx + Math.cos(a) * r * 45, cy + Math.sin(a) * r * 12, C.f3); }
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; ellipse(cx + Math.cos(a) * 18, cy + Math.sin(a) * 5, 5, 3, C.yellow); }
    for (let i = 0; i < 3; i++) { const a = ((t * 0.6 + i / 3) % 1); line(cx - 20 + i * 20, cy - 16 - a * 20, cx - 18 + i * 20 + Math.sin(t * 3 + i) * 3, cy - 24 - a * 20, C.white); }
  }
  function beer(x, y) { rect(x, y - 24, 14, 24, C.gold); rect(x, y - 28, 14, 5, C.white); rect(x + 2, y - 20, 2, 16, C.yellow); rect(x + 14, y - 18, 4, 2, C.g4); rect(x + 17, y - 18, 2, 10, C.g4); rect(x + 14, y - 10, 4, 2, C.g4); }

  return { CAST, crowdLook, SKINS, runner, phase, portrait, alarmClock, phone, trainers, watch, calendarPage, balloon, puppy, wall, paella, beer };
})();
if (typeof window !== 'undefined') window.ART = ART;
