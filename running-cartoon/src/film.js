// Film grammar: letterbox, subtitles in the lower bar, location titles, quotes from the log, title cards,
// and the shot timeline with per-shot grading, fades and flashback effects.
'use strict';
const FILM = (() => {
  const { W, H, C, rect, dither, text, textW, wrap, clamp, lerp, easeOut } = PX;
  const BAR = 32, TOP = BAR, BOT = H - BAR;

  // Solid caption plate: near-black with a dithered one-pixel edge so it sits softly on the picture.
  function plate(x, y, w, h, c = C.ink) {
    rect(x, y, w, h, c);
    dither(x - 1, y - 1, w + 2, 1, c, 0.5); dither(x - 1, y + h, w + 2, 1, c, 0.5);
    dither(x - 1, y, 1, h, c, 0.5); dither(x + w, y, 1, h, c, 0.5);
  }
  // A centred stat card: small label, big number, optional line under it.
  function card(cx, y, label, big, sub, lt = 99, t0 = 0, o = {}) {
    if (lt < t0) return;
    const sc = o.scale || 3, bw = textW(big, sc) + 2;
    const w = Math.max(bw, label ? textW(label) : 0, sub ? textW(sub) : 0) + 24;
    const h = 12 + (label ? 11 : 0) + 7 * sc + (sub ? 12 : 0) + 2;
    const x = Math.round(cx - w / 2);
    plate(x, y, w, h);
    rect(x, y, w, 1, o.rule || C.gold);
    let yy = y + 6;
    if (label) { text(label, cx, yy, C.g4, { align: 'center' }); yy += 11; }
    bigNumber(big, cx, yy, lt, t0, sc, o.c || C.gold, { shadow: C.black });
    yy += 7 * sc + 3;
    if (sub) text(sub, cx, yy, C.white, { align: 'center' });
  }
  function bars(amount = 1) { const h = Math.round(BAR * amount); if (h > 0) { rect(0, 0, W, h, C.black); rect(0, H - h, W, h, C.black); } }
  const STYLE = { dialog: [C.white, C.g2], whisper: [C.g4, C.g1], motif: [C.gold, C.goldD], sfx: [C.g3, C.g1], mark: [C.white, C.g2], log: [C.dawnL, C.e2] };
  // Subtitle: sits in the lower bar, fades on its first/last 0.25 s by stepping its colour.
  function subtitle(str, lt, t0, t1, style = 'dialog') {
    if (lt < t0 || lt > t1) return;
    const [c, dim] = STYLE[style] || STYLE.dialog;
    const edge = Math.min(lt - t0, t1 - lt);
    const col = edge < 0.18 ? dim : c;
    const lines = wrap(str, W - 60);
    const y0 = H - BAR + (lines.length > 1 ? 7 : 12);
    lines.forEach((ln, i) => text(ln, W / 2, y0 + i * 10, col, { align: 'center', spacing: style === 'motif' || style === 'whisper' ? 2 : 1 }));
  }
  // Location / date title, top-left of the picture, typed on and faded off.
  function chyron(lt, t0, t1, l1, l2) {
    if (lt < t0 || lt > t1) return;
    const n = (lt - t0) * 40, fade = t1 - lt < 0.3;
    const x = 16, y = TOP + 12;
    plate(x - 6, y - 5, Math.max(textW(l1), l2 ? textW(l2) : 0) + 14, l2 ? 28 : 17);
    rect(x - 6, y - 5, 2, l2 ? 28 : 17, fade ? C.goldD : C.gold);
    text(l1, x, y, fade ? C.g3 : C.white, { chars: n });
    if (l2) text(l2, x, y + 11, fade ? C.goldD : C.gold, { chars: n - [...l1].length });
  }
  // A quote from Mark's own log, as a lower-third.
  function logQuote(lt, t0, t1, date, quote, pos = 'left') {
    if (lt < t0 || lt > t1) return;
    const lines = wrap(quote, 220);
    const w = Math.max(textW(`MARK'S LOG · ${date}`), ...lines.map((l) => textW(l))) + 18;
    const h = 16 + lines.length * 10;
    const x = pos === 'right' ? W - w - 14 : 14, y = pos === 'top' ? TOP + 10 : BOT - h - 10;
    const a = easeOut(clamp((lt - t0) / 0.25, 0, 1)), fade = t1 - lt < 0.25;
    if (a < 1) dither(x, y, w, h, C.ink, a); else plate(x, y, w, h);
    rect(x, y, 2, h, C.strava);
    text(`MARK'S LOG · ${date}`, x + 9, y + 5, fade ? C.b1 : C.strava);
    let n = (lt - t0 - 0.15) * 55;
    lines.forEach((ln, i) => { text(ln, x + 9, y + 16 + i * 10, fade ? C.g3 : C.white, { chars: n }); n -= [...ln].length; });
  }
  function bigNumber(str, x, y, lt, t0, scale = 4, c = C.white, o = {}) {
    if (lt < t0 || (o.t1 !== undefined && lt > o.t1)) return;
    const a = clamp((lt - t0) / 0.25, 0, 1);
    text(str, x, Math.round(y + (1 - easeOut(a)) * 8), a < 0.5 ? (o.dim || C.g3) : c, { align: o.align || 'center', scale, shadow: o.shadow === undefined ? C.black : o.shadow, spacing: o.spacing });
  }

  // ---------- timeline ----------
  let SHOTS = [], duration = 0;
  function build(list) {
    let t = 0;
    SHOTS = list.map((s, i) => { const o = { ...s, i, start: t }; t += s.d; return o; });
    duration = t;
    return { shots: SHOTS, duration };
  }
  function shotAt(t) { let a = 0, b = SHOTS.length - 1; while (a < b) { const m = (a + b + 1) >> 1; if (SHOTS[m].start <= t) a = m; else b = m - 1; } return a; }
  function render(t) {
    t = clamp(t, 0, duration - 1e-4);
    const i = shotAt(t), s = SHOTS[i], lt = t - s.start;
    PX.target(null);
    PX.clear(C.black);
    s.draw(lt, s);
    const fx = s.fx || {};
    if (fx.heat) PX.heat(lt, typeof fx.heat === 'function' ? fx.heat(lt) : fx.heat, TOP, BOT);
    if (fx.grade) PX.grade(typeof fx.grade === 'function' ? fx.grade(lt) : fx.grade, TOP, BOT);
    if (fx.sepia) PX.sepia(typeof fx.sepia === 'function' ? fx.sepia(lt) : fx.sepia, TOP, BOT);
    if (fx.vignette) PX.vignette(fx.vignette, TOP, BOT);
    for (const c of s.chy || []) chyron(lt, ...c);
    for (const q of s.log || []) logQuote(lt, ...q);
    if (s.over) s.over(lt, s);
    bars(s.bars === undefined ? 1 : typeof s.bars === 'function' ? s.bars(lt) : s.bars);
    for (const sub of s.sub || []) subtitle(sub[2], lt, sub[0], sub[1], sub[3]);
    const fin = fx.in === undefined ? 0 : fx.in, fout = fx.out === undefined ? 0 : fx.out;
    if (fin && lt < fin) dither(0, 0, W, H, fx.white ? C.white : C.black, 1 - lt / fin);
    if (fout && s.d - lt < fout) dither(0, 0, W, H, fx.whiteOut ? C.white : C.black, 1 - (s.d - lt) / fout);
    if (fx.flash && lt < fx.flash) dither(0, TOP, W, BOT - TOP, C.white, 1 - lt / fx.flash);
    return i;
  }
  return { BAR, TOP, BOT, bars, plate, card, subtitle, chyron, logQuote, bigNumber, build, render, shotAt, get shots() { return SHOTS; }, get duration() { return duration; } };
})();
if (typeof window !== 'undefined') window.FILM = FILM;
