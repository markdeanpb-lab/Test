// CHAPTER 1 - BASIC TRAINING (2020-2021)
// First run on record (14.05.2020, Camden -> Regent's Park, real GPS, with the 11-minute stop),
// sore shins, two thin years, and the first parkrun back at Finsbury (21.08.2021, 25:39).
import { RaceScene } from '../RaceScene';
import { RunProfile } from '../profile';
import firstRun from '../../../data/gps/first-run.json';
import { SKY, chapterCard, steady, fades } from '../common';
import { CodecScene } from '../Codec';
import { Card, grid } from '../Cards';
import { COL, env, smooth, fmt } from '../../hud/Hud';
import { raceClock, stamp } from '../../hud/widgets';
import { funnel, flag } from '../dressing';
import { Scene } from '../core';

/** the first run's stream, with the stop made explicit (GPS interpolation would creep 130 m) */
function firstRunProfile() {
  const d = [...firstRun.dist], t = [...firstRun.time];
  const i = t.indexOf(1764);
  // hold still from 1096 s, set off again ~59 s before the next sample
  d.splice(i, 0, d[i - 1]);
  t.splice(i, 0, 1705);
  return new RunProfile(d, t);
}

const clockOf = (T: number) => {
  // 11:46 start
  const s = 11 * 3600 + 46 * 60 + Math.floor(T);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

export function ch1(): Scene[] {
  const prof = firstRunProfile();
  const stopD = 2340.5;
  const first = new RaceScene({
    id: 'c1-first-run',
    chapter: 'BASIC TRAINING',
    arena: 'regents',
    course: 0,
    profile: prof,
    sky: SKY.grey,
    lane: 0.2,
    halfWidth: 2,
    shots: [
      { dur: 8, T: 20, cam: { mode: 'follow', dist: 46, h: 34, ang: 25, look: 0, fov: 38, shake: 0.1 }, cam2: { dist: 38, h: 28, ang: 40 }, grade: { letterbox: 1 } },
      { dur: 5, T: 420, cam: { mode: 'follow', dist: 5, h: 1.7, ang: 12, look: 1.2, fov: 40 }, cam2: { dist: 4.2 } },
      { dur: 5, T: 880, cam: { mode: 'follow', dist: 3.4, h: 0.9, ang: 82, look: 1.0, fov: 42 } },
      // CCTV: eleven minutes standing still, fast-forwarded
      { dur: 12, T: 1080, rate: 57, cam: { mode: 'fixed', at: { s: stopD - 16, off: 6, h: 6.5 }, look: 1.0, fov: 34, shake: 0 }, tag: 'cctv' },
      { dur: 5, T: 1770, cam: { mode: 'follow', dist: 4.5, h: 1.5, ang: 170, look: 1.3, fov: 38 }, cam2: { dist: 6, h: 2 } },
      { dur: 7, T: 2934, cam: { mode: 'follow', dist: 9, h: 3, ang: 150, look: 1.0, fov: 36 }, cam2: { dist: 11, h: 4 }, tag: 'end' },
    ],
    pose: (i) => (i.tag === 'cctv' && i.speed < 0.3 ? { other: { Idle_Loop: [1, i.T * 0.02] } } : {}),
    onFrame: (race, i, ctx) => {
      const h = ctx.hud, g = ctx.r.grade;
      g.saturation = 0.62;
      g.contrast = 1.08;
      if (i.shot === 0) {
        g.fade = 1 - smooth(0, 2, i.shotT);
        h.caption(['14.05.2020  11:46', 'LONDON  -  LOCKDOWN', 'FIRST RUN ON RECORD'], i.shotT, 1.5, env(i.shotT, 1.2, 8, 0.4, 0.6), 110, 150);
      }
      if (i.shot >= 1 && i.shot <= 2) raceClock(h, { T: i.T, d: i.d, alpha: 0.9 });
      if (i.tag === 'cctv') {
        g.saturation = 0;
        g.contrast = 1.25;
        g.scan = 0.8;
        g.grain = 0.12;
        g.vignette = 0.55;
        g.ca = 0.003;
        h.text('CAM 07   REGENT\'S PARK', 90, 90, { font: 'mono', size: 30, color: COL.white, alpha: 0.9, tracking: 3 });
        h.text(`14.05.2020  ${clockOf(i.T)}`, 1830, 90, { font: 'mono', size: 30, color: COL.white, align: 'right', alpha: 0.9, tracking: 3 });
        h.text('REC', 1830, 1010, { font: 'mono', size: 30, color: COL.red, align: 'right', alpha: Math.floor(i.t * 2) % 2 ? 0.2 : 0.95, tracking: 3 });
        if (i.T > 1096 && i.T < 1764) {
          const stood = i.T - 1096;
          h.text(`STATIONARY  ${fmt(stood)}`, 90, 1010, { font: 'mono', size: 34, color: COL.amber, alpha: 0.95, tracking: 3 });
        }
        h.text('>> x60', 960, 1010, { font: 'mono', size: 28, color: COL.white, align: 'center', alpha: 0.8, tracking: 3 });
      }
      if (i.tag === 'end') {
        const a = smooth(1, 2, i.shotT) * (1 - smooth(6.2, 7, i.shotT));
        h.panel(110, 700, 560, 250, { alpha: a });
        h.text('5.07 KM', 150, 780, { font: 'mono', size: 54, color: COL.white, alpha: a });
        h.text(`MOVING   37:56`, 150, 850, { font: 'mono', size: 34, color: COL.ui, alpha: a, tracking: 2 });
        h.text(`ELAPSED  48:58`, 150, 905, { font: 'mono', size: 34, color: COL.amber, alpha: a, tracking: 2 });
        g.fade = smooth(6, 7, i.shotT);
      }
      void race;
    },
    cues: [{ t: 0, kind: 'amb-city-quiet', dur: 42 }, { t: 18, kind: 'cctv', dur: 12 }],
  });

  const standing = new CodecScene({
    id: 'c1-codec-start',
    freq: '140.85',
    lines: [
      { who: 'TEMPO', text: 'Eleven minutes standing still, Stride.' },
      { who: 'PAUSE', dur: 1.2 },
      { who: 'STRIDE', text: "It's a start." },
    ],
  });

  const shins = new CodecScene({
    id: 'c1-codec-shins',
    freq: '141.12',
    ring: false,
    lines: [
      { who: 'STRIDE', text: 'LOG 19.06.2020: "Ouch my shins."' },
      { who: 'GEARBOX', text: 'Shins take longer than lungs. Easy miles. Let the legs catch up.' },
    ],
  });

  const years = new Card({
    id: 'c1-years',
    dur: 9,
    draw: (t, h) => {
      const a = env(t, 0, 9, 0.6, 0.8);
      grid(h, a * 0.6);
      const row = (y: number, yr: string, runs: number, km: number, t0: number) => {
        const u = smooth(t0, t0 + 1.6, t);
        h.text(yr, 420, y, { font: 'head', size: 90, weight: 700, color: COL.white, alpha: a * smooth(t0 - 0.4, t0, t), tracking: 6 });
        h.text(`${Math.round(runs * u)} RUNS`, 760, y, { font: 'mono', size: 64, color: COL.ui, alpha: a * smooth(t0 - 0.4, t0, t) });
        h.text(`${(km * u).toFixed(1)} KM`, 1180, y, { font: 'mono', size: 64, color: COL.ui, alpha: a * smooth(t0 - 0.4, t0, t) });
        // a year of weeks: mostly empty
        for (let w = 0; w < 52; w++) h.rect(420 + w * 21, y + 30, 16, 16, COL.uiFaint, a * smooth(t0, t0 + 1, t));
      };
      row(420, '2020', 25, 122.8, 0.8);
      row(640, '2021', 41, 232.7, 2.6);
      h.text('STRAVA TOTALS', 960, 860, { font: 'mono', size: 24, color: COL.uiDim, align: 'center', alpha: a * smooth(4, 5, t), tracking: 8 });
    },
    cues: [{ t: 0.8, kind: 'counter', dur: 1.6 }, { t: 2.6, kind: 'counter', dur: 1.6 }],
  });

  const parkrun = new RaceScene({
    id: 'c1-parkrun-back',
    arena: 'finsbury',
    profile: RunProfile.fromRuns('first-parkrun-back'),
    sky: SKY.morning,
    halfWidth: 2.2,
    lane: 0.3,
    field: { count: 210, pack: 6, packSpread: 12, kmin: 0.7, kmax: 1.35, seed: 3 },
    spectators: [{ s0: -25, s1: 10, density: 0.4 }],
    after: 'walk',
    build: (race) => {
      funnel(race, race.course.length, 30);
      flag(race, 0, -3.2, '#5c2a86', 'START');
    },
    shots: [
      { dur: 6, T: -10, cam: { mode: 'follow', dist: 14, h: 6, ang: 150, look: 0.8, fov: 38, shake: 0.2 }, cam2: { dist: 11, h: 4.5 }, grade: { letterbox: 1 } },
      { dur: 4, T: 2, cam: { mode: 'follow', dist: 6, h: 2.4, ang: 18, look: 1.1, fov: 38, shake: 0.4, ahead: 4 } },
      { dur: 4, T: 540, cam: { mode: 'follow', dist: 4.5, h: 1.6, ang: 10, look: 1.2, fov: 40 } },
      { dur: 4, T: 1180, cam: { mode: 'follow', dist: 3.4, h: 1.0, ang: 95, look: 1.1, fov: 40 } },
      { dur: 9, T: 1533, rate: 0.45, cam: { mode: 'follow', dist: 5.5, h: 1.4, ang: 168, look: 1.2, fov: 36, shake: 0.3 }, cam2: { dist: 7.5 }, tag: 'finish' },
      { dur: 9, T: 1548, cam: { mode: 'follow', dist: 16, h: 3, ang: -20, look: 1.0, fov: 30, shake: 0.2 }, cam2: { dist: 22, h: 3.5 }, grade: { letterbox: 1 }, tag: 'home' },
    ],
    onFrame: (race, i, ctx) => {
      const h = ctx.hud, g = ctx.r.grade;
      g.saturation = 0.85;
      if (i.shot === 0) {
        g.fade = 1 - smooth(0, 1.5, i.shotT);
        h.caption(['21.08.2021', 'FINSBURY PARK', 'LOG: "FIRST PARKRUN BACK"'], i.shotT, 0.8, env(i.shotT, 0.6, 6, 0.4, 0.5), 110, 150);
      }
      if (i.shot >= 1 && i.shot <= 4) raceClock(h, { T: Math.min(i.T, 1539), d: Math.min(i.d, race.o.profile.distance), alpha: i.shot === 4 ? 1 - smooth(5, 6, i.shotT) : 0.95 });
      if (i.tag === 'finish') {
        const a = smooth(4.5, 5.5, i.shotT);
        stamp(h, '25:39', { alpha: a, size: 170, sub: 'THE FIRST NUMBER', y: 560 });
      }
      if (i.tag === 'home') {
        g.saturation = 0.7;
        fades(g, i.shotT, 9, 0.6, 2.5);
      }
    },
    cues: [{ t: 0, kind: 'amb-park', dur: 36 }, { t: 7, kind: 'music', id: 'first-steps', dur: 20 }, { t: 22.5, kind: 'result', big: false }],
  });

  return [chapterCard('c1-card', 'CHAPTER 1', 'BASIC TRAINING', '2020  -  2021'), first, standing, shins, years, parkrun];
}

export { steady };
