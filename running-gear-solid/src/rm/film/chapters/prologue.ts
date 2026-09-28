// PROLOGUE - "A LINE". Manchester, 19.04.2026: the start pen, the watch set to 3:00:00,
// four lines of codec text, the gun. Then the title, forged from six years of routes.
import { RaceScene } from '../RaceScene';
import { RunProfile } from '../profile';
import { MANCHESTER } from '../../../data/activities';
import { SKY, textCard, ROUTES } from '../common';
import { Card } from '../Cards';
import { WatchFace } from '../props';
import { arch } from '../dressing';
import { COL, env, smooth } from '../../hud/Hud';
import { watchInset } from '../../hud/widgets';
import { Scene } from '../core';

export const manchesterProfile = () => RunProfile.fromSplits(MANCHESTER.splits, MANCHESTER.distanceKm, MANCHESTER.timeSec);

export function prologue(): Scene[] {
  let watch: WatchFace;
  const pen = new RaceScene({
    id: 'p1-pen',
    chapter: 'PROLOGUE',
    arena: 'manchester',
    profile: manchesterProfile(),
    sky: { ...SKY.dawn, fog: 0.006 },
    halfWidth: 5.5,
    lane: 0.6,
    field: { count: 320, kmin: 0.75, kmax: 1.25, seed: 19 },
    spectators: [{ s0: -60, s1: 20, density: 0.7 }],
    treeLight: 0.7,
    build: (race) => {
      arch(race, 0, 'START', 13);
      watch = new WatchFace(race.runner);
      watch.draw('3:00:00', 'TARGET');
    },
    shots: [
      // wide, high, slow drift over the pen at dawn
      { dur: 7, T: -60, cam: { mode: 'follow', dist: 26, h: 13, ang: 165, look: 0.5, fov: 34, shake: 0.2 }, cam2: { dist: 21, h: 10, ang: 175 }, grade: { letterbox: 1 } },
      // the watch
      { dur: 3.5, T: -40, cam: { mode: 'follow', dist: 2.4, h: 1.55, ang: 150, look: 1.3, fov: 36, shake: 0.2 }, cam2: { dist: 2.0 }, grade: { letterbox: 1 } },
      { dur: 4, T: -36.5, cam: { mode: 'follow', dist: 1.1, h: 1.62, ang: 160, look: 1.45, fov: 26, shake: 0.15 }, grade: { letterbox: 1 } },
      // the face: breathing, eyes down the road
      { dur: 5, T: -20, cam: { mode: 'follow', dist: 1.0, h: 1.62, ang: 172, look: 1.6, fov: 30, shake: 0.2 }, cam2: { dist: 0.85 }, grade: { letterbox: 1 } },
    ],
    pose: (i) => (i.shot === 1 || i.shot === 2 ? { other: { Idle_Loop: [1, i.T + 50] }, post: (r) => r.checkWatch(1, -0.6) } : {}),
    onFrame: (race, i, ctx) => {
      const g = ctx.r.grade;
      g.saturation = 0.78;
      g.contrast = 1.1;
      g.lift = [0.01, 0.006, 0.0];
      g.gain = [1.04, 0.98, 0.9];
      if (i.shot === 0) g.fade = 1 - smooth(0, 2.5, i.shotT);
      if (i.shot === 2) {
        g.fade = 0.62; // dim and defocus the picture behind the watch inset
        g.dof = 0.03;
        g.focus = 0.25;
        watchInset(ctx.hud, { main: '3:00:00', top: 'TARGET', sub: 'MARATHON', alpha: smooth(0, 0.4, i.shotT) * (1 - smooth(3.5, 4, i.shotT)), progress: 0 });
      }
      if (i.shot === 3) g.fade = smooth(3.8, 5, i.shotT);
      void race;
    },
    cues: [
      { t: 0, kind: 'amb-crowd', dur: 18, level: 0.5 },
      { t: 0, kind: 'music', id: 'dread', dur: 18 },
      { t: 7, kind: 'watch-beep' },
    ],
  });

  const line = textCard(
    'p2-line',
    [
      { t: 0.8, text: 'Three hours.', y: 470, col: COL.ui, out: 11.5 },
      { t: 3.2, text: "That's not a race target.", y: 530, out: 11.5 },
      { t: 6.2, text: 'What is it?', y: 590, col: COL.ui, out: 11.5 },
      { t: 8.6, text: 'A line.', y: 670, size: 64, out: 11.5 },
    ],
    12.5,
    { cues: [{ t: 0.8, kind: 'codec-blip' }, { t: 3.2, kind: 'codec-blip' }, { t: 6.2, kind: 'codec-blip' }, { t: 8.6, kind: 'codec-blip' }] },
  );

  const gun = new RaceScene({
    id: 'p3-gun',
    arena: 'manchester',
    profile: manchesterProfile(),
    sky: { ...SKY.dawn, fog: 0.006 },
    halfWidth: 5.5,
    lane: 0.9,
    field: { count: 200, kmin: 0.75, kmax: 1.25, seed: 19 },
    spectators: [{ s0: -60, s1: 20, density: 0.7 }],
    build: (race) => {
      arch(race, 0, 'START', 13);
    },
    shots: [
      // in front of STRIDE: stillness, the gun, then black under the roar (the surge is heard, not seen)
      { dur: 3.6, T: -2.4, rate: 1, cam: { mode: 'follow', dist: 3.2, h: 1.1, ang: 170, look: 1.15, fov: 30, shake: 0.5 }, cam2: { dist: 2.9, h: 1.05 } },
    ],
    onFrame: (race, i, ctx) => {
      const g = ctx.r.grade;
      g.dof = 0.012;
      g.focus = ctx.r.camera.position.distanceTo(i.pos);
      g.letterbox = 1;
      g.saturation = 0.8;
      g.flash = Math.max(0, 1 - Math.abs(i.T) / 0.12) * 0.9;
      if (i.T > 0.001) g.fade = 1; // hard cut on the frame after the flash
      void race;
    },
    cues: [{ t: 2.4, kind: 'gun' }, { t: 2.4, kind: 'crowd-roar', dur: 1.9 }],
  });

  const title = new Card({
    id: 'p4-title',
    dur: 13,
    draw: (t, h, g) => {
      const keys = Object.keys(ROUTES);
      const a = env(t, 0.2, 12.6, 0.6, 1.2);
      // every route, normalised into the same square, drawn on in sequence: a knot of six years
      const cx = 960, cy = 470, R = 300;
      keys.forEach((k, i) => {
        const p = ROUTES[k];
        let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
        for (let j = 0; j < p.length; j += 2) {
          mnx = Math.min(mnx, p[j]); mxx = Math.max(mxx, p[j]); mnz = Math.min(mnz, p[j + 1]); mxz = Math.max(mxz, p[j + 1]);
        }
        const sc = (2 * R) / Math.max(mxx - mnx, mxz - mnz);
        const u = smooth(0.3 + i * 0.22, 2.2 + i * 0.22, t);
        if (u <= 0) return;
        const gg = h.g;
        gg.save();
        gg.globalAlpha = a * (0.16 + 0.5 * (1 - smooth(5, 7.5, t)));
        gg.strokeStyle = i === keys.length - 1 ? COL.white : COL.ui;
        gg.lineWidth = 2;
        gg.beginPath();
        const n = Math.floor((p.length / 2) * u);
        for (let j = 0; j < n; j++) {
          const x = cx + (p[j * 2] - (mnx + mxx) / 2) * sc, y = cy + (p[j * 2 + 1] - (mnz + mxz) / 2) * sc;
          if (j) gg.lineTo(x, y);
          else gg.moveTo(x, y);
        }
        gg.stroke();
        gg.restore();
      });
      const ta = smooth(5.2, 6.4, t) * a;
      h.text('RUNNING GEAR', 960, 520, { font: 'head', size: 150, weight: 700, color: COL.white, align: 'center', alpha: ta, tracking: 26, glow: 26 });
      h.text('SOLID', 960, 660, { font: 'head', size: 150, weight: 700, color: COL.white, align: 'center', alpha: ta, tracking: 60, glow: 26 });
      h.text('REMASTERED', 960, 745, { font: 'mono', size: 34, color: COL.ui, align: 'center', alpha: smooth(7.2, 8.2, t) * a, tracking: 30 });
      h.text('A TRUE STORY IN SIX YEARS OF GPS', 960, 1000, { font: 'mono', size: 20, color: COL.uiDim, align: 'center', alpha: smooth(8.5, 9.5, t) * a, tracking: 10 });
      g.grain = 0.05;
    },
    cues: [{ t: 0.3, kind: 'music', id: 'title', dur: 12.7 }, { t: 5.2, kind: 'title-hit' }],
  });

  const earlier = textCard('p5-earlier', [{ t: 0.8, text: 'SIX YEARS EARLIER', font: 'mono', size: 40, col: COL.ui, out: 4.2 }], 5);
  return [pen, line, gun, title, earlier];
}
