import { RaceScene } from '../RaceScene';
import { RunProfile } from '../profile';
import { WatchFace } from '../props';
let wf: WatchFace;
export const wristTest = () =>
  new RaceScene({
    id: 'test-wrist',
    arena: 'finsbury',
    profile: new RunProfile([0, 5000], [0, 1200]),
    sky: { hdri: 'kloofendal_48d_partly_cloudy_puresky', sun: 2.4 },
    shots: [
      { dur: 1, T: -5, cam: { mode: 'follow', dist: 1.3, h: 1.45, ang: 150, look: 1.25, fov: 35, shake: 0 }, tag: '-0.6' },
      { dur: 1, T: -5, cam: { mode: 'follow', dist: 1.3, h: 1.45, ang: 150, look: 1.25, fov: 35, shake: 0 }, tag: '-1.2' },
      { dur: 1, T: -5, cam: { mode: 'follow', dist: 0.45, h: 1.75, ang: -20, look: 1.2, side: 0.1, ahead: 0.3, fov: 45, shake: 0 }, tag: '-0.6' },
      { dur: 1, T: -5, cam: { mode: 'follow', dist: 1.3, h: 1.45, ang: 150, look: 1.25, fov: 35, shake: 0 }, tag: '0.6' },
      { dur: 2, T: -5, cam: { mode: 'follow', dist: 0.5, h: 1.55, ang: 175, look: 1.2, side: 0.05, fov: 35, shake: 0 } },
      { dur: 2, T: -5, cam: { mode: 'follow', dist: 1.6, h: 1.4, ang: 140, look: 1.25, fov: 35, shake: 0 } },
      { dur: 2, T: 30, cam: { mode: 'follow', dist: 1.2, h: 1.1, ang: -80, look: 1.0, fov: 35, shake: 0 } },
    ],
    build: (race) => {
      wf = new WatchFace(race.runner);
      wf.draw('3:00:00', 'TARGET');
    },
    pose: (i) => (i.shot < 4 ? { other: { Idle_Loop: [1, 3] }, post: (r) => r.checkWatch(1, Number(i.tag)) } : i.shot < 6 ? {
      other: { Idle_Loop: [1, 3] },
      post: (r) => r.checkWatch(1),
    } : {}),
  });
