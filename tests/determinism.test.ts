import { describe, it, expect, beforeAll } from 'vitest';
import type { Universe } from '../src/sim/types';
import { runTask, nextTask, loadSetup, hashRecord } from '../src/sim/world/season';
import { LiveSession } from '../src/app/live';
import { splitUniverse, joinUniverse } from '../src/persist/db';
import { clone, fingerprint, newUniverse, toMeeting, nextMeeting, toSeasonEnd } from './helpers';

describe('determinism', () => {
  let season1926: Universe;
  beforeAll(() => { season1926 = newUniverse('det-A'); toSeasonEnd(season1926, 1926); });

  it('the same seed produces the same history', () => {
    const b = newUniverse('det-A'); toSeasonEnd(b, 1926);
    expect(fingerprint(b)).toBe(fingerprint(season1926));
    expect(Object.keys(b.races).length).toBeGreaterThanOrEqual(6);
  });

  it('a different seed produces a different history', () => {
    const c = newUniverse('det-B'); toSeasonEnd(c, 1926);
    expect(fingerprint(c)).not.toBe(fingerprint(season1926));
  });

  it('watching live at any speed or frame rate gives the same race as headless simulation', () => {
    const base = newUniverse('det-live'); toMeeting(base, 1);
    const headless = clone(base); runTask(headless, nextTask(headless));
    const m0 = nextMeeting(base)!;
    const expected = headless.races[m0.id].hash;
    for (const [speed, frames] of [[1, [0.016, 0.033, 0.25]], [5, [0.016, 0.1]], [20, [0.05, 0.007, 0.2]]] as const) {
      const u = clone(base);
      const m = nextMeeting(u)!;
      const live = LiveSession.begin(u, m)!;
      live.speed = speed;
      let i = 0, guard = 0;
      // play partly in real time with irregular frames, then skip ahead: same engine steps either way
      while (live.stage !== 'done' && guard++ < 4000) live.tick(frames[i++ % frames.length]);
      live.skipToEnd();
      while (live.stage !== 'done') live.tick(0);
      expect(u.races[m.id].hash, `speed ${speed}`).toBe(expected);
      expect(fingerprint(u)).toBe(fingerprint(headless));
    }
  });

  it('every race replays from its stored setup to the recorded result', () => {
    const u = season1926;
    const ids = Object.keys(u.races);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const rec = u.races[id];
      const m = u.seasons[rec.year].meetings.find((x) => x.id === id)!;
      const before = fingerprint(u);
      const live = new LiveSession(u, m, loadSetup(u, id)!, { expectHash: rec.hash });
      live.skipToEnd();
      while (live.stage !== 'done') live.tick(0);
      expect(live.replay!.result, `${rec.name} ${rec.year}`).toBe('match');
      expect(fingerprint(u), 'a replay must not modify the universe').toBe(before);
    }
  });

  it('save and resume between meetings continues identically', () => {
    const a = newUniverse('det-save'); toMeeting(a, 4);
    const { core, chunks } = splitUniverse(a);
    const b = joinUniverse(clone(core), clone(chunks)); // JSON round trip, as IndexedDB/export would
    toSeasonEnd(a, 1926); toSeasonEnd(b, 1926);
    expect(fingerprint(b)).toBe(fingerprint(a));
  });

  it('a save taken mid-race resumes the same weekend and result', () => {
    const base = newUniverse('det-midrace'); toMeeting(base, 2);
    const ref = clone(base); runTask(ref, nextTask(ref));
    const u = clone(base);
    const m = nextMeeting(u)!;
    const live = LiveSession.begin(u, m)!;
    live.skipSession(); while (live.stage === 'quali') live.tick(0);
    for (let i = 0; i < 3000 && live.stage === 'race'; i++) live.stepOnce();
    const midT = live.st.t, midS = Array.from(live.st.cars, (c) => c.s);
    const saved = clone(u); // what an export/autosave taken now contains
    // resume: the begun weekend is rebuilt from its stored setup, then fast-forwarded to the same moment
    const m2 = nextMeeting(saved)!;
    const resumed = LiveSession.begin(saved, m2)!;
    while (resumed.stage !== 'done' && (resumed.stage !== 'race' || resumed.st.t < midT - 1e-9)) resumed.stepOnce();
    expect(Array.from(resumed.st.cars, (c) => c.s)).toEqual(midS);
    resumed.skipToEnd(); while (resumed.stage !== 'done') resumed.tick(0);
    expect(saved.races[m.id].hash).toBe(ref.races[m.id].hash);
  });

  it('replay fingerprints use the same hashing as the record', () => {
    expect(hashRecord([{ driverId: 'a', pos: 1, laps: 10, time: 100 }])).toBe(hashRecord([{ driverId: 'a', pos: 1, laps: 10, time: 100 }]));
    expect(hashRecord([{ driverId: 'a', pos: 1, laps: 10, time: 100 }])).not.toBe(hashRecord([{ driverId: 'a', pos: 1, laps: 10, time: 100.001 }]));
  });
});
