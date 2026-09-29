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
import * as THREE from 'three';
import { lockdownScenes, briefing, toScreen } from './door';
import { makeHare } from './hare';
import { aimAt } from '../bosses/place';
import { lifeHud, equip, banner, results } from '../../hud/game';
import type { Kit } from '../../char/Runner';

/** the first run: an old t-shirt, the shorts from the drawer, the trainers from the cabinet */
const FIRST_KIT: Kit = { singlet: 0x7c8088, shorts: 0x17181c, socks: 0xeeeeea, shoes: 0xe4e2dc, hair: 0x2a1d14 };

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
    kit: FIRST_KIT,
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
      { dur: 11, T: 2934, cam: { mode: 'follow', dist: 9, h: 3, ang: 150, look: 1.0, fov: 36 }, cam2: { dist: 11, h: 4 }, tag: 'end' },
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
      // gameplay: the stamina gauge empties just before the stop and refills while he stands there
      const stam = i.T < 1096 ? Math.max(0.02, 1 - Math.pow(i.T / 1096, 1.6)) : i.T < 1764 ? Math.min(1, (i.T - 1096) / 668) : Math.max(0.1, 1 - (i.T - 1764) / 1400);
      if (i.shot >= 1 && i.tag !== 'cctv' && i.tag !== 'end') {
        h.time = i.t;
        lifeHud(h, { life: 1, stamina: stam, alpha: 1 });
        equip(h, { item: 'OLD TRAINERS', weapon: 'NONE' });
      }
      if (i.tag === 'cctv' && i.T > 1096 && i.T < 1200) banner(h, 'STAMINA DEPLETED', (i.T - 1096) / 57 + 0.05, { col: COL.red, sub: 'REST TO RECOVER', dur: 2.2 });
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
        banner(h, 'MISSION COMPLETE', i.shotT - 0.3, { col: COL.green, sub: 'FIRST RUN ON RECORD', dur: 2.6 });
        results(h, i.shotT - 2.8, {
          title: 'RESULTS',
          rows: [['DISTANCE', '5.07 KM'], ['MOVING TIME', '37:56'], ['ELAPSED', '48:58'], ['STANDING STILL', '11:02']],
          codename: 'TORTOISE',
          rank: 'Slow. But it finished.',
        });
      }
      void race;
    },
    cues: [{ t: 0, kind: 'amb-city-quiet', dur: 46 }, { t: 18, kind: 'cctv', dur: 12 }, { t: 18.3, kind: 'fail' }, { t: 35.3, kind: 'win' }, { t: 38, kind: 'result' }],
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

  let hare: ReturnType<typeof makeHare>;
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
      // the first sighting: a white hare with a pocket watch, just off the start line
      hare = makeHare();
      race.extras.add(hare.g);
    },
    shots: [
      { dur: 6, T: -10, cam: { mode: 'follow', dist: 14, h: 6, ang: 150, look: 0.8, fov: 38, shake: 0.2 }, cam2: { dist: 11, h: 4.5 }, grade: { letterbox: 1 } },
      { dur: 4.5, T: -6, cam: { mode: 'follow', dist: 3.2, h: 1.3, ang: 35, look: 1.2, fov: 40 }, tag: 'hare' },
      { dur: 4, T: 2, cam: { mode: 'follow', dist: 6, h: 2.4, ang: 18, look: 1.1, fov: 38, shake: 0.4, ahead: 4 }, tag: 'go' },
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
      // the hare: waits at the start checking its watch, then bounds off up the course at the gun
      const hs = i.T < 0 ? 9 : 9 + i.T * 7.5;
      const hp = race.place(hs, i.T < 0 ? -3.4 : -1.5);
      hare.g.position.set(hp.x, hp.y + (i.T > 0 ? Math.abs(Math.sin(i.t * 9)) * 0.45 : 0), hp.z);
      hare.g.rotation.y = i.T < 0 ? Math.atan2(-hp.dx, -hp.dz) + 0.8 : Math.atan2(hp.dx, hp.dz);
      hare.legs.forEach((l, k) => (l.rotation.x = i.T > 0 ? Math.sin(i.t * 18 + k * Math.PI) * 0.9 : 0));
      hare.watch.rotation.z = i.T < 0 ? Math.sin(i.t * 2) * 0.2 : 0;
      hare.g.visible = i.tag === 'hare' || i.tag === 'go';
      if (i.tag === 'hare') {
        aimAt(race.stage!.camera, new THREE.Vector3(hp.x, hp.y + 0.9, hp.z), 0.5 * smooth(0.3, 1.4, i.shotT));
        if (i.shotT > 1.6) {
          const [sx, sy] = toScreen(new THREE.Vector3(hp.x, hp.y + 2.4, hp.z), race.stage!.camera);
          h.text('?', sx, sy, { font: 'head', size: 110, weight: 700, color: COL.amber, align: 'center', alpha: env(i.shotT, 1.6, 4.4, 0.05, 0.3), glow: 10, shadow: true });
        }
      }
      if (i.shot >= 2 && i.shot <= 5) raceClock(h, { T: Math.min(i.T, 1539), d: Math.min(i.d, race.o.profile.distance), alpha: i.tag === 'finish' ? 1 - smooth(5, 6, i.shotT) : 0.95 });
      if (i.tag === 'finish') {
        const a = smooth(4.5, 5.5, i.shotT);
        stamp(h, '25:39', { alpha: a, size: 170, sub: 'THE FIRST NUMBER', y: 560 });
      }
      if (i.tag === 'home') {
        g.saturation = 0.7;
        fades(g, i.shotT, 9, 0.6, 2.5);
      }
    },
    cues: [{ t: 0, kind: 'amb-park', dur: 40.5 }, { t: 7.6, kind: 'alert' }, { t: 11.5, kind: 'music', id: 'first-steps', dur: 20 }, { t: 27, kind: 'result', big: false }],
  });

  const [flat, door] = lockdownScenes();
  const call = new CodecScene({
    id: 'c1-codec-lockdown',
    freq: '140.85',
    lines: [
      { who: 'TEMPO', text: 'Stride. Day fifty-three. How long are you going to sit there?' },
      { who: 'STRIDE', text: "There's nowhere to go." },
      { who: 'TEMPO', text: 'The rules changed yesterday. You can go outside as much as you like.' },
      { who: 'STRIDE', text: "I don't run." },
      { who: 'PAUSE', dur: 1 },
      { who: 'TEMPO', text: 'Then this is your first mission. The objective is four metres away.' },
      { who: 'STRIDE', text: 'The front door?' },
      { who: 'TEMPO', text: "Careful. It's stronger than it looks." },
    ],
  });
  const brief = briefing('c1-brief', {
    op: 'FRONT DOOR',
    objective: 'GO OUTSIDE. RUN.',
    intel: ['Equipment: none', 'Running experience: none', 'Rules: outdoor exercise unlimited from 13.05.2020'],
    enemy: 'UNKNOWN',
    dur: 8,
  });
  // the first omen: something was waiting at the start line
  const hareCall = new CodecScene({
    id: 'c1-codec-hare',
    freq: '140.85',
    lines: [
      { who: 'STRIDE', text: 'Tempo. There was a hare at the start. A white one. With a pocket watch.' },
      { who: 'TEMPO', text: 'Red eyes?' },
      { who: 'STRIDE', text: "You've seen it." },
      { who: 'TEMPO', text: 'Everyone has. It waits at start lines. It wants you to chase it.' },
      { who: 'STRIDE', text: 'And if I do?' },
      { who: 'TEMPO', text: "Then you'll find out why nobody talks about it." },
    ],
  });
  return [chapterCard('c1-card', 'CHAPTER 1', 'BASIC TRAINING', '2020  -  2021'), flat, call, brief, door, first, standing, shins, years, parkrun, hareCall];
}

export { steady };
