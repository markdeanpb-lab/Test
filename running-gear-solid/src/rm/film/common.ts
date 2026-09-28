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
  dusk: { hdri: 'qwantani_dusk_2_puresky', sun: 1.8, sunColor: 0xffa070, env: 0.7, fog: 0.004, fogColor: 0x8c7c86 },
  sunset: { hdri: 'belfast_sunset_puresky', sun: 2.2, sunColor: 0xffae70, env: 0.8, fog: 0.003, fogColor: 0xc0a090 },
  night: { hdri: 'qwantani_night_puresky', sun: 0.15, sunColor: 0x8fa8ff, env: 0.35, fog: 0.01, fogColor: 0x10141c },
  storm: { hdri: 'wasteland_clouds_puresky', sun: 1.2, env: 0.75, fog: 0.0016, fogColor: 0x7d848a, bgIntensity: 0.65 },
  winter: { hdri: 'winter_sky', sun: 1.6, sunColor: 0xffe0c0, env: 0.9, fog: 0.004, fogColor: 0xaab4c0 },
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
      entries.forEach(([date, text], i) => {
        if (t < t0) return;
        const typed = h.type(`"${text}"`, t, t0 + 0.35, 40);
        h.text(date, 240, y, { font: 'mono', size: 28, color: o.col ?? COL.ui, alpha: a, tracking: 3 });
        const lines = h.wrap(typed, 1180, { font: 'body', size: 44, weight: 600 });
        lines.forEach((ln, k) => h.text(ln, 520, y + k * 54, { font: 'body', size: 44, weight: 600, color: COL.white, alpha: a }));
        y += Math.max(1, h.wrap(`"${text}"`, 1180, { font: 'body', size: 44, weight: 600 }).length) * 54 + 34;
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
