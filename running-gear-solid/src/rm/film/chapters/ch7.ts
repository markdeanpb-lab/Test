// CHAPTER 7 - THE LINE (Dec 2025 - Apr 2026)
// The prologue's four lines, understood. 18 weeks of bricks. The Hare at Bath. Regent's Park.
// A calf. Manchester the night before: watch set to 3:00:00.
import { RaceScene } from '../RaceScene';
import { RunProfile } from '../profile';
import bathJ from '../../../data/gps/bath-half.json';
import regentsJ from '../../../data/gps/regents-park-10k.json';
import { SKY, chapterCard, logCard, boardCard, fades, textCard, steady } from '../common';
import { CodecScene } from '../Codec';
import { BricksScene } from '../Bricks';
import { Card } from '../Cards';
import { COL, env, smooth, clamp01 } from '../../hud/Hud';
import { raceClock, bossPlate, eventTag, watchInset, splitPop } from '../../hud/widgets';
import { arch } from '../dressing';
import { Ghost } from '../fx';
import { Lure } from '../bosses/Lure';
import { Scene } from '../core';

export function ch7(): Scene[] {
  const scenes: Scene[] = [chapterCard('c7-card', 'CHAPTER 7', 'THE LINE', 'DECEMBER 2025  -  APRIL 2026')];
  scenes.push(
    new CodecScene({
      id: 'c7-codec-line',
      chapter: 'THE LINE',
      freq: '140.85',
      lines: [
        { who: 'STRIDE', text: 'Three hours.' },
        { who: 'TEMPO', text: "That's not a race target." },
        { who: 'STRIDE', text: 'What is it?' },
        { who: 'PAUSE', dur: 1.2 },
        { who: 'TEMPO', text: 'A line.' },
      ],
      tail: 1.8,
    }),
    new CodecScene({
      id: 'c7-codec-wall',
      freq: '140.85',
      ring: false,
      lines: [
        { who: 'TEMPO', text: 'Every line you have drawn grew something to hold it. A clock. A ghost. A drone.' },
        { who: 'STRIDE', text: 'And this one?' },
        { who: 'TEMPO', text: 'Somewhere around thirty kilometres, this one builds a wall.' },
        { who: 'STRIDE', text: 'Out of what?' },
        { who: 'TEMPO', text: "Out of every brick you didn't lay. So lay all of them." },
      ],
    }),
    new BricksScene(),
  );

  // --- THE HARE at Bath, 15.03.2026 (1:28:08): "Dreadful - big blow up after 10k"
  const bath = RunProfile.fromGpsProfile(bathJ as any, 5288);
  let hare: Lure;
  const hareD = (T: number) => bath.distAt(T) + 11 + Math.max(0, T - 2300) * 0.3;
  scenes.push(
    new RaceScene({
      id: 'c7-bath',
      arena: 'bath',
      profile: bath,
      sky: SKY.overcast,
      halfWidth: 4,
      field: { count: 220, pack: 6, kmin: 0.85, kmax: 1.15, seed: 71 },
      build: async (race) => {
        hare = await Lure.create();
        hare.rig(-1, (race.o.halfWidth ?? 2.5) + 0.2);
        hare.prepare(hareD, 1500, 5300);
        race.extras.add(hare.runner.root);
      },
      shots: [
        { dur: 6, T: 1600, cam: { mode: 'follow', dist: 5, h: 1.7, ang: 10, look: 1.3, ahead: 6 } },
        { dur: 6, T: 2700, cam: { mode: 'follow', dist: 5, h: 1.6, ang: 12, look: 1.3, ahead: 20 } },
        { dur: 7, T: 4700, cam: { mode: 'follow', dist: 3.4, h: 1.4, ang: 155, look: 1.4 } },
      ],
      pose: (i) => ({ fatigue: clamp01((i.d - 10500) / 8000) * 0.7 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const op = 1 - smooth(3000, 3300, i.T);
        hare.opacity = 0.3 * op;
        if (op > 0) hare.pose(race.place(hareD(i.T) * (race.course.length / bath.distance), -0.7), i.T, bath.speedAt(i.T));
        eventTag(h, { name: 'BATH HALF', date: '15.03.2026', t: i.t });
        const km = Math.floor(i.d / 1000);
        raceClock(h, { T: i.T, d: i.d, hours: true, pace: bath.timeAt((km + 1) * 1000) - bath.timeAt(km * 1000) });
        bossPlate(h, { name: 'THE HARE', sub: 'STILL HERE', alpha: env(i.t, 0.5, 12, 0.5, 0.5) });
        if (i.shot === 2) {
          h.text('LOG: "DREADFUL - BIG BLOW UP AFTER 10K"', 960, 880, { font: 'mono', size: 30, color: COL.amber, align: 'center', alpha: smooth(1, 1.5, i.shotT), tracking: 3, shadow: true });
          h.text('1:28:08', 960, 945, { font: 'mono', size: 44, color: COL.white, align: 'center', alpha: smooth(2.5, 3, i.shotT), shadow: true });
          fades(ctx.r.grade, i.shotT, 7, 0.01, 0.8);
        }
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 19 }, { t: 0, kind: 'music', id: 'hare', dur: 19 }],
    }),
  );

  // --- Regent's Park 10K 21.03.2026: 39:04 PB, "thought I was well under 39"
  const rp = RunProfile.fromGpsProfile(regentsJ as any, 2344);
  scenes.push(
    new RaceScene({
      id: 'c7-regents',
      arena: 'regents',
      course: 1,
      profile: rp,
      sky: SKY.morning,
      halfWidth: 3,
      field: { count: 150, pack: 5, kmin: 0.85, kmax: 1.1, seed: 72 },
      build: (race) => {
        arch(race, race.course.length, 'FINISH', 9);
      },
      shots: [{ dur: 11, T: 2330, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 172 }, cam2: { dist: 8 } }],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        eventTag(h, { name: "REGENT'S PARK 10K", date: '21.03.2026', t: i.t });
        raceClock(h, { T: Math.min(i.T, rp.finish), d: Math.min(i.d, rp.distance) });
        if (i.finished) {
          const u = i.T - rp.finish;
          h.text('39:04  10K PB', 960, 860, { font: 'mono', size: 60, color: COL.green, align: 'center', alpha: smooth(0.2, 0.8, u), glow: 10, shadow: true });
          h.text('LOG: "THOUGHT I WAS WELL UNDER 39"', 960, 930, { font: 'mono', size: 28, color: COL.ui, align: 'center', alpha: smooth(1.2, 1.8, u), tracking: 3, shadow: true });
        }
        fades(ctx.r.grade, i.t, 11, 0.5, 1);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 11 }, { t: 6, kind: 'win-small' }],
    }),
    logCard('c7-calf', [
      ['31.03.2026', 'Got to get to the start line in one piece. Hopefully just a calf strain.'],
      ['EASTER 10K', '39:13'],
      ['FINAL LONG RUN', 'Got overtaken for the first time on the Alban way!'],
    ], { title: 'MISSION LOG  -  TAPER', hold: 1.2 }),
    boardCard('c7-board-manchester', { dur: 9, op: 'MANCHESTER MARATHON', objective: 'PRIMARY OBJECTIVE', target: '2:59:59', size: 0.9, route: 'manchester-marathon', sub: '42.2 KM  -  4:15 /KM', status: 'MARATHON PB 3:55:11   GAP 55:12', chapter: 'THE LINE' }),
  );

  // --- Salford shakeout, the evening before
  scenes.push(
    new RaceScene({
      id: 'c7-shakeout',
      arena: 'manchester',
      s0: 1500,
      profile: steady(90, 30),
      sky: SKY.dusk,
      shots: [{ dur: 9, T: 2, cam: { mode: 'follow', dist: 9, h: 2.2, ang: -150, look: 1.2, fov: 30 }, cam2: { dist: 7 }, grade: { letterbox: 1 } }],
      onFrame: (race, i, ctx) => {
        ctx.hud.caption(['THE DAY BEFORE', 'SALFORD', 'SHAKEOUT'], i.t, 1, env(i.t, 0.8, 9, 0.4, 0.6), 110, 150);
        fades(ctx.r.grade, i.t, 9, 1, 1);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-city-quiet', dur: 9 }, { t: 0, kind: 'music', id: 'night', dur: 9 }],
    }),
    new Card({
      id: 'c7-watch',
      dur: 8,
      draw: (t, h) => {
        const a = env(t, 0.3, 8, 0.8, 1);
        const set = t > 3.2;
        watchInset(h, { main: set ? '3:00:00' : '--:--:--', top: 'TARGET', sub: set ? 'READY' : 'SET TARGET', alpha: a, progress: 0, r: 280 });
        h.text('19.04.2026', 960, 950, { font: 'mono', size: 26, color: COL.uiDim, align: 'center', alpha: a * smooth(4, 5, t), tracking: 8 });
      },
      cues: [{ t: 3.2, kind: 'watch-beep' }],
    }),
  );
  void splitPop;
  void textCard;
  return scenes;
}
