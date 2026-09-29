// Shared building blocks for chapters: skies, cards (chapter titles, Strava log entries,
// mission boards), fades, synthetic profiles.
import { AtmosSpec } from '../engine/Atmos';
import { Card, grid, courseMap } from './Cards';
import { COL, Hud, env, smooth, clamp01 } from '../hud/Hud';
import { RunProfile } from './profile';
import type { Grade } from '../engine/Renderer';
import routes from '../../../public/arenas/routes-lite.json';

export const ROUTES = routes as unknown as Record<string, number[]>;

export const SKY: Record<string, AtmosSpec> = {
  dawn: { hdri: 'qwantani_dawn_puresky', sun: 2.2, sunColor: 0xffc890, env: 0.8, fog: 0.004, fogColor: 0xc9b39a, shadowSize: 40 },
  sunrise: { hdri: 'qwantani_sunrise_puresky', sun: 2.4, sunColor: 0xffd2a0, env: 0.75, fog: 0.0012, fogColor: 0xb8ab9a, bgIntensity: 0.7 },
  morning: { hdri: 'kloofendal_48d_partly_cloudy_puresky', sun: 2.5, env: 1, fog: 0.0022, fogColor: 0xaab3b9 },
  misty: { hdri: 'kloofendal_misty_morning_puresky', sun: 0.9, sunColor: 0xfff0dc, env: 0.9, fog: 0.008, fogColor: 0xa9aeae, bgIntensity: 0.7 },
  overcast: { hdri: 'kloofendal_overcast_puresky', sun: 0.5, env: 1.15, fog: 0.004, fogColor: 0xb3b8ba },
  grey: { hdri: 'overcast_soil_puresky', sun: 0.35, env: 1.0, fog: 0.006, fogColor: 0x9ea3a6 },
  clear: { hdri: 'kloofendal_43d_clear_puresky', sun: 2.3, env: 0.8, fog: 0.0015, fogColor: 0xa9b7c4, bgIntensity: 0.8 },
  hot: { hdri: 'qwantani_noon_puresky', sun: 3.4, sunColor: 0xfff0d0, env: 1, fog: 0.003, fogColor: 0xd8d0bd },
  dusk: { hdri: 'qwantani_dusk_2_puresky', sun: 1.8, sunColor: 0xffa070, env: 0.7, fog: 0.002, fogColor: 0x6c5f68, bgIntensity: 0.55 },
  sunset: { hdri: 'belfast_sunset_puresky', sun: 2.2, sunColor: 0xffae70, env: 0.8, fog: 0.003, fogColor: 0xc0a090 },
  night: { hdri: 'qwantani_night_puresky', sun: 0.15, sunColor: 0x8fa8ff, env: 0.35, fog: 0.01, fogColor: 0x10141c },
  storm: { hdri: 'wasteland_clouds_puresky', sun: 1.2, env: 0.75, fog: 0.0016, fogColor: 0x7d848a, bgIntensity: 0.65 },
  winter: { hdri: 'winter_sky', sun: 1.4, sunColor: 0xffe0c0, env: 0.75, fog: 0.0018, fogColor: 0x8f98a4, bgIntensity: 0.55 },
};

/** constant-pace profile (standing, walking, easy runs with no stream data) */
export const steady = (metres: number, seconds: number) => {
  const p = new RunProfile([0, metres], [0, seconds]);
  p.synthetic = true;
  return p;
};

/** fade the picture in over [0,a] and out over [dur-b, dur] */
export function fades(g: Grade, t: number, dur: number, a = 0.8, b = 0.8) {
  g.fade = Math.max(g.fade, 1 - Math.min(smooth(0, a, t), 1 - smooth(dur - b, dur, t)));
}

