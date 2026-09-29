// The Phantom's build-up: after Battersea, a new line (1:30) - and on three real long runs
// something starts to appear. 23.04.2023 and 30.04.2023 in the Highgate hills, 07.05.2023 through
// Finsbury Park (two weeks before Hackney). First a see-through runner passing in the mist, then
// the same figure ahead carrying a sign, then running alongside him. Between them, the codec
// calls that name it and make the plan.
import * as THREE from 'three';
import { RaceScene } from '../RaceScene';
import { SKY, steady } from '../common';
import { CodecScene } from '../Codec';
import { COL, env, smooth } from '../../hud/Hud';
import { radar } from '../../hud/game';
import { Ghost } from '../fx';
import { toScreen } from './door';
import { aimAt } from '../bosses/place';
import type { Scene } from '../core';

const MIST = { ...SKY.misty, fog: 0.02, fogColor: 0xb8bcbc };

function sighting(o: { id: string; arena: string; s0: number; date: string; run: string; sign: boolean; mode: 'pass' | 'ahead' | 'along'; dur: number }) {
  let ghost: Ghost;
  const V = 3.1; // his long-run speed (about 5:20 a km)
  return new RaceScene({
    id: o.id,
    arena: o.arena,
    s0: o.s0,
    profile: steady(V * 40, 40),
    sky: MIST,
    halfWidth: 2.4,
    build: async (race) => {
      ghost = await Ghost.create(0x5ff3ff, true, 0.14);
      if (o.sign) race.extras.add(...ghost.pacer('1:30'));
      ghost.camera = race.stage!.camera;
      race.extras.add(ghost.runner.root);
    },
    shots:
      o.mode === 'pass'
        ? [
            { dur: 4, T: 2, cam: { mode: 'follow', dist: 4.5, h: 1.5, ang: 100, look: 1.2, fov: 40 }, grade: { letterbox: 1 } },
            { dur: o.dur - 4, T: 8, cam: { mode: 'follow', dist: 5.5, h: 1.5, ang: 55, look: 1.3, fov: 44 }, grade: { letterbox: 1 }, tag: 'see' },
          ]
        : [{ dur: o.dur, T: 2, cam: o.mode === 'ahead' ? { mode: 'follow', dist: 4.4, h: 1.8, ang: 12, look: 1.5, ahead: 12, fov: 40 } : { mode: 'follow', dist: 5.5, h: 1.4, ang: 95, look: 1.2, fov: 40 }, grade: { letterbox: 1 }, tag: 'see' }],
    onFrame: (race, i, ctx) => {
      const h = ctx.hud, g = ctx.r.grade;
      g.saturation = 0.7;
      const u = i.tag === 'see' ? i.shotT : -1;
      // where it is, relative to him (m): passing from behind, holding ahead, or level then gone
      let rel = -99, op = 0;
      if (o.mode === 'pass' && u >= 0) {
        rel = -5 + u * 3.4;
        op = smooth(0, 0.8, u) * (1 - smooth(3.4, 4.6, u));
      } else if (o.mode === 'ahead' && u >= 0) {
        rel = 16 + u * 0.4;
        op = smooth(0.8, 2, u) * (1 - smooth(o.dur - 2.2, o.dur - 1, u));
      } else if (o.mode === 'along' && u >= 0) {
        rel = u < 4 ? 0.3 : 0.3 + (u - 4) ** 2 * 1.6;
        op = smooth(0.3, 1.5, u) * (1 - smooth(5.5, 7, u));
      }
      const gp = race.place(i.s + rel, o.mode === 'along' ? -1.4 : -1.1);
      // daylight mist: it needs more presence than it has in the dark
      ghost.opacity = 0.38 * op;
      ghost.pose(gp, i.T, V + (o.mode === 'along' && u > 4 ? (u - 4) * 3 : o.mode === 'pass' ? 3.4 : 0));
      if (o.mode === 'ahead' && op > 0.1) aimAt(race.stage!.camera, new THREE.Vector3(gp.x, gp.y + 1.4, gp.z), 0.35 * op);
      h.caption([o.date, o.run], i.t, 0.6, env(i.t, 0.5, o.dur, 0.4, 0.5), 110, 150);
      // the radar can't place it
      const ra = env(i.t, 1, o.dur - 0.3, 0.3, 0.3);
      radar(h, { pts: [[0, 70], [0, -90]], enemies: op > 0.2 ? [[-3, -rel * 2.4, COL.cyan]] : [], alpha: ra, jam: op > 0.2 ? 0.5 : 0 });
      if (op > 0.3) h.text('UNKNOWN SIGNAL', 1674, 410, { font: 'mono', size: 30, color: COL.cyan, align: 'center', alpha: ra * (0.6 + 0.4 * Math.sin(i.t * 7)), tracking: 4 });
      if (op > 0.5 && o.mode !== 'along') {
        const [sx, sy] = toScreen(new THREE.Vector3(gp.x, gp.y + 2.5 + (o.sign ? 0.8 : 0), gp.z), race.stage!.camera);
        h.text('?', sx, sy, { font: 'head', size: 90, weight: 700, color: COL.cyan, align: 'center', alpha: op, glow: 10, shadow: true });
      }
      g.fade = Math.max(g.fade, 1 - smooth(0, 0.8, i.t), smooth(o.dur - 0.8, o.dur, i.t));
    },
    cues: [{ t: 0, kind: 'wind', dur: o.dur }, { t: 0.3, kind: 'music', id: 'haunt', dur: o.dur - 0.5 }, { t: o.mode === 'pass' ? 4.6 : 2.4, kind: 'phantom-pass' }],
  });
}

