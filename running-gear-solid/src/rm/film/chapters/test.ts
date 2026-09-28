// Engine test scene: DOUBLE ZERO round 2 (Finsbury, 18.03.2023, 19:25).
import { RaceScene } from '../RaceScene';
import { RunProfile } from '../profile';
import fins from '../../../data/gps/finsbury-parkrun.json';
import { raceClock, targetBlock, eventTag } from '../../hud/widgets';
import { funnel, kmBoard, flag } from '../dressing';

export const testRace = () =>
  new RaceScene({
    id: 'test-1925',
    chapter: 'TEST',
    arena: 'finsbury',
    profile: RunProfile.fromStream(fins as any, 1165),
    sky: { hdri: 'kloofendal_48d_partly_cloudy_puresky', sun: 2.4, fog: 0.0022, fogColor: 0xaab3b9 },
    halfWidth: 2.2,
    field: { count: 140, pack: 10, kmin: 0.72, kmax: 1.1 },
    spectators: [{ s0: -30, s1: 12, density: 0.5 }],
    build: (race) => {
      funnel(race, race.course.length, 30);
      flag(race, 0, -3, '#5c2a86', 'START');
      for (let k = 1; k <= 4; k++) kmBoard(race, (k * 1000 * race.course.length) / race.o.profile.distance, String(k));
    },
    shots: [
      { dur: 4, T: -3, cam: { mode: 'follow', dist: 7, h: 2.2, ang: 160, look: 1.2 }, cam2: { dist: 5 } },
      { dur: 4, T: 200, cam: { mode: 'follow', dist: 4.2, h: 1.5, ang: 0 } },
      { dur: 4, T: 400, cam: { mode: 'follow', dist: 3.2, h: 1.0, ang: 90, look: 1.0 } },
      { dur: 4, T: 700, cam: { mode: 'follow', dist: 18, h: 9, ang: 200, look: 0.5 } },
      { dur: 4, T: 1160, cam: { mode: 'follow', dist: 5, h: 1.4, ang: 170 } },
    ],
    onFrame: (race, i, ctx) => {
      const h = ctx.hud;
      eventTag(h, { name: 'FINSBURY PARK', date: '18.03.2023', t: i.t });
      raceClock(h, { T: i.T, d: i.d, pace: i.T > 5 ? i.T / (i.d / 1000) : undefined });
      targetBlock(h, { target: 1199, projection: race.o.profile.projection(i.T) });
    },
  });