export function chapterCard(id: string, num: string, title: string, years: string, dur = 6) {
  return new Card({
    id,
    chapter: title,
    dur,
    draw: (t, h) => {
      const a = env(t, 0.3, dur - 0.2, 0.8, 1.0);
      grid(h, a * 0.6);
      h.text(num, 960, 470, { font: 'mono', size: 30, color: COL.uiDim, align: 'center', alpha: a, tracking: 16 });
      h.text(title, 960, 570, { font: 'head', size: 110, weight: 700, color: COL.white, align: 'center', alpha: a, tracking: 18, glow: 10 });
      h.line(760, 610, 760 + 400 * smooth(0.5, 1.6, t), 610, COL.ui, 2, a);
      h.text(years, 960, 670, { font: 'mono', size: 30, color: COL.ui, align: 'center', alpha: a * smooth(1, 1.8, t), tracking: 10 });
    },
    cues: [{ t: 0.2, kind: 'chapter' }],
  });
}

/**
 * Strava log entries typed on a terminal. Every quote is the athlete's own title/description.
 * entries: [date, text][]
 */
export function logCard(id: string, entries: [string, string][], o: { dur?: number; title?: string; hold?: number; col?: string } = {}) {
  const per = entries.map(([, s]) => Math.max(2.8, 1.6 + s.length / 26));
  const dur = o.dur ?? per.reduce((a, b) => a + b, 0) + (o.hold ?? 1.5) + 1.2;
  return new Card({
    id,
    dur,
    draw: (t, h) => {
      const a = env(t, 0, dur, 0.5, 0.7);
      grid(h, a * 0.4);
      h.text(o.title ?? 'MISSION LOG', 240, 250, { font: 'mono', size: 26, color: COL.uiDim, alpha: a, tracking: 8 });
      h.line(240, 272, 1680, 272, COL.uiFaint, 1, a);
      let t0 = 0.8, y = 360;
      const qx = Math.max(520, 240 + Math.max(...entries.map(([d]) => h.measure(d, { font: 'mono', size: 28, tracking: 3 }))) + 50);
      entries.forEach(([date, text], i) => {
        if (t < t0) return;
        const typed = h.type(`"${text}"`, t, t0 + 0.35, 40);
        h.text(date, 240, y, { font: 'mono', size: 28, color: o.col ?? COL.ui, alpha: a, tracking: 3 });
        const lw = 1680 - qx;
        const lines = h.wrap(typed, lw, { font: 'body', size: 44, weight: 600 });
        lines.forEach((ln, k) => h.text(ln, qx, y + k * 54, { font: 'body', size: 44, weight: 600, color: COL.white, alpha: a }));
        y += Math.max(1, h.wrap(`"${text}"`, lw, { font: 'body', size: 44, weight: 600 }).length) * 54 + 34;
        t0 += per[i];
      });
    },
    cues: entries.map((_, i) => ({ t: 0.8 + per.slice(0, i).reduce((a, b) => a + b, 0), kind: 'log-line' })),
  });
}

/** Mission board: an objective with a course map. size 0..1 scales the objective number. */
export function boardCard(id: string, o: { dur: number; op: string; objective: string; target: string; sub?: string; route?: string; size?: number; status?: string; statusCol?: string; strike?: number; chapter?: string }) {
  return new Card({
    id,
    chapter: o.chapter,
    dur: o.dur,
    draw: (t, h) => {
      const a = env(t, 0, o.dur, 0.6, 0.8);
      grid(h, a);
      h.panel(150, 150, 1620, 780, { alpha: a * 0.9 });
      h.text('OPERATION', 200, 225, { font: 'mono', size: 24, color: COL.uiDim, alpha: a, tracking: 8 });
      h.text(o.op, 200, 285, { font: 'head', size: 56, weight: 700, color: COL.white, alpha: a, tracking: 6 });
      if (o.route && ROUTES[o.route]) {
        courseMap(h, ROUTES[o.route], 1200, 220, 520, 520, { alpha: a * 0.9, progress: clamp01((t - 0.5) / 2.5), lw: 3 });
        h.text('ROUTE: STRAVA GPS', 1460, 790, { font: 'mono', size: 20, color: COL.uiDim, alpha: a, align: 'center', tracking: 4 });
      }
      h.text(o.objective, 200, 400, { font: 'mono', size: 26, color: COL.uiDim, alpha: a, tracking: 8 });
      const sz = 120 + 200 * (o.size ?? 1);
      const reveal = smooth(0.9, 1.6, t);
      h.text(o.target, 190, 400 + sz * 0.95, { font: 'head', size: sz, weight: 700, color: COL.white, alpha: a * reveal, tracking: 4, glow: 20 });
      if (o.strike) {
        const w = h.measure(o.target, { font: 'head', size: sz, weight: 700, tracking: 4 });
        h.line(180, 400 + sz * 0.6, 180 + w * clamp01(o.strike), 400 + sz * 0.6, COL.red, 10, a);
      }
      if (o.sub) h.text(o.sub, 200, 400 + sz * 0.95 + 70, { font: 'mono', size: 30, color: COL.ui, alpha: a * reveal, tracking: 4 });
      if (o.status) h.text(o.status, 200, 880, { font: 'mono', size: 30, color: o.statusCol ?? COL.amber, alpha: a * smooth(1.8, 2.3, t), tracking: 8 });
    },
    cues: [{ t: 0.9, kind: 'board' }],
  });
}

