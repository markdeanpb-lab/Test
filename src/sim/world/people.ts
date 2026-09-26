// People: generation, annual development, form/confidence, retirement and family links.
// Hidden attributes generate performance; ratings shown to the player (Elo, reputation) are derived
// from recorded results only.
import { Rng } from '../rng';
import { clamp, dexp } from '../dmath';
import type { Universe, Person, Attrs, DevProfile, Personality, DriverStyle, PersonKind, Day, AttrKey } from '../types';
import { ATTR_KEYS } from '../types';
import { genName, pickNationality, pickTown, femaleShare } from '../names';
import { dayOf, ageYears } from '../dates';

export const PHYSICAL: AttrKey[] = ['pace', 'quali', 'fitness'];
export const MENTAL: AttrKey[] = ['racecraft', 'defence', 'consistency', 'wet', 'mechSympathy', 'adaptability', 'pressure'];

export function nextId(u: Universe, prefix: string): string {
  const n = (u.counters[prefix] ?? 0) + 1;
  u.counters[prefix] = n;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

export function takenNames(u: Universe): Set<string> {
  const s = new Set<string>();
  for (const p of Object.values(u.people)) if (p.status !== 'deceased') s.add(`${p.first} ${p.last}`);
  return s;
}

const BACKGROUNDS: [string, number, number][] = [
  // label, readiness bias, era weight hint (0 early .. 1 modern)
  ['wealthy amateur', 0.35, 0], ['motorcycle racing', 0.45, 0.2], ['hill climbs', 0.45, 0.1], ['riding mechanic', 0.5, 0], ['aviation', 0.4, 0.1],
  ['club racing', 0.5, 0.4], ['national formula', 0.6, 0.6], ['sports cars', 0.55, 0.5], ['karting', 0.6, 0.9], ['junior single-seaters', 0.7, 1],
  ['simulator racing', 0.55, 1], ['rallying', 0.5, 0.6], ['engineering apprentice', 0.4, 0.3],
];

export function makeAttrsProfile(rng: Rng, talent: number, era: number): { attrs: Attrs; dev: DevProfile } {
  const ceiling = {} as Attrs;
  for (const k of ATTR_KEYS) ceiling[k] = clamp(63 + 11 * talent + rng.gauss(0, 7), 38, 99);
  ceiling.aggression = clamp(rng.gauss(55, 16), 10, 95);
  const dev: DevProfile = {
    ceiling,
    growth: clamp(rng.gauss(1, 0.28), 0.4, 1.7),
    peakPhysical: clamp(rng.gauss(27.5 + era * 0.5, 2.6), 22, 34),
    peakMental: clamp(rng.gauss(31.5, 3.2), 25, 40),
    decline: clamp(rng.gauss(1, 0.3), 0.4, 1.9),
    volatility: clamp(rng.gauss(1, 0.35), 0.3, 2),
    lateBloom: clamp(rng.chance(0.18) ? rng.range(0.4, 0.9) : rng.range(0, 0.25), 0, 1),
  };
  const attrs = {} as Attrs;
  for (const k of ATTR_KEYS) attrs[k] = ceiling[k];
  return { attrs, dev };
}

export interface NewPersonOpts { kind: PersonKind; year: number; age?: number; nat?: string; gender?: 'm' | 'f'; talent?: number; last?: string; parentId?: string; background?: string }

export function createPerson(u: Universe, rng: Rng, o: NewPersonOpts): Person {
  const era = clamp((o.year - 1926) / 100, 0, 1.5);
  const gender = o.gender ?? (rng.chance(o.kind === 'driver' ? femaleShare(o.year) : femaleShare(o.year) * 0.8) ? 'f' : 'm');
  const nat = o.nat ?? pickNationality(rng, o.year);
  const nm = genName(rng, nat, gender, takenNames(u), o.last);
  const age = o.age ?? (o.kind === 'driver' ? (o.year < 1950 ? rng.gaussClamp(26, 4.5, 18, 40) : rng.gaussClamp(20 - era * 1.2, 2.2, 16, 30)) : rng.gaussClamp(40, 7, 26, 62));
  const now = dayOf(o.year, 1, 15);
  const dob = now - Math.round(age * 365.25) - rng.int(300);
  const talent = o.talent ?? rng.gauss(0, 1);
  const { attrs, dev } = makeAttrsProfile(rng, talent, era);
  const personality: Personality = {
    temperament: clamp(rng.gauss(0.5, 0.2), 0, 1), discipline: clamp(rng.gauss(0.55, 0.2), 0, 1), loyalty: clamp(rng.gauss(0.5, 0.22), 0, 1),
    ambition: clamp(rng.gauss(0.55, 0.22), 0, 1), sociability: clamp(rng.gauss(0.5, 0.22), 0, 1), resilience: clamp(rng.gauss(0.5, 0.2), 0, 1),
  };
  // temperament feeds risk appetite; discipline tempers it
  dev.ceiling.aggression = clamp(dev.ceiling.aggression + (personality.temperament - 0.5) * 30 - (personality.discipline - 0.5) * 12, 8, 97);
  const style: DriverStyle = rng.weighted(['smooth', 'aggressive', 'technical', 'instinctive'], [1 + attrs.mechSympathy / 60, 0.6 + dev.ceiling.aggression / 50, 1 + attrs.adaptability / 70, 1 + attrs.pace / 80]);
  const bgChoices = BACKGROUNDS.filter((b) => Math.abs(b[2] - Math.min(1, era)) < 0.55);
  const bg = o.background ?? rng.weighted(bgChoices.map((b) => b[0]), bgChoices.map((b) => 1.2 - Math.abs(b[2] - Math.min(1, era))));
  const bgBias = BACKGROUNDS.find((b) => b[0] === bg)?.[1] ?? 0.5;
  const p: Person = {
    id: nextId(u, o.kind === 'driver' ? 'D' : o.kind === 'engineer' ? 'E' : 'M'), kind: o.kind, first: nm.first, last: nm.last, gender, nationality: nat, hometown: pickTown(rng, nat), dob,
    status: o.kind === 'driver' ? 'prospect' : 'free', attrs, dev, personality, style, balancePref: clamp(rng.gauss(0, 0.45), -1, 1), background: bg,
    readiness: clamp(bgBias + rng.gauss(0, 0.15), 0.1, 0.95),
    form: 0, confidence: clamp(rng.gauss(0.55, 0.12), 0.2, 0.9), health: 1, injuries: [], experience: 0, circuitExp: {}, roles: [], reputation: 0,
    elo: { rating: 1500, rd: 200, peak: 1500, peakDay: now, peakAge: age, races: 0, lastDay: now, history: [], seasonEnd: {} },
    family: { parents: [], children: [] }, notes: [],
  };
  // current attributes: the young have not yet reached their ceilings
  setAttrsForAge(p, ageYears(dob, now), rng);
  if (o.kind !== 'driver') {
    p.skill = clamp(0.5 + 0.18 * talent + rng.gauss(0, 0.08), 0.1, 0.98);
    p.specialty = o.kind === 'engineer' ? rng.pick(['aero', 'engine', 'chassis', 'operations'] as const) : 'operations';
  }
  if (o.parentId) {
    const parent = u.people[o.parentId];
    if (parent) { p.family.parents.push(parent.id); parent.family.children.push(p.id); }
  }
  u.people[p.id] = p;
  return p;
}

/** Attributes appropriate to an age given a development profile (used at creation). */
function setAttrsForAge(p: Person, age: number, rng: Rng) {
  for (const k of ATTR_KEYS) {
    const c = p.dev.ceiling[k];
    if (k === 'aggression') { p.attrs[k] = clamp(c + (26 - age) * 0.6, 5, 99); continue; }
    const peak = PHYSICAL.includes(k) ? p.dev.peakPhysical : p.dev.peakMental;
    const yearsToPeak = Math.max(0, peak - age);
    const gap = Math.min(0.55, yearsToPeak * (0.045 + p.dev.lateBloom * 0.02) * (1.25 - p.readiness * 0.5));
    let v = c - (c - 35) * gap;
    if (age > peak) v -= (age - peak) * 0.35 * p.dev.decline;
    p.attrs[k] = clamp(v + rng.gauss(0, 2), 25, 99);
  }
}

/** Annual development: each attribute grows towards its ceiling before its own peak, then declines. */
export function developPerson(u: Universe, p: Person, rng: Rng, year: number) {
  const now = dayOf(year, 1, 10);
  const age = ageYears(p.dob, now);
  const mentor = p.mentorId ? u.people[p.mentorId] : undefined;
  const mentorBonus = mentor ? 0.08 + 0.12 * ((mentor.attrs.adaptability + mentor.attrs.consistency) / 200) : 0;
  const expBoost = clamp(p.experience / 60, 0, 1);
  for (const k of ATTR_KEYS) {
    const c = p.dev.ceiling[k];
    let v = p.attrs[k];
    if (k === 'aggression') {
      // risk appetite tends to ease with experience and age; temperament keeps some drivers fiery
      v += (c - v) * 0.15 - (age > 30 ? 0.6 : 0.2) * (1 - p.personality.temperament) + rng.gauss(0, 1.5);
      p.attrs[k] = clamp(v, 5, 99);
      continue;
    }
    const peak = PHYSICAL.includes(k) ? p.dev.peakPhysical : p.dev.peakMental;
    if (age < peak) {
      const bloomShift = p.dev.lateBloom * clamp((peak - age) / 8, 0, 1); // late bloomers grow slower early
      const learning = (MENTAL.includes(k) ? 0.18 + 0.1 * expBoost : 0.24) * p.dev.growth * (1 - bloomShift * 0.7) * (1 + mentorBonus);
      v += (c - v) * learning * rng.range(0.55, 1.45);
    } else {
      const over = age - peak;
      v -= p.dev.decline * (0.25 + 0.09 * over) * rng.range(0.5, 1.5) * (PHYSICAL.includes(k) ? 1.25 : 0.8);
      if (over < 3 && k !== 'fitness') v += (c - v) * 0.05; // a little late refinement
    }
    v += rng.gauss(0, 1.1 * p.dev.volatility);
    // lingering injury effects
    if (p.health < 1 && (k === 'pace' || k === 'fitness')) v -= (1 - p.health) * 4;
    p.attrs[k] = clamp(v, 20, 99.5);
  }
  // health recovers slowly
  p.health = clamp(p.health + 0.25, 0, 1);
}

/** A driver's overall "true" level (hidden; used only by the simulation for recruitment scouting noise). */
export function trueLevel(p: Person): number {
  const a = p.attrs;
  return a.pace * 0.34 + a.quali * 0.08 + a.racecraft * 0.12 + a.defence * 0.06 + a.consistency * 0.16 + a.wet * 0.05 + a.mechSympathy * 0.05 + a.adaptability * 0.05 + a.pressure * 0.06 + a.fitness * 0.03;
}

/** What teams can observe: results-based rating blended with scouting (noisy view of true level). */
export function perceivedLevel(u: Universe, p: Person, scoutQuality: number, rng: Rng): number {
  const scout = trueLevel(p) + rng.gauss(0, 9 * (1.1 - scoutQuality));
  const eloView = 70 + (p.elo.rating - 1500) / 12;
  const evidence = clamp(p.elo.races / 30, 0, 0.75);
  return scout * (1 - evidence) + eloView * evidence + (p.reputation - 50) * 0.04;
}

export function isActiveDriver(p: Person) { return p.kind === 'driver' && (p.status === 'active' || p.status === 'reserve'); }

export function retireDriver(u: Universe, p: Person, day: Day, reason: string) {
  p.status = 'retired';
  p.retiredDay = day;
  p.retireReason = reason;
  if (p.teamId) { const t = u.teams[p.teamId]; if (t) t.drivers = t.drivers.filter((x) => x !== p.id); }
  p.teamId = undefined;
  p.contract = undefined;
  const open = p.roles.find((r) => r.role === 'driver' && r.toDay === undefined);
  if (open) open.toDay = day;
  p.roles.push({ role: 'retired', fromDay: day });
}

/** Chance a driver chooses (or is forced) to retire at season end. */
export function retirementChance(u: Universe, p: Person, year: number, hasSeat: boolean, recentResults: number): number {
  const age = ageYears(p.dob, dayOf(year, 12, 1));
  const era = year < 1960 ? 5 : year < 1990 ? 2 : 0; // longer careers were common in early decades
  const pivot = 36 + era + (p.personality.ambition - 0.5) * 4;
  let pr = 1 / (1 + dexp(-(age - pivot) / 1.8));
  if (!hasSeat) pr = Math.max(pr, age > 27 ? 0.35 : 0.12);
  if (p.health < 0.5) pr += 0.3;
  pr += clamp(-recentResults, 0, 1) * 0.15 * (age > 30 ? 1 : 0.3);
  if (p.elo.rating > 1650 && age < pivot) pr *= 0.5;
  return clamp(pr, 0.005, 0.98);
}

/** Create a relative (child) of a former competitor, with valid dates. Returns null if none suitable. */
export function relativeCandidate(u: Universe, rng: Rng, year: number): Person | null {
  const now = dayOf(year, 1, 1);
  const pool = Object.values(u.people).filter((p) => p.kind === 'driver' && (p.status === 'retired' || p.status === 'active') && p.experience >= 10);
  const cands = pool.filter((p) => {
    const age = ageYears(p.dob, now);
    return age >= 38 && age <= 72 && p.family.children.filter((c) => u.people[c]?.kind === 'driver').length < 2;
  });
  if (!cands.length) return null;
  // better-known parents are more likely to have children given an opportunity (connections)
  return rng.weighted(cands, cands.map((p) => 0.5 + p.reputation / 40));
}

export function makeChildDriver(u: Universe, rng: Rng, parent: Person, year: number): Person | null {
  const now = dayOf(year, 1, 15);
  const parentAge = ageYears(parent.dob, now);
  const childAge = clamp(year < 1950 ? rng.gauss(24, 3) : rng.gauss(19.5, 2), 16, 30);
  const parentAgeAtBirth = parentAge - childAge;
  if (parentAgeAtBirth < 19 || parentAgeAtBirth > 48) return null;
  if (parent.dod && parent.dod < now - childAge * 365.25) return null;
  // inherited ability is only weakly correlated; opportunity (readiness, reputation) is what the name brings
  const parentTalent = (parent.dev.ceiling.pace - 63) / 11;
  const talent = 0.3 * parentTalent + rng.gauss(0, 0.95);
  const child = createPerson(u, rng, { kind: 'driver', year, age: childAge, nat: rng.chance(0.85) ? parent.nationality : undefined, last: parent.last, talent, parentId: parent.id });
  child.readiness = clamp(child.readiness + 0.12, 0, 0.95);
  child.reputation = clamp(parent.reputation * 0.25, 0, 30);
  child.notes.push(`child of ${parent.first} ${parent.last}`);
  return child;
}
