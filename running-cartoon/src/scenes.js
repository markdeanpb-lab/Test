// The cartoon itself: 23 scenes on one timeline. Each scene draws itself for a scene-local time `st`.
// Story beats and quotes come from Mark's Strava activity titles/descriptions and parkrun results.
'use strict';
const CARTOON = (() => {
  const { W, H, C, rect, dither, px, line, disc, tri, text, textW, wrap, dude, panel, spr, rnd, clamp, lerp, inv, easeOut, easeIn, easeInOut, backOut, box, ring } = PX;
  const K = KIT;
  const D = window.CAREER;
  const T = D.totals;
  const fmt = (n) => n.toLocaleString('en-GB');
  const ph = (t, rate = 1.5) => t * rate * Math.PI * 2;
  const MEGAN = { top: C.purple, top2: C.plum, shorts: C.ink, hair: C.blond, hairStyle: 'pony', shoe: C.pink, shoe2: C.pink, bib: false };
  const LAD = [
    { top: C.blue, hair: C.hairD, bib: false }, { top: C.green, hair: C.ink, bib: false }, { top: C.gold, hair: C.hair, bib: false },
    { top: C.red, hair: C.blond, bib: false }, { top: C.cyan, hair: C.hairD, bib: false }, { top: C.white, hair: C.ink, bib: false },
    { top: C.pink, hair: C.hair, hairStyle: 'pony', bib: false }, { top: C.navy, hair: C.hair, bib: false }, { top: C.lime, hair: C.hairD, bib: false },
  ];
  const DAY0 = Date.UTC(2016, 0, 1);
  const dayOf = (iso) => Math.round((Date.parse(iso + 'T00:00:00Z') - DAY0) / 86400000);
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const dateLabel = (day) => { const d = new Date(DAY0 + day * 86400000); return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  // cumulative counters for the HUD
  const runDays = D.runs.map((r) => r[0]);
  const runCum = []; let acc = 0; for (const r of D.runs) { acc += r[1]; runCum.push(acc); }
  const prDays = D.parkruns.map((r) => r[0]);
  const upper = (arr, v) => { let a = 0, b = arr.length; while (a < b) { const m = (a + b) >> 1; if (arr[m] <= v) a = m + 1; else b = m; } return a; };
  const statsAt = (day) => { const n = upper(runDays, day); return { runs: n, km: n ? Math.round(runCum[n - 1] / 1000) : 0, parkruns: upper(prDays, day) }; };

  // ---------- shared backdrops ----------
  function parkBackdrop(st, speed, o = {}) {
    K.sky(o.sky || [C.sky, C.sky, C.cyan], 0, 104);
    if (o.sun) K.sun(o.sun[0], o.sun[1], 9);
    K.clouds(st, speed * 0.1 + 3, 18, o.seed || 3, 4);
    if (o.city === 'london') { K.london(-((st * speed * 0.05) % 40), 104, C.silver, C.white, false); }
    if (o.city === 'stalbans') K.stAlbans(10 - st * speed * 0.03, 104, C.slate, C.sand);
    K.hills(st, speed * 0.2, 104, 5, C.green, o.seed || 1, 45, 112);
    K.trees(st, speed * 0.5, 112, 30, o.seed || 2, 1);
    K.ground(112, C.grass, C.grassD, st, speed);
    K.path(120, 13, C.sand, C.orange, st, speed);
  }
  const GY = 129; // feet on the park path

  const SCENES = [
    // 1 ─ Title
    {
      id: 'title', name: 'Title', dur: 8, music: 'title', hud: false, sfx: [[6.0, 'select'], [6.4, 'jump']],
      draw(st) {
        K.sky([C.navy, C.navy, C.blue, C.plum, C.red, C.orange], 0, 132);
        K.stars(st, 45, 70, 2);
        K.sun(255, 124 - st * 2.5, 13);
        K.hills(st, 8, 120, 10, C.plum, 2, 40, 132);
        K.hills(st, 18, 128, 7, C.teal, 5, 26, 134);
        K.road(132, 16, st, 110);
        K.ground(148, C.grass, C.grassD, st, 140);
        text('MARK DEAN IN', W / 2, 16, C.sand, { align: 'center', shadow: C.ink });
        text('THE LONG RUN', W / 2, 28, C.gold, { align: 'center', scale: 3, outline: C.ink, shadow: C.red, wave: 1.2, waveT: st });
        text('A PIXEL CARTOON ABOUT A RUNNING CAREER', W / 2, 60, C.white, { align: 'center', shadow: C.ink });
        text('2016 – 2026', W / 2, 71, C.cyan, { align: 'center', shadow: C.ink });
        let x = 160;
        if (st > 6.3) x = 160 + Math.pow(st - 6.3, 2) * 110;
        dude(x, 143, { pose: st > 6.3 ? 'sprint' : 'jog', phase: ph(st, st > 6.3 ? 2.4 : 1.4) });
        if (st < 6) { if (Math.floor(st * 2.5) % 2 === 0) text('PRESS START', W / 2, 94, C.white, { align: 'center', outline: C.ink }); }
        else text(st < 6.4 ? 'GET SET...' : 'GO!', W / 2, 94, C.lime, { align: 'center', scale: 2, outline: C.ink });
        text(`${fmt(T.runs)} RUNS · ${fmt(T.km)} KM · ${T.parkruns} PARKRUNS`, W / 2, 160, C.white, { align: 'center', outline: C.grassD });
      },
    },
    // 2 ─ Prologue: Norwich 2016, St Albans 2019, then pause
    {
      id: 'prologue', name: 'Level 0: the origin story', dur: 10, hud: [[0, '2016-05-14'], [5.4, '2016-05-14'], [5.6, '2019-09-21'], [10, '2019-11-09']], music: 'main',
      sfx: [[4.2, 'coin'], [6.6, 'pb'], [8.1, 'thud']],
      draw(st) {
        if (st < 5.4) {
          parkBackdrop(st, 40, { seed: 4 });
          const archX = W + 40 - (st - 1.0) * 72;
          if (st > 1) K.finishArch(archX, GY + 2, 'FINISH');
          for (let i = 0; i < 12; i++) {
            const x = 16 + i * 24 + Math.sin(st * 0.8 + i * 1.7) * 5 + (i > 4 ? (st > 3 ? (st - 3) * 20 : 0) : 0);
            if (i === 3) continue;
            dude(x, GY - (i % 3), { pose: 'run', phase: ph(st, 1.4 + (i % 4) * 0.08) + i, pal: LAD[i % LAD.length] });
          }
          dude(88, GY, { pose: 'run', phase: ph(st, 1.5) });
          K.banner(st, 'LEVEL 0 · THE ORIGIN STORY', 'NORWICH', '14 MAY 2016 · FIRST EVER PARKRUN', { t1: 2.6 });
          K.popup(st, 4.2, 90, 100, '26:21', C.gold, { scale: 2, life: 1.2 });
          K.caption(st, 3.0, 'FIRST PARKRUN: 26:21, FINISHING 308TH. EVERYONE STARTS SOMEWHERE.');
        } else {
          const s = st - 5.4;
          K.sky([C.plum, C.red, C.orange, C.sand], 0, 110);
          K.sun(250, 92, 10);
          K.stAlbans(10, 110, C.navy, C.sand);
          K.ground(110, C.grassD, C.teal, s, 30);
          K.path(118, 14, C.sand, C.orange, s, 50);
          dude(150, 128, { pose: 'run', phase: ph(s, 1.55) });
          K.banner(s, 'SEPTEMBER 2019', 'ST ALBANS', '5 PARKRUNS · NEW PB: 24:56', { y: 20 });
          K.popup(s, 1.2, 150, 100, 'PB!', C.lime, { scale: 2, life: 1.3 });
          if (st > 8.0) {
            const a = clamp((st - 8.0) / 0.3, 0, 1);
            dither(0, 0, W, H, C.ink, 0.6 * a);
            rect(140, 60, 12, 34, C.white); rect(168, 60, 12, 34, C.white);
            text('THEN THE WORLD HIT PAUSE.', W / 2, 108, C.white, { align: 'center', outline: C.ink, chars: (st - 8.1) * 30 });
          }
        }
      },
    },
    // 3 ─ Lockdown London 2020
    {
      id: 'lockdown', name: 'World 1: Lockdown London', dur: 13, hud: [[0, '2020-05-14'], [5.5, '2020-06-19'], [8.2, '2020-07-13'], [11, '2020-08-17'], [13, '2021-07-31']], music: 'main',
      sfx: [[5.6, 'bonk'], [11.2, 'coin']],
      draw(st) {
        const moving = !(st > 8.2 && st < 11);
        const sp = moving ? 34 : 0;
        const tt = st < 8.2 ? st : st < 11 ? 8.2 : st - 2.8;
        parkBackdrop(tt, 30, { city: 'london', seed: 6 });
        if (st < 5.6) dude(120, GY, { pose: 'jog', phase: ph(st, 1.1) });
        else if (st < 8.2) {
          dude(120, GY, { pose: 'limp', phase: ph(st, 1.1) });
          K.bubble(st, 5.7, 122, GY - 26, 'OUCH MY SHINS');
          text('19 JUN 2020', 122, GY - 58, C.white, { align: 'center', outline: C.ink });
        } else if (st < 11) {
          dude(120, GY, { pose: 'idle', phase: ph(st, 0.6), dir: 1, mouth: true });
          dude(150, GY, { pose: 'wave', phase: ph(st, 0.5), dir: -1, pal: { top: C.teal, bib: false, hair: C.ink } });
          K.bubble(st, 8.4, 120, GY - 26, 'BLAH BLAH...', { t1: 9.4 });
          K.bubble(st, 9.5, 150, GY - 26, '...AND THEN...');
          // the watch keeps running
          panel(214, 40, 70, 28, C.ink, C.white, C.slate);
          text('MOVING TIME', 249, 44, C.cyan, { align: 'center' });
          const secs = Math.floor((st - 8.2) * 70);
          text(`${Math.floor(21 + secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 249, 54, C.white, { align: 'center' });
          K.caption(st, 8.3, '"NOT-ON-THE-PACE RUN": STARTED TALKING TO SOMEONE IN THE PARK AND FORGOT TO PAUSE.', { who: 'JUL 2020' });
        } else {
          dude(120, GY, { pose: 'run', phase: ph(st, 1.6) });
        }
        void sp;
        K.banner(st, 'WORLD 1', 'LOCKDOWN LONDON', '2020 · THE FIRST RUN ON THE LOG', { t1: 2.4 });
        K.logCard(st, 2.6, 60, 30, 200, { t1: 5.5, date: '14 MAY 2020', title: 'LUNCH RUN', desc: 'THE VERY FIRST STRAVA ACTIVITY.', stat: '5.07 KM · 7:29 /KM' });
        if (st > 11) {
          const u = easeInOut(clamp((st - 11.1) / 1.2, 0, 1));
          panel(70, 26, 180, 44, C.ink, C.gold, C.plum);
          text('PACE, MAY → AUG 2020', 160, 30, C.sand, { align: 'center' });
          const secs = Math.round(lerp(449, 317, u));
          text(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} /KM`, 160, 40, C.white, { align: 'center', scale: 2 });
          const y20 = D.years.find((y) => y.year === 2020);
          text(`2020: ${y20.runs} RUNS · ${y20.km} KM`, 160, 58, C.cyan, { align: 'center' });
        }
      },
    },
    // 4 ─ Finsbury Park, parkrun returns, the PB staircase
    {
      id: 'finsbury', name: 'World 2: Finsbury Park', dur: 14, hud: [[0, '2021-08-21'], [3.4, '2021-09-18'], [6.3, '2021-09-18'], [13.3, '2022-08-27']], music: 'main',
      sfx: [[2.2, 'beep'], [2.7, 'go'], ...D.finsburyStair.slice(1).map((_, k) => [6.3 + (k + 1) * 0.5, 'coin']), [13.4, 'pb']],
      draw(st) {
        if (st < 6) {
          parkBackdrop(st > 2.7 ? st - 2.7 : 0, st > 2.7 ? 40 : 0, { seed: 8 });
          // start line crowd
          for (let i = 0; i < 9; i++) {
            const run = st > 2.7;
            const x = 40 + i * 26 + (run ? Math.sin(st + i) * 4 : 0);
            if (i === 4) continue;
            dude(x, GY - (i % 2), { pose: run ? 'run' : 'idle', phase: ph(st, run ? 1.5 : 0.7) + i, pal: LAD[i % LAD.length] });
          }
          if (st > 3.2 && st < 6) {
            const x = lerp(-20, 330, (st - 3.2) / 2.8);
            dude(x, GY + 1, { pose: 'run', phase: ph(st, 1.7), pal: { top: C.navy, stripe: C.white, hair: C.ink, bib: false } });
            K.bubble(st, 3.6, 146, GY - 26, '!!');
          }
          dude(144, GY, { pose: st > 2.7 ? 'run' : 'idle', phase: ph(st, st > 2.7 ? 1.5 : 0.7) });
          if (st > 1.6 && st < 2.7) text(st < 2.2 ? 'READY...' : 'GO!', W / 2, 60, C.lime, { align: 'center', scale: 2, outline: C.ink });
          K.banner(st, 'WORLD 2', 'FINSBURY PARK', 'AUG 2021 · PARKRUN IS BACK!', { t1: 1.6 });
          K.caption(st, 3.4, 'ED MILIBAND @ PARKRUN', { who: 'LOG · 18 SEP 2021', t1: 6 });
          return;
        }
        const s = st - 6;
        K.sky([C.cyan, C.sky, C.sky], 0, H);
        K.clouds(st, 4, 30, 11, 4);
        K.hills(0, 0, 150, 6, C.green, 3, 40, H);
        const steps = D.finsburyStair;
        const n = steps.length;
        const x0 = 18, sw = 19, top = 50, bottom = 170, sh = (bottom - top - 20) / n;
        const k = Math.min(n - 1, Math.floor(Math.max(0, s - 0.3) / 0.5));
        for (let i = 0; i < n; i++) {
          const x = x0 + i * sw, y = Math.round(bottom - (i + 1) * sh);
          rect(x, y, sw, bottom - y, C.brick);
          for (let yy = y + 2; yy < bottom; yy += 4) for (let xx = x + ((yy >> 2) % 2) * 4; xx < x + sw - 1; xx += 8) rect(xx, yy, 3, 1, C.brickD);
          rect(x, y, sw, 2, i <= k ? C.gold : C.sand);
          if (i > k) { const bob = Math.round(Math.sin(st * 5 + i) * 1.5); K.icon('coin', x + sw / 2 - 2, y - 10 + bob); }
          if (i === n - 1) K.flagPole(x + sw - 4, y, st, C.lime, 24);
        }
        // hop between steps
        const u = clamp((s - 0.3 - k * 0.5) / 0.5, 0, 1);
        const kk = s < 0.3 ? 0 : k;
        const fromX = x0 + Math.max(0, kk - 1) * sw + sw / 2, toX = x0 + kk * sw + sw / 2;
        const fromY = bottom - Math.max(1, kk) * sh, toY = bottom - (kk + 1) * sh;
        const hx = kk === 0 ? toX : lerp(fromX, toX, u), hy = kk === 0 ? toY : lerp(fromY, toY, u) - Math.sin(u * Math.PI) * 10;
        dude(hx, hy, { pose: u < 1 && kk > 0 ? 'run' : 'cheer', phase: ph(st, 2) });
        K.popup(st, 6.3 + kk * 0.5 + 0.5, hx, hy - 28, 'PB!', C.lime);
        panel(8, 16, 118, 40, C.ink, C.gold, C.plum);
        text('FINSBURY PARK PB', 67, 20, C.sand, { align: 'center' });
        text(steps[kk].time, 67, 30, C.white, { align: 'center', scale: 2 });
        const d = new Date(steps[kk].date + 'T00:00:00Z');
        text(`${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`, 67, 46, C.cyan, { align: 'center' });
        text('THE PB STAIRCASE', 312, 20, C.white, { align: 'right', outline: C.ink });
        text(`${n - 1} PBS IN 11 MONTHS`, 312, 30, C.gold, { align: 'right', outline: C.ink });
      },
    },
    // 5 ─ 2022 race map
    {
      id: 'races2022', name: 'World 3: the 2022 race map', dur: 14, hud: [[0, '2022-08-27'], [13, '2022-10-09']], music: 'main',
      sfx: [0, 1, 2, 3, 4, 5].flatMap((k) => [[1.0 + k * 2.1, 'coin'], ...(k < 5 ? [[2.2 + k * 2.1, 'jump']] : [])]),
      draw(st) {
        rect(0, 0, W, H, C.teal);
        for (let i = 0; i < 40; i++) { const x = rnd(i, 3) * W, y = 70 + rnd(i, 4) * 110; if (Math.sin(st * 2 + i) > 0.5) rect(x, y, 3, 1, C.cyan); }
        // land masses
        disc(70, 118, 46, C.grass); disc(130, 108, 40, C.grass); disc(200, 104, 44, C.grass); disc(262, 96, 42, C.grass); disc(300, 70, 26, C.grass);
        rect(40, 104, 260, 40, C.grass);
        for (let i = 0; i < 26; i++) K.tree(30 + rnd(i, 8) * 270, 90 + rnd(i, 9) * 70, 1, C.grassD, C.green);
        const nodes = [[44, 128], [98, 104], [152, 132], [206, 102], [256, 126], [292, 78]];
        const races = [
          ['FIRST HALF MARATHON (SOLO)', '1:51:17', '"RETIRING MY RUNNING SHOES"', '31 MAR 2022'],
          ['VITALITY LONDON 10K', '43:54', 'FIRST PROPER 10K RACE', '2 MAY 2022'],
          ['HACKNEY HALF', '1:46:30', '"THE KNEE HELD OUT – GREAT ATMOSPHERE"', '22 MAY 2022'],
          ['ASICS LONDON 10K', '43:26', '36 KUDOS', '10 JUL 2022'],
          ['GREAT NORTH RUN', '1:38:12', '"FANTASTIC ATMOSPHERE"', '11 SEP 2022'],
          ['ROYAL PARKS HALF', '1:39:57', '"A STRONG FIRST 10K WHICH I PAID FOR"', '9 OCT 2022'],
        ];
        for (let i = 0; i < nodes.length - 1; i++) {
          const [ax, ay] = nodes[i], [bx, by] = nodes[i + 1];
          for (let s = 0; s <= 1; s += 0.08) px(lerp(ax, bx, s), lerp(ay, by, s), C.sand);
        }
        // landmarks
        ring(86, 84, 9, C.white); for (let a = 0; a < 8; a++) line(86, 84, 86 + Math.cos(a * 0.785) * 9, 84 + Math.sin(a * 0.785) * 9, C.silver); line(86, 84, 81, 97, C.white); line(86, 84, 91, 97, C.white);
        rect(230, 118, 44, 3, C.silver); for (let i = 0; i < 5; i++) line(232 + i * 10, 118, 236 + i * 10, 110, C.silver); // Tyne bridge-ish
        const at = (st - 1.0) / 2.1;
        const k = clamp(Math.floor(at), 0, 5);
        const f = clamp((at - k) / 0.55 - 0.45 / 0.55, 0, 1);
        for (let i = 0; i < nodes.length; i++) {
          const [x, y] = nodes[i];
          disc(x, y, 5, i <= k && st > 1 ? C.gold : C.slate); disc(x, y, 3, i <= k && st > 1 ? C.strava : C.dark);
          if (i <= k && st > 1) K.flagPole(x + 3, y - 3, st + i, C.red, 14);
        }
        let mx, my;
        if (k < 5 && at - k > 0.55) { const [ax, ay] = nodes[k], [bx, by] = nodes[k + 1]; mx = lerp(ax, bx, f); my = lerp(ay, by, f) - Math.sin(f * Math.PI) * 8; }
        else { [mx, my] = nodes[k]; }
        dude(mx, my - 2, { pose: at - k > 0.55 && k < 5 ? 'run' : 'cheer', phase: ph(st, 2) });
        panel(4, 13, 186, 20, C.ink, C.gold, C.plum);
        text('WORLD 3 · THE RACE MAP · 2022', 97, 19, C.sand, { align: 'center' });
        if (st > 0.9) {
          const r = races[k];
          const y = 36;
          panel(4, y, 250, 42, C.white, C.ink, C.silver);
          text(r[0], 10, y + 5, C.ink);
          text(r[1], 10, y + 15, C.strava, { scale: 2 });
          text(r[3], 248, y + 19, C.slate, { align: 'right' });
          text(r[2], 10, y + 32, C.slate, { chars: (st - 1 - k * 2.1) * 50 });
        }
      },
    },
    // 6 ─ Bloopers 2022
    {
      id: 'bloopers', name: 'Bloopers 2022', dur: 10, hud: [[0, '2022-10-09'], [10, '2022-12-31']], music: 'main',
      sfx: [[0.1, 'whoosh'], [2.5, 'whoosh'], [5.0, 'whoosh'], [7.5, 'whoosh']],
      draw(st) {
        rect(0, 0, W, H, C.dark);
        K.checker(14, 11, W - 28, H - 11, 8, C.dark, C.ink);
        K.filmFrame(st);
        const cards = [
          ['blank', 'FLAT TYRE AT NEWINGTON GREEN', '"THE CURSE OF MARY SHELLEY"', '20 OCT 2022'],
          ['volcano', 'MT. VESUVIUS HILL SPRINTS', '(NOT REALLY)', '19 SEP 2022'],
          ['toilet', 'TOILETS LOCKED AT FINSBURY PARK', 'A 2.3 KM RUN OF PURE URGENCY', '13 JUN 2022'],
          ['bed', 'PARKRUN – OVERSLEPT AND HUNGOVER', 'STILL RAN 23:44', '29 OCT 2022'],
        ];
        const i = Math.min(3, Math.floor(st / 2.5));
        const s = st - i * 2.5;
        const [ic, title, sub, date] = cards[i];
        text('BLOOPERS · 2022', W / 2, 16, C.gold, { align: 'center', scale: 2, outline: C.ink });
        const a = backOut(clamp(s / 0.35, 0, 1));
        const cy = Math.round(lerp(200, 40, a));
        panel(34, cy, 252, 116, C.white, C.ink, C.silver);
        const ICW = ic === 'blank' ? 0 : K.ICON[ic][0].length, ICH = ic === 'blank' ? 8 : K.ICON[ic].length;
        const sc = 5;
        const pal = ic === 'bed' ? { w: C.slate, p: C.pink, b: C.blue } : ic === 'volcano' ? { b: C.brick, r: C.red, w: C.silver } : {};
        if (ic !== 'blank') K.icon(ic, 160 - (ICW * sc) / 2, cy + 10, sc, pal);
        if (ic === 'toilet') K.icon('lock', 190, cy + 28, 3);
        if (ic === 'bed') { K.icon('zzz', 200 + Math.sin(st * 4) * 2, cy + 8 - (st * 10) % 8, 2, { k: C.blue }); }
        if (ic === 'blank') {
          rect(120, cy + 8, 80, 34, C.white);
          const by = cy + 34;
          ring(136, by, 10, C.ink); ring(136, by, 9, C.ink); rect(125, by + 8, 22, 3, C.ink);
          for (let a = 0; a < 6; a++) line(136, by, 136 + Math.cos(a) * 8, by + Math.sin(a) * 5, C.silver);
          ring(184, by, 10, C.ink); ring(184, by, 9, C.ink); for (let a = 0; a < 6; a++) line(184, by, 184 + Math.cos(a) * 8, by + Math.sin(a) * 8, C.silver);
          line(136, by, 156, by, C.strava, 2); line(156, by, 172, by - 14, C.strava, 2); line(150, by - 14, 172, by - 14, C.strava, 2); line(136, by, 150, by - 14, C.strava, 2); line(150, by - 14, 156, by, C.strava, 2);
          line(172, by - 14, 184, by, C.strava, 2); line(172, by - 14, 170, by - 20, C.ink, 2); rect(166, by - 21, 8, 2, C.ink); rect(146, by - 17, 8, 2, C.ink);
          text('PSSSHHH', 116, cy + 10 + Math.round(Math.sin(st * 20)), C.red);
        }
        const ty = cy + 18 + ICH * sc;
        text(title, 160, ty, C.ink, { align: 'center', chars: (s - 0.2) * 40 });
        text(sub, 160, ty + 12, C.strava, { align: 'center', chars: (s - 0.6) * 40 });
        text(date, 160, ty + 24, C.slate, { align: 'center' });
      },
    },
    // 7 ─ Track Tuesdays 2023
    {
      id: 'track', name: 'World 4: Track Tuesdays', dur: 14, hud: [[0, '2023-01-17'], [5.6, '2023-03-18'], [7.3, '2023-04-15'], [9.0, '2023-05-21'], [10.7, '2023-07-01'], [12.4, '2023-07-14'], [14, '2023-07-21']], music: 'main',
      sfx: [5.6, 7.3, 9.0, 10.7, 12.4].map((t) => [t, 'pb']),
      draw(st) {
        K.sky([C.navy, C.blue, C.plum], 0, 60);
        K.stars(st, 20, 30, 7);
        for (const lx of [30, 290]) { rect(lx, 12, 3, 50, C.slate); rect(lx - 5, 10, 13, 5, C.white); dither(lx - 20, 15, 43, 40, C.sand, 0.12); }
        rect(0, 50, W, 26, C.dark);
        K.crowd(st, 56, 0, W, 5, 6);
        rect(0, 72, W, 4, C.white);
        K.ground(76, C.grass, C.grassD, st, 20, 92);
        rect(0, 92, W, 50, C.track);
        for (let l = 0; l < 6; l++) rect(0, 94 + l * 8, W, 1, C.white);
        K.ground(142, C.grass, C.grassD, st, 60);
        const off = (st * 60) % 60;
        for (let i = 0; i < 6; i++) { const x = W - ((i * 60 + st * 40) % (W + 60)); text(String(i + 1), x, 144, C.white); }
        void off;
        const repTotal = 16;
        const rep = Math.min(repTotal, 1 + Math.floor(st * 1.2));
        if (st > 2.9) {
          panel(4, 14, 102, 30, C.ink, C.cyan, C.teal);
          text('TUESDAY TRACK', 55, 18, C.cyan, { align: 'center' });
          text('2 × (8 × 400M)', 55, 27, C.white, { align: 'center' });
          text(`REP ${rep}/${repTotal}`, 55, 36, C.sand, { align: 'center' });
        }
        // club mates lapping
        for (let i = 0; i < 3; i++) {
          const x = ((st * (58 + i * 4) + i * 90) % (W + 40)) - 20;
          dude(x, 108 + i * 10, { pose: 'run', phase: ph(st, 1.8) + i, pal: LAD[i + 3] });
        }
        if (st > 2.8 && st < 5.6) {
          const u = clamp((st - 3.0) / 2.2, 0, 1);
          const mx = lerp(140, 300, u), my = lerp(122, 96, u);
          dude(mx, my, { pose: 'sprint', phase: ph(st, 2.4) });
          panel(250, 44, 66, 26, C.brickD, C.sand, C.hairD);
          text('PUB QUIZ', 283, 48, C.sand, { align: 'center' });
          text('TONIGHT', 283, 58, C.white, { align: 'center' });
          K.icon('pint', 234, 54, 1);
          K.caption(st, 2.9, '"7 × 800" – MISSED THE LAST ONE AS HAD TO RUSH OFF TO PUB QUIZ!', { who: '4 APR 2023', t1: 5.6 });
        } else dude(150 + Math.sin(st) * 10, 122, { pose: 'sprint', phase: ph(st, 2.2) });
        K.banner(st, 'WORLD 4', 'TRACK TUESDAYS', '2023 · INTERVALS UNDER THE LIGHTS', { t1: 2.6 });
        const ach = [
          ['SUB 20 PARKRUN!', '19:25 · FINSBURY · MAR 2023'],
          ['SUB 40 10K!', '39:35 · BATTERSEA · APR 2023'],
          ['HACKNEY HALF', '1:35:30 · MAY 2023'],
          ['19:00 PARKRUN', 'LORDSHIP REC · JUL 2023'],
          ['GOLDEN STAG MILE', '1ST IN HEAT · 5:12 · JUL 2023'],
        ];
        ach.forEach(([a, b], i) => K.toast(st, 5.6 + i * 1.7, 1.65, a, b, { y: 48 }));
      },
    },
    // 8 ─ Richmond Marathon 2023 (boss 1)
    {
      id: 'richmond', name: 'Boss 1: Richmond Marathon', dur: 14, hud: [[0, '2023-07-16'], [4.2, '2023-08-20'], [11.2, '2023-09-10']], music: 'boss', restart: true,
      sfx: [[4.2, 'zap'], [11.7, 'fanfare'], [11.7, 'cheer']],
      draw(st) {
        if (st < 4.2) {
          K.sky([C.sky, C.cyan, C.white], 0, 120);
          K.clouds(st, 8, 20, 2, 4);
          K.hills(st, 10, 110, 8, C.green, 2, 40, 120);
          K.ground(120, C.grass, C.grassD, st, 80);
          K.path(128, 12, C.sand, C.orange, st, 80);
          dude(250, 137, { pose: 'run', phase: ph(st, 1.5) });
          panel(12, 14, 170, 104, C.ink, C.white, C.slate);
          text('LONG RUNS, SUMMER 2023', 97, 18, C.sand, { align: 'center' });
          const runs = [['16 JUL', 26], ['24 JUL', 28], ['30 JUL', 30], ['6 AUG', 32], ['20 AUG', 32]];
          runs.forEach(([d, km], i) => {
            const u = clamp((st - 0.2 - i * 0.45) / 0.5, 0, 1);
            const y = 30 + i * 16;
            text(d, 18, y + 2, C.silver);
            rect(58, y, Math.round((km / 32) * 100 * easeOut(u)), 9, i === 1 ? C.red : C.strava);
            if (u > 0.9) text(`${km} KM`, 62, y + 1, C.white);
          });
          K.caption(st, 1.1, '"I HAVE BECOME DEATH, DESTROYER OF LONG RUNS" (28 KM)', { who: '24 JUL 2023' });
          return;
        }
        const s = st - 4.2;
        const fin = st > 11.2;
        K.sky([C.orange, C.sand, C.yellow], 0, 110);
        const hp = clamp(1 - s / 7, 0.08, 1);
        K.sun(262, 40, 18, C.gold, C.orange, true);
        K.heatShimmer(st, 60, 118);
        K.hills(st, 10, 104, 6, C.lime, 7, 40, 112);
        K.trees(st, 30, 112, 36, 3, 1, C.green, C.lime);
        rect(0, 112, W, 8, C.sky); for (let i = 0; i < 20; i++) px((i * 23 + st * 30) % W, 115, C.white);
        K.ground(120, C.lime, C.green, st, 70);
        K.path(128, 12, C.sand, C.orange, st, fin ? 20 : 70);
        const archX = fin ? lerp(380, 200, clamp((st - 11.2) / 0.8, 0, 1)) : 999;
        if (fin) K.finishArch(archX, 139, 'FINISH');
        const mx = fin ? lerp(110, 230, clamp((st - 11.3) / 1.2, 0, 1)) : 110;
        dude(mx, 138, { pose: fin && st > 12.5 ? 'cheer' : s > 5 ? 'tired' : 'run', phase: ph(st, s > 5 && !fin ? 0.9 : 1.4) });
        if (!fin) K.sweat(mx + 2, 112, st);
        // boss bars
        panel(170, 12, 146, 20, C.ink, C.red, C.plum);
        text('BOSS: THE HEATWAVE', 176, 16, C.gold);
        rect(176, 25, 134, 3, C.red);
        panel(4, 12, 146, 20, C.ink, C.lime, C.teal);
        text('MARK', 10, 16, C.lime);
        rect(10, 25, 134, 3, C.dark); rect(10, 25, Math.round(134 * hp), 3, hp < 0.3 ? C.red : C.lime);
        K.banner(s, 'BOSS 1 · 10 SEP 2023', 'RICHMOND MARATHON', 'FIRST MARATHON', { t1: 1.8, y: 36 });
        if (!fin) K.caption(st, 6.6, '"THAT WAS REALLY HARD – MANAGED TO PASS THROUGH THE END WHEN THEY STARTED TO CANCEL THE RACE DUE TO TOO MANY CASUALTIES."', { who: 'LOG' });
        if (st > 12.0) {
          K.bigText(st, 12.0, 'FIRST MARATHON!', 38, 2, C.gold);
          K.bigText(st, 12.3, '3:55:11', 56, 3, C.white);
          K.confetti(st, 70, 5, 11.8);
        }
      },
    },
    // 9 ─ Christmas Day 2023, 100th parkrun
    {
      id: 'xmas', name: '100th parkrun, Christmas Day 2023', dur: 8, hud: [[0, '2023-12-25']], music: 'xmas', restart: true,
      sfx: [[2.6, 'pb']],
      draw(st) {
        K.sky([C.navy, C.blue, C.slate], 0, 96);
        rect(0, 96, W, 22, C.blue);
        for (let i = 0; i < 30; i++) px((rnd(i, 2) * W + st * 12) % W, 98 + rnd(i, 3) * 18, C.white);
        K.ground(118, C.snow, C.silver, st, 60);
        K.path(126, 12, C.silver, C.white, st, 60);
        K.trees(st, 40, 118, 60, 5, 1, C.teal, C.snow);
        dude(210, 136, { pose: 'run', phase: ph(st, 1.7), pal: { top: C.red, stripe: C.gold, hair: C.ink, bib: false } });
        text('IRONMAN', 210, 100, C.gold, { align: 'center', outline: C.ink });
        dude(120, 136, { pose: 'run', phase: ph(st, 1.7), hat: 'santa' });
        K.snow(st, 80);
        K.banner(st, 'CHRISTMAS DAY 2023', 'MILFORD WATERFRONT', 'PEMBROKESHIRE', { t1: 2.4 });
        K.toast(st, 2.6, 5.2, '100TH PARKRUN!', '2ND PLACE · 19:51', { icon: 'medal', y: 16 });
        K.bubble(st, 4.0, 122, 108, '"NO CHANCE I WAS BEATING THE IRONMAN ATHLETE ☺"', { maxW: 150 });
      },
    },
    // 10 ─ 2024 speed run
    {
      id: 'speed', name: 'World 5: Speed demon 2024', dur: 16, hud: [[0, '2024-03-30'], [4.3, '2024-03-30'], [5.58, '2024-05-19'], [6.86, '2024-06-21'], [8.14, '2024-07-23'], [9.42, '2024-08-17'], [10.7, '2024-09-01'], [11.98, '2024-09-07'], [13.26, '2024-09-29'], [14.54, '2024-10-05']], music: 'main', musicOpts: { bpm: 176 }, restart: true,
      sfx: [...Array.from({ length: 9 }, (_, k) => [[4.3 + k * 1.28 - 0.32, 'jump'], [4.3 + k * 1.28, 'bonk'], [4.35 + k * 1.28, 'coin']]).flat()],
      draw(st) {
        const ramp = clamp((st - 4) / 11, 0, 1);
        const speed = st < 4 ? 60 : lerp(90, 260, ramp);
        const dist = st < 4 ? st * 60 : 240 + (st - 4) * 90 + 0.5 * ((260 - 90) / 11) * Math.pow(Math.min(st - 4, 11), 2);
        const tt = dist / 100;
        K.sky([C.sky, C.sky, C.cyan], 0, 120);
        K.clouds(tt, 20, 20, 4, 4);
        K.hills(tt, 20, 112, 12, C.green, 3, 30, 120);
        K.hills(tt, 50, 120, 8, C.grassD, 5, 22, 128);
        // brick ground
        rect(0, 128, W, 52, C.brick);
        const off = dist % 16;
        for (let y = 128; y < H; y += 8) for (let x = -off - ((y / 8) % 2) * 8; x < W; x += 16) { rect(x, y, 15, 1, C.brickD); rect(x, y, 1, 8, C.brickD); }
        rect(0, 128, W, 2, C.sand);
        if (st < 4) {
          dude(110, 128, { pose: 'jog', phase: ph(st, 1.3), swollen: true });
          K.logCard(st, 1.4, 150, 22, 160, { date: '30 MAR 2024', title: 'OAK HILL PARKRUN WITH A SWOLLEN EYE.', desc: "UPDATE: TURNS OUT I'VE GOT SHINGLES", stat: 'STILL RAN 20:27' });
          K.banner(st, 'WORLD 5', 'SPEED DEMON', '2024', { t1: 1.0, y: 14 });
          return;
        }
        const items = [
          ['LONDON WINTER 10K', '39:50', 'FEB 2024'], ['HACKNEY HALF', '1:29:01 · SUB 90!', 'MAY 2024'],
          ['FINSBURY 5KS', '18:46 · 1ST IN RACE', 'JUN 2024'], ['GREAT CITY RACE', '"IN THE TOP 50 LAWYERS"', 'JUL 2024'],
          ['"SETTING 10K PBS ERA"', '39:10', 'AUG 2024'], ['THE BIG HALF', '1:28:45', 'SEP 2024'],
          ['FINALLY SUB 19 AT FINSBURY', '18:52', 'SEP 2024'], ['ROBIN HOOD HALF', '1:24:17', 'SEP 2024'], ['NEW 5K PB', '18:42', 'OCT 2024'],
        ];
        const mx = 110;
        let jumpY = 0, cur = -1;
        items.forEach((it, k) => {
          const th = 4.3 + k * 1.28;
          const bx = mx + (th - st) * speed;
          const hit = st >= th;
          const bounce = hit && st - th < 0.2 ? -Math.sin(((st - th) / 0.2) * Math.PI) * 4 : 0;
          if (bx > -20 && bx < W + 20) {
            const by = 78 + bounce;
            rect(bx - 7, by, 14, 14, hit ? C.brickD : C.gold);
            box(bx - 7, by, 14, 14, C.ink);
            if (!hit) text('?', bx - 2, by + 4, C.ink); else { px(bx - 5, by + 2, C.sand); px(bx + 4, by + 2, C.sand); }
          }
          const dj = st - (th - 0.32);
          if (dj >= 0 && dj < 0.64) jumpY = Math.sin((dj / 0.64) * Math.PI) * 30;
          if (hit) cur = k;
        });
        dude(mx, 128 - jumpY, { pose: 'sprint', phase: ph(st, lerp(2, 3.4, ramp)), hat: st > 4.3 + 7 * 1.28 ? 'robin' : undefined });
        if (st > 10) K.speedLines(st, 16, speed * 1.5, 70, 100);
        if (cur >= 0 && st - (4.3 + cur * 1.28) < 1.25) {
          const [a, b, c] = items[cur];
          const s2 = st - (4.3 + cur * 1.28);
          const y = Math.round(lerp(60, 20, easeOut(clamp(s2 / 0.25, 0, 1))));
          const big = b.length <= 9;
          panel(150, y, 164, 42, C.ink, C.gold, C.plum);
          text(a, 232, y + 5, C.sand, { align: 'center' });
          text(b, 232, y + (big ? 14 : 18), C.white, { align: 'center', scale: big ? 2 : 1 });
          text(c, 232, y + 32, C.cyan, { align: 'center' });
        }
      },
    },
    // 11 ─ Injury: game over
    {
      id: 'gameover', name: 'Game over (autumn 2024)', dur: 10, hud: [[0, '2024-10-15'], [3.2, '2024-11-01'], [6.2, '2024-11-20'], [10, '2024-12-16']], music: 'sad', restart: true,
      sfx: [[3.2, 'gameover'], [8.3, 'beep'], [8.7, 'beep'], [9.1, 'beep'], [9.4, 'coin'], [9.55, 'select']],
      draw(st) {
        if (st < 3.2) {
          K.sky([C.slate, C.silver, C.silver], 0, 128);
          K.hills(st, 6, 118, 8, C.teal, 3, 40, 128);
          rect(0, 128, W, 52, C.brickD);
          dude(120, 128, { pose: 'limp', phase: ph(st, 0.8) });
          if (Math.floor(st * 5) % 2) { rect(118, 125, 4, 3, C.red); }
          K.logCard(st, 0.3, 150, 24, 160, { date: '15 OCT 2024', title: 'WARMUP (PULLING OUT OF TRACK TONIGHT)', desc: 'SORE ANKLES' });
          return;
        }
        if (st < 6.2) {
          rect(0, 0, W, H, C.black);
          const a = clamp((st - 3.2) / 0.5, 0, 1);
          text('GAME OVER', W / 2, 50, C.red, { align: 'center', scale: 4, shadow: C.plum, chars: a * 9 });
          text('VALENCIA MARATHON DREAM OVER', W / 2, 96, C.white, { align: 'center', chars: (st - 4.0) * 35 });
          text('"WE WILL COME BACK STRONGER"', W / 2, 110, C.sand, { align: 'center', chars: (st - 4.8) * 35 });
          text('1 NOV 2024', W / 2, 124, C.slate, { align: 'center' });
          return;
        }
        if (st < 8.2) {
          rect(0, 0, W, H, C.dark);
          rect(0, 130, W, 50, C.slate);
          for (let x = 0; x < W; x += 20) rect(x, 130, 1, 50, C.dark);
          dude(160, 130, { pose: 'lift', phase: ph(st, 0.7) });
          for (let i = 0; i < 3; i++) { const a = ((st * 0.8 + i / 3) % 1); K.icon('zzz', 176 + a * 20, 100 - a * 40, 2, { k: C.white }); }
          K.caption(st, 6.3, '"ABSOLUTE SNOOZE FEST – CAN\'T WAIT TO BE BACK RUNNING"', { who: 'WEIGHT TRAINING · NOV 2024', y: 26 });
          return;
        }
        rect(0, 0, W, H, C.black);
        const n = Math.max(0, 3 - Math.floor((st - 8.2) / 0.4));
        text('CONTINUE?', W / 2, 60, C.white, { align: 'center', scale: 3 });
        if (st < 9.4) text(String(n || 1), W / 2, 96, C.gold, { align: 'center', scale: 4 });
        else {
          K.icon('coin', 156, lerp(20, 96, clamp((st - 9.2) / 0.2, 0, 1)), 2);
          if (st > 9.5) text('CONTINUE!', W / 2, 120, C.lime, { align: 'center', scale: 2 });
        }
      },
    },
    // 12 ─ The comeback montage
    {
      id: 'comeback', name: 'The comeback montage', dur: 10, hud: [[0, '2024-12-17'], [2.5, '2024-12-21'], [5, '2025-01-13'], [7.5, '2025-01-20']], music: 'montage', restart: true,
      sfx: [[0.05, 'whoosh'], [2.5, 'whoosh'], [5.0, 'whoosh'], [7.5, 'whoosh'], [9.0, 'cheer']],
      draw(st) {
        const i = Math.min(3, Math.floor(st / 2.5));
        const s = st - i * 2.5;
        if (i === 0) {
          K.sky([C.plum, C.red, C.orange, C.sand], 0, 112);
          K.sun(230, 108, 12);
          K.london(0, 112, C.navy, C.gold);
          K.ground(112, C.grassD, C.teal, st, 50); K.path(120, 13, C.sand, C.orange, st, 60);
          dude(130, 129, { pose: 'run', phase: ph(st, 1.5) });
          dude(154, 130, { pose: 'run', phase: ph(st, 1.5) + 1, pal: LAD[0] });
          K.caption(st, 0.2, 'RUN WITH DAVID – "ONE FOR THE COMEBACK MONTAGE"', { who: '17 DEC 2024' });
        } else if (i === 1) {
          parkBackdrop(st, s < 1.2 ? 120 : 30, { seed: 12 });
          dude(140, GY, { pose: s < 1.2 ? 'sprint' : 'tired', phase: ph(st, s < 1.2 ? 2.6 : 0.9) });
          if (s > 1.2) K.sweat(142, GY - 26, st);
          if (s < 1.2) K.speedLines(st, 10, 400, 110, 40);
          K.caption(st, 2.6, 'COMEBACK PARKRUN – "WENT FOR A FULL SEND THE FIRST LAP AND THEN BIG REGRETS ☺"', { who: '21 DEC 2024' });
        } else if (i === 2) {
          K.sky([C.sky, C.cyan, C.white], 0, 180);
          K.sun(60, 40, 10);
          tri(-40, 180, 360, 40, 360, 180, C.snow);
          for (let k = 0; k < 20; k++) { const x = (rnd(k, 5) * 360 - st * 60) % 360 + 20; K.tree(x, 180 - (x + 40) * 0.35 + 6, 1, C.teal, C.snow); }
          const x = 100 + s * 30, y = 180 - (x + 40) * 0.35;
          dude(x, y, { pose: 'ski', phase: 0, hat: 'cap', pal: { cap: C.red } });
          K.snow(st, 50);
          K.caption(st, 5.1, '"MORNING ALPINE SKI" × 6 – A WEEK IN THE DOLOMITES', { who: 'JAN 2025' });
        } else {
          K.sky([C.navy, C.plum, C.red, C.orange, C.gold], 0, 150);
          K.sun(160, 120, 16);
          K.london(0, 150, C.ink, C.gold);
          tri(90, 150, 230, 150, 160, 100, C.ink);
          dude(160, 101, { pose: 'cheer', phase: ph(st, 1.2) });
          K.bigText(st, 7.6, 'BACK TO RUNNING!', 30, 2, C.gold);
          K.caption(st, 7.7, '"THE HACKNEY HALF BUILD STARTS NOW"', { who: '20 JAN 2025' });
        }
        // montage frame
        text('THE COMEBACK MONTAGE', 6, 14, C.white, { outline: C.ink });
        if (Math.floor(st * 2) % 2) disc(W - 12, 17, 3, C.red);
        text('REC', W - 32, 14, C.white, { outline: C.ink });
      },
    },
    // 13 ─ Moving to St Albans
    {
      id: 'moving', name: 'Moving to St Albans', dur: 9, hud: [[0, '2025-03-01'], [4.2, '2025-03-01'], [9, '2025-03-15']], music: 'main', restart: true,
      sfx: [[0.5, 'cheer'], [4.2, 'whoosh']],
      draw(st) {
        if (st < 4.2) {
          parkBackdrop(st, 10, { seed: 14, city: 'london' });
          for (let i = 0; i < 4; i++) dude(40 + i * 25, GY, { pose: 'idle', phase: ph(st, 0.5) + i, pal: LAD[i + 2] });
          dude(190, GY, { pose: 'wave', phase: ph(st, 1) });
          K.logCard(st, 0.3, 64, 16, 192, { date: '1 MAR 2025', title: 'FINAL FINSBURY PARKRUN 19:10', desc: 'AFTER 95 PARKRUNS AT FINSBURY, THE FINAL ONE BEFORE MOVING TO ST ALBANS', stat: '3RD FASTEST TIME ON THE COURSE' });
          return;
        }
        const s = st - 4.2;
        K.sky([C.sky, C.cyan, C.white], 0, 120);
        K.clouds(st, 10, 16, 6, 4);
        const scroll = s * 70;
        K.london(20 - scroll, 118, C.silver, C.white, false);
        K.stAlbans(W + 60 - scroll * 0.9, 118, C.slate, C.sand);
        K.ground(118, C.grass, C.grassD, s, 90, 124);
        K.road(124, 22, s, 150);
        K.ground(146, C.grass, C.grassD, s, 150);
        const vx = 100, vy = 142 + (Math.floor(s * 8) % 2);
        rect(vx - 46, vy - 32, 58, 28, C.white); rect(vx - 46, vy - 32, 58, 2, C.silver); rect(vx - 46, vy - 6, 58, 2, C.silver);
        rect(vx + 12, vy - 24, 20, 20, C.strava); rect(vx + 22, vy - 21, 8, 8, C.cyan);
        text('MOVING', vx - 17, vy - 26, C.strava, { align: 'center' });
        text('DAY!', vx - 17, vy - 16, C.ink, { align: 'center' });
        rect(vx + 23, vy - 19, 4, 4, C.skin); rect(vx + 23, vy - 20, 4, 1, C.hair); px(vx + 26, vy - 18, C.ink);
        for (const wx of [vx - 32, vx + 22]) { disc(wx, vy - 2, 5, C.ink); disc(wx, vy - 2, 2, C.silver); px(wx + Math.round(Math.cos(s * 20) * 3), vy - 2 + Math.round(Math.sin(s * 20) * 3), C.silver); }
        K.banner(s, 'WORLD 6', 'ST ALBANS', '2025 · NEW CLUB: ST ALBANS STRIDERS', { t0: 1.8, y: 14 });
      },
    },
    // 14 ─ St Albans 2025 highlights
    {
      id: 'stalbans', name: 'St Albans 2025', dur: 13, hud: [[0, '2025-03-29'], [2.5, '2025-05-18'], [4.7, '2025-06-06'], [6.4, '2025-06-08'], [8.4, '2025-06-14']], music: 'main',
      sfx: [[0.4, 'pb'], [2.6, 'pb'], [4.8, 'pb'], [6.5, 'pb'], [8.5, 'pb'], [12.0, 'fanfare']],
      draw(st) {
        K.sky([C.sky, C.sky, C.cyan], 0, 104);
        K.clouds(st, 5, 20, 9, 3);
        K.stAlbans(-st * 3, 104, C.slate, C.sand);
        rect(0, 104, W, 8, C.blue); for (let i = 0; i < 16; i++) px((i * 29 + st * 10) % W, 107, C.white);
        K.ground(112, C.grass, C.grassD, st, 45);
        K.path(120, 13, C.sand, C.orange, st, 45);
        const cards = [
          ['RICKMANSWORTH PARKRUN · 29 MAR 2025', '18:28', 'ALL-TIME PARKRUN PB – STILL STANDING'],
          ['HACKNEY HALF · 18 MAY 2025', '1:26:28', 'HACKNEY PB · KUDOS: '],
          ['MILE END MILE · 6 JUN 2025', '5:06', 'EQUALLED MILE PB FROM LAST YEAR'],
          ['ST ALBANS HALF · 8 JUN 2025', '1:26:21', '"BRUTALLY HILLY COURSE"'],
          ['ST ALBANS PARKRUN · 14 JUN 2025', '18:53', 'FIRST SUB 19 ON HOME TURF'],
        ];
        const starts = [0.3, 2.5, 4.7, 6.4, 8.4];
        let idx = -1;
        starts.forEach((t, i) => { if (st >= t) idx = i; });
        if (st < 10.2) {
          dude(150, GY, { pose: 'run', phase: ph(st, 1.6) });
          if (idx >= 0) {
            const [a, b, c] = cards[idx];
            const s = st - starts[idx];
            const y = Math.round(lerp(-60, 18, backOut(clamp(s / 0.35, 0, 1))));
            panel(40, y, 240, 58, C.ink, C.gold, C.plum);
            text(a, 160, y + 5, C.sand, { align: 'center' });
            text(b, 160, y + 17, C.white, { align: 'center', scale: 3, shadow: C.plum });
            let c2 = c;
            if (idx === 1) c2 = c + Math.round(Math.min(1, s / 1.4) * 125);
            text(c2, 160, y + 44, C.cyan, { align: 'center' });
            if (idx === 1) for (let k = 0; k < 8; k++) { const a2 = (s * 1.3 + k / 8) % 1; K.icon('thumb', 20 + ((k * 37) % 280), 110 - a2 * 60, 1, { o: C.strava }); }
            if (idx === 0) for (let k = 0; k < 6; k++) if (Math.sin(st * 8 + k) > 0.5) text('★', 50 + k * 45, y + 30, C.gold);
          }
        } else {
          dude(130, GY, { pose: 'run', phase: ph(st, 1.4) });
          dude(155, GY + 1, { pose: 'run', phase: ph(st, 1.4) + 1.3, pal: MEGAN });
          text('PLAYER 2', 155, GY - 36, C.pink, { align: 'center', outline: C.ink });
          K.caption(st, 10.3, 'PACING MEGAN TO SUB 32... "SHE ENDED UP GETTING SUB 30!!"', { who: '3 MAY 2025' });
          K.popup(st, 12.0, 155, 58, 'SUB 30!', C.pink, { scale: 2, life: 1.0 });
        }
      },
    },
    // 15 ─ Side quest: the St Albans Sixer
    {
      id: 'pubs', name: 'Side quest: the St Albans Sixer', dur: 8, hud: [[0, '2025-08-24'], [4.9, '2025-12-07'], [6.4, '2025-12-16']], music: 'main',
      sfx: [0.9, 1.6, 2.3, 3.0, 3.7, 4.4].map((t) => [t, 'pop']).concat([[6.4, 'pb']]),
      draw(st) {
        K.sky([C.ink, C.navy, C.navy], 0, 120);
        K.stars(st, 30, 50, 4);
        const scroll = st * 60;
        for (let i = -1; i < 12; i++) {
          const x = Math.round(i * 44 - (scroll % 44));
          const gi = i + Math.floor(scroll / 44);
          const col = [C.brickD, C.dark, C.plum, C.teal][((gi % 4) + 4) % 4];
          rect(x, 56, 42, 72, col);
          rect(x + 4, 66, 12, 12, C.gold); rect(x + 24, 66, 12, 12, C.gold);
          rect(x + 16, 100, 10, 28, C.hairD);
          if (gi % 2 === 0) {
            rect(x + 30, 84, 12, 1, C.silver);
            panel(x + 32, 86, 14, 14, C.ink, C.gold, C.hair);
            K.icon('pint', x + 35, 89, 1);
          }
        }
        rect(0, 128, W, 52, C.slate);
        rect(0, 128, W, 2, C.silver);
        const drinks = Math.min(6, Math.max(0, Math.floor((st - 0.6) / 0.7) + 1));
        const wob = drinks * 0.9;
        dude(120 + Math.sin(st * 3) * wob * 2, 146 + Math.round(Math.sin(st * 5) * wob * 0.3), { pose: 'jog', phase: ph(st, 1.3), dir: Math.sin(st * 2.2) > 0.97 - drinks * 0.02 ? -1 : 1 });
        panel(4, 156, 140, 20, C.ink, C.gold, C.plum);
        text('DRINKS', 10, 163, C.sand);
        for (let k = 0; k < 6; k++) K.icon('pint', 50 + k * 15, 162, 1, k < drinks ? {} : { w: C.dark, y: C.dark });
        K.banner(st, 'SIDE QUEST · AUG 2025', 'THE ST ALBANS SIXER', '6 MILES · 6 PUBS · 6 DRINKS', { t1: 4.6, y: 14, scale: 2 });
        K.caption(st, 4.9, 'DEC 2025: THE DOUBLE SIXER – "12 MILES, 6 PUBS + 1 MULLED WINE SPOT"', { y: 16, t1: 6.3 });
        K.toast(st, 6.4, 1.6, 'NEW 5K PB!', 'STRIDERS FESTIVE 5K · 18:19 · DEC 2025', { y: 20 });
      },
    },
    // 16 ─ Manchester Marathon 2026 (final boss)
    {
      id: 'manchester', name: 'Final boss: Manchester Marathon', dur: 17, hud: [[0, '2025-12-21'], [5, '2026-04-12'], [5.2, '2026-04-19']], music: 'boss', restart: true,
      sfx: [...Array.from({ length: 18 }, (_, k) => [0.3 + k * 0.2, 'tick']), [5.0, 'zap'], [9.3, 'boom'], [10.3, 'boom'], [13.6, 'fanfare'], [13.6, 'cheer']],
      draw(st) {
        if (st < 5) {
          rect(0, 0, W, H, C.navy);
          K.checker(0, 11, W, H - 11, 10, C.navy, C.blue);
          panel(8, 16, 132, 120, C.ink, C.white, C.slate);
          text('MANCHESTER', 74, 21, C.sand, { align: 'center' });
          text('MARATHON TRAINING', 74, 30, C.sand, { align: 'center' });
          for (let k = 0; k < 18; k++) {
            const x = 18 + (k % 6) * 19, y = 44 + Math.floor(k / 6) * 26;
            const done = st > 0.3 + k * 0.2;
            text(done ? '☑' : '☐', x, y, done ? C.lime : C.slate);
            text(String(k + 1), x + 3, y + 9, C.silver, { align: 'center' });
          }
          text('18 WEEKS ☑', 74, 124, C.lime, { align: 'center' });
          const notes = [
            [1.0, 'FRED HUGHES 10 MILE', 'JAN 2026 · "HAPPY WITH THAT"'],
            [1.9, 'BATH HALF · 1:28:08', '"DREADFUL – BIG BLOW UP"'],
            [2.8, "REGENT'S PARK 10K", '39:04 · NEW 10K PB'],
            [3.7, 'SESSION NAME OF THE YEAR', '"3 PIZZA SLICES" (NO TOPPINGS)'],
          ];
          notes.forEach(([t, a, b], i) => {
            if (st < t) return;
            const y = 18 + i * 29, x = Math.round(lerp(330, 148, easeOut(clamp((st - t) / 0.3, 0, 1))));
            panel(x, y, 166, 25, C.white, C.ink, C.silver);
            text(a, x + 5, y + 4, C.ink); text(b, x + 5, y + 14, C.strava);
          });
          return;
        }
        const s = st - 5;
        const race = st < 13.2;
        const shake = st > 10.3 && st < 10.8 ? Math.round(Math.sin(st * 90) * 2) : 0;
        K.sky([C.silver, C.silver, C.white], 0, 110);
        K.mancMills(-((s * 20) % 60) + shake, 110);
        rect(0, 104, W, 8, C.dark);
        K.crowd(st, 106, 0, W, 9, 6);
        K.barrier(112, s, 90);
        const wallStop = st > 10.3 && st < 11.4;
        const roadSpeed = wallStop ? 0 : race ? 90 : 30;
        K.road(118, 30, s, roadSpeed);
        K.ground(148, C.grass, C.grassD, s, roadSpeed);
        // km markers
        const kmNow = Math.min(42.2, s * 4.2);
        for (const km of [10, 20, 30, 40]) {
          const x = 110 + (km - kmNow) * 40;
          if (x > -20 && x < W + 20 && race) { rect(x, 86, 2, 26, C.slate); panel(x - 10, 76, 22, 12, C.strava, C.white, C.white); text(`${km}K`, x + 1, 79, C.white, { align: 'center' }); }
        }
        const wallUp = clamp((st - 9.2) / 0.8, 0, 1) * (1 - clamp((st - 11.4) / 0.6, 0, 1));
        const mx = race ? 110 : lerp(110, 230, clamp((st - 13.2) / 1.4, 0, 1));
        if (wallUp > 0) {
          const wx = 150 + shake, wh = Math.round(64 * wallUp);
          rect(wx, 138 - wh, 34, wh, C.brick);
          for (let y = 138 - wh; y < 138; y += 6) for (let x = wx + ((y / 6) % 2) * 5; x < wx + 33; x += 10) rect(x, y, 9, 1, C.brickD);
          if (wh > 30) { rect(wx + 8, 138 - wh + 12, 5, 3, C.white); rect(wx + 21, 138 - wh + 12, 5, 3, C.white); px(wx + 11, 138 - wh + 13, C.ink); px(wx + 22, 138 - wh + 13, C.ink); line(wx + 7, 138 - wh + 9, wx + 13, 138 - wh + 11, C.ink); line(wx + 27, 138 - wh + 9, wx + 21, 138 - wh + 11, C.ink); rect(wx + 11, 138 - wh + 22, 12, 2, C.ink); }
          text('THE WALL', wx + 17, 138 - wh - 10, C.red, { align: 'center', outline: C.white });
        }
        if (!race) K.finishArch(lerp(380, 250, clamp((st - 13.2) / 0.8, 0, 1)), 139, 'FINISH');
        const pose = !race && st > 14.8 ? 'cheer' : st > 10.3 && st < 13.2 ? 'tired' : 'run';
        dude(mx + (st > 10.3 && st < 10.6 ? -6 : 0), 138, { pose, phase: ph(st, pose === 'tired' ? 0.8 : 1.5) });
        if (race && Math.floor(st * 4) % 2) { rect(mx - 3, 136, 2, 2, C.red); }
        if (race) {
          panel(4, 14, 112, 20, C.ink, C.white, C.slate);
          text(`KM ${kmNow.toFixed(1)}`, 10, 18, C.white);
          text('ACHILLES', 64, 18, C.red);
          rect(10, 27, 100, 3, C.dark); rect(10, 27, Math.round(100 * clamp(1 - s / 8, 0.1, 1)), 3, C.red);
        }
        K.banner(s, 'FINAL BOSS · 19 APR 2026', 'MANCHESTER MARATHON', 'GOAL: SUB 3?', { t1: 1.8, y: 36 });
        if (st > 10.6 && st < 13.2) K.bigText(st, 10.6, 'THE WALL WON.', 60, 3, C.red, { outline: C.white });
        if (st >= 13.4) {
          K.bigText(st, 13.6, '3:20:03', 40, 4, C.gold);
          K.bigText(st, 14.0, '35 MINUTES FASTER THAN RICHMOND', 76, 1, C.white);
          K.caption(st, 14.6, '"DIDN\'T HAVE IT IN ME FOR SUB 3. BUT NOW I KNOW... NOW FOR A LONG REST..."', { who: 'LOG' });
          K.confetti(st, 60, 8, 13.6);
        }
      },
    },
    // 17 ─ Crutches PB
    {
      id: 'crutches', name: 'Walk-to-the-end-of-my-street-with-crutches 2026', dur: 7, hud: [[0, '2026-04-21']], music: 'sad', restart: true,
      sfx: [[4.9, 'fanfare'], [4.9, 'cheer']],
      draw(st) {
        K.sky([C.sky, C.cyan, C.white], 0, 110);
        for (let i = 0; i < 9; i++) {
          const x = i * 38 - 10;
          rect(x, 70, 34, 42, [C.brick, C.sand, C.silver][i % 3]);
          tri(x - 2, 70, x + 36, 70, x + 17, 54, C.brickD);
          rect(x + 4, 80, 8, 8, C.cyan); rect(x + 22, 80, 8, 8, C.cyan); rect(x + 14, 96, 7, 16, C.hairD);
        }
        rect(0, 112, W, 8, C.grass);
        rect(0, 120, W, 30, C.silver); for (let x = 0; x < W; x += 16) rect(x, 120, 1, 30, C.slate);
        rect(0, 150, W, 30, C.dark);
        const u = clamp(st / 4.8, 0, 1);
        const mx = lerp(40, 250, u);
        rect(262, 108, 2, 30, C.white); rect(262, 112, 2, 2, C.red);
        if (st < 4.9) line(262, 118, 262, 138, C.red); else { line(262, 118, 256, 126, C.red); }
        dude(mx, 138, { pose: st < 4.9 ? 'crutch' : 'cheer', phase: ph(st, 0.9) });
        panel(8, 16, 304, 30, C.ink, C.gold, C.plum);
        text('WALK-TO-THE-END-OF-MY-STREET', 160, 21, C.white, { align: 'center' });
        text('-WITH-CRUTCHES 2026', 160, 32, C.white, { align: 'center' });
        panel(250, 50, 60, 24, C.ink, C.white, C.slate);
        text('CLOCK', 280, 54, C.cyan, { align: 'center' });
        const secs = Math.round(Math.min(300, u * 300));
        text(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 280, 63, C.white, { align: 'center' });
        if (st > 4.9) {
          K.bigText(st, 4.9, '5:00 · NEW PB!', 88, 2, C.gold);
          K.caption(st, 5.2, '"2 MINUTES OFF MY TIME FROM YESTERDAY"', { who: '21 APR 2026' });
          K.confetti(st, 60, 3, 4.9);
        }
      },
    },
    // 18 ─ Japan bonus stage
    {
      id: 'japan', name: 'Bonus stage: Japan', dur: 10, hud: [[0, '2026-05-16'], [6, '2026-06-06']], music: 'japan', restart: true,
      sfx: [[2.4, 'pb'], [6.0, 'sad']],
      draw(st) {
        if (st < 6) {
          K.sky([C.cyan, C.white, C.pink], 0, 110);
          K.sun(270, 30, 12, C.red, C.pink);
          tri(60, 110, 230, 110, 145, 36, C.slate);
          tri(118, 56, 172, 56, 145, 36, C.white);
          for (let i = 0; i < 5; i++) px(128 + i * 8, 57 + (i % 2), C.white);
          rect(0, 104, W, 10, C.blue); for (let i = 0; i < 18; i++) px((i * 23 + st * 14) % W, 108, C.white);
          K.ground(114, C.grass, C.grassD, st, 45);
          K.path(122, 12, C.sand, C.orange, st, 45);
          const gx = W - ((st * 45) % (W + 80)) + 40;
          rect(gx - 20, 76, 4, 46, C.red); rect(gx + 16, 76, 4, 46, C.red); rect(gx - 26, 72, 52, 4, C.red); rect(gx - 22, 82, 44, 3, C.red);
          for (let i = 0; i < 4; i++) {
            const tx = ((i * 97 - st * 45) % (W + 60) + W + 60) % (W + 60) - 30;
            rect(tx, 98, 3, 16, C.hairD); disc(tx + 1, 92, 9, C.pink); disc(tx - 5, 96, 5, C.pink); disc(tx + 7, 96, 5, C.pink);
          }
          for (let i = 0; i < 30; i++) { const x = (rnd(i, 1) * W - st * 30 + 1000) % W, y = (rnd(i, 2) * H + st * (15 + rnd(i, 3) * 10)) % H; px(x, y, C.pink); }
          dude(140, 131, { pose: 'run', phase: ph(st, 1.5) });
          K.sweat(142, 106, st);
          K.banner(st, 'BONUS STAGE · MAY 2026', 'JAPAN', 'PARKRUN EVENT #19', { t1: 2.2 });
          K.toast(st, 2.4, 3.5, 'FUTAKOTAMAGAWA PARKRUN', '19:50 · "HOT HOT HOT"', { y: 16, icon: 'medal' });
          return;
        }
        rect(0, 0, W, H, C.sand);
        K.checker(0, 11, W, H - 11, 6, C.sand, C.apricot);
        panel(12, 18, 132, 114, C.white, C.ink, C.silver);
        text('MISSING', 78, 23, C.red, { align: 'center', scale: 2 });
        rect(40, 40, 76, 40, C.silver); dude(78, 77, { pose: 'idle', phase: 0 });
        text('?', 104, 44, C.ink, { scale: 2 });
        text('MY FITNESS', 78, 85, C.ink, { align: 'center' });
        text('LAST SEEN:', 78, 96, C.slate, { align: 'center' });
        text('IN JAPAN', 78, 107, C.ink, { align: 'center', scale: 2 });
        panel(156, 18, 156, 114, C.ink, C.white, C.slate);
        text('MRK ▼', 164, 24, C.red);
        text('FITNESS STOCK', 304, 24, C.silver, { align: 'right' });
        for (let x = 0; x < 140; x += 20) rect(164 + x, 36, 1, 76, C.dark);
        const u = clamp((st - 6.2) / 1.6, 0, 1);
        const pts = [[0, 30], [20, 26], [40, 22], [55, 18], [70, 16], [85, 20], [100, 60], [115, 78], [130, 84]];
        for (let i = 0; i < pts.length - 1; i++) {
          if (pts[i + 1][0] / 130 > u) break;
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          line(166 + ax, 38 + ay * 0.85, 166 + bx, 38 + by * 0.85, i >= 5 ? C.red : C.lime, 2);
        }
        text('APR', 190, 118, C.slate); text('MAY', 256, 118, C.red); text('JUN', 290, 118, C.slate);
        K.caption(st, 7.0, '"SHOULD\'VE SOLD MY MRK STOCKS BEFORE THE GREAT CRASH OF MAY 2026"', { who: '6 JUN 2026' });
      },
    },
    // 19 ─ New character: the puppy
    {
      id: 'puppy', name: 'New character unlocked', dur: 8, hud: [[0, '2026-07-14'], [8, '2026-07-31']], music: 'main', restart: true,
      sfx: [[0.3, 'fanfare'], [1.1, 'bark'], [2.4, 'bark'], [5.8, 'zap']],
      draw(st) {
        if (st < 3.2) {
          rect(0, 0, W, H, C.plum);
          K.checker(0, 11, W, H - 11, 12, C.plum, C.purple);
          K.bigText(st, 0.1, 'NEW CHARACTER UNLOCKED!', 16, 2, C.gold);
          const b = Math.abs(Math.sin(st * 5)) * 4;
          panel(40, 44, 110, 90, C.ink, C.white, C.slate);
          K.icon(Math.floor(st * 4) % 2 ? 'puppy' : 'puppy2', 56, 60 - b, 5, { b: C.sand, k: C.ink, w: C.white });
          text('THE PUPPY', 95, 122, C.white, { align: 'center' });
          const stats = [['SPEED', 3], ['ZOOMIES', 10], ['NAPS', 9], ['CUTENESS', 10], ['LETS MARK RUN', 2]];
          panel(160, 44, 150, 90, C.ink, C.white, C.slate);
          stats.forEach(([n, v], i) => {
            text(n, 166, 52 + i * 16, C.sand);
            for (let k = 0; k < 10; k++) rect(166 + k * 13, 60 + i * 16, 11, 4, k < v * clamp((st - 0.5 - i * 0.2) / 0.4, 0, 1) ? C.lime : C.dark);
          });
          text('JUL 2026', W / 2, 150, C.white, { align: 'center' });
          return;
        }
        const s = st - 3.2;
        const back = st > 5.6;
        parkBackdrop(st, back ? -80 : 40, { city: 'stalbans', seed: 21 });
        dude(back ? 200 - (st - 5.6) * 30 : 160, GY, { pose: back ? 'sprint' : 'run', phase: ph(st, back ? 2.4 : 1.5), dir: back ? -1 : 1 });
        panel(8, 20, 70, 50, C.ink, C.white, C.slate);
        text('PUPCAM', 14, 24, C.red);
        if (!back || Math.floor(st * 6) % 2) {
          rect(12, 34, 62, 32, back ? C.dark : C.hairD);
          if (!back) { rect(20, 54, 44, 10, C.red); K.icon('puppy', 26, 46, 2, { b: C.sand, k: C.ink, w: C.white }); K.icon('zzz', 58, 38 - ((st * 8) % 6), 1, { k: C.white }); }
          else text('NO SIGNAL', 43, 46, C.white, { align: 'center' });
        }
        if (!back) K.caption(st, 3.3, '"SHORT RUN WHILST THE PUPPY SLEEPS"', { who: '14 JUL 2026' });
        else K.caption(st, 5.7, '"ABORTED RUN" – TRIED TO LEAVE THE PUPPY ALONE... WEBCAM DOWN. POWER CUT AT THE HOUSE.', { who: '23 SEP 2026' });
        void s;
      },
    },
    // 20 ─ The St Albans Claw, Stampede, Chippenham
    {
      id: 'claw', name: 'The St Albans Claw', dur: 11, hud: [[0, '2026-09-02'], [6.3, '2026-09-05'], [8.8, '2026-09-13']], music: 'main',
      sfx: [[4.8, 'fanfare'], [6.9, 'bonk'], [7.1, 'bonk'], [9.0, 'whoosh']],
      draw(st) {
        if (st < 6.3) {
          K.sky([C.sand, C.apricot, C.orange], 0, 180);
          K.hills(0, 0, 150, 20, C.green, 5, 22, H);
          K.hills(0, 0, 164, 10, C.grassD, 9, 16, H);
          K.stAlbans(-30, 120, C.brickD, C.sand);
          // the rolling head + GPS trace forming a claw
          const u = clamp((st - 0.3) / 5.6, 0, 1);
          const pts = [];
          for (let i = 0; i <= 60; i++) {
            const a = i / 60;
            const x = 30 + a * 260, y = 150 - Math.abs(Math.sin(a * Math.PI * 6)) * 40 - 10;
            pts.push([x, y]);
          }
          const n = Math.floor(u * 60);
          for (let i = 0; i < n; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], C.strava, 2);
          const [hx, hy] = pts[n];
          disc(hx, hy - 6, 6, C.skin);
          const ang = st * 8;
          px(hx + Math.cos(ang) * 3, hy - 6 + Math.sin(ang) * 3, C.ink); px(hx + Math.cos(ang + 1.2) * 3, hy - 6 + Math.sin(ang + 1.2) * 3, C.ink);
          ring(hx, hy - 15, 4, C.gold);
          rect(hx - 6, hy - 4, 12, 2, C.ink); rect(hx - 2, hy - 5, 4, 4, C.cyan);
          K.caption(st, 0.3, "LEGEND SAYS ST ALBAN'S HEAD ROLLED DOWN A HILL. BUT WHAT IF IT ROLLED DOWN 6 HILLS... WITH A GPS WATCH ATTACHED?", { y: 14, t1: 4.7 });
          K.banner(st, 'INTRODUCING · 2 SEP 2026', 'THE ST ALBANS CLAW', '10.8 KM · 6 HILLS · "JUST LIKE ALBAN, I DIED ON HOLYWELL HILL"', { t0: 4.8, y: 16, scale: 2 });
          return;
        }
        const s = st - 6.3;
        if (s < 2.5) {
          parkBackdrop(st, 60, { city: 'stalbans', seed: 30 });
          dude(140, GY, { pose: 'tired', phase: ph(st, 1) });
          for (const [i, d] of [[0, -1], [1, 1]]) {
            const a = clamp((s - 0.4 - i * 0.2) / 2, 0, 1);
            K.icon('wheel', 138 + d * a * 90, GY - 5 - Math.abs(Math.sin(a * 12)) * 8, 2);
          }
          K.banner(s, 'STAMPEDE RELAY · 5 SEP 2026', 'LAP 4 OF 4', '"FINAL LAP FOR ME. WHEELS FULLY OFF."', { y: 16, scale: 2 });
        } else {
          const s2 = s - 2.5;
          K.sky([C.sky, C.cyan, C.white], 0, 110);
          K.clouds(st, 10, 20, 12, 3);
          K.hills(st, 10, 106, 8, C.green, 11, 40, 114);
          rect(0, 106, W, 8, C.grass);
          K.road(114, 30, st, 70);
          K.ground(144, C.grass, C.grassD, st, 70);
          const px2 = 200 + s2 * 40;
          dude(px2, 136, { pose: 'run', phase: ph(st, 1.7), pal: { top: C.gold, bib: false, hair: C.ink } });
          line(px2 - 2, 112, px2 - 2, 70, C.ink);
          K.icon('balloon', px2 - 6, 56, 2, { p: C.red });
          text('1:30', px2 - 1, 62, C.white, { align: 'center' });
          dude(120, 136, { pose: 'tired', phase: ph(st, 1.1) });
          K.bubble(st, 9.0, 122, 108, 'GOODBYE 1:30 PACE GROUP...', { maxW: 130 });
          K.banner(s2, 'CHIPPENHAM HALF · 13 SEP 2026', 'FELT GOOD UNTIL 14 KM', 'THEN THE LACK OF LONG RUNS CAUGHT UP', { y: 16, scale: 1 });
        }
      },
    },
    // 21 ─ Today
    {
      id: 'today', name: 'Today: St Albans parkrun', dur: 11, hud: [[0, '2026-09-26']], music: 'main', restart: true,
      sfx: [[5.6, 'fanfare'], [5.6, 'cheer'], [7.2, 'pop'], [8.1, 'pop'], [9.0, 'pop'], [9.8, 'pop']],
      draw(st) {
        const fin = st > 5.6;
        K.sky([C.sky, C.cyan, C.sand], 0, 104);
        K.sun(60, 40, 10);
        K.clouds(st, 4, 18, 14, 3);
        K.stAlbans(20 - st * 2, 104, C.slate, C.sand);
        K.hills(st, 4, 104, 4, C.green, 13, 40, 112);
        K.trees(st, fin ? 5 : 20, 112, 40, 23, 1);
        K.ground(112, C.grass, C.grassD, st, fin ? 10 : 50);
        K.path(120, 13, C.sand, C.orange, st, fin ? 10 : 50);
        const archX = lerp(420, 156, clamp((st - 3.0) / 2.6, 0, 1));
        K.finishArch(archX, GY + 2, 'FINISH');
        for (let i = 0; i < 5; i++) {
          const fx = lerp(170 + i * 22, 330 + i * 30, clamp((st - 2.5 - i * 0.3) / 2.5, 0, 1));
          dude(fx, GY - (i % 2), { pose: 'run', phase: ph(st, 1.7) + i, pal: LAD[(i + 4) % LAD.length] });
        }
        const mx = fin ? lerp(150, 260, clamp((st - 5.6) / 1.5, 0, 1)) : 150;
        dude(mx, GY, { pose: fin && st > 7 ? 'cheer' : 'sprint', phase: ph(st, fin && st > 7 ? 1.2 : 2.5) });
        if (!fin) K.speedLines(st, 8, 300, GY - 12, 24);
        const secs = fin ? 1123 : Math.floor(lerp(1050, 1123, clamp((st - 1.8) / 3.8, 0, 1)));
        if (st > 1.8) {
          panel(110, 14, 100, 28, C.ink, fin ? C.gold : C.white, C.slate);
          text(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 160, 20, fin ? C.gold : C.white, { align: 'center', scale: 2 });
        }
        K.banner(st, 'TODAY · 26 SEP 2026', 'ST ALBANS PARKRUN', 'EVENT #698 · PARKRUN NUMBER 186', { t1: 1.6, y: 14 });
        if (fin) {
          K.bigText(st, 5.8, 'NEW COURSE PB!', 50, 2, C.lime);
          K.bigText(st, 6.1, '18:43 · 6TH PLACE', 70, 1, C.white);
          K.caption(st, 6.8, '"WHERE DID THAT COME FROM"', { who: 'LOG · 26 SEP 2026' });
          [[70, 40, C.gold, 7.2], [250, 36, C.pink, 8.1], [110, 30, C.cyan, 9.0], [210, 44, C.lime, 9.8]].forEach(([x, y, c, t0], i) => K.firework(x, y, st - t0 + 0.6, c, 18, i + 1));
        }
      },
    },
    // 22 ─ High scores & stats
    {
      id: 'stats', name: 'High scores', dur: 16, hud: false, music: 'title', restart: true,
      sfx: [...[0.8, 1.2, 1.6, 2.0, 2.4, 2.8].map((t) => [t, 'tick']), [11.0, 'ding']],
      draw(st) {
        rect(0, 0, W, H, C.ink);
        K.stars(st, 60, H, 31);
        if (st < 5.2) {
          text('HIGH SCORES', W / 2, 12, C.gold, { align: 'center', scale: 3, outline: C.plum });
          const rows = [
            ['MILE', '5:06', 'GOLDEN STAG', 'JUL 2024'],
            ['5K', '18:19', 'STRIDERS FESTIVE 5K', 'DEC 2025'],
            ['PARKRUN', '18:28', 'RICKMANSWORTH', 'MAR 2025'],
            ['10K', '39:04', "REGENT'S PARK", 'MAR 2026'],
            ['HALF', '1:24:17', 'ROBIN HOOD HALF', 'SEP 2024'],
            ['MARATHON', '3:20:03', 'MANCHESTER', 'APR 2026'],
          ];
          rows.forEach(([a, b, c, d], i) => {
            if (st < 0.8 + i * 0.4) return;
            const y = 46 + i * 20;
            text(a, 18, y + 3, C.cyan);
            for (let x = 18 + textW(a) + 4; x < 96; x += 3) px(x, y + 9, C.slate);
            text(b, 162, y, C.white, { align: 'right', scale: 2 });
            text(c, 172, y, C.silver);
            text(d, 172, y + 8, C.slate);
          });
          return;
        }
        if (st < 10.6) {
          const s = st - 5.2;
          text('THE PARKRUN PB STAIRCASE', W / 2, 14, C.gold, { align: 'center', outline: C.plum, scale: 2 });
          const pts = D.pbStair;
          const x0 = 36, x1 = 300, y0 = 36, y1 = 110;
          const d0 = dayOf('2016-05-14'), d1 = dayOf('2025-12-31');
          const sMax = 1600, sMin = 1080;
          const X = (d) => lerp(x0, x1, (d - d0) / (d1 - d0)), Y = (sec) => lerp(y1, y0, (sMax - sec) / (sMax - sMin));
          rect(x0, y1 + 1, x1 - x0, 1, C.slate); rect(x0 - 1, y0, 1, y1 - y0 + 1, C.slate);
          for (const [sec, lab] of [[1560, '26:00'], [1440, '24:00'], [1320, '22:00'], [1200, '20:00'], [1080, '18:00']]) { text(lab, x0 - 4, Y(sec) - 3, C.slate, { align: 'right' }); dither(x0, Y(sec), x1 - x0, 1, C.dark, 0.5); }
          const u = clamp(s / 3.2, 0, 1);
          const dNow = lerp(d0, d1, u);
          let prev = null;
          for (const p of pts) {
            const d = dayOf(p.date);
            if (d > dNow) break;
            const x = X(d), y = Y(p.s);
            if (prev) { line(prev[0], prev[1], x, prev[1], C.strava); line(x, prev[1], x, y, C.strava); }
            prev = [x, y];
            rect(x - 1, y - 1, 3, 3, C.gold);
          }
          if (prev) line(prev[0], prev[1], X(dNow), prev[1], C.strava);
          for (const yy of [2016, 2018, 2020, 2022, 2024]) text(String(yy), X(dayOf(`${yy}-01-01`)), y1 + 4, C.silver, { align: 'center' });
          text('26:21', X(d0) + 4, Y(1581) - 10, C.white);
          if (u > 0.98) text('18:28', X(dayOf('2025-03-29')) - 4, Y(1108) + 5, C.gold, { align: 'right' });
          // yearly km bars
          text('KM PER YEAR ON STRAVA', W / 2, 122, C.cyan, { align: 'center' });
          const ys = D.years;
          const maxKm = Math.max(...ys.map((y) => y.km));
          ys.forEach((y, i) => {
            const bx = 30 + i * 40, a = clamp((s - 0.5 - i * 0.2) / 0.6, 0, 1);
            const bh = Math.round((y.km / maxKm) * 24 * easeOut(a));
            rect(bx, 168 - bh, 26, bh, y.year === 2026 ? C.lime : C.strava);
            text(String(y.year), bx + 13, 171, C.silver, { align: 'center' });
            if (a > 0.9) text(fmt(y.km), bx + 13, 160 - bh, C.white, { align: 'center' });
          });
          return;
        }
        const s = st - 10.6;
        text('THE GRAND TOTAL', W / 2, 14, C.gold, { align: 'center', scale: 2, outline: C.plum });
        const km = Math.round(T.km * easeOut(clamp(s / 1.6, 0, 1)));
        text(`${fmt(km)} KM`, W / 2, 34, C.white, { align: 'center', scale: 3, shadow: C.plum });
        text(`${fmt(T.runs)} RUNS ON ${fmt(T.runDays)} DAYS SINCE MAY 2020`, W / 2, 60, C.cyan, { align: 'center' });
        // UK -> Japan
        rect(10, 72, 300, 56, C.navy);
        for (let i = 0; i < 30; i++) px(12 + rnd(i, 44) * 296, 74 + rnd(i, 45) * 52, C.blue);
        disc(34, 100, 8, C.grass); disc(30, 90, 5, C.grass); disc(38, 110, 5, C.grass); disc(22, 104, 4, C.grass);
        for (let i = 0; i < 6; i++) disc(282 + i * 3, 112 - i * 6, 4, C.grass);
        const gc = (a) => [lerp(36, 286, a), 96 - Math.sin(a * Math.PI) * 18];
        for (let a = 0; a <= 1; a += 0.02) { const [x, y] = gc(a); if (Math.floor(a * 50) % 2 === 0) px(x, y, C.silver); }
        const frac = T.km / 9557;
        const pu = Math.min(frac, easeOut(clamp(s / 1.6, 0, 1)) * frac);
        for (let a = 0; a <= pu; a += 0.01) { const [x, y] = gc(a); rect(x, y, 2, 2, C.strava); }
        const [rx, ry] = gc(pu);
        dude(rx, ry, { pose: 'run', phase: ph(st, 2) });
        text('FINSBURY PARK', 14, 118, C.white);
        text('FUTAKOTAMAGAWA', 306, 76, C.white, { align: 'right' });
        text(`= ${Math.round(frac * 100)}% OF THE WAY TO THE TOKYO PARKRUN (9,557 KM)`, W / 2, 134, C.sand, { align: 'center' });
        text(`${T.parkruns} PARKRUNS · ${T.events} EVENTS · ${T.coursePBs} COURSE PBS · ${T.podiums} PODIUMS`, W / 2, 148, C.white, { align: 'center' });
        text(`AVERAGE PARKRUN ${T.meanParkrun} · LONGEST RUN ${T.longestKm.toFixed(1)} KM`, W / 2, 160, C.silver, { align: 'center' });
      },
    },
    // 23 ─ Credits
    {
      id: 'credits', name: 'Credits', dur: 18, hud: false, music: 'credits', restart: true,
      sfx: [[16.4, 'coin']],
      draw(st) {
        rect(0, 0, W, H, C.ink);
        K.stars(st, 70, 150, 40);
        K.ground(150, C.grassD, C.teal, st, 60);
        dude(150, 162, { pose: 'run', phase: ph(st, 1.5) });
        dude(122, 163, { pose: 'run', phase: ph(st, 1.5) + 1.2, pal: MEGAN });
        K.icon(Math.floor(st * 6) % 2 ? 'puppy' : 'puppy2', 168, 154, 1, { b: C.sand, k: C.ink, w: C.white });
        const lines = [
          ['h', 'THE LONG RUN'], ['', ''], ['k', 'STARRING'], ['n', 'MARK DEAN'], ['', ''],
          ['k', 'PLAYER 2'], ['n', 'MEGAN'], ['s', 'COACH · CYCLIST · PB MACHINE'], ['', ''],
          ['k', 'THE LADS'], ['n', 'LOUIS · KYALL · HARRY · DAVID'], ['n', 'JACK · WILL · BEN · SAM · KENAN'], ['n', 'TOM · STEFANO · JOEL · DAMIEN'], ['', ''],
          ['k', 'SPECIAL GUEST'], ['n', 'BRO MATT'], ['s', 'FIRST HALF MARATHON, SUB 2, PACED BY MARK'], ['', ''],
          ['k', 'CLUBS'], ['n', 'HEATHSIDE · ST ALBANS STRIDERS'], ['', ''],
          ['k', 'SPECIAL THANKS'], ['s', 'EVERY PARKRUN VOLUNTEER'], ['s', 'TREADMILL THURSDAY'], ['s', 'GRAND DESIGNS (CLOSED CAPTIONS)'],
          ['s', 'DAFT PUNK – ALIVE 2007'], ['s', 'ONE KNEE, TWO ANKLES, ONE ACHILLES'], ['', ''],
          ['k', 'DATA'], ['s', 'STRAVA LOG · PARKRUN RESULTS'], ['', ''], ['k', 'PIXELS, CODE & CHIPTUNE'], ['s', 'CLAUDE'],
        ];
        if (st < 13.6) {
          const scroll = st * 30 - 20;
          let y = 150 - scroll;
          for (const [kind, str] of lines) {
            if (y > 12 && y < 142) {
              const c = kind === 'h' ? C.gold : kind === 'k' ? C.cyan : kind === 'n' ? C.white : C.silver;
              text(str, W / 2, y, c, { align: 'center', scale: kind === 'h' ? 2 : 1 });
            }
            y += kind === 'h' ? 18 : 11;
          }
        } else {
          K.bigText(st, 13.7, 'THANKS FOR PLAYING', 36, 2, C.gold);
          K.bigText(st, 14.4, 'NEXT LEVEL: SUB 18?', 70, 2, C.lime);
          if (st > 15.2 && Math.floor(st * 2.5) % 2) text('INSERT COIN TO CONTINUE', W / 2, 108, C.white, { align: 'center' });
          if (st > 16.4) K.icon('coin', 156, lerp(0, 120, clamp((st - 16.4) / 0.25, 0, 1)), 2);
        }
      },
    },
  ];

  // ---------- timeline ----------
  let t = 0;
  for (const s of SCENES) { s.start = t; t += s.dur; }
  const duration = t;
  for (const s of SCENES) if (s.hud) s.hudKeys = s.hud.map(([t, iso]) => [t, dayOf(iso)]);
  const timeline = SCENES.map((s) => ({ start: s.start, end: s.start + s.dur, music: s.music, musicOpts: s.musicOpts, restart: s.restart, sfx: s.sfx }));

  function sceneAt(time) {
    let i = 0;
    while (i < SCENES.length - 1 && time >= SCENES[i + 1].start) i++;
    return i;
  }
  function renderAt(time) {
    time = clamp(time, 0, duration - 1e-4);
    const i = sceneAt(time);
    const s = SCENES[i];
    const st = time - s.start;
    PX.clear(C.ink);
    s.draw(st);
    if (s.hudKeys) {
      const k = s.hudKeys;
      let j = 0;
      while (j < k.length - 1 && st >= k[j + 1][0]) j++;
      let day = k[j][1];
      if (j < k.length - 1) day = Math.round(lerp(k[j][1], k[j + 1][1], easeInOut(clamp((st - k[j][0]) / (k[j + 1][0] - k[j][0]), 0, 1))));
      K.hud({ date: dateLabel(day), ...statsAt(day) });
    }
    const fade = 0.3;
    if (st < fade && i > 0) dither(0, 0, W, H, C.black, 1 - st / fade);
    else if (s.dur - st < fade) dither(0, 0, W, H, C.black, 1 - (s.dur - st) / fade);
    return i;
  }
  return { SCENES, duration, timeline, renderAt, sceneAt, W, H };
})();
if (typeof window !== 'undefined') window.CARTOON = CARTOON;