/** plain typed lines on black (dialogue without portraits, dates, captions) */
export function textCard(id: string, lines: { t: number; text: string; y?: number; size?: number; col?: string; font?: 'mono' | 'head' | 'body'; out?: number }[], dur: number, o: { cues?: { t: number; kind: string }[]; chapter?: string } = {}) {
  return new Card({
    id,
    chapter: o.chapter,
    dur,
    draw: (t, h: Hud) => {
      for (const l of lines) {
        if (t < l.t) continue;
        const a = env(t, l.t, l.out ?? dur, 0.35, 0.6);
        h.text(h.type(l.text, t, l.t, 26), 960, l.y ?? 540, { font: l.font ?? 'body', size: l.size ?? 52, weight: 600, color: l.col ?? COL.white, align: 'center', alpha: a, tracking: 1 });
      }
    },
    cues: o.cues ?? lines.map((l) => ({ t: l.t, kind: 'type' })),
  });
}

/**
 * Lane-1 path around the OSM athletics track nearest to (x,z): the track polygon pulled in
 * towards its centre by `inset` metres, repeated for `laps` laps, starting at the point
 * nearest to `start` (x,z) and running anticlockwise (as UK track races do).
 */
export function trackPath(areas: { k: string; p: number[] }[], x: number, z: number, laps: number, inset = 1.5) {
  let best: number[] | null = null, bd = Infinity;
  for (const a of areas) {
    if (a.k !== 'track') continue;
    let cx = 0, cz = 0;
    for (let i = 0; i < a.p.length; i += 2) {
      cx += a.p[i];
      cz += a.p[i + 1];
    }
    cx /= a.p.length / 2;
    cz /= a.p.length / 2;
    const d = Math.hypot(cx - x, cz - z);
    if (d < bd) {
      bd = d;
      best = a.p;
    }
  }
  if (!best) return [];
  const p = best;
  let cx = 0, cz = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    cx += p[i * 2];
    cz += p[i * 2 + 1];
  }
  cx /= n;
  cz /= n;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const px = p[i * 2], pz = p[i * 2 + 1];
    const r = Math.hypot(px - cx, pz - cz);
    const k = Math.max(0, (r - inset) / r);
    pts.push([cx + (px - cx) * k, cz + (pz - cz) * k]);
  }
  // orientation: anticlockwise seen from above (x east, z south => signed area < 0 in x,z)
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    area += ax * bz - bx * az;
  }
  if (area > 0) pts.reverse();
  // resample evenly (~1 m) then repeat
  const ring: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n];
    const l = Math.hypot(bx - ax, bz - az), m = Math.max(1, Math.round(l));
    for (let k = 0; k < m; k++) ring.push([ax + ((bx - ax) * k) / m, az + ((bz - az) * k) / m]);
  }
  let s0 = 0, sd = Infinity;
  ring.forEach(([rx, rz], i) => {
    const d = Math.hypot(rx - x, rz - z);
    if (d < sd) {
      sd = d;
      s0 = i;
    }
  });
  const out: number[] = [];
  const total = Math.round(ring.length * laps);
  for (let i = 0; i <= total; i++) {
    const [rx, rz] = ring[(s0 + i) % ring.length];
    out.push(rx, rz);
  }
  return out;
}

