// EPILOGUE - STILL STANDING. Understated: crutches, small races, the Phantom leaving STRIDE this
// time, an unexpected 18:43, the defeated bosses, the mission log with two lines still open,
// silence, a new mission. STRIDE runs again.
import { RaceScene } from '../RaceScene';
import { RunProfile } from '../profile';
import chipJ from '../../../data/gps/chippenham-half.json';
import sapJ from '../../../data/gps/st-albans-parkrun.json';
import { SKY, logCard, fades, missionList, textCard, steady } from '../common';
import { Card, grid } from '../Cards';
import { COL, env, smooth, clamp01, fmt } from '../../hud/Hud';
import { raceClock, eventTag } from '../../hud/widgets';
import { Ghost } from '../fx';
import { crack } from './ch5';
import { Scene } from '../core';

export function epilogue(): Scene[] {
  const scenes: Scene[] = [];
  scenes.push(
    textCard('e0-card', [{ t: 0.6, text: 'EPILOGUE', font: 'mono', col: COL.uiDim, size: 30, y: 470, out: 5 }, { t: 1.2, text: 'STILL STANDING', font: 'head', size: 96, y: 580, out: 5 }], 5.6, { chapter: 'EPILOGUE' }),
    logCard('e1-crutches', [['AFTER MANCHESTER', 'Walk to the end of my street with crutches - 5.00 (New PB). 2 minutes off my time from yesterday.']], { hold: 1.8 }),
    logCard('e2-small', [
      ['JAPAN PARKRUN  19:50', 'hot hot hot'],
      ['ST ALBANS STAMPEDE', 'wheels fully off'],
      ['NEW ROUTE', 'Introducing: The St Albans Claw'],
    ], { title: 'MISSION LOG  -  SUMMER 2026', hold: 1 }),
  );

  // --- Chippenham Half 13.09.2026: the Phantom returns and leaves STRIDE at 14 km
  const chip = RunProfile.fromGpsProfile(chipJ as any, 5531);
  const phD = (T: number) => Math.max(0, T) * (chip.distance / 5400);
  let phantom: Ghost;
  scenes.push(
    new RaceScene({
      id: 'e3-chippenham',
      arena: 'chippenham',
      profile: chip,
      sky: SKY.overcast,
      halfWidth: 3.5,
      field: { count: 140, pack: 4, seed: 91 },
      build: async (race) => {
        phantom = await Ghost.create(0x5ff3ff, true, 0.16);
        phantom.prepare(phD, 3000, 5000);
        race.extras.add(phantom.runner.root);
      },
      shots: [
        { dur: 6, T: 3350, cam: { mode: 'follow', dist: 4, h: 1.5, ang: 160, look: 1.3 } },
        { dur: 11, T: 3950, rate: 0.8, cam: { mode: 'follow', dist: 5, h: 1.7, ang: 10, look: 1.4, ahead: 25, fov: 32 }, cam2: { dist: 6 } },
      ],
      pose: (i) => ({ fatigue: clamp01((i.d - 14000) / 5000) * 0.9 }),
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        const pd = phD(i.T);
        phantom.opacity = 0.18;
        phantom.pose(race.place(pd * (race.course.length / chip.distance), -0.9), i.T, chip.distance / 5400);
        eventTag(h, { name: 'CHIPPENHAM HALF', date: '13.09.2026', t: i.t });
        raceClock(h, { T: i.T, d: i.d, hours: true });
        const lead = chip.distAt(i.T) / (chip.distance / 5400) - i.T;
        h.text('1:30 PACE GROUP', 116, 212, { font: 'mono', size: 22, color: COL.cyan, tracking: 5, shadow: true });
        h.text(lead >= 0 ? `${fmt(lead)} AHEAD` : `${fmt(-lead)} BEHIND`, 116, 270, { font: 'mono', size: 48, color: lead >= 0 ? COL.green : COL.red, shadow: true });
        if (i.shot === 1) {
          h.text('LOG: "GOODBYE TO THE 1.30 PACE GROUP"', 960, 880, { font: 'mono', size: 30, color: COL.amber, align: 'center', alpha: smooth(3, 3.6, i.shotT), tracking: 3, shadow: true });
          h.text('1:32:11', 960, 945, { font: 'mono', size: 44, color: COL.white, align: 'center', alpha: smooth(5, 5.5, i.shotT), shadow: true });
          h.text('NO GOAL IS OWNED FOREVER', 960, 1010, { font: 'mono', size: 24, color: COL.uiDim, align: 'center', alpha: smooth(7, 8, i.shotT), tracking: 8, shadow: true });
          fades(ctx.r.grade, i.shotT, 11, 0.01, 1);
        }
      },
      cues: [{ t: 0, kind: 'amb-crowd', dur: 17, level: 0.4 }, { t: 0, kind: 'music', id: 'memory', dur: 17 }],
    }),
  );

  // --- St Albans parkrun 26.09.2026: 18:43, "Where did that come from"
  const sap = RunProfile.fromGpsProfile(sapJ as any, 1123);
  scenes.push(
    new RaceScene({
      id: 'e4-stalbans',
      arena: 'st-albans',
      course: 1,
      rawGps: true,
      profile: sap,
      sky: SKY.morning,
      halfWidth: 2,
      field: { count: 120, pack: 3, seed: 92 },
      shots: [{ dur: 10, T: 1113, rate: 0.5, cam: { mode: 'follow', dist: 6, h: 1.5, ang: 172 }, cam2: { dist: 8 } }],
      onFrame: (race, i, ctx) => {
        const h = ctx.hud;
        eventTag(h, { name: 'ST ALBANS PARKRUN', date: '26.09.2026', t: i.t });
        raceClock(h, { T: Math.min(i.T, sap.finish), d: Math.min(i.d, sap.distance) });
        if (i.finished) {
          const u = i.T - sap.finish;
          h.text('18:43', 960, 860, { font: 'mono', size: 90, color: COL.white, align: 'center', alpha: smooth(0.2, 0.8, u), glow: 10, shadow: true });
          h.text('LOG: "WHERE DID THAT COME FROM"', 960, 940, { font: 'mono', size: 30, color: COL.green, align: 'center', alpha: smooth(1.2, 1.8, u), tracking: 3, shadow: true });
        }
        fades(ctx.r.grade, i.t, 10, 0.5, 1);
        void race;
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 10 }],
    }),
  );

  // --- reflection: the bosses, one last flash each
  const bosses: [string, string, string][] = [
    ['THE HARE', 'IMPATIENCE', COL.white],
    ['HINGE', 'JOINT HELD', COL.green],
    ['DOUBLE ZERO', '19:25', COL.green],
    ['FORTY', '39:35', COL.green],
    ['PHANTOM 1:30', '1:29:01', COL.cyan],
    ['NINETEEN', '18:55', COL.green],
    ['FURNACE', 'SURVIVED', COL.amber],
    ['THE CLAW', 'RETRACTED', COL.green],
    ['HAIRLINE', 'OUTLASTED', COL.white],
    ['EIGHTEEN', 'UNBEATEN', COL.red],
    ['THE WALL', 'UNBEATEN', COL.red],
  ];
  const per = 1.25;
  scenes.push(
    new Card({
      id: 'e5-bosses',
      dur: bosses.length * per + 1.5,
      draw: (t, h) => {
        const k = Math.floor((t - 0.5) / per);
        if (k < 0 || k >= bosses.length) return;
        const lt = t - 0.5 - k * per;
        const a = env(lt, 0, per, 0.12, 0.25);
        const [name, res, col] = bosses[k];
        grid(h, a * 0.4);
        h.text(name, 960, 540, { font: 'head', size: 110, weight: 700, color: COL.white, align: 'center', alpha: a, tracking: 16, glitch: lt < 0.15 ? 0.6 : 0 });
        h.text(res, 960, 630, { font: 'mono', size: 38, color: col, align: 'center', alpha: a, tracking: 8 });
      },
      cues: bosses.map((_, k) => ({ t: 0.5 + k * per, kind: 'boss-flash' })),
    }),
  );

  // --- the mission log
  scenes.push(
    missionList('e6-log', [
      { name: 'SUB 20  5K', status: 'COMPLETE', note: '18.03.2023' },
      { name: 'SUB 40  10K', status: 'COMPLETE', note: '15.04.2023' },
      { name: 'SUB 19  5K', status: 'COMPLETE', note: '21.07.2023' },
      { name: 'FIRST MARATHON', status: 'COMPLETE', note: '10.09.2023' },
      { name: 'SUB 1:30  HALF', status: 'COMPLETE', note: '19.05.2024' },
      { name: 'SUB 3:00:00  MARATHON', status: 'INCOMPLETE', note: 'BEST 3:20:03' },
      { name: 'SUB 18:00  5K', status: 'INCOMPLETE', note: 'BEST 18:19' },
    ], 15, 'MISSION LOG  -  2020 - 2026'),
  );

  // --- silence; a new mission; the runner moves again
  scenes.push(
    new Card({
      id: 'e7-new',
      dur: 9,
      draw: (t, h) => {
        if (t < 3) return; // silence
        const blink = Math.floor(t * 2.2) % 2 === 0;
        h.text('NEW MISSION DETECTED', 960, 520, { font: 'head', size: 76, weight: 700, color: COL.amber, align: 'center', alpha: t < 5.5 ? (blink ? 1 : 0.25) : 1, tracking: 16, glow: 16 });
        h.text('LAST CONTACT  27.09.2026  -  20.01 KM', 960, 610, { font: 'mono', size: 30, color: COL.ui, align: 'center', alpha: smooth(5.5, 6.2, t), tracking: 6 });
      },
      cues: [{ t: 3, kind: 'alert' }],
    }),
    new RaceScene({
      id: 'e8-run',
      arena: 'st-albans',
      course: 1,
      rawGps: true,
      s0: 60,
      profile: (() => {
        // standing, then setting off: an easy run
        const p = new RunProfile([0, 0.01, 10, 40, 90], [0, 3.6, 7, 14, 26]);
        p.synthetic = true;
        return p;
      })(),
      sky: SKY.sunrise,
      shots: [
        { dur: 6, T: -2, cam: { mode: 'follow', dist: 3.2, h: 1.5, ang: 160, look: 1.4, fov: 32 }, grade: { letterbox: 1 } },
        { dur: 12, T: 4, cam: { mode: 'follow', dist: 6, h: 1.4, ang: -10, look: 1.2, fov: 30 }, cam2: { dist: 26, h: 2.5 }, grade: { letterbox: 1 } },
      ],
      onFrame: (race, i, ctx) => {
        const g = ctx.r.grade;
        if (i.shot === 0) g.fade = 1 - smooth(0, 2, i.shotT);
        if (i.shot === 1) {
          ctx.hud.text('END', 960, 960, { font: 'mono', size: 30, color: COL.white, align: 'center', alpha: smooth(9, 10, i.shotT), tracking: 20 });
          fades(g, i.shotT, 12, 0.01, 2.2);
        }
        void race;
      },
      cues: [{ t: 0, kind: 'amb-park', dur: 18, level: 0.5 }, { t: 5, kind: 'music', id: 'end', dur: 13 }],
    }),
  );
  scenes.push(
    new Card({
      id: 'e9-credits',
      dur: 9,
      draw: (t, h) => {
        const a = env(t, 0, 9, 0.8, 1);
        const L = [
          ['A TRUE STORY', 'Every time, distance, split and quote is from the Strava record. Dialogue is fiction.'],
          ['COURSES', 'Strava GPS, map-matched to OpenStreetMap'],
          ['MAP DATA', '(c) OpenStreetMap contributors, ODbL'],
          ['ELEVATION', 'AWS Terrain Tiles (Mapzen / SRTM)'],
          ['CHARACTERS & ANIMATION', 'Quaternius Universal Base Characters & Animation Library (CC0)'],
          ['TEXTURES, SKIES, TREES, PROPS', 'Poly Haven (CC0)'],
          ['TYPE', 'Rajdhani, Share Tech Mono (SIL Open Font License)'],
          ['MUSIC & SOUND', 'Synthesised from scratch for this film'],
        ];
        h.text('RUNNING GEAR SOLID: REMASTERED', 960, 250, { font: 'head', size: 44, weight: 700, color: COL.white, align: 'center', alpha: a, tracking: 10 });
        L.forEach(([k, v], i) => {
          h.text(k, 900, 360 + i * 70, { font: 'mono', size: 22, color: COL.uiDim, align: 'right', alpha: a, tracking: 4 });
          h.text(v, 930, 360 + i * 70, { font: 'body', size: 30, weight: 500, color: COL.white, alpha: a, maxWidth: 900 });
        });
      },
    }),
  );
  void crack;
  void steady;
  return scenes;
}
