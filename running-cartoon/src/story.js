// The film. A hero's journey the viewer never sees labelled, told in shots. Dates, times and quotes
// come from Mark's Strava log and parkrun results; the marathon pacing follows his watch data.
'use strict';
const STORY = (() => {
  const { W, H, C, rect, dither, px, line, disc, ellipse, ellipseDither, tri, poly, text, textW, rnd, clamp, lerp, inv, easeOut, easeIn, easeInOut, smooth, box, ring } = PX;
  const Wd = WORLD, A = ART, F = FILM, D = window.CAREER, R = window.RACES;
  const ph = A.phase;
  const TOP = F.TOP, BOT = F.BOT, GY = 216;
  const INK = () => C.ink;
  const MOTIF = 'IF YOU CAN’T TALK, YOU’RE GOING TOO FAST.';

  // ---------- shared set-ups ----------
  function park(lt, o = {}) {
    const sp = o.speed || 0, season = o.season || 'summer';
    Wd.sky(o.sky || 'morning', TOP, 196);
    if (o.sun) Wd.sun(o.sun[0], o.sun[1], o.sun[2] || 10, o.sunCore, o.sunGlow);
    if (o.stars) Wd.stars(lt, 40, 120, 3);
    Wd.clouds(lt, sp * 0.03 + 4, 52, o.seed || 3, o.clouds === undefined ? 4 : o.clouds, o.cloudTones);
    if (o.city === 'london') Wd.london(10 - lt * sp * 0.02, 180, o.cityC || C.g4, C.dawnL, !!o.lights, o.cityD || C.g3);
    if (o.city === 'stalbans') Wd.stAlbans(80 - lt * sp * 0.02, 182, o.cityC || C.g3, C.dawnL, o.cityD || C.g2);
    if (o.bandstand !== undefined) Wd.bandstand(o.bandstand - lt * sp * 0.4, 200);
    Wd.hills(lt, sp * 0.06, 186, 5, o.hillC || C.f3, o.seed || 1, 70, 196);
    Wd.treeline(lt, sp * 0.14, 190, 12, o.lineC || C.f2, (o.seed || 1) + 4);
    Wd.grass(196, BOT, lt, sp, o.grass || (season === 'winter' ? [C.g3, C.g4, C.g5] : season === 'autumn' ? [C.f1, C.f2, C.e3] : [C.f2, C.f3, C.f4]));
    if (o.lake) { rect(0, 196, W, 8, C.water); for (let i = 0; i < 30; i++) rect(Wd.mod(rnd(i, 4) * W - lt * sp * 0.3, W), 198 + (i % 3) * 2, 5, 1, C.waterL); }
    if (o.trees !== false) Wd.trees(lt, sp * 0.4, 202, o.treeGap || 84, o.seed || 2, 1, season);
    Wd.path(206, 18, lt, sp, o.pathPal);
    if (o.fg) Wd.fgBushes(lt, sp * 1.7, BOT + 8, o.fgC || C.f0);
  }
  function street(lt, o = {}) {
    const sp = o.speed || 0;
    Wd.sky(o.sky || 'blue', TOP, 150);
    Wd.clouds(lt, 5, 50, o.seed || 5, 3);
    Wd.terraces(lt, sp * 0.5, 178, o.seed || 3);
    if (o.bunting !== false) Wd.bunting(lt, 108, sp * 0.5);
    rect(0, 178, W, 16, C.g3); rect(0, 178, W, 2, C.g4);
    if (o.crowd !== false) Wd.crowd(lt, 196, -10, W + 10, o.seed || 1, 0.62, 13);
    if (o.barrier !== false) Wd.barrier(190, lt, sp);
    Wd.road(202, BOT - 202, lt, sp);
  }
  function river(lt, o = {}) {
    const sp = o.speed || 0;
    Wd.sky(o.sky || 'hot', TOP, 190);
    if (o.sun !== false) Wd.sun(o.sunX || 380, o.sunY || 70, 16, C.white, [C.dawnL, C.yellow]);
    Wd.hills(lt, sp * 0.05, 176, 5, C.f4, 4, 80, 186);
    Wd.treeline(lt, sp * 0.1, 180, 12, o.lineC || C.f3, 8);
    rect(0, 180, W, 14, C.water); for (let i = 0; i < 40; i++) rect(Wd.mod(rnd(i, 3) * W - lt * sp * 0.2, W), 183 + (i % 4) * 3, 6, 1, C.waterL);
    Wd.grass(194, BOT, lt, sp, [C.f3, C.f4, C.f5]);
    Wd.trees(lt, sp * 0.45, 202, 96, 6, 1, 'summer');
    Wd.path(206, 18, lt, sp, [C.e3, C.e5, C.e2]);
  }
  function bokehBG(cols, lt, base) { PX.vgrad(TOP, BOT, base); Wd.bokeh(lt, cols, 5, 16); }
  function runners(lt, list) {
    // list: [x, y, who, k, pose, rate, dir]
    list.slice().sort((a, b) => a[1] - b[1]).forEach(([x, y, who, k, pose, rate, dir, extra], i) => A.runner(x, y, { who, k, pose: pose || 'run', phase: ph(lt, rate || 1.5) + i * 1.3, dir: dir || 1, ...(extra || {}) }));
  }
  function pack(lt, n, seed, o = {}) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const base = (rnd(i, seed) * (W + 120)) - 60;
      const drift = (o.drift || 0) * (0.5 + rnd(i, seed + 1));
      const x = Wd.mod(base + lt * drift, W + 120) - 60;
      const depth = rnd(i, seed + 2);
      out.push([x, (o.y0 || 206) + depth * (o.dy || 14), A.crowdLook(i + seed * 50), (o.k0 || 0.7) + depth * (o.kd || 0.3), o.pose || 'run', o.rate || 1.5]);
    }
    return out;
  }
  function watchFace(cx, cy, rows) {
    rect(cx - 90, cy - 18, 180, 36, C.g1); for (let x = cx - 86; x < cx + 86; x += 6) rect(x, cy - 18, 1, 36, C.g0);
    disc(cx, cy, 52, C.g0); disc(cx, cy, 48, C.black); ring(cx, cy, 50, C.g3); ring(cx, cy, 49, C.g2);
    rect(cx + 50, cy - 10, 5, 7, C.g3); rect(cx + 50, cy + 6, 5, 7, C.g3);
    rows.forEach(([s, c, sc, dy]) => text(s, cx, cy + dy, c, { align: 'center', scale: sc || 1 }));
  }
  function clockBoard(x, y, str, c = C.gold) {
    rect(x - 52, y, 104, 30, C.black); box(x - 52, y, 104, 30, C.g2);
    text(str, x, y + 8, c, { align: 'center', scale: 2 });
    rect(x - 2, y + 30, 4, 60, C.g2);
  }
  function hand(x, y, len, ang, c = C.skin) { line(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len, c, 14); disc(x + Math.cos(ang) * len, y + Math.sin(ang) * len, 9, c); }
  const secs = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const hms = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // Pace (s/km) at a given km from the watch streams.
  function paceAt(race, km) {
    const d = race.distance, t = race.time;
    let i = 1; while (i < d.length - 1 && d[i] < km * 1000) i++;
    const v = (d[i] - d[i - 1]) / Math.max(1, t[i] - t[i - 1]);
    return 1000 / v;
  }
  function hrAt(race, km) { const d = race.distance; let i = 0; while (i < d.length - 1 && d[i] < km * 1000) i++; return race.heart_rate[i]; }
  function paceBadge(race, km, x = W - 110, y = TOP + 10, showHr) {
    const hr = showHr ? hrAt(race, km) : 0;
    F.plate(x - 4, y - 4, 100, hr ? 36 : 26);
    text(`KM ${km.toFixed(1)}`, x + 4, y + 2, C.g4);
    text(`${secs(paceAt(race, km))} /KM`, x + 4, y + 12, C.white, { scale: 1 });
    if (hr) text(`HR ${hr}`, x + 4, y + 22, C.red);
  }

  // ---------- the shots ----------
  const S = [];
  const shot = (o) => S.push(o);

  // ===== COLD OPEN =====
  function ridge(lt, list, o = {}) {
    Wd.sky('dawn', TOP, 206);
    Wd.stars(lt, 30, 90, 2);
    Wd.sun(330, 190 - lt * (o.sunRise || 1.4), 15, C.yellow, [C.dawnL, C.dawnY]);
    Wd.clouds(lt, 2, 72, 7, 3, [C.dawnL, C.dawnO, C.dawnR]);
    Wd.hills(lt, 1.5, 184, 10, C.dawnP, 3, 90, BOT);
    Wd.mist(176, 196, C.dawnR, 0.2);
    const top = (x) => Math.round(200 - 5 * Math.sin(x / 90) - 3 * Math.sin(x / 37));
    for (let x = 0; x < W; x++) rect(x, top(x), 1, BOT - top(x), C.ink);
    for (let x = 30; x < W; x += 42) { rect(x, top(x) - 10, 2, 10, C.ink); line(x, top(x) - 8, x + 42, top(x + 42) - 8, C.ink); }
    Wd.tree(410, top(410) + 2, 1.2, 'night', 3);
    for (let i = 0; i < 4; i++) { const bx = Wd.mod(120 + i * 40 + lt * 12, W), by = 90 + i * 7 + Math.sin(lt * 3 + i) * 2; line(bx - 3, by - 2, bx, by, C.ink); line(bx, by, bx + 3, by - 2, C.ink); }
    for (const [x, who, k, dx] of list) A.runner(x, top(x) + 1, { who, k, pose: who === 'dog' ? 'run' : 'run', phase: ph(lt, 1.3) + dx, map: INK, outline: C.ink });
    return top;
  }
  shot({
    ch: 'Dawn', d: 9.5, fx: { in: 2.2, out: 1.0 }, cue: ['dawn'], amb: ['wind'],
    draw(lt) { ridge(lt, [[lerp(-30, 250, lt / 9.5), 'mark', 0.75, 0]]); },
    sub: [[3.6, 8.2, 'IF YOU CAN’T TALK…', 'whisper']],
  });
  shot({
    d: 4.5, fx: { in: 1.2, out: 1.0 }, bars: 1, cue: ['title'], amb: ['none'],
    draw(lt) {
      rect(0, 0, W, H, C.black);
      F.bigNumber('THE LONG RUN', W / 2, 118, lt, 0.4, 4, C.gold, { spacing: 2, dim: C.goldD, shadow: C.b0 });
      if (lt > 1.6) text('2016 – 2026', W / 2, 160, lt > 1.9 ? C.g4 : C.g2, { align: 'center', spacing: 2 });
    },
  });

  // ===== I. ORDINARY WORLD, THE CALL, THE MENTOR =====
  shot({
    ch: 'Norwich, 2016', d: 3.6, fx: { in: 0.6 }, cue: ['student'], amb: ['none'], chy: [[0.4, 3.4, 'NORWICH', 'MAY 2016']], sfx: [[1.2, 'buzz'], [2.6, 'buzz']],
    draw(lt) {
      Wd.studentRoom(lt, false);
      // in bed, phone held over his face
      A.runner(404, 182, { who: 'mark16', k: 1.3, pose: 'lie' });
      const buzz = (lt > 1.2 && lt < 1.8) || (lt > 2.6 && lt < 3.2), bx = 420 + (buzz ? Math.round(Math.sin(lt * 80)) : 0);
      ellipseDither(bx + 4, 164, 30, 18, C.skyL, buzz ? 0.3 : 0.16);
      rect(bx, 146, 10, 16, C.ink); rect(bx + 1, 147, 8, 13, buzz ? C.white : C.skyL);
    },
  });
  shot({
    d: 5.4, sfx: [[0.3, 'tick'], [1.6, 'tick'], [2.9, 'tick'], [4.4, 'tick']],
    draw(lt) {
      bokehBG([C.navy, C.deep, C.dawnP, C.blue], lt, [C.ink, C.night, C.navy]);
      hand(420, 260, 160, -2.6, C.skinM);
      A.phone(160, 44, 160, 186, [['them', 'PARKRUN TOMORROW? 9AM', 0.3], ['me', 'WHAT’S PARKRUN', 1.6], ['them', '5K. FREE. EVERY SATURDAY. COME ON', 2.9], ['me', '…FINE.', 4.4]], lt, 0);
      hand(470, 250, 120, -2.9, C.skin);
    },
  });
  shot({
    d: 2.6, sfx: [[0.05, 'alarm'], [1.7, 'thud']],
    draw(lt) {
      PX.vgrad(TOP, BOT, [C.ink, C.night, C.navy]);
      rect(0, 196, W, 42, C.e1);
      A.alarmClock(240, 142, lt, lt < 1.7);
      if (lt > 1.45) { const k = clamp((lt - 1.45) / 0.25, 0, 1); hand(240, lerp(-40, 70, k), 60, 1.57, C.skin); }
      if (lt > 1.7) text('7:45', 330, 70, C.red, { scale: 2 });
    },
  });
  shot({
    d: 2.3, fx: { grade: { r: 0.8, g: 0.85, b: 1.05 } }, sub: [[0.6, 2.2, 'UGH.', 'dialog']],
    draw(lt) { bokehBG([C.navy, C.deep, C.skyL], lt, [C.night, C.navy, C.deep]); A.portrait(240, 60, 'mark16', { expr: 'sleepy', t: lt, blink: lt > 1.6 && lt < 1.8 }); },
  });
  shot({
    d: 4.2, cue: ['none'], amb: ['birds'], chy: [[0.3, 3.9, 'EATON PARK, NORWICH', 'SATURDAY, 9:00 AM']], sfx: [[1.9, 'beep'], [2.7, 'beep'], [3.5, 'beep']],
    sub: [[1.8, 2.5, '3…', 'dialog'], [2.6, 3.3, '2…', 'dialog'], [3.4, 4.2, '1…', 'dialog']],
    draw(lt) {
      park(lt, { sky: 'morning', bandstand: 340, seed: 4, sun: [430, 62, 10] });
      const list = [];
      for (let i = 0; i < 18; i++) list.push([30 + i * 16 + rnd(i, 3) * 8, 212 + rnd(i, 4) * 10, A.crowdLook(i + 5), 0.78 + rnd(i, 4) * 0.2, 'idle', 0.8]);
      list.push([150, 216, 'mark16', 1, 'idle', 0.8]);
      runners(lt, list);
      rect(404, 204, 22, 12, C.e2);
      A.runner(415, 204, { who: 'vis', pose: 'megaphone', dir: -1, phase: 0 });
    },
  });
  shot({
    d: 2.8, cue: ['parkrun'], sfx: [[0, 'go'], [0.2, 'whoosh']], sub: [[0, 0.8, 'GO!', 'dialog']],
    draw(lt) {
      park(lt, { sky: 'morning', speed: 160, seed: 4, bandstand: 520 });
      runners(lt, pack(lt, 14, 7, { drift: -40, rate: 1.4 }));
      const mx = lerp(120, 300, easeOut(clamp(lt / 2.8, 0, 1)));
      A.runner(mx, 218, { who: 'mark16', pose: 'sprint', phase: ph(lt, 2.8), expr: 'determined' });
      Wd.speedLines(lt, 10, 600, 190, 40);
    },
  });
  shot({
    d: 4.8, sub: [[1.5, 2.7, 'FIRST TIME?', 'dialog'], [2.9, 4.7, '*GASP* …YEAH.', 'dialog']],
    draw(lt) {
      park(lt, { sky: 'morning', speed: 55, seed: 9 });
      const list = [];
      for (let i = 0; i < 5; i++) { const x = -60 + Wd.mod(lt * 70 + i * 110, 600); list.push([x, 208 + (i % 2) * 6, A.crowdLook(i + 20), 0.8, 'run', 1.6]); }
      runners(lt, list);
      // medium shot: the stranger draws level
      const mentX = lerp(-60, 200, easeOut(clamp((lt - 0.4) / 1.3, 0, 1)));
      A.runner(mentX, 232, { who: 'mentor', k: 1.5, pose: 'jog', phase: ph(lt, 1.35) });
      A.runner(272, 237, { who: 'mark16', k: 1.55, pose: 'tired', phase: ph(lt, 1.1), expr: 'gasp', sweat: true, flush: true });
    },
  });
  shot({
    d: 5.6, cue: ['motif'], amb: ['birds', 0.4], sub: [[0.5, 5.5, MOTIF, 'motif']],
    draw(lt) { bokehBG([C.f3, C.f4, C.dawnL, C.f5], lt, [C.f4, C.f3, C.f2]); A.portrait(300, 60, 'mentor', { dir: -1, expr: lt > 0.5 && lt < 4.2 ? 'talk' : 'smile', t: lt }); },
  });
  shot({
    d: 2.6,
    draw(lt) { bokehBG([C.f3, C.f4, C.dawnL, C.f5], lt, [C.f4, C.f3, C.f2]); const calm = lt > 1.0; A.portrait(180, 62 + (calm ? Math.round(Math.sin(lt * 4) * 1) : 0), 'mark16', { expr: calm ? 'smile' : 'gasp', t: lt, sweat: true, flush: !calm }); },
  });
  shot({
    d: 4.2, cue: ['parkrun', 0, { vol: 0.8 }], chy: [[1.6, 4.0, '26:21 · 308TH', 'FIRST EVER PARKRUN']],
    draw(lt) {
      park(lt, { sky: 'morning', seed: 4, bandstand: 120, speed: 10 });
      for (let i = 0; i < 6; i++) { rect(220 + i * 26, 190, 2, 30, C.g4); rect(220 + i * 26, 188, 10, 5, i % 2 ? C.strava : C.white); }
      clockBoard(250, 110, '26:21');
      A.runner(lerp(170, 330, clamp(lt / 3.2, 0, 1)), 218, { who: 'mark16', pose: lt < 3.2 ? 'jog' : 'idle', phase: ph(lt, 1.3), expr: 'smile' });
      A.runner(lerp(410, 520, clamp((lt - 2.2) / 2.4, 0, 1)), 210, { who: 'mentor', k: 0.95, pose: lt < 2.2 ? 'wave' : 'walk', dir: lt < 2.2 ? -1 : 1, phase: ph(lt, 1) });
    },
  });

  // ===== REFUSAL: THE FALSE START =====
  shot({
    ch: 'The lost years', d: 2.8, cue: ['dust'], amb: ['clock'], sfx: [[0.7, 'tear'], [1.7, 'tear']],
    draw(lt) {
      PX.vgrad(TOP, BOT, [C.e1, C.e0]);
      const yrs = ['2016', '2017', '2018'];
      const k = lt < 0.7 ? 0 : lt < 1.7 ? 1 : 2;
      A.calendarPage(240, 136, 'MAY', yrs[Math.min(2, k + 1)], k === 2 ? 'NO PARKRUNS' : '');
      const torn = lt < 0.7 ? 0 : lt < 1.7 ? (lt - 0.7) : (lt - 1.7);
      if (torn < 0.5 && lt > 0.7) A.calendarPage(240 + torn * 60, 136 + torn * 80, 'MAY', yrs[k - 1 >= 0 ? k - 1 : 0], '');
      if (lt < 0.7) A.calendarPage(240, 136, 'MAY', '2016', '');
    },
  });
  shot({
    d: 2.2,
    draw(lt) {
      Wd.underBed(lt);
      A.trainers(240, 214, clamp(0.3 + lt / 2.2, 0, 1), lt);
      for (let i = 0; i < 6; i++) line(170, 150, 170 + i * 12, 150 + (6 - i) * 8, C.g4);
      for (let r = 10; r < 60; r += 12) ring(170, 150, r, C.g3);
    },
  });
  shot({
    d: 4.6, cue: ['dust', 0, { vol: 0.8 }], chy: [[0.3, 4.3, 'ST ALBANS', 'SEPTEMBER 2019']], sfx: [[1.0, 'coin'], [1.6, 'coin'], [2.2, 'coin'], [2.8, 'coin'], [3.4, 'coin']],
    draw(lt) {
      Wd.sky('dusk', TOP, 196);
      Wd.sun(360, 176, 12, C.dawnL, [C.dawnO, C.dawnY]);
      Wd.stAlbans(40, 186, C.plum, C.dawnY, C.ink);
      Wd.grass(186, BOT, lt, 40, [C.f1, C.f2, C.dawnP]);
      Wd.path(204, 18, lt, 50, [C.e1, C.e2, C.e0]);
      A.runner(220, 216, { who: 'mark16', pose: 'jog', phase: ph(lt, 1.3), map: (c) => PX.half(c) === c ? c : c });
      const n = clamp(Math.floor((lt - 1.0) / 0.6) + 1, 0, 5); // five St Albans parkruns, Sep–Nov 2019
      F.plate(W - 130, TOP + 12, 116, 40);
      text('PARKRUNS', W - 120, TOP + 18, C.g4); text(String(n), W - 24, TOP + 16, C.white, { align: 'right', scale: 2 });
      if (n >= 2) text('NEW PB 24:56', W - 120, TOP + 36, C.gold);
    },
  });
  shot({
    d: 2.0, sfx: [[1.5, 'thud']],
    draw(lt) {
      PX.vgrad(TOP, BOT, [C.e1, C.e0, C.black]);
      rect(120, 60, 240, 160, C.e0); rect(130, 150, 220, 4, C.e2);
      A.trainers(240, 150, 0.2, lt);
      const door = clamp((lt - 0.5) / 1.0, 0, 1);
      rect(Math.round(lerp(360, 120, easeIn(door))), 50, Math.round(lerp(0, 240, easeIn(door))) + 4, 180, C.e2);
      if (door >= 1) { rect(120, 50, 244, 180, C.e2); disc(340, 140, 4, C.gold); }
    },
  });
  shot({
    d: 4.0, cue: ['none'], amb: ['wind'], chy: [[0.4, 3.7, 'LONDON', 'MARCH 2020']], fx: { out: 0.8 },
    draw(lt) {
      Wd.sky('dusk', TOP, 150);
      Wd.terraces(0, 0, 184, 9);
      rect(0, 184, W, 12, C.g3); Wd.road(196, BOT - 196, 0, 0);
      PX.grade({ r: 0.62, g: 0.62, b: 0.8 }, TOP, BOT);
      // street lamp and its pool of light
      rect(120, 92, 3, 104, C.g1); rect(113, 88, 17, 5, C.g2); rect(116, 93, 11, 2, C.dawnL);
      dither(98, 194, 50, 3, C.dawnL, 0.35);
      // the notice on the park railings
      for (let x = 210; x < 400; x += 8) rect(x, 158, 2, 38, C.ink); rect(206, 160, 198, 2, C.ink);
      rect(238, 118, 126, 54, C.white); box(238, 118, 126, 54, C.g2);
      text('PARKRUN', 301, 124, C.purple, { align: 'center' }); text('ALL EVENTS', 301, 136, C.ink, { align: 'center' });
      text('CANCELLED', 301, 151, C.red, { align: 'center', scale: 2 });
      const lx = lerp(-40, 520, lt / 4.0);
      for (let i = 0; i < 3; i++) { const x = Wd.mod(lx * 0.3 + i * 170, W), y = 220 + Math.sin(lt * 3 + i) * 2; rect(x, y, 5, 3, C.white); }
    },
  });

  // ===== CROSSING THE THRESHOLD =====
  shot({
    ch: 'Lockdown', d: 3.0, fx: { in: 0.6 }, cue: ['lonely'], amb: ['none'], chy: [[0.3, 2.8, 'LONDON', '14 MAY 2020']], sfx: [[1.6, 'whoosh']],
    draw(lt) {
      Wd.underBed(lt);
      const pull = easeInOut(clamp((lt - 1.0) / 1.4, 0, 1));
      A.trainers(240 + pull * 150, 214, 1 - pull, lt);
      hand(W + 40, 190, 120 + (1 - pull) * 90, Math.PI, C.skin);
      if (lt > 1.4) for (let i = 0; i < 40; i++) { const a = rnd(i, 3) * Math.PI * 2, r = (lt - 1.4) * (20 + rnd(i, 4) * 40); px(260 + pull * 150 + Math.cos(a) * r, 196 + Math.sin(a) * r * 0.5 - (lt - 1.4) * 10, C.g4); }
    },
  });
  shot({
    d: 3.2, sfx: [[0.3, 'door']],
    draw(lt) {
      Wd.hallway(lt, smooth(clamp((lt - 0.3) / 1.4, 0, 1)));
      if (lt > 1.5) A.runner(lerp(80, 250, (lt - 1.5) / 1.7), 222, { who: 'mark', k: 1.3, pose: 'walk', phase: ph(lt, 0.9), map: INK });
    },
  });
  shot({
    d: 3.4, amb: ['birds', 0.3],
    draw(lt) { park(lt, { sky: 'morning', speed: 35, city: 'london', seed: 12, sun: [420, 64, 10] }); A.runner(210, 222, { who: 'mark', pose: 'jog', phase: ph(lt, 1.05), expr: 'gasp', flush: true }); },
  });
  shot({
    d: 2.4,
    draw(lt) { bokehBG([C.f3, C.f4, C.skyL], lt, [C.f4, C.f3, C.f2]); hand(W + 20, 150, 200, Math.PI, C.skin); watchFace(240, 135, [['DISTANCE', C.g3, 1, -34], ['5.07 KM', C.white, 2, -24], ['PACE', C.g3, 1, 0], ['7:29 /KM', C.gold, 2, 10]]); },
  });
  shot({
    d: 2.8, log: [[0.3, 2.7, '19 JUN 2020', 'OUCH MY SHINS']],
    draw(lt) { park(lt, { sky: 'blue', speed: 18, city: 'london', seed: 14 }); A.runner(260, 226, { who: 'mark', k: 1.2, pose: 'limp', phase: ph(lt, 0.9), expr: 'pain' }); },
  });
  shot({
    d: 4.6, log: [[0.3, 4.5, '13 JUL 2020', 'NOT-ON-THE-PACE RUN. ABOUT 5 MINUTES IN STARTED TALKING TO SOMEONE IN THE PARK AND FORGOT TO PAUSE']],
    draw(lt) {
      park(lt, { sky: 'blue', city: 'london', seed: 15, sun: [300, 60, 9] });
      A.runner(318, 224, { who: 'mark', k: 1.15, pose: 'idle', phase: ph(lt, 0.5), expr: Math.floor(lt * 3) % 3 ? 'smile' : 'laugh' });
      A.runner(362, 224, { who: A.crowdLook(33), k: 1.15, pose: 'wave', dir: -1, phase: ph(lt, 0.4) });
      A.puppy(402, 224, lt, 1.1);
      F.plate(W - 96, TOP + 10, 84, 24); text('MOVING TIME', W - 90, TOP + 13, C.g4); text(secs(300 + lt * 60), W - 90, TOP + 23, C.red);
    },
  });
  shot({
    d: 1.8, fx: { sepia: 1, in: 0.25, white: true, out: 0.25, whiteOut: true }, cue: ['motif', 0, { partial: 4, vol: 0.6 }],
    draw(lt) { bokehBG([C.f3, C.f4, C.dawnL], lt, [C.f4, C.f3, C.f2]); A.portrait(300, 60, 'mentor', { dir: -1, expr: 'smile', t: lt }); },
  });
  shot({
    d: 4.2, cue: ['lonely', 0, { lift: true }],
    draw(lt) {
      const i = Math.min(3, Math.floor(lt / 1.05));
      const skies = ['morning', 'blue', 'blue', 'golden'];
      park(lt, { sky: skies[i], speed: 60 + i * 20, city: 'london', seed: 16 + i });
      A.runner(220, 218, { who: 'mark', pose: 'run', phase: ph(lt, 1.4 + i * 0.1), expr: i < 2 ? 'gasp' : 'smile' });
      const p = [['MAY', '7:29'], ['JUN', '6:24'], ['JUL', '5:28'], ['AUG', '5:17']][i];
      F.plate(W - 120, TOP + 12, 106, 40);
      text(`${p[0]} 2020`, W - 112, TOP + 17, C.g4); text(`${p[1]} /KM`, W - 112, TOP + 29, C.white, { scale: 2 });
    },
  });

  // ===== TESTS, ALLIES, ENEMIES =====
  shot({
    ch: 'Finsbury Park', d: 4.0, cue: ['rise'], amb: ['crowd', 0.5], chy: [[0.3, 3.8, 'FINSBURY PARK, LONDON', 'AUGUST 2021 · PARKRUN IS BACK']],
    draw(lt) {
      park(lt, { sky: 'blue', city: 'london', seed: 20, sun: [430, 58, 10] });
      const list = [];
      for (let i = 0; i < 22; i++) list.push([20 + i * 20 + rnd(i, 5) * 10, 210 + rnd(i, 6) * 12, A.crowdLook(i + 40), 0.72 + rnd(i, 6) * 0.25, rnd(i, 7) > 0.7 ? 'wave' : 'idle', 1]);
      list.push([230, 218, 'mark', 1, 'wave', 1.2]);
      runners(lt, list);
      A.runner(380, 206, { who: 'vis', pose: 'clap', phase: ph(lt, 1), dir: -1, k: 0.9 }); A.runner(100, 204, { who: 'vis', pose: 'wave', phase: ph(lt, 1), k: 0.85 });
      A.puppy(300, 222, lt, 0.8);
    },
  });
  shot({
    d: 2.4, log: [[0.3, 2.3, '18 SEP 2021', 'ED MILIBAND @ PARKRUN']],
    draw(lt) { park(lt, { sky: 'blue', city: 'london', speed: 70, seed: 21 }); A.runner(lerp(-30, 460, lt / 2.4), 212, { who: 'suit', pose: 'run', phase: ph(lt, 1.6) }); A.runner(300, 222, { who: 'mark', k: 1.1, pose: 'run', phase: ph(lt, 1.5), dir: lt > 1.3 ? -1 : 1, expr: lt > 1.3 ? 'gasp' : 'neutral' }); },
  });
  const SEASONS = [['autumn', 'autumn', 'OCT 2021'], ['winter', 'winter', 'DEC 2021'], ['winter', 'winter', 'FEB 2022'], ['spring', 'morning', 'APR 2022'], ['summer', 'golden', 'AUG 2022']];
  const FSTAIR = [2, 5, 8, 11, 14].map((i) => D.finsburyStair[i]); // Oct 21, Dec 21, Feb 22, Apr 22, Aug 22
  SEASONS.forEach(([season, sk, label], i) => shot({
    d: 1.4, sfx: [[0.05, 'pb']],
    draw(lt) {
      park(lt, { sky: sk, city: 'london', speed: 90, season, seed: 30 + i });
      if (season === 'autumn') Wd.leaves(lt, 50);
      if (season === 'winter') { Wd.frost(lt, 80); if (Math.floor(lt * 4) % 2) disc(262, 180, 3, C.white); }
      if (season === 'spring') Wd.leaves(lt, 40, [C.pink, C.white, C.pinkD], 19);
      A.runner(250, 218, { who: 'mark', pose: 'run', phase: ph(lt, 1.6 + i * 0.05) });
      F.plate(W - 128, TOP + 12, 114, 44);
      text(label, W - 120, TOP + 17, C.g4); text(FSTAIR[i].time, W - 120, TOP + 29, C.gold, { scale: 3 });
    },
  }));
  shot({
    d: 3.8, cue: ['rise', 0, { soft: true }], log: [[0.4, 3.7, '3 APR 2022', 'SLOW SUNDAY RUN WITH MEGAN']],
    draw(lt) {
      park(lt, { sky: 'morning', speed: 40, seed: 40, season: 'spring', sun: [430, 62, 9] });
      A.runner(300, 214, { who: 'megan', pose: 'jog', phase: ph(lt, 1.1) + 1, expr: Math.floor(lt * 2) % 2 ? 'smile' : 'laugh' });
      A.runner(332, 220, { who: 'mark', pose: 'jog', phase: ph(lt, 1.1), expr: 'smile' });
      const talker = Math.floor(lt / 1.1) % 2;
      const bx = talker ? 308 : 340, by = talker ? 160 : 166;
      rect(bx - 8, by - 6, 18, 9, C.white); tri(bx - 3, by + 3, bx + 2, by + 3, bx - 2, by + 7, C.white); for (let k = 0; k < 3; k++) px(bx - 4 + k * 4, by - 2, C.ink);
    },
  });

  // the knee
  shot({
    d: 3.0, log: [[0.3, 2.9, '31 MAR 2022', 'RETIRING MY RUNNING SHOES. FIRST HALF MARATHON: 1:51:17']],
    draw(lt) { Wd.sky('morning', TOP, 180); Wd.london(-lt * 4, 176, C.g4, C.white, false, C.g3); Wd.canal(lt, 60, 186); Wd.path(206, 20, lt, 60, [C.e3, C.e4, C.e2]); Wd.grass(222, BOT, lt, 60); A.runner(330, 220, { who: 'mark', k: 1.1, pose: 'run', phase: ph(lt, 1.5) }); },
  });
  shot({
    ch: 'The knee', d: 3.2, cue: ['knee'], amb: ['none'], chy: [[0.3, 2.9, 'MAY 2022', 'RUNNER’S KNEE']], sfx: [[0.6, 'crack']],
    draw(lt) { park(lt, { sky: 'grey', speed: 12, seed: 44, city: 'london', cityC: C.g4 }); A.runner(260, 230, { who: 'mark', k: 1.35, pose: 'hobble', phase: ph(lt, 0.8), expr: 'pain', knee: Math.floor(lt * 3) % 2 === 0 }); },
  });
  shot({
    d: 3.8, sfx: Array.from({ length: 12 }, (_, k) => [0.4 + k * 0.26, 'tick']),
    draw(lt) {
      Wd.livingRoom(lt, false);
      A.runner(130, 218, { who: 'mark', k: 2, pose: 'sit', phase: 0, expr: 'squint' });
      rect(142, 188, 18, 9, C.aqua); rect(142, 188, 18, 2, C.cyan);
      rect(330, 60, 110, 96, C.white); rect(330, 60, 110, 18, C.red); text('MAY 2022', 385, 66, C.white, { align: 'center' });
      const left = Math.max(1, 15 - Math.floor(clamp((lt - 0.4) / 3.0, 0, 1) * 14));
      text(String(left), 385, 86, C.ink, { align: 'center', scale: 4 });
      text(left === 1 ? 'DAY TO GO' : 'DAYS TO GO', 385, 120, C.g2, { align: 'center' });
      ring(385, 140, 1, C.red); text('HACKNEY HALF', 385, 138, C.red, { align: 'center' });
    },
  });
  shot({
    d: 2.6, log: [[0.3, 2.5, '21 MAY 2022', 'PARKRUN – TESTING THE KNEE']],
    draw(lt) { park(lt, { sky: 'morning', city: 'london', speed: 40, seed: 45 }); A.runner(300, 224, { who: 'mark', k: 1.2, pose: 'jog', phase: ph(lt, 1.1), expr: 'determined', knee: Math.floor(lt * 2) % 3 === 0 }); },
  });
  shot({
    d: 2.4, cue: ['race'], amb: ['crowd'], chy: [[0.3, 2.3, 'HACKNEY HALF', '22 MAY 2022']],
    draw(lt) { street(lt, { speed: 80, seed: 2 }); runners(lt, pack(lt, 12, 3, { drift: -30, y0: 208, dy: 20 })); A.runner(220, 226, { who: 'mark', pose: 'run', phase: ph(lt, 1.5), bib: true }); },
  });
  shot({
    d: 3.6,
    draw(lt) {
      street(lt, { speed: 90, seed: 4 });
      runners(lt, pack(lt, 6, 5, { drift: -20, y0: 204, dy: 8, k0: 0.7, kd: 0.1 }));
      // the 1:30 pacer's balloon, pulling away up the road
      A.runner(lerp(370, 430, lt / 3.6), 214, { who: A.crowdLook(90), k: 0.95, pose: 'run', phase: ph(lt, 1.6), balloon: '1:30' });
      A.runner(170, 236, { who: 'mark', k: 1.45, pose: 'run', phase: ph(lt, 1.5), bib: true, knee: lt < 1.5 && Math.floor(lt * 3) % 2 === 0, expr: 'determined' });
    },
  });
  shot({
    d: 4.0, log: [[0.9, 3.9, '22 MAY 2022', 'THE KNEE HELD OUT – GREAT ATMOSPHERE']], sfx: [[1.4, 'cheer']],
    draw(lt) {
      street(lt, { speed: 20, seed: 6 });
      Wd.finishArch(260, 226, 'FINISH');
      clockBoard(400, 76, '1:46:30');
      A.runner(lerp(120, 340, clamp(lt / 2.2, 0, 1)), 232, { who: 'mark', k: 1.2, pose: lt < 2.2 ? 'run' : 'cheer', phase: ph(lt, 1.5), bib: true, expr: 'smile' });
    },
  });
  shot({
    d: 3.0, cue: ['motif', 0, { partial: 4, vol: 0.5 }],
    draw(lt) {
      Wd.sky('blue', TOP, 200); Wd.clouds(lt, 3, 60, 8, 3);
      Wd.terraces(0, 0, 200, 5); rect(0, 200, W, BOT - 200, C.g2);
      A.runner(130, 230, { who: 'mark', k: 1.35, pose: 'idle', phase: ph(lt, 0.4), medal: true, expr: 'neutral' });
      A.balloon(lerp(340, 380, lt / 3.0), lerp(170, 80, easeOut(lt / 3.0)), '1:30');
    },
  });
  shot({
    ch: 'Chasing 1:30', d: 2.2, cue: ['chase'], amb: ['crowd', 0.4], chy: [[0.2, 2.1, 'GREAT NORTH RUN', 'SEP 2022 · 1:38:12']],
    draw(lt) { Wd.sky('blue', TOP, 190); Wd.tyneBridge(30 - lt * 6, 190, C.g3); rect(0, 190, W, 10, C.water); Wd.road(200, BOT - 200, lt, 80); runners(lt, pack(lt, 16, 9, { drift: -30, y0: 206, dy: 24 })); A.runner(240, 228, { who: 'mark', pose: 'run', phase: ph(lt, 1.5), bib: true }); },
  });
  shot({
    d: 2.0, chy: [[0.2, 1.9, 'ROYAL PARKS HALF', 'OCT 2022 · 1:39:57']],
    draw(lt) { park(lt, { sky: 'autumn', season: 'autumn', speed: 80, seed: 50 }); Wd.leaves(lt, 50); runners(lt, pack(lt, 8, 11, { drift: -30 })); A.runner(250, 222, { who: 'mark', pose: 'run', phase: ph(lt, 1.5), bib: true }); },
  });
  shot({
    d: 4.0, chy: [[0.2, 1.6, 'TUESDAY NIGHTS', '2023']], log: [[1.5, 3.9, '4 APR 2023', '7 × 800. MISSED THE LAST ONE AS HAD TO RUSH OFF TO PUB QUIZ!']],
    draw(lt) {
      Wd.track(lt, 80, 176);
      for (let i = 0; i < 3; i++) A.runner(Wd.mod(lt * (70 + i * 6) + i * 140, W + 60) - 30, 196 + i * 12, { who: ['louis', 'lad1', 'david'][i], pose: 'sprint', phase: ph(lt, 2.2) + i });
      const off = lt > 2.2 ? (lt - 2.2) * 180 : 0; // ...and off to the pub quiz
      A.runner(290 + off, 234, { who: 'mark', k: 1.1, pose: 'sprint', phase: ph(lt, 2.3), dir: 1 });
    },
  });
  shot({
    d: 3.0, sfx: [[0.05, 'pb'], [1.5, 'pb']],
    draw(lt) {
      const a = lt < 1.5;
      if (a) park(lt, { sky: 'blue', city: 'london', speed: 90, seed: 55, season: 'spring' });
      else { Wd.sky('blue', TOP, 186); Wd.clouds(lt, 6, 50, 9, 3); Wd.london(-60 - lt * 10, 184, C.g4, C.white, false, C.g3); rect(0, 184, W, 14, C.water); Wd.path(198, 22, lt, 110); Wd.grass(220, BOT, lt, 110); }
      A.runner(240, a ? 224 : 228, { who: 'mark', k: 1.2, pose: 'sprint', phase: ph(lt, 2.4), bib: !a });
      F.card(W / 2, TOP + 14, a ? 'SUB 20 PARKRUN · MAR 2023' : 'SUB 40 10K · BATTERSEA · APR 2023', a ? '19:25' : '39:35', '', lt, a ? 0 : 1.5, { scale: 4 });
    },
  });
  shot({
    d: 4.4, cue: ['race'], chy: [[0.2, 2.0, 'HACKNEY HALF', '21 MAY 2023']], log: [[2.0, 4.3, '21 MAY 2023', 'AN AMBITIOUS ATTEMPT AT 1:30 BUT HAPPY WITH 1:35']],
    draw(lt) {
      street(lt, { speed: 90, seed: 7 });
      runners(lt, pack(lt, 6, 13, { drift: -20, y0: 204, dy: 8, k0: 0.7, kd: 0.1 }));
      A.runner(lerp(390, 410, lt / 4.4), 216, { who: A.crowdLook(91), k: 1.0, pose: 'run', phase: ph(lt, 1.6), balloon: '1:30' });
      A.runner(300, 236, { who: 'mark', k: 1.4, pose: 'run', phase: ph(lt, 1.6), bib: true, expr: 'determined' });
      if (lt > 2.0) { F.plate(W - 128, TOP + 12, 114, 30); text('FINISH', W - 120, TOP + 16, C.g4); text('1:35:30', W - 120, TOP + 26, C.white, { scale: 2 }); }
    },
  });

  // ===== APPROACH =====
  shot({
    ch: 'Richmond', d: 5.2, cue: ['approach'], amb: ['birds', 0.3], chy: [[0.2, 2.4, 'RICHMOND MARATHON', '8 WEEKS TO GO']], sfx: [[1.3, 'tick'], [2.6, 'tick'], [3.9, 'tick']],
    draw(lt) {
      const i = Math.min(3, Math.floor(lt / 1.3));
      Wd.sky(['dawn', 'golden', 'morning', 'hot'][i], TOP, 186);
      Wd.sun(360 - i * 30, 176 - i * 30, 12 + i * 2, C.yellow, [C.dawnL, C.dawnY]);
      Wd.london(-lt * 6, 180, C.g4, C.dawnL, false, C.g3);
      Wd.canal(lt, 70, 186);
      Wd.path(206, 20, lt, 70, [C.e3, C.e4, C.e2]); Wd.grass(222, BOT, lt, 70);
      A.runner(250, 224, { who: 'mark', k: 1.15, pose: 'run', phase: ph(lt, 1.4), sweat: i > 1 });
      F.plate(W - 110, TOP + 12, 96, 30);
      text(`${[26, 28, 30, 32][i]} KM`, W - 100, TOP + 18, C.white, { scale: 2 });
    },
  });
  shot({
    d: 3.2, log: [[0.3, 3.1, '24 JUL 2023', 'I HAVE BECOME DEATH, DESTROYER OF LONG RUNS']], fx: { flash: 0.5 },
    draw(lt) { PX.vgrad(TOP, 200, [C.yellow, C.white, C.white, C.dawnL]); ellipse(240, 200, 180, 60, C.white); rect(0, 200, W, BOT - 200, C.ink); A.runner(330, 202, { who: 'mark', k: 1.6, pose: 'run', phase: 0.9, map: INK }); },
  });
  shot({
    d: 2.2, sfx: [[0.3, 'tick']],
    draw(lt) {
      bokehBG([C.dawnY, C.yellow, C.dawnO], lt, [C.dawnY, C.dawnO, C.dawnR]);
      hand(420, 260, 160, -2.6, C.skinM);
      rect(156, 40, 168, 190, C.ink); PX.vgrad(44, 226, [C.sky, C.skyL], 160, 320);
      text('RICHMOND', 240, 56, C.white, { align: 'center' }); text('SUN 10 SEP', 240, 68, C.white, { align: 'center' });
      Wd.sun(240, 118, 16, C.yellow, [C.dawnL, C.dawnY]);
      text('30°C', 240, 150, C.white, { align: 'center', scale: 4 });
      text('HEAT WARNING', 240, 196, C.red, { align: 'center' });
    },
  });

  // ===== THE ORDEAL: RICHMOND =====
  const RM = R.richmond2023;
  shot({
    d: 3.4, cue: ['ordeal'], amb: ['crowd', 0.6], chy: [[0.3, 3.2, 'RICHMOND MARATHON', '10 SEP 2023']], fx: { heat: 1 },
    draw(lt) { river(lt, { speed: 60 }); runners(lt, pack(lt, 14, 21, { drift: -20, y0: 206, dy: 12 })); A.runner(250, 230, { who: 'mark', k: 1.2, pose: 'run', phase: ph(lt, 1.5), bib: true }); },
  });
  shot({
    d: 4.0, fx: { heat: 2 }, amb: ['heart'],
    over(lt) { paceBadge(RM, lerp(20.2, 24.0, lt / 4.0), W - 110, TOP + 10, true); },
    draw(lt) {
      river(lt, { speed: 40 });
      runners(lt, [[120, 210, A.crowdLook(5), 0.85, 'walk', 0.8], [340, 212, A.crowdLook(7), 0.9, 'tired', 0.8], [60, 206, A.crowdLook(8), 0.75, 'walk', 0.8]]);
      A.runner(240, 232, { who: 'mark', k: 1.3, pose: lt < 1.8 ? 'run' : 'tired', phase: ph(lt, lt < 1.8 ? 1.4 : 1.0), bib: true, sweat: true, flush: true, expr: 'gasp' });
    },
  });
  shot({
    d: 4.0, fx: { heat: 2 },
    draw(lt) {
      river(lt, { speed: 0, sunX: 120 });
      Wd.ambulance(300, 204, lt);
      Wd.waterTable(150, 222, true, lt);
      A.runner(80, 222, { who: A.crowdLook(12), pose: 'sit', phase: 0 });
      A.runner(420, 222, { who: A.crowdLook(13), pose: 'lie' });
      A.runner(lerp(170, 260, lt / 4.0), 232, { who: 'mark', k: 1.2, pose: 'tired', phase: ph(lt, 0.9), bib: true, sweat: true, expr: 'gasp' });
    },
  });
  shot({
    d: 2.0, fx: { heat: 1 },
    draw(lt) { bokehBG([C.yellow, C.dawnY, C.white], lt, [C.dawnL, C.dawnY, C.dawnO]); A.portrait(240, 60, 'mark', { expr: 'gasp', t: lt, sweat: true, flush: true }); },
  });
  shot({
    d: 2.0, fx: { sepia: 1, in: 0.2, white: true, out: 0.2, whiteOut: true }, cue: ['motif', 0, { partial: 4, vol: 0.7 }], sub: [[0.2, 1.9, 'IF YOU CAN’T TALK…', 'whisper']],
    draw(lt) { bokehBG([C.f3, C.f4, C.dawnL], lt, [C.f4, C.f3, C.f2]); A.portrait(300, 60, 'mentor', { dir: -1, expr: 'talk', t: lt }); },
  });
  shot({
    d: 2.2, cue: ['ordeal', 0, { calm: true }], fx: { heat: 1 },
    draw(lt) { bokehBG([C.yellow, C.dawnY, C.white], lt, [C.dawnL, C.dawnY, C.dawnO]); A.portrait(240, 60 + Math.round(Math.sin(lt * 3)), 'mark', { expr: 'determined', t: lt, sweat: true }); },
  });
  shot({
    d: 4.4, cue: ['ordeal', 0, { push: true }], sub: [[0.4, 2.6, 'THE RACE HAS BEEN STOPPED!', 'dialog']], sfx: [[0.4, 'megaphone']],
    draw(lt) {
      river(lt, { speed: 20, sunX: 100 });
      Wd.finishArch(360, 226, 'FINISH');
      A.runner(60, 222, { who: 'vis', pose: 'megaphone', phase: 0, k: 1.1 });
      const bx = lerp(520, 408, clamp((lt - 1.5) / 2.2, 0, 1));
      rect(bx, 196, 90, 30, C.g5); for (let i = 0; i < 6; i++) rect(bx + 4 + i * 15, 200, 8, 22, C.g3);
      A.runner(lerp(170, 392, clamp(lt / 3.2, 0, 1)), 232, { who: 'mark', k: 1.2, pose: 'run', phase: ph(lt, 1.3), bib: true, sweat: true, expr: 'determined' });
    },
  });
  shot({
    d: 4.0, cue: ['triumph', 0.4, { soft: true }], log: [[0.8, 3.9, '10 SEP 2023', 'THAT WAS REALLY HARD – MANAGED TO PASS THROUGH THE END WHEN THEY STARTED TO CANCEL THE RACE']],
    draw(lt) { river(lt, { speed: 0, sunX: 90 }); Wd.finishArch(240, 226); clockBoard(240, 60, '3:55:11', C.gold); A.runner(lerp(250, 330, clamp(lt / 2, 0, 1)), 232, { who: 'mark', k: 1.2, pose: lt < 2 ? 'tired' : 'idle', phase: ph(lt, 0.9), bib: true, sweat: true, medal: lt > 2.4 }); },
  });
  shot({
    d: 4.4, amb: ['none'], fx: { out: 0.6 },
    draw(lt) {
      PX.vgrad(TOP, 150, [C.white, C.haze, C.skyP]);
      Wd.grass(150, BOT, lt, 0, [C.f3, C.f4, C.f5]);
      A.runner(160, 200, { who: A.crowdLook(40), pose: 'lie', k: 0.8 });
      A.runner(380, 170, { who: A.crowdLook(41), pose: 'lie', k: 0.7 });
      A.runner(280, 226, { who: 'mark', k: 1.3, pose: 'lie', medal: true });
    },
  });

  // ===== THE REWARD =====
  shot({
    ch: 'The golden year', d: 4.8, cue: ['xmas'], amb: ['wind', 0.4], chy: [[0.2, 2.1, 'MILFORD WATERFRONT', 'CHRISTMAS DAY 2023']], log: [[2.2, 4.7, '25 DEC 2023', '100TH PARKRUN, 2ND PLACE. NO CHANCE I WAS BEATING THE IRONMAN ATHLETE']],
    draw(lt) {
      Wd.sky('winter', TOP, 176);
      poly([[0, 150], [120, 142], [160, 176], [0, 176]], C.g2); poly([[330, 176], [380, 138], [480, 130], [480, 176]], C.g2);
      rect(0, 176, W, 22, C.water); for (let i = 0; i < 30; i++) rect(Wd.mod(rnd(i, 2) * W - lt * 12, W), 180 + (i % 5) * 3, 6, 1, C.white);
      Wd.grass(198, BOT, lt, 70, [C.g3, C.f2, C.g4]); Wd.path(206, 18, lt, 70, [C.g3, C.g4, C.g2]);
      A.runner(410, 216, { who: 'iron', k: 1.05, pose: 'run', phase: ph(lt, 1.7) });
      A.runner(310, 226, { who: 'mark', k: 1.15, pose: 'run', phase: ph(lt, 1.7), hat: 'santa' });
    },
  });
  shot({
    d: 3.6, cue: ['race'], sfx: [[0.05, 'pb']], log: [[0.2, 1.7, 'FEB 2024', 'LONDON WINTER 10K: 39:50']], log2: true,
    over(lt) { F.logQuote(lt, 1.9, 3.5, '30 MAR 2024', 'OAK HILL PARKRUN WITH A SWOLLEN EYE. UPDATE: TURNS OUT I’VE GOT SHINGLES'); },
    draw(lt) {
      if (lt < 1.8) { street(lt, { speed: 90, seed: 8, sky: 'winter', bunting: false }); A.runner(320, 230, { who: 'mark', k: 1.15, pose: 'run', phase: ph(lt, 1.6), bib: true }); }
      else { park(lt, { sky: 'morning', speed: 50, seed: 60, season: 'spring' }); A.runner(320, 224, { who: 'mark', k: 1.15, pose: 'run', phase: ph(lt, 1.5), expr: 'squint' }); }
    },
  });
  shot({
    d: 3.6, cue: ['race', 0, { big: true }], amb: ['crowd'], chy: [[0.2, 2.0, 'HACKNEY HALF', '19 MAY 2024']],
    draw(lt) {
      street(lt, { speed: 100, seed: 9 });
      runners(lt, pack(lt, 6, 17, { drift: -25, y0: 204, dy: 8, k0: 0.7, kd: 0.1 }));
      A.runner(lerp(390, 340, lt / 3.6), 222, { who: A.crowdLook(92), k: 1.25, pose: 'run', phase: ph(lt, 1.6), balloon: '1:30' });
      A.runner(lerp(110, 230, lt / 3.6), 237, { who: 'mark', k: 1.45, pose: 'run', phase: ph(lt, 1.7), bib: true, expr: 'determined' });
    },
  });
  shot({
    d: 4.0, amb: ['heart'], cue: ['none'],
    draw(lt) {
      // slow motion: past the balloon
      street(lt * 0.4, { speed: 100, seed: 10 });
      A.runner(300 - lt * 14, 226, { who: A.crowdLook(92), k: 1.4, pose: 'run', phase: ph(lt, 0.6), balloon: '1:30' });
      A.runner(lerp(140, 350, easeInOut(lt / 4.0)), 238, { who: 'mark', k: 1.55, pose: 'run', phase: ph(lt, 0.62), bib: true, expr: 'determined' });
    },
    fx: { grade: { r: 0.95, g: 0.95, b: 1.05 } },
  });
  shot({
    d: 4.2, cue: ['triumph'], amb: ['crowd'], sfx: [[0.3, 'cheer'], [0.3, 'fanfare']],
    draw(lt) {
      street(lt, { speed: 10, seed: 11 });
      Wd.finishArch(240, 228);
      A.runner(lerp(160, 310, clamp(lt / 1.5, 0, 1)), 234, { who: 'mark', k: 1.3, pose: lt > 1.4 ? 'cheer' : 'run', phase: ph(lt, 1.4), bib: true, expr: 'laugh' });
      Wd.confetti(lt, 0.4);
      F.card(W / 2, TOP + 10, 'HACKNEY HALF 2024', '1:29:01', lt > 1.2 ? 'SUB 1:30' : '', lt, 0.5, { scale: 4 });
    },
  });
  shot({ d: 2.4, draw(lt) { bokehBG([C.gold, C.strava, C.white, C.skyL], lt, [C.skyL, C.sky, C.blue]); Wd.confetti(lt, -1); A.portrait(240, 60, 'mark', { expr: 'laugh', t: lt, medal: true }); } });
  shot({
    d: 2.8, sfx: [[0.05, 'pb'], [1.4, 'pb']],
    draw(lt) {
      const a = lt < 1.4;
      if (a) { street(lt, { speed: 90, seed: 12, bunting: false }); } else park(lt, { sky: 'golden', city: 'london', speed: 80, seed: 61 });
      A.runner(240, a ? 232 : 226, { who: 'mark', k: 1.2, pose: 'sprint', phase: ph(lt, 2), bib: a });
      F.card(W / 2, TOP + 10, a ? 'THE BIG HALF · SEP 2024' : 'FINSBURY PARKRUN · SEP 2024', a ? '1:28:45' : '18:52', a ? '' : 'FINALLY SUB 19 AT FINSBURY', lt, a ? 0 : 1.4);
    },
  });
  shot({
    d: 5.0, cue: ['triumph', 0, { big: true }], chy: [[0.2, 2.2, 'ROBIN HOOD HALF, NOTTINGHAM', '29 SEP 2024']], sfx: [[2.4, 'pb']],
    draw(lt) {
      Wd.sky('blue', TOP, 190); Wd.clouds(lt, 20, 50, 13, 4);
      Wd.castleRock(250 - lt * 10, 190);
      rect(0, 190, W, 8, C.water);
      Wd.road(198, BOT - 198, lt, 180);
      runners(lt, pack(lt, 5, 23, { drift: -120, y0: 204, dy: 10 }));
      A.runner(240, 234, { who: 'mark', k: 1.25, pose: 'sprint', phase: ph(lt, 2.4), bib: true, expr: 'determined' });
      Wd.speedLines(lt, 18, 700, 200, 60);
      if (lt > 2.4) { F.plate(W - 150, TOP + 60, 136, 48); text('HALF MARATHON PB', W - 142, TOP + 66, C.g4); text('1:24:17', W - 142, TOP + 78, C.gold, { scale: 3 }); }
    },
  });

  // ===== THE ROAD BACK =====
  const cal = [];
  for (const [d, m] of D.runs) { const day = new Date(Date.UTC(2016, 0, 1) + d * 86400000); const iso = day.toISOString().slice(0, 10); if (iso >= '2024-09-02' && iso <= '2024-10-13') cal.push([iso, Math.round(m / 1000)]); }
  shot({
    ch: 'Valencia', d: 5.0, cue: ['fall_build'], amb: ['clock'], chy: [[0.2, 2.0, 'VALENCIA MARATHON', '10 WEEKS TO GO']], sub: [[2.2, 3.1, 'IF YOU CAN’T TALK…', 'whisper'], [3.1, 3.7, 'IF YOU CAN’T…', 'whisper'], [3.7, 4.2, 'IF YOU…', 'whisper']],
    draw(lt) {
      PX.vgrad(TOP, BOT, [C.g1, C.g0]);
      rect(40, TOP + 14, 400, 180, C.white);
      rect(40, TOP + 14, 400, 18, C.red); text('SEPTEMBER – OCTOBER 2024', 240, TOP + 19, C.white, { align: 'center' });
      const shown = Math.floor(clamp(lt / 3.9, 0, 1) * cal.length);
      const start = Date.parse('2024-09-02');
      for (let wk = 0; wk < 6; wk++) for (let dd = 0; dd < 7; dd++) {
        const x = 44 + dd * 56, y = TOP + 36 + wk * 26;
        box(x, y, 54, 24, C.g4);
        const iso = new Date(start + (wk * 7 + dd) * 86400000).toISOString().slice(0, 10);
        text(iso.slice(8), x + 3, y + 3, C.g3);
        const hits = cal.slice(0, shown).filter((c) => c[0] === iso);
        hits.forEach((h, j) => { rect(x + 16, y + 4 + j * 9, 34, 8, h[1] >= 20 ? C.strava : C.orange); text(`${h[1]}K`, x + 18, y + 5 + j * 9, C.white); });
      }
      const ang = lt * lt * 3;
      disc(420, TOP + 190, 16, C.g5); line(420, TOP + 190, 420 + Math.cos(ang) * 12, TOP + 190 + Math.sin(ang) * 12, C.ink, 2); line(420, TOP + 190, 420 + Math.cos(ang / 12) * 8, TOP + 190 + Math.sin(ang / 12) * 8, C.ink, 2);
    },
  });
  shot({
    d: 2.6, cue: ['none', 0.9, { cut: true }], amb: ['none'], chy: [[0.9, 2.5, '15 OCT 2024', '']], sfx: [[0.9, 'crack']],
    draw(lt) {
      const frozen = lt > 0.9;
      park(frozen ? 0.9 : lt, { sky: 'grey', speed: 160, seed: 70, season: 'autumn', city: 'london', cityC: C.g4 });
      A.runner(240, 230, { who: 'mark', k: 1.3, pose: lt < 0.9 ? 'sprint' : 'limp', phase: ph(frozen ? 0.9 + (lt - 0.9) * 0.3 : lt, 2.4), expr: lt > 0.9 ? 'pain' : 'determined' });
      if (lt > 0.9 && lt < 1.3) dither(0, TOP, W, BOT - TOP, C.red, 0.35 * (1 - (lt - 0.9) / 0.4));
      if (lt > 0.9) { const r = 6 + Math.sin(lt * 10) * 2; ellipseDither(244, 222, r, r, C.red, 0.7); }
    },
    fx: { grade: (lt) => (lt > 0.9 ? { r: 0.85, g: 0.8, b: 0.8 } : { r: 1, g: 1, b: 1 }) },
  });
  shot({
    d: 4.8, cue: ['fall'], amb: ['rain'], log: [[0.3, 2.4, '19 OCT 2024', 'NOT SURE WHAT IS WRONG WITH MY ANKLE…', 'top']],
    draw(lt) {
      Wd.livingRoom(lt, true);
      A.runner(130, 218, { who: 'mark', k: 2, pose: 'sit', phase: 0, expr: 'tired' });
      rect(140, 206, 16, 9, C.aqua); rect(140, 206, 16, 2, C.cyan);
      if (lt > 2.4) {
        const a = easeOut(clamp((lt - 2.4) / 0.4, 0, 1));
        const y = Math.round(lerp(BOT, 70, a));
        rect(250, y, 200, 110, C.white); rect(250, y, 200, 16, C.g4); text('DIAGNOSIS', 258, y + 5, C.ink);
        text('POSTERIOR TIBIAL', 350, y + 30, C.red, { align: 'center' }); text('STRESS INJURY', 350, y + 44, C.red, { align: 'center' });
        text('CAUSE: OVERTRAINING', 350, y + 68, C.ink, { align: 'center' }); text('REST. NO RUNNING.', 350, y + 82, C.g2, { align: 'center' });
      }
    },
  });
  shot({
    d: 3.6,
    draw(lt) {
      rect(0, 0, W, H, C.black);
      text('VALENCIA MARATHON DREAM OVER', W / 2, 118, C.white, { align: 'center', chars: (lt - 0.4) * 22, spacing: 2 });
      if (lt > 1.9) text('MARK’S LOG · 1 NOV 2024', W / 2, 140, C.strava, { align: 'center' });
    },
  });
  shot({
    d: 2.6, log: [[0.3, 2.5, '20 NOV 2024', 'ABSOLUTE SNOOZE FEST – CAN’T WAIT TO BE BACK RUNNING']],
    draw(lt) { Wd.gym(lt); A.runner(320, 226, { who: 'mark', k: 1.6, pose: 'lift', phase: ph(lt, 0.5), expr: 'tired' }); for (let i = 0; i < 3; i++) { const a = (lt * 0.7 + i / 3) % 1; text('Z', 350 + a * 30, 130 - a * 50, C.white, { scale: 1 + (i % 2) }); } },
  });
  shot({
    d: 4.0, cue: ['valencia'], amb: ['crowd', 0.6], chy: [[0.3, 3.8, 'VALENCIA', '1 DEC 2024']],
    draw(lt) {
      Wd.sky('spain', TOP, 186); Wd.sun(420, 66, 11);
      Wd.valencia(40, 186);
      rect(0, 186, W, 12, C.water); for (let i = 0; i < 24; i++) rect(Wd.mod(rnd(i, 3) * W - lt * 8, W), 189 + (i % 4) * 2, 6, 1, C.white);
      Wd.palm(20, 206, 1.2, lt); Wd.palm(450, 206, 1.1, lt);
      Wd.road(198, 30, lt, 0);
      runners(lt, pack(lt, 14, 29, { drift: 70, y0: 204, dy: 16, k0: 0.65 }));
      Wd.barrier(226, 0, 0, C.white, C.strava);
      A.runner(240, 238, { who: 'mark', pose: 'cheer', phase: ph(lt, 1.4), k: 1.05 });
      rect(256, 170, 44, 22, C.white); box(256, 170, 44, 22, C.ink); text('GO', 278, 173, C.red, { align: 'center' }); text('LADS!', 278, 182, C.red, { align: 'center' }); line(262, 192, 262, 212, C.e2, 2);
    },
  });
  shot({
    d: 2.6,
    draw(lt) {
      Wd.sky('spain', TOP, 196); Wd.valencia(-160 - lt * 10, 196);
      Wd.road(196, BOT - 196, lt, 0);
      for (const [who, off] of [['lad1', 0], ['lad2', 60], ['david', 130]]) A.runner(Wd.mod(-60 + lt * 160 + off * 1.2, 700) - 60, 214 + (off % 20), { who, pose: 'run', phase: ph(lt, 1.6) + off });
      A.runner(250, 232, { who: 'mark', pose: 'clap', phase: ph(lt, 1.8), k: 1.1, expr: 'laugh' });
    },
  });
  shot({
    d: 5.2, sfx: [[2.8, 'clink']], sub: [[3.0, 5.1, 'WE WILL COME BACK STRONGER.', 'dialog']],
    draw(lt) {
      Wd.sky('golden', TOP, 150); Wd.valencia(60, 150);
      rect(0, 150, W, BOT - 150, C.e4);
      for (const [x, who] of [[110, 'lad1'], [200, 'david'], [300, 'lad2']]) A.runner(x, 200, { who, pose: 'clap', phase: ph(lt, 0.8) + x, dir: x > 240 ? -1 : 1, expr: 'laugh' });
      A.runner(380, 204, { who: 'mark', pose: lt > 2.5 ? 'drink' : 'idle', phase: ph(lt, 0.6), dir: -1, expr: 'smile' });
      rect(40, 196, 400, 42, C.white); rect(40, 196, 400, 3, C.g5); dither(40, 199, 400, 39, C.g5, 0.2);
      A.paella(240, 212, lt);
      A.beer(90, 224); A.beer(390, 224); A.beer(150, 228);
    },
  });

  // ===== RESURRECTION =====
  shot({
    ch: 'The comeback', d: 4.2, cue: ['comeback'], amb: ['none'], log: [[0.4, 4.1, '17 DEC 2024', 'RUN WITH DAVID – ONE FOR THE COMEBACK MONTAGE']],
    draw(lt) {
      Wd.sky('night', TOP, 186); Wd.stars(lt, 40, 120, 9);
      Wd.terraces(lt, 20, 186, 11);
      PX.grade({ r: 0.55, g: 0.6, b: 0.9 }, TOP, 186);
      rect(0, 186, W, 10, C.g1); Wd.road(196, BOT - 196, lt, 60, [C.ink, C.g0, C.g2]);
      // street lamps: post, lit head and a pool of light on the pavement
      for (let i = 0; i < 4; i++) {
        const x = Math.round(Wd.mod(i * 140 - lt * 40, W + 60) - 30);
        rect(x, 108, 3, 86, C.g1); rect(x - 6, 104, 15, 4, C.g2); rect(x - 4, 108, 11, 2, C.dawnL);
        dither(x - 22, 188, 47, 6, C.dawnL, 0.3);
      }
      A.runner(300, 224, { who: 'david', k: 1.1, pose: 'jog', phase: ph(lt, 1.2) + 1, expr: 'smile' });
      A.runner(334, 232, { who: 'mark', k: 1.15, pose: 'jog', phase: ph(lt, 1.2), expr: Math.floor(lt * 2) % 2 ? 'smile' : 'laugh' });
      for (let i = 0; i < 2; i++) if (Math.sin(lt * 5 + i) > 0.4) { const bx = 316 + i * 34, by = 164; disc(bx, by, 2, C.white); disc(bx + 4, by - 2, 1, C.white); }
    },
  });
  shot({
    d: 2.8, log: [[0.3, 2.7, '21 DEC 2024', 'COMEBACK PARKRUN – FULL SEND THE FIRST LAP, THEN BIG REGRETS']],
    draw(lt) { park(lt, { sky: 'winter', season: 'winter', speed: lt < 1.2 ? 160 : 30, seed: 75, city: 'london' }); A.runner(330, 226, { who: 'mark', k: 1.2, pose: lt < 1.2 ? 'sprint' : 'tired', phase: ph(lt, lt < 1.2 ? 2.6 : 0.9), expr: lt < 1.2 ? 'determined' : 'gasp', sweat: lt > 1.2 }); if (lt < 1.2) Wd.speedLines(lt, 12, 600, 190, 40); },
  });
  shot({
    d: 4.2, chy: [[0.2, 2.0, 'FINSBURY PARK', '1 MAR 2025']], log: [[2.0, 4.1, '1 MAR 2025', 'FINAL FINSBURY PARKRUN. AFTER 95 PARKRUNS AT FINSBURY', 'top']],
    draw(lt) {
      park(lt, { sky: 'morning', city: 'london', seed: 78, season: 'spring', sun: [440, 60, 10] });
      for (let i = 0; i < 7; i++) A.runner(262 + i * 28, 214 + (i % 2) * 6, { who: ['louis', 'david', 'lad1', 'megan', 'lad2', 'lad3', 'vis'][i], pose: 'clap', phase: ph(lt, 1.5) + i, k: 0.95, dir: -1 });
      A.runner(lerp(-20, 200, clamp(lt / 1.6, 0, 1)), 232, { who: 'mark', k: 1.25, pose: lt < 1.6 ? 'run' : 'wave', phase: ph(lt, 1.5), expr: 'smile' });
    },
  });
  shot({
    d: 3.2, cue: ['comeback', 0, { lift: true }],
    draw(lt) {
      Wd.sky('golden', TOP, 186); Wd.clouds(lt, 6, 50, 17, 3);
      Wd.london(20 - lt * 70, 184, C.g3, C.dawnL, false, C.g2);
      Wd.stAlbans(W + 60 - lt * 90, 184, C.g2, C.dawnL, C.g1);
      Wd.grass(184, BOT, lt, 90, [C.f2, C.f3, C.f4]);
      Wd.road(196, 30, lt, 160);
      Wd.van(200, 222, lt);
    },
  });
  shot({
    d: 3.2, chy: [[0.3, 3.0, 'ST ALBANS', '2025 · A NEW CLUB']], amb: ['birds', 0.3],
    draw(lt) {
      park(lt, { sky: 'golden', city: 'stalbans', speed: 50, seed: 80, sun: [420, 110, 12] });
      for (let i = 0; i < 4; i++) A.runner(150 + i * 34, 212 + (i % 2) * 6, { who: ['lad1', 'david', 'megan', 'lad3'][i], pose: 'jog', phase: ph(lt, 1.3) + i * 0.8, k: 0.9 });
      A.runner(310, 228, { who: 'mark', k: 1.15, pose: 'jog', phase: ph(lt, 1.3), expr: 'smile' });
    },
  });
  const HI25 = [
    ['RICKMANSWORTH PARKRUN', '18:28', 'ALL-TIME PARKRUN PB', 'park'], ['HACKNEY HALF', '1:26:28', 'HACKNEY PB · 125 KUDOS', 'street'],
    ['ST ALBANS HALF', '1:26:21', '“BRUTALLY HILLY”', 'hill'], ['STRIDERS FESTIVE 5K', '18:19', '5K PB · DEC 2025', 'night'],
  ];
  HI25.forEach(([a, b, c, kind], i) => shot({
    d: 1.4, sfx: [[0.05, 'pb']],
    draw(lt) {
      if (kind === 'park') park(lt, { sky: 'blue', speed: 100, seed: 82 });
      else if (kind === 'street') street(lt, { speed: 110, seed: 13 });
      else if (kind === 'hill') { park(lt, { sky: 'blue', city: 'stalbans', speed: 80, seed: 83 }); }
      else { Wd.track(lt, 110, 176); }
      A.runner(240, kind === 'night' ? 236 : kind === 'street' ? 234 : 226, { who: 'mark', k: 1.2, pose: 'sprint', phase: ph(lt, 2.4), bib: kind !== 'park' });
      F.card(W / 2, TOP + 10, a, b, c, lt, 0.05);
      void i;
    },
  }));

  // Manchester
  const MM = R.manchester2026;
  shot({
    ch: 'Manchester', d: 4.2, cue: ['boss'], amb: ['none'], chy: [[0.2, 2.0, 'MANCHESTER MARATHON', '18 WEEKS']], sfx: Array.from({ length: 18 }, (_, k) => [0.3 + k * 0.15, 'tick']),
    draw(lt) {
      PX.vgrad(TOP, BOT, [C.navy, C.night]);
      rect(24, TOP + 36, 190, 150, C.white); rect(24, TOP + 36, 190, 16, C.red); text('WEEK', 119, TOP + 41, C.white, { align: 'center' });
      for (let k = 0; k < 18; k++) { const x = 34 + (k % 6) * 30, y = TOP + 60 + Math.floor(k / 6) * 40; const done = lt > 0.3 + k * 0.15; text(done ? '☑' : '☐', x + 6, y, done ? C.f3 : C.g4, { scale: 2 }); text(String(k + 1), x + 11, y + 16, C.g2, { align: 'center' }); }
      [[1.0, 'BATH HALF · 1:28:08', '“DREADFUL – BIG BLOW UP AFTER 10K”'], [1.9, 'REGENT’S PARK 10K · 39:04', 'NEW 10K PB'], [2.8, 'SESSION NAME OF THE YEAR', '“3 PIZZA SLICES” (NO TOPPINGS)']].forEach(([t, a, b], i) => {
        if (lt < t) return;
        const x = Math.round(lerp(W + 10, 232, easeOut(clamp((lt - t) / 0.3, 0, 1)))), y = TOP + 40 + i * 50;
        rect(x, y, 232, 40, C.white); rect(x, y, 3, 40, C.strava); text(a, x + 10, y + 8, C.ink); text(b, x + 10, y + 22, C.strava);
      });
    },
  });
  function manc(lt, sp) { Wd.sky('grey', TOP, 170); Wd.mills(-Wd.mod(lt * sp * 0.3, 84), 176); rect(0, 176, W, 10, C.g2); Wd.crowd(lt, 192, -10, W + 10, 4, 0.6, 14); Wd.barrier(188, lt, sp); Wd.road(198, BOT - 198, lt, sp); }
  shot({
    d: 3.0, amb: ['crowd'], chy: [[0.2, 2.8, 'MANCHESTER', '19 APR 2026']],
    draw(lt) { manc(lt, 90); runners(lt, pack(lt, 14, 31, { drift: -20, y0: 204, dy: 14 })); A.runner(240, 234, { who: 'mark', k: 1.2, pose: 'run', phase: ph(lt, 1.6), bib: true }); F.plate(W - 120, TOP + 10, 108, 24); text('TARGET', W - 112, TOP + 13, C.g4); text('4:15 /KM', W - 112, TOP + 22, C.white); },
  });
  shot({
    d: 3.6,
    over(lt) { paceBadge(MM, lerp(8, 26, lt / 3.6), W - 110, TOP + 10, true); },
    draw(lt) { manc(lt, 110); runners(lt, pack(lt, 6, 33, { drift: -30, y0: 206, dy: 10 })); A.runner(240, 234, { who: 'mark', k: 1.2, pose: 'run', phase: ph(lt, 1.6), bib: true, expr: 'determined' }); if (Math.floor(lt * 3) % 2) ellipseDither(232, 229, 4, 3, C.red, 0.8); },
  });
  shot({
    d: 4.8, cue: ['none'], amb: ['heart'], sfx: [[3.6, 'boom']],
    draw(lt) {
      manc(lt * (lt < 3.6 ? 1 : 0.2), 90);
      const up = easeOut(clamp((lt - 0.6) / 1.4, 0, 1));
      A.wall(330 - clamp(lt - 2, 0, 2) * 30, 238, Math.round(150 * up), lt);
      const mx = lt < 3.6 ? lerp(200, 250, lt / 3.6) : 250 - (lt - 3.6) * 20;
      A.runner(mx, 234, { who: 'mark', k: 1.2, pose: lt < 2 ? 'run' : 'tired', phase: ph(lt, lt < 2 ? 1.5 : 0.9), bib: true, expr: 'gasp', sweat: true });
      paceBadge(MM, lerp(27.5, 30.5, lt / 4.8), W - 110, TOP + 10, true);
      if (lt > 3.6 && lt < 3.9) dither(0, TOP, W, BOT - TOP, C.white, 0.5);
    },
  });
  shot({ d: 2.0, draw(lt) { bokehBG([C.g4, C.b2, C.g3], lt, [C.g4, C.g3, C.g2]); A.portrait(240, 60, 'mark', { expr: 'gasp', t: lt, sweat: true, flush: true }); }, fx: { grade: { r: 0.9, g: 0.9, b: 0.95 } } });
  shot({
    d: 1.8, fx: { sepia: 1, in: 0.2, white: true, out: 0.2, whiteOut: true }, cue: ['motif', 0, { from: 4, to: 9, fit: true, low: true, vol: 0.6 }], sub: [[0.2, 1.7, '…YOU’RE GOING TOO FAST.', 'whisper']],
    draw(lt) { bokehBG([C.f3, C.f4, C.dawnL], lt, [C.f4, C.f3, C.f2]); A.portrait(300, 60, 'mentor', { dir: -1, expr: 'smile', t: lt }); },
  });
  shot({
    d: 3.2, cue: ['boss', 0, { slow: true }], amb: ['crowd', 0.5],
    draw(lt) {
      manc(lt, 60);
      for (let i = 0; i < 14; i++) { const a = (lt * 0.6 + i / 14); const x = 300 + (i % 5) * 12 + a * 40, y = 120 + (i * 11) % 60 + a * a * 80; if (y < 236) rect(x, y, 10, 5, i % 2 ? C.b2 : C.b1); }
      A.runner(lerp(220, 320, lt / 3.2), 234, { who: 'mark', k: 1.2, pose: 'run', phase: ph(lt, 1.1), bib: true, expr: 'determined', sweat: true });
      paceBadge(MM, lerp(33, 40, lt / 3.2), W - 110, TOP + 10);
    },
  });
  shot({
    d: 4.8, cue: ['triumph'], amb: ['crowd'], sfx: [[0.8, 'fanfare'], [0.8, 'cheer']], log: [[2.0, 4.7, '19 APR 2026', 'THE WALL WON. DIDN’T HAVE IT IN ME FOR SUB 3. BUT NOW I KNOW']],
    draw(lt) {
      manc(lt, 20);
      Wd.finishArch(250, 238);
      A.runner(lerp(160, 320, clamp(lt / 1.6, 0, 1)), 234, { who: 'mark', k: 1.2, pose: lt < 1.6 ? 'run' : 'idle', phase: ph(lt, 1.3), bib: true, medal: lt > 2, expr: 'smile' });
      F.card(W / 2, TOP + 10, 'MANCHESTER MARATHON', '3:20:03', lt > 1.4 ? '35 MINUTES FASTER THAN RICHMOND' : '', lt, 0.6, { scale: 4 });
    },
  });
  shot({
    d: 5.0, cue: ['comic'], amb: ['birds', 0.3], sfx: [[3.8, 'fanfare']], log: [[0.4, 3.6, '21 APR 2026', 'WALK-TO-THE-END-OF-MY-STREET-WITH-CRUTCHES 2026 – 5:00 (NEW PB). 2 MINUTES OFF MY TIME FROM YESTERDAY', 'top']],
    draw(lt) {
      Wd.sky('blue', TOP, 190); Wd.terraces(0, 0, 190, 21); rect(0, 190, W, 12, C.f3); rect(0, 202, W, 36, C.g4); for (let x = 0; x < W; x += 24) rect(x, 202, 1, 36, C.g3);
      rect(400, 180, 2, 40, C.white); rect(440, 180, 2, 40, C.white); line(401, 196, lt < 3.8 ? 441 : 430, lt < 3.8 ? 196 : 206, C.red, 2);
      A.runner(lerp(60, 420, clamp(lt / 3.8, 0, 1)), 232, { who: 'mark', k: 1.25, pose: lt < 3.8 ? 'crutch' : 'cheer', phase: ph(lt, 0.7), expr: 'determined' });
      if (lt > 3.8) Wd.confetti(lt, 3.8);
    },
  });

  // ===== THE RETURN =====
  shot({
    ch: 'Coach', d: 2.8, cue: ['warm'], chy: [[0.2, 2.6, 'FUTAKOTAMAGAWA PARKRUN, TOKYO', 'MAY 2026 · “HOT HOT HOT”']], fx: { heat: 1 },
    draw(lt) {
      Wd.sky('hot', TOP, 186); tri(120, 186, 360, 186, 240, 96, C.g4); tri(208, 118, 272, 118, 240, 96, C.white); Wd.mist(120, 186, C.haze, 0.5);
      rect(0, 176, W, 14, C.water); for (let i = 0; i < 30; i++) rect(Wd.mod(rnd(i, 4) * W - lt * 20, W), 179 + (i % 4) * 3, 5, 1, C.waterL);
      Wd.grass(190, BOT, lt, 70); Wd.path(206, 18, lt, 70);
      A.runner(250, 226, { who: 'mark', k: 1.2, pose: 'run', phase: ph(lt, 1.5), sweat: true, flush: true });
    },
  });
  shot({
    d: 3.4, log: [[0.3, 3.3, '14 JUL 2026', 'SHORT RUN WHILST THE PUPPY SLEEPS', 'top']],
    draw(lt) { Wd.livingRoom(lt, false); rect(60, 212, 120, 10, C.red); A.puppy(120, 214, lt, 1.6, true); for (let i = 0; i < 3; i++) { const a = (lt * 0.6 + i / 3) % 1; text('Z', 140 + a * 20, 170 - a * 40, C.white); } A.runner(lerp(290, 500, lt / 3.4), 234, { who: 'mark', pose: 'walk', phase: ph(lt, 0.6), k: 1.6 }); },
  });
  shot({
    d: 4.0, amb: ['birds', 0.3], log: [[0.3, 3.9, '28 APR 2026', 'COACHING DUTIES. THE ROAD TO MEGAN’S SUB 2 HOUR HALF STARTS NOW']],
    draw(lt) {
      park(lt, { sky: 'dusk', city: 'stalbans', cityC: C.dawnP, cityD: C.plum, speed: 60, seed: 90, lineC: C.f1, hillC: C.f2 });
      A.runner(318, 218, { who: 'megan', k: 1.1, pose: 'run', phase: ph(lt, 1.7), expr: 'gasp', flush: true, sweat: true });
      A.runner(352, 228, { who: 'mark', k: 1.15, pose: 'jog', phase: ph(lt, 1.3), expr: 'smile' });
    },
  });
  shot({ d: 2.0, draw(lt) { bokehBG([C.dawnO, C.dawnY, C.dawnR], lt, [C.dawnR, C.dawnP, C.plum]); A.portrait(160, 62, 'megan', { expr: 'gasp', t: lt, flush: true, sweat: true }); } });
  shot({
    d: 5.0, cue: ['motif', 0, { full: true, vol: 0.9 }], sub: [[0.4, 4.9, MOTIF, 'motif']],
    draw(lt) { bokehBG([C.dawnO, C.dawnY, C.dawnR], lt, [C.dawnR, C.dawnP, C.plum]); A.portrait(320, 60, 'mark', { dir: -1, expr: lt > 0.4 && lt < 4.0 ? 'talk' : 'smile', t: lt }); },
  });
  shot({ d: 2.4, cue: ['warm'], draw(lt) { bokehBG([C.dawnO, C.dawnY, C.dawnR], lt, [C.dawnR, C.dawnP, C.plum]); A.portrait(160, 62, 'megan', { expr: 'laugh', t: lt }); } });
  shot({
    d: 3.6, log: [[0.3, 1.8, '30 AUG 2026', 'ST ALBANS SIXER. 6 PUBS. 6 MILES.']], over(lt) { F.logQuote(lt, 1.9, 3.5, '2 SEP 2026', 'INTRODUCING: THE ST ALBANS CLAW'); },
    draw(lt) {
      if (lt < 1.85) {
        Wd.sky('night', TOP, 190); Wd.terraces(lt, 40, 196, 23); PX.grade({ r: 0.7, g: 0.65, b: 0.9 }, TOP, 196);
        // pub signs, each with a pint on it
        for (let i = 0; i < 3; i++) { const x = Math.round(Wd.mod(i * 190 - lt * 40, W + 80) - 40); rect(x + 10, 104, 2, 8, C.g2); rect(x, 110, 22, 22, C.ink); box(x, 110, 22, 22, C.gold); rect(x + 7, 116, 8, 11, C.gold); rect(x + 7, 115, 8, 2, C.white); dither(x - 4, 190, 30, 5, C.dawnY, 0.3); }
        Wd.road(196, BOT - 196, lt, 60, [C.g1, C.g2, C.g3]);
        for (let i = 0; i < 4; i++) A.runner(250 + i * 32, 224 + (i % 2) * 8, { who: ['lad1', 'lad2', 'mark', 'david'][i], k: 1.1, pose: 'jog', phase: ph(lt, 1.3) + i, expr: 'laugh' });
      } else {
        // the route as GPS art over a street map, drawn on like a live track
        PX.vgrad(TOP, BOT, [C.e5, C.e4]);
        for (let x = -40; x < W; x += 38) line(x, TOP, x + 50, BOT, C.e3);
        for (let y = TOP + 22; y < BOT; y += 34) rect(0, y, W, 2, C.e3);
        rect(0, 150, W, 5, C.white); rect(330, TOP, 6, BOT - TOP, C.white);
        const u = clamp((lt - 1.9) / 1.25, 0, 1), n = Math.floor(u * (CLAW.length - 1));
        for (let i = 0; i < n; i++) line(CLAW[i][0], CLAW[i][1], CLAW[i + 1][0], CLAW[i + 1][1], C.strava, 3);
        if (n > 0 && u < 1) { disc(CLAW[n][0], CLAW[n][1], 4, C.white); disc(CLAW[n][0], CLAW[n][1], 2, C.strava); }
        text('THE ST ALBANS CLAW · 10.8 KM', W / 2, TOP + 12, C.e1, { align: 'center' });
      }
    },
  });
  const CLAW = (() => {
    const q = (a, c, b, n = 10) => Array.from({ length: n }, (_, i) => { const t = (i + 1) / n; return [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]; });
    let pts = [[150, 214]], at = [150, 214];
    const go = (c, b, n) => { pts = pts.concat(q(at, c, b, n)); at = b; };
    go([136, 196], [150, 170], 6);
    [180, 222, 264, 306].forEach((xj, j) => { const tipY = [88, 72, 70, 86][j]; go([xj - 18, 120], [xj + 6, tipY], 10); go([xj + 26, tipY - 10], [xj + 24, tipY + 16], 5); go([xj + 16, 132], [xj + 12, 168], 8); });
    go([340, 190], [322, 214], 6); go([236, 232], [150, 214], 10);
    return pts;
  })();
  shot({
    ch: 'Today', d: 6.0, cue: ['finale'], amb: ['crowd', 0.6], chy: [[0.2, 2.4, 'ST ALBANS PARKRUN', 'TODAY · 26 SEP 2026']], sfx: [[3.8, 'fanfare'], [3.8, 'cheer']],
    draw(lt) {
      const fin = lt > 3.8;
      park(lt, { sky: 'morning', city: 'stalbans', speed: fin ? 10 : 110, seed: 95, lake: true, sun: [430, 64, 11] });
      Wd.finishArch(lerp(560, 300, clamp((lt - 1.4) / 2.4, 0, 1)), 230);
      A.runner(fin ? lerp(300, 400, clamp((lt - 3.8) / 1.4, 0, 1)) : 250, 232, { who: 'mark', k: 1.35, pose: fin && lt > 5.0 ? 'cheer' : 'sprint', phase: ph(lt, fin ? 1.4 : 2.6), expr: lt > 5.0 ? 'laugh' : 'determined' });
      if (!fin) Wd.speedLines(lt, 10, 600, 196, 30);
      const s = fin ? 1123 : Math.floor(lerp(1080, 1123, clamp((lt - 0.9) / 2.9, 0, 1)));
      F.plate(W / 2 - 60, TOP + 8, 120, 34);
      text(secs(s), W / 2, TOP + 14, fin ? C.gold : C.white, { align: 'center', scale: 3 });
      if (fin) text('COURSE PB · 6TH', W / 2, TOP + 48, C.white, { align: 'center', spacing: 2 });
    },
  });
  shot({ d: 2.8, log: [[0.4, 2.7, '26 SEP 2026', 'WHERE DID THAT COME FROM']], draw(lt) { bokehBG([C.skyL, C.f4, C.white], lt, [C.skyL, C.sky, C.f3]); A.portrait(240, 60, 'mark', { expr: lt < 1.4 ? 'laugh' : 'smile', t: lt }); } });
  shot({
    d: 9.5, cue: ['dawn', 0, { resolve: true }], amb: ['wind', 0.6], fx: { in: 0.8, out: 1.6 }, sub: [[5.3, 9.0, '…YOU’RE GOING TOO FAST.', 'motif']],
    draw(lt) {
      const x0 = lerp(-120, 280, lt / 9.5);
      const top = ridge(lt + 20, [[x0 + 80, 'mark', 0.75, 0], [x0 + 52, 'megan', 0.72, 1], [x0 + 24, 'david', 0.74, 2], [x0 - 4, 'lad1', 0.73, 3], [x0 - 32, 'lad2', 0.74, 4]], { sunRise: 0.6 });
      A.puppy(x0 + 108, top(x0 + 108) + 1, lt, 0.8);
      for (let i = 0; i < 3; i++) if (Math.sin(lt * 3 + i * 2) > 0.3) { const bx = x0 + 24 + i * 28, by = top(bx) - 44; disc(bx, by, 2, C.dawnL); disc(bx + 4, by - 2, 1, C.dawnL); }
    },
  });
  shot({
    d: 5.6, fx: { in: 0.8, out: 1.0 }, cue: ['title', 0, { end: true }], amb: ['none'],
    draw(lt) {
      rect(0, 0, W, H, C.black);
      F.bigNumber('THE LONG RUN', W / 2, 96, lt, 0.2, 4, C.gold, { spacing: 2, dim: C.goldD, shadow: C.b0 });
      if (lt > 1.2) text(`${D.totals.runs.toLocaleString('en-GB')} RUNS · ${D.totals.km.toLocaleString('en-GB')} KM · ${D.totals.parkruns} PARKRUNS`, W / 2, 142, C.white, { align: 'center', spacing: 2 });
      if (lt > 2.2) text('ONE PIECE OF ADVICE', W / 2, 160, C.gold, { align: 'center', spacing: 2 });
    },
  });
  const OUTTAKES = [
    ['19 JUN 2020', 'OUCH MY SHINS'],
    ['20 OCT 2022', 'FLAT TYRE AT NEWINGTON GREEN. THE CURSE OF MARY SHELLEY'], ['29 OCT 2022', 'PARKRUN – OVERSLEPT AND HUNGOVER'],
    ['18 JAN 2024', 'WATCHING TRAITORS EPISODE 2 ON THE TREADMILL'], ['28 FEB 2024', 'TODAY I LEARNED THE WALTHAMSTOW WETLANDS DO NOT OPEN UNTIL 9:30'],
    ['9 NOV 2025', 'THE RUN SAVED BY DAFT PUNK'], ['1 SEP 2026', 'ACCIDENTALLY DID THIS RUN IN AN ODD PAIR OF NIKE SHOES LOL'],
  ];
  const CREDITS = [
    ['h', 'THE LONG RUN'], ['', ''], ['k', 'STARRING'], ['n', 'MARK DEAN'], ['', ''], ['k', 'THE STRANGER IN EATON PARK'], ['n', 'AS HIMSELF'], ['', ''],
    ['k', 'MEGAN'], ['s', 'SLOW SUNDAY RUNS, COACH, PB MACHINE'], ['', ''], ['k', 'THE LADS'], ['n', 'LOUIS · KYALL · HARRY · DAVID'], ['n', 'JACK · WILL · BEN · SAM · KENAN'],
    ['n', 'TOM · STEFANO · JOEL · DAMIEN'], ['', ''], ['k', 'CLUBS'], ['n', 'HEATHSIDE · ST ALBANS STRIDERS'], ['', ''],
    ['k', 'SPECIAL THANKS'], ['s', 'EVERY PARKRUN VOLUNTEER'], ['s', 'THE PUPPY'], ['s', 'ONE KNEE, TWO ANKLES, ONE ACHILLES'], ['', ''],
    ['k', 'FROM'], ['s', '1,230 RUNS ON STRAVA · 186 PARKRUN RESULTS'], ['', ''], ['k', 'PIXELS, CODE & MUSIC'], ['s', 'CLAUDE'],
  ];
  shot({
    ch: 'Credits', d: 18, cue: ['credits'], fx: { in: 0.6 },
    draw(lt) {
      rect(0, 0, W, H, C.black);
      let y = BOT - 10 - lt * 26;
      for (const [kind, str] of CREDITS) {
        if (y > TOP + 4 && y < BOT - 10) text(str, 130, y, kind === 'h' ? C.gold : kind === 'k' ? C.g3 : kind === 'n' ? C.white : C.g4, { align: 'center', scale: kind === 'h' ? 2 : 1, spacing: kind === 'k' ? 2 : 1 });
        y += kind === 'h' ? 22 : 12;
      }
      const i = Math.min(OUTTAKES.length - 1, Math.floor(lt / 2.5)), s = lt - i * 2.5;
      const [d, q] = OUTTAKES[i];
      rect(262, TOP + 30, 200, 140, C.g0); box(262, TOP + 30, 200, 140, C.g2);
      text('OUTTAKES', 272, TOP + 38, C.g3, { spacing: 2 });
      text(`MARK'S LOG · ${d}`, 272, TOP + 60, C.strava);
      PX.wrap(q, 176).forEach((ln, j) => text(ln, 272, TOP + 76 + j * 11, C.white, { chars: (s - 0.2) * 40 - j * 30 }));
      A.runner(362, TOP + 160, { who: 'mark', k: 0.8, pose: ['limp', 'walk', 'tired', 'run', 'idle', 'run', 'jog'][i], phase: ph(lt, 1.2), expr: 'laugh' });
    },
  });
  shot({
    d: 4.6, fx: { in: 0.6, out: 1.6 },
    draw(lt) { rect(0, 0, W, H, C.black); text('SEE YOU SATURDAY. 9AM.', W / 2, 128, C.white, { align: 'center', spacing: 2, chars: (lt - 0.4) * 20 }); },
  });

  const built = FILM.build(S);
  // music + ambience cue lists derived from the shots
  const cues = [], ambs = [];
  for (const s of built.shots) {
    if (s.cue) cues.push({ t: s.start + (s.cue[1] || 0), name: s.cue[0], opts: s.cue[2] || {} });
    if (s.amb) ambs.push({ t: s.start, name: s.amb[0], level: s.amb[1] === undefined ? 1 : s.amb[1] });
    for (const [t, n] of s.sfx || []) cues.push({ t: s.start + t, sfx: n });
  }
  const chapters = built.shots.filter((s) => s.ch).map((s) => ({ name: s.ch, start: s.start }));
  return { shots: built.shots, duration: built.duration, cues, ambs, chapters };
})();
if (typeof window !== 'undefined') window.STORY = STORY;