/** mission list card: objectives with status */
export function missionList(id: string, items: { name: string; status: 'COMPLETE' | 'OPEN' | 'INCOMPLETE' | 'CANCELLED'; note?: string }[], dur: number, title = 'MISSION STATUS', chapter?: string) {
  return new Card({
    id,
    chapter,
    dur,
    draw: (t, h) => {
      const a = env(t, 0, dur, 0.6, 1);
      grid(h, a * 0.6);
      h.text(title, 300, 200, { font: 'mono', size: 28, color: COL.uiDim, alpha: a, tracking: 10 });
      h.line(300, 225, 1620, 225, COL.uiFaint, 1, a);
      items.forEach((it, i) => {
        const t0 = 0.7 + i * 0.55;
        const ai = a * smooth(t0, t0 + 0.4, t);
        const y = 320 + i * 86;
        const col = it.status === 'COMPLETE' ? COL.green : it.status === 'OPEN' ? COL.amber : COL.red;
        h.text(it.name, 300, y, { font: 'head', size: 54, weight: 700, color: COL.white, alpha: ai, tracking: 4 });
        h.text(it.status, 1620, y, { font: 'mono', size: 36, color: col, align: 'right', alpha: ai, tracking: 6, glow: it.status === 'OPEN' ? 10 : 0 });
        if (it.note) h.text(it.note, 1180, y, { font: 'mono', size: 26, color: COL.uiDim, align: 'right', alpha: ai, tracking: 2 });
      });
    },
    cues: items.map((_, i) => ({ t: 0.7 + i * 0.55, kind: 'tick' })),
  });
}

/** lat/lon -> arena-local metres (same equirectangular projection as tools/geo/build-arena.ts) */
export function llToLocal(origin: [number, number], lat: number, lon: number): [number, number] {
  const DEG = Math.PI / 180, R = 6378137;
  const k = Math.cos(origin[0] * DEG) * DEG * R;
  return [(lon - origin[1]) * k, -(lat - origin[0]) * DEG * R];
}

/** CONTINUE? 9 ... YES. The game-over screen after a boss wins a round. */
export function continueCard(id: string, o: { title: string; line?: string; log?: string; dur?: number }) {
  const dur = o.dur ?? 8;
  return new Card({
    id,
    dur,
    draw: (t, h) => {
      const a = env(t, 0, dur, 0.3, 0.5);
      h.text('GAME OVER', 960, 250, { font: 'head', size: 120, weight: 700, color: COL.red, align: 'center', alpha: a * smooth(0, 0.3, t), tracking: 20, glow: 14 });
      h.text(o.title, 960, 330, { font: 'mono', size: 38, color: COL.white, align: 'center', alpha: a, tracking: 8 });
      if (o.line) h.text(o.line, 960, 400, { font: 'body', size: 46, weight: 600, color: COL.white, align: 'center', alpha: a * smooth(0.6, 1, t) });
      if (o.log) h.text(o.log, 960, 460, { font: 'mono', size: 32, color: COL.amber, align: 'center', alpha: a * smooth(1, 1.4, t) });
      const n = Math.max(0, 9 - Math.floor(Math.max(0, t - 1.8) * 1.6));
      const chosen = t > 5.2;
      h.text('CONTINUE?', 960, 620, { font: 'head', size: 90, weight: 700, color: COL.white, align: 'center', alpha: a * smooth(1.6, 1.9, t), tracking: 14 });
      if (!chosen) h.text(String(n), 960, 760, { font: 'mono', size: 140, color: COL.amber, align: 'center', alpha: a * smooth(1.8, 2, t), glow: 12 });
      h.text('YES', 800, 900, { font: 'head', size: 70, weight: 700, color: chosen ? COL.green : COL.white, align: 'center', alpha: a * smooth(2, 2.3, t) * (chosen ? 0.6 + 0.4 * Math.sin(t * 20) : 1), tracking: 8, glow: chosen ? 12 : 0 });
      h.text('NO', 1120, 900, { font: 'head', size: 70, weight: 700, color: COL.uiDim, align: 'center', alpha: a * smooth(2, 2.3, t), tracking: 8 });
      if (!chosen) h.text('>', 720, 900, { font: 'head', size: 70, weight: 700, color: COL.white, align: 'center', alpha: a * smooth(2, 2.3, t) * (Math.floor(t * 3) % 2 ? 1 : 0.3) });
    },
    cues: [{ t: 0.1, kind: 'gameover' }, ...[2.4, 3.0, 3.6, 4.3].map((t) => ({ t, kind: 'tick' })), { t: 5.2, kind: 'select' }],
  });
}

