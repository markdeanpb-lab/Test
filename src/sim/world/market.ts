// The driver market: retirements, contract expiry, team recruitment (by resources, needs, reputation,
// relationships and development philosophy), rookie supply and family links.
import type { Universe, Person, Team, Day } from '../types';
import { Rng } from '../rng';
import { clamp } from '../dmath';
import { createPerson, retireDriver, retirementChance, perceivedLevel, relativeCandidate, makeChildDriver, trueLevel } from './people';
import { addEvent, activeTeams } from './events';
import { scaleMoney } from './cars';
import { ageYears, dayOf } from '../dates';
import { relBetween, bumpRel } from './relationships';

/** New prospects enter the junior ranks each year; occasionally the child of a former driver. */
export function generateProspects(u: Universe, rng: Rng, year: number) {
  const n = Math.round(u.meta.settings.teams * 0.9 + rng.int(4));
  for (let i = 0; i < n; i++) {
    if (rng.chance(0.07)) {
      const parent = relativeCandidate(u, rng, year);
      if (parent) {
        const child = makeChildDriver(u, rng, parent, year);
        if (child) { addEvent(u, { day: dayOf(year, 1, 12), type: 'family-prospect', scope: 'driver', title: `${child.first} ${child.last}, child of ${parent.first} ${parent.last}, begins racing`, people: [child.id, parent.id], severity: 0.3, facts: { parentStarts: parent.experience } }); continue; }
      }
    }
    createPerson(u, rng, { kind: 'driver', year });
  }
  // prospects who never got a chance drift away
  for (const p of Object.values(u.people)) {
    if (p.kind !== 'driver' || p.status !== 'prospect') continue;
    const age = ageYears(p.dob, dayOf(year, 1, 1));
    if (age > (year < 1950 ? 38 : 29) || (age > 24 && rng.chance(0.25))) { p.status = 'retired'; p.retireReason = 'never reached the championship'; p.retiredDay = dayOf(year, 1, 1); }
    else developJunior(p, rng);
  }
}
function developJunior(p: Person, rng: Rng) { p.readiness = clamp(p.readiness + rng.range(0.03, 0.12), 0, 0.97); }

/** Recent form as observable by paddock: points-per-start relative to the field (-1..1). */
function recentResults(u: Universe, p: Person, year: number): number {
  const s = u.seasons[year];
  if (!s) return 0;
  const row = s.driverStandings.find((r) => r.id === p.id);
  if (!row) return -0.5;
  const idx = s.driverStandings.indexOf(row);
  return 1 - (2 * idx) / Math.max(1, s.driverStandings.length - 1);
}

