// Universe creation and the top-level advance API. All world randomness is drawn from named, serialisable
// streams stored in u.rng, so a saved universe resumes with identical future outcomes.
import type { Universe, UniverseSettings } from './types';
import { ENGINE_VERSION, SCHEMA_VERSION } from './types';
import { streamFor, Rng } from './rng';
import { dayOf } from './dates';
import { initVenues } from './world/venues';
import { initTechWorld } from './world/tech';
import { initialRegs } from './world/regs';
import { createTeam } from './world/teams';
import { createPerson } from './world/people';
import { initRecords } from './world/records';
import { nextTask, runTask, type Task } from './world/season';
import './world/venues';

export const DEFAULT_SETTINGS: UniverseSettings = { raceFormat: 'gp', teams: 12, meetings: 10, startYear: 1926, endYear: 2025 };

export function randomSeed(): string {
  const words = ['abbey', 'verulam', 'holywell', 'fishpool', 'clocktower', 'kingsbury', 'sopwell', 'batchwood', 'chequer', 'romeland', 'marford', 'colney', 'redbourn', 'pelham'];
  const r = Math.floor(Math.random() * 1e9);
  return `${words[r % words.length]}-${(r % 9000) + 1000}`;
}

export function createUniverse(seed: string, name?: string, settings: Partial<UniverseSettings> & { fatalities?: boolean } = {}): Universe {
  const st = { ...DEFAULT_SETTINGS, ...settings } as UniverseSettings;
  const year = st.startYear;
  const u: Universe = {
    meta: { id: `U-${seed}-${Date.now().toString(36)}`, name: name ?? `St Albans from ${year}`, seed, engineVersion: ENGINE_VERSION, schemaVersion: SCHEMA_VERSION, created: new Date().toISOString(), settings: st },
    rng: {},
    clock: { day: dayOf(year, 1, 1), year, phase: 'preseason', nextMeeting: 0 },
    world: { economy: 0.1, fuelSupply: 1, popularity: 30, safetyAttitude: 0.08, environment: 0.02, industry: 0, media: 'press', emergency: null, inflation: 1 },
    people: {}, teams: {}, lineages: {}, cars: {}, tech: {}, regs: { sets: {}, current: '', announced: [] }, venues: {}, layouts: {}, seasons: {}, races: {}, setups: {},
    events: [], rels: {}, records: {}, stories: {}, news: [], cooldowns: {}, counters: {}, favourites: { people: [], teams: [] }, carElo: {}, careers: {}, teamCareers: {},
  };
  const rng: Rng = streamFor(seed, 'genesis');
  initVenues(u, year);
  initTechWorld(u, rng);
  const regs = initialRegs(u);
  u.regs.sets[regs.id] = regs; u.regs.current = regs.id;
  initRecords(u);
  // founding teams: a spread of resources, a couple of strong works efforts, several privateers
  for (let i = 0; i < st.teams; i++) {
    const strength = i < 2 ? rng.range(0.55, 0.8) : i < 6 ? rng.range(0.3, 0.6) : rng.range(0.1, 0.45);
    createTeam(u, rng, year, { strength, ownerType: i < 2 ? 'works' : undefined });
  }
  // the founding generation: experienced racers from other disciplines plus young hopefuls
  for (let i = 0; i < st.teams * 3; i++) {
    const p = createPerson(u, rng, { kind: 'driver', year, age: rng.gaussClamp(i < st.teams * 2 ? 30 : 23, 5, 19, 48) });
    p.status = 'free';
    p.readiness = Math.min(0.95, p.readiness + 0.2);
    p.reputation = rng.range(5, 35);
  }
  if ((settings as any).fatalities) (u.meta.settings as any).fatalities = true;
  return u;
}

export { nextTask, runTask };
export type { Task };

/** Advance whole tasks until `stop` returns true (checked before each task). Returns tasks run. */
export function advance(u: Universe, stop: (t: Task) => boolean, maxTasks = 100000): number {
  let n = 0;
  while (n < maxTasks) {
    const t = nextTask(u);
    if (stop(t)) break;
    runTask(u, t);
    n++;
  }
  return n;
}