/** a PS-style memory card screen: save slots, a cursor, LOAD or SAVE with a progress bar */
export function memoryCard(id: string, o: { mode: 'LOAD' | 'SAVE'; slots: { name: string; sub: string; icon: string }[]; pick: number; dur: number; after?: string; chapter?: string }) {
  return new Card({
    id,
    chapter: o.chapter,
    dur: o.dur,
    draw: (t, h) => {
      const a = env(t, 0, o.dur, 0.4, 0.6);
      h.rect(0, 0, 1920, 1080, '#05070c', a);
      grid(h, a * 0.25);
      h.text('MEMORY CARD  SLOT 1', 180, 150, { font: 'mono', size: 34, color: COL.uiDim, alpha: a, tracking: 8 });
      h.text(o.mode === 'LOAD' ? 'LOAD GAME' : 'SAVE GAME', 180, 230, { font: 'head', size: 80, weight: 700, color: COL.white, alpha: a, tracking: 14 });
      const cur = t < 1.6 ? 0 : o.pick;
      o.slots.forEach((sl, i) => {
        const y = 360 + i * 150;
        const sel = i === cur;
        h.panel(180, y - 70, 1560, 120, { alpha: a * (sel ? 1 : 0.6), col: sel ? COL.amber : undefined });
        h.rect(210, y - 50, 80, 80, sel ? COL.amber : '#333a44', a);
        h.text(sl.icon, 250, y + 8, { font: 'mono', size: 38, color: '#05070c', align: 'center', alpha: a });
        h.text(sl.name, 330, y - 2, { font: 'head', size: 48, weight: 700, color: sel ? COL.white : COL.ui, alpha: a, tracking: 4 });
        h.text(sl.sub, 330, y + 38, { font: 'mono', size: 30, color: COL.uiDim, alpha: a, tracking: 3 });
      });
      const q = 2.4, go = 3.6;
      if (t > q) {
        const qa = a * smooth(q, q + 0.2, t);
        h.text(o.mode === 'LOAD' ? 'LOAD THIS DATA?' : 'SAVE TO THIS SLOT?', 960, 360 + o.slots.length * 150 + 20, { font: 'head', size: 50, weight: 700, color: COL.white, align: 'center', alpha: qa, tracking: 8 });
        h.text(t > go ? '> YES' : '  YES', 900, 360 + o.slots.length * 150 + 90, { font: 'mono', size: 44, color: t > go ? COL.amber : COL.ui, align: 'right', alpha: qa });
        h.text('NO', 1020, 360 + o.slots.length * 150 + 90, { font: 'mono', size: 44, color: COL.uiDim, alpha: qa });
      }
      if (t > go + 0.4) {
        const pa = a * smooth(go + 0.4, go + 0.6, t);
        const k = clamp01((t - go - 0.5) / 1.8);
        const done = k >= 1;
        h.rect(0, 0, 1920, 1080, 'rgba(0,0,0,0.93)', pa);
        h.text(done ? (o.mode === 'LOAD' ? 'LOAD COMPLETE' : 'SAVE COMPLETE') : o.mode === 'LOAD' ? 'LOADING...' : 'SAVING... DO NOT REMOVE MEMORY CARD', 960, 500, { font: 'mono', size: 44, color: done ? COL.green : COL.white, align: 'center', alpha: pa, tracking: 6 });
        h.rect(560, 560, 800, 26, 'rgba(255,255,255,0.12)', pa);
        h.rect(560, 560, 800 * k, 26, done ? COL.green : COL.amber, pa);
        if (o.after && done) h.text(o.after, 960, 700, { font: 'mono', size: 40, color: COL.ui, align: 'center', alpha: pa * smooth(go + 2.6, go + 3.1, t), tracking: 10 });
      }
    },
    cues: [{ t: 1.6, kind: 'select' }, { t: 3.6, kind: 'select' }, { t: 5.9, kind: 'item-get' }],
  });
}