export function phantomBuildUp(): Scene[] {
  return [
    new CodecScene({
      id: 'c3-codec-130',
      freq: '140.85',
      lines: [
        { who: 'TEMPO', text: 'Thirty-nine thirty-five. That puts a half marathon in a different place.' },
        { who: 'STRIDE', text: 'Where?' },
        { who: 'TEMPO', text: 'Under an hour and a half.' },
        { who: 'STRIDE', text: 'One thirty.' },
        { who: 'PAUSE', dur: 1.2 },
        { who: 'TEMPO', text: "Careful. You've just drawn another line." },
      ],
    }),
    sighting({ id: 'c3-sight1', arena: 'highgate', s0: 900, date: '23.04.2023', run: 'LONG RUN  -  20.5 KM', sign: false, mode: 'pass', dur: 10 }),
    new CodecScene({
      id: 'c3-codec-what',
      freq: '140.85',
      ring: false,
      lines: [
        { who: 'STRIDE', text: 'Tempo. Did you see that?' },
        { who: 'TEMPO', text: 'See what?' },
        { who: 'STRIDE', text: 'Someone ran past me. Easy, like they were barely trying. I could see through them.' },
        { who: 'TEMPO', text: "You're two hours into a long run. Drink something." },
      ],
    }),
    sighting({ id: 'c3-sight2', arena: 'highgate', s0: 1600, date: '30.04.2023', run: 'LONG RUN  -  25.0 KM', sign: true, mode: 'ahead', dur: 8 }),
    sighting({ id: 'c3-sight3', arena: 'finsbury', s0: 300, date: '07.05.2023', run: 'LONG RUN  -  21.1 KM', sign: true, mode: 'along', dur: 8 }),
    new CodecScene({
      id: 'c3-codec-phantom',
      freq: '140.85',
      lines: [
        { who: 'STRIDE', text: "It's back. Third time. It ran next to me for a kilometre. It's carrying a sign." },
        { who: 'TEMPO', text: 'What does the sign say?' },
        { who: 'STRIDE', text: 'One thirty.' },
        { who: 'PAUSE', dur: 1.2 },
        { who: 'TEMPO', text: 'The Phantom.' },
        { who: 'TEMPO', text: 'Everyone who wants a 1:30 half sees it eventually. It runs exactly that pace, start to finish. It never tires. It never slows.' },
        { who: 'STRIDE', text: 'How do I beat it?' },
        { who: 'TEMPO', text: 'First you have to see it properly. Gearbox?' },
        { who: 'GEARBOX', text: 'Pace goggles. They lock onto anything moving at four-sixteen a kilometre.' },
        { who: 'TEMPO', text: 'And you go where it lives. Hackney. Two weeks.' },
      ],
    }),
  ];
}