export function offseasonMarket(u: Universe, rng: Rng, year: number, day: Day) {
  const prevYear = year - 1;
  // 1) retirements
  for (const p of Object.values(u.people)) {
    if (p.kind !== 'driver' || !(p.status === 'active' || p.status === 'free' || p.status === 'reserve')) continue;
    const hasSeat = !!p.contract && p.contract.untilYear >= year;
    const pr = retirementChance(u, p, prevYear, hasSeat, recentResults(u, p, prevYear));
    if (rng.chance(pr)) {
      const age = Math.floor(ageYears(p.dob, day));
      const reason = p.health < 0.5 ? 'injury' : !hasSeat && age < 33 ? 'no drive available' : age > 38 ? 'age' : 'personal choice';
      const team = p.teamId;
      retireDriver(u, p, day, reason);
      addEvent(u, { day, type: 'driver-retires', scope: 'driver', title: `${p.first} ${p.last} retires`, people: [p.id], teams: team ? [team] : [], severity: clamp(p.reputation / 100, 0.2, 0.9), facts: { age, starts: p.experience, reason, peakElo: Math.round(p.elo.peak) } });
      postCareer(u, p, rng, day);
    }
  }
  // 2) contracts end
  for (const p of Object.values(u.people)) {
    if (p.kind !== 'driver' || p.status !== 'active' || !p.contract) continue;
    if (p.contract.untilYear < year) {
      const t = p.teamId ? u.teams[p.teamId] : undefined;
      // teams choose whether to renew (observable evidence + scouting)
      if (t && t.status === 'active' && renewWanted(u, t, p, rng, year)) { p.contract = { ...p.contract, fromYear: year, untilYear: year + rng.intRange(0, 2), salary: salaryFor(u, p, rng) }; continue; }
      if (t) t.drivers = t.drivers.filter((d) => d !== p.id);
      p.teamId = undefined; p.contract = undefined; p.status = 'free';
    }
  }
  // drivers attached to teams that folded
  for (const t of Object.values(u.teams)) if (t.status !== 'active') for (const d of t.drivers) { const p = u.people[d]; if (p) { p.teamId = undefined; p.contract = undefined; p.status = 'free'; } }
  // 3) fill seats: most attractive teams choose first
  const teams = activeTeams(u).sort((a, b) => attractiveness(u, b) - attractiveness(u, a));
  const scout = (t: Team) => clamp(0.3 + t.engineering * 0.4 + t.prestige / 250, 0, 1);
  let guard = 0;
  while (guard++ < 200) {
    const needy = teams.filter((t) => t.drivers.length < 2);
    if (!needy.length) break;
    const t = needy[0];
    const cands = Object.values(u.people).filter((p) => p.kind === 'driver' && (p.status === 'free' || p.status === 'prospect' || p.status === 'reserve') && !p.teamId && ageYears(p.dob, day) >= 16.5 && p.health > 0.6);
    if (!cands.length) { const p = createPerson(u, rng, { kind: 'driver', year }); cands.push(p); }
    let best: Person | null = null, bestScore = -Infinity;
    for (const p of cands) {
      let sc = perceivedLevel(u, p, scout(t), rng);
      const age = ageYears(p.dob, day);
      if (p.status === 'prospect') sc += (t.philosophy.youth - 0.5) * 6 - (1 - p.readiness) * 8;
      if (age > 34) sc -= (age - 34) * (1.5 - t.philosophy.youth);
      sc += p.reputation * 0.05;
      // money: poorer teams favour cheaper drivers
      const sal = salaryFor(u, p, null);
      sc -= (sal / Math.max(0.1, t.cash + t.ownerBacking)) * 6;
      // relationships: a past dispute with this team or its lead driver is a real deterrent
      for (const d of t.drivers) { const r = relBetween(u, p.id, d); if (r?.kind === 'dispute' && r.status === 'active') sc -= 8 * r.intensity; if (r?.kind === 'friendship') sc += 1.5 * r.intensity; }
      if (t.notes.includes(`dispute:${p.id}`)) sc -= 10;
      // family name opens doors (opportunity, not ability)
      if (p.family.parents.some((x) => u.people[x]?.reputation > 50)) sc += 2;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    if (!best) break;
    sign(u, t, best, rng, year, day);
  }
  // 4) reserves for injuries: best unsigned drivers stay on standby
  for (const p of Object.values(u.people)) if (p.kind === 'driver' && p.status === 'free' && !p.teamId && ageYears(p.dob, day) < 40) p.status = 'free';
}

function renewWanted(u: Universe, t: Team, p: Person, rng: Rng, year: number): boolean {
  const lvl = perceivedLevel(u, p, 0.6, rng);
  const age = ageYears(p.dob, dayOf(year, 1, 1));
  const res = recentResults(u, p, year - 1);
  let want = 0.45 + res * 0.3 + (lvl - 70) * 0.02 + t.philosophy.stability * 0.2 + p.personality.loyalty * 0.15 - (age > 35 ? 0.2 : 0);
  for (const d of t.drivers) { const r = relBetween(u, p.id, d); if (r?.kind === 'dispute' && r.status === 'active') want -= 0.3 * r.intensity; }
  // ambitious drivers leave struggling teams
  if (p.personality.ambition > 0.7 && t.prestige < 35 && lvl > 72) want -= 0.3;
  return rng.chance(clamp(want, 0.05, 0.95));
}

export function salaryFor(u: Universe, p: Person, rng: Rng | null): number {
  const scale = scaleMoney(u);
  const lvl = 70 + (p.elo.rating - 1500) / 12 + p.reputation * 0.1;
  const v = scale * 0.06 * Math.max(0.2, Math.pow(Math.max(0, lvl - 55) / 20, 2.2));
  return Math.round(v * (rng ? rng.range(0.85, 1.15) : 1) * 100) / 100;
}

function attractiveness(u: Universe, t: Team) { return t.prestige + t.cash / Math.max(0.1, scaleMoney(u)) * 5 + (t.knowledge.engine + t.knowledge.aero + t.knowledge.chassis) * 10; }

export function sign(u: Universe, t: Team, p: Person, rng: Rng, year: number, day: Day, midSeason = false) {
  const debut = p.status === 'prospect' || p.experience === 0;
  const prevTeam = [...p.roles].reverse().find((r) => r.role === 'driver')?.teamId;
  p.status = 'active';
  p.teamId = t.id;
  p.contract = { teamId: t.id, fromYear: year, untilYear: midSeason ? year : year + rng.intRange(0, 2), role: t.drivers.length === 0 ? 'lead' : 'second', salary: salaryFor(u, p, rng) };
  if (!t.drivers.includes(p.id)) t.drivers.push(p.id);
  p.roles.push({ role: 'driver', teamId: t.id, fromDay: day });
  const prev = prevTeam ? u.teams[prevTeam] : undefined;
  addEvent(u, { day, type: debut ? 'driver-debut-signing' : prev && prev.id !== t.id ? 'driver-transfer' : 'driver-signing', scope: 'driver', title: debut ? `${t.name} sign newcomer ${p.first} ${p.last}` : prev && prev.id !== t.id ? `${p.first} ${p.last} moves from ${prev.name} to ${t.name}` : `${t.name} sign ${p.first} ${p.last}`, people: [p.id], teams: prev && prev.id !== t.id ? [t.id, prev.id] : [t.id], severity: clamp(p.reputation / 120 + 0.15, 0.15, 0.8), facts: { background: p.background, age: Math.floor(ageYears(p.dob, day)), salary: p.contract.salary, rookie: debut, midSeason } });
  // mentorship: a former driver may take a newcomer under their wing (affects development and confidence)
  if (debut && rng.chance(0.25)) {
    const mentors = Object.values(u.people).filter((m) => m.kind === 'driver' && m.status === 'retired' && ageYears(m.dob, day) < 70 && m.reputation > 30 && m.personality.sociability > 0.45);
    if (mentors.length) {
      const m = rng.weighted(mentors, mentors.map((x) => x.reputation + (x.nationality === p.nationality ? 20 : 0) + (p.family.parents.includes(x.id) ? 40 : 0)));
      p.mentorId = m.id;
      m.roles.push({ role: 'mentor', teamId: t.id, fromDay: day });
      bumpRel(u, m.id, p.id, 'mentorship', 0.5, 'mentor takes on newcomer', day);
      addEvent(u, { day, type: 'mentorship', scope: 'driver', title: `${m.first} ${m.last} to mentor ${p.first} ${p.last}`, people: [m.id, p.id], severity: 0.25 });
    }
  }
}

/** After a driving career: some become mentors, team principals or engineers when a role exists. */
function postCareer(u: Universe, p: Person, rng: Rng, day: Day) {
  if (p.attrs.mechSympathy > 76 && p.attrs.adaptability > 72 && rng.chance(0.15)) {
    p.skill = clamp(0.35 + (p.attrs.mechSympathy + p.attrs.adaptability) / 400 + rng.gauss(0, 0.08), 0.2, 0.9);
    p.specialty = 'chassis';
    p.notes.push('available as engineer');
  }
}

/** Mid-season replacement for an injured or departed driver. */
export function replacementFor(u: Universe, t: Team, rng: Rng, year: number, day: Day): Person {
  const pool = Object.values(u.people).filter((p) => p.kind === 'driver' && (p.status === 'free' || p.status === 'reserve' || p.status === 'prospect') && !p.teamId && ageYears(p.dob, day) >= 17 && ageYears(p.dob, day) < 45 && p.health > 0.7);
  const pick = pool.length ? pool.sort((a, b) => trueLevel(b) * 0.3 + b.readiness * 10 + b.elo.rating / 50 - (trueLevel(a) * 0.3 + a.readiness * 10 + a.elo.rating / 50))[0] : createPerson(u, rng, { kind: 'driver', year });
  sign(u, t, pick, rng, year, day, true);
  return pick;
}
