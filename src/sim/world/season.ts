// The annual cycle and race weekends. The same functions run whether a meeting is watched live or
// simulated in the background: beginMeeting() builds an immutable WeekendSetup; the race engine runs
// qualifying and the race; finishMeeting() turns the classified outcome into history.
import type { Universe, Meeting, Season, RaceRecord, ResultRow, QualiRow, StandingRow, Day, Person, Team, RegSet } from '../types';
import { ENGINE_VERSION } from '../types';
import { Rng, streamFor } from '../rng';
import { clamp, dexp, dpow } from '../dmath';
import { getTrack } from '../track';
import { createQuali, createRace, stepRace, isOver, type RaceState } from '../race/engine';
import { classify } from '../race/results';
import { q4, packSetup, unpackSetup, type WeekendSetup, type EntrantSetup } from '../race/setup';
import { dayOf, ageYears, monthOf, fmtDate } from '../dates';
import { driverCode } from '../names';
import { addEvent, tickEvents, activeTeams } from './events';
import { developPerson } from './people';
import { offseasonMarket, generateProspects, replacementFor } from './market';
import { staffMarket, planDevelopment, teamYearEnd, resolveTeamCrises, recruitTeams, applyRegShock } from './teams';
import { designCar, inSeasonUpgrade, scaleMoney } from './cars';
import { applyRegsForYear, reviewRegulations } from './regs';
import { buildCalendar, evolveVenues, safetyReview } from './venues';
import { updateElo, eloSeasonEnd, carRatingFor, initRookieElo } from './elo';
import { bumpRel, relBetween, yearlyRelationships, formFriendships } from './relationships';
import { afterRace, afterSeason } from './history';
import { TECHS } from './tech';

export type TaskKind = 'newyear' | 'testing' | 'meeting' | 'seasonEnd';
export interface Task { kind: TaskKind; day: Day; year: number; idx?: number }

const rngFor = (u: Universe, name: string) => Rng.wrap(u.rng[name] ?? (u.rng[name] = streamFor(u.meta.seed, `world:${name}`).s));

// ---------------------------------------------------------------------------- scheduling
export function nextTask(u: Universe): Task {
  const y = u.clock.year;
  const s = u.seasons[y];
  if (!s) return { kind: 'newyear', day: dayOf(y, 1, 2), year: y };
  if (!s.testing && s.status !== 'cancelled') return { kind: 'testing', day: dayOf(y, 3, 20), year: y };
  const idx = s.meetings.findIndex((m) => m.status === 'scheduled');
  if (idx >= 0 && s.status !== 'cancelled' && s.status !== 'interrupted') return { kind: 'meeting', day: s.meetings[idx].day, year: y, idx };
  if (s.status === 'running' || s.status === 'planned' || (s.status === 'interrupted' && !s.review) || (s.status === 'cancelled' && !s.review)) return { kind: 'seasonEnd', day: dayOf(y, 11, 15), year: y };
  return { kind: 'newyear', day: dayOf(y + 1, 1, 2), year: y + 1 };
}

export function runTask(u: Universe, t: Task, opts: { onRace?: (setup: WeekendSetup) => void } = {}) {
  switch (t.kind) {
    case 'newyear': newYear(u, t.year, t.day); break;
    case 'testing': testing(u, t.year, t.day); break;
    case 'meeting': { const m = u.seasons[t.year].meetings[t.idx!]; const w = beginMeeting(u, m); if (w) { opts.onRace?.(w.setup); runWeekendHeadless(u, m, w.setup); } break; }
    case 'seasonEnd': seasonEnd(u, t.year, t.day); break;
  }
}

/** Simulate a weekend with no rendering: identical rules, just no presentation delays. */
export function runWeekendHeadless(u: Universe, m: Meeting, setup: WeekendSetup) {
  const tr = getTrack(setup.layout.geometryId);
  const q = createQuali(setup, tr);
  while (!isOver(q)) stepRace(q);
  const grid = q.q!.gridOrder.map((k) => q.cars[k].i);
  const r = createRace(setup, tr, grid);
  while (!isOver(r)) stepRace(r);
  finishMeeting(u, m, setup, q, r);
}

// ---------------------------------------------------------------------------- new year
function newYear(u: Universe, year: number, day: Day) {
  const rng = rngFor(u, 'season');
  u.clock.year = year; u.clock.day = day; u.clock.phase = 'preseason';
  // the world moves on
  worldDrift(u, rng, year, day);
  const changed = applyRegsForYear(u, year);
  const regs = u.regs.sets[u.regs.current];
  if (changed) {
    const prev = Object.values(u.regs.sets).filter((r) => r.year < year).sort((a, b) => b.year - a.year)[0];
    const areas: string[] = [];
    if (prev && regs.powerCapKW !== prev.powerCapKW) areas.push('engine');
    if (prev && (regs.aeroCap !== prev.aeroCap || regs.groundEffect !== prev.groundEffect)) areas.push('aero');
    if (prev && regs.compounds.join() !== prev.compounds.join()) areas.push('tyres');
    if (prev && regs.hybrid !== prev.hybrid) areas.push('energy');
    if (areas.length) applyRegShock(u, areas, rng);
  }
  recruitTeams(u, rng, year, day);
  for (const p of Object.values(u.people)) if (p.kind === 'driver' && (p.status === 'active' || p.status === 'prospect' || p.status === 'free' || p.status === 'reserve')) developPerson(u, p, rng, year);
  generateProspects(u, rng, year);
  offseasonMarket(u, rng, year, day);
  staffMarket(u, rng, year, day);
  for (const t of activeTeams(u)) { planDevelopment(u, t, rng, year, day); designCar(u, t, rng, year); }
  for (const t of activeTeams(u)) for (const d of t.drivers) initRookieElo(u.people[d]);
  // the season
  const season: Season = { year, status: 'planned', regSetId: regs.id, meetings: [], entries: [], driverStandings: [], teamStandings: [], rookies: [], retirements: [], eventIds: [] };
  u.seasons[year] = season;
  if (u.world.emergency) {
    season.status = 'cancelled'; season.statusReason = `${u.world.emergency.kind}`;
    addEvent(u, { day, type: 'season-cancelled', scope: 'world', title: `No championship in ${year}`, severity: 0.9, causes: [u.world.emergency.eventId] });
    return;
  }
  season.meetings = buildCalendar(u, rng, year, regs.id);
  buildEntries(u, season);
  season.rookies = season.entries.flatMap((e) => e.drivers).filter((d) => u.people[d].experience === 0);
  season.retirements = Object.values(u.people).filter((p) => p.retiredDay !== undefined && p.retiredDay >= dayOf(year, 1, 1) - 30 && p.kind === 'driver').map((p) => p.id);
  season.status = 'running';
  yearlyRelationships(u, rng, day);
  formFriendships(u, rng, day, season.entries.flatMap((e) => e.drivers));
  u.clock.phase = 'testing';
}

function buildEntries(u: Universe, season: Season) {
  let no = 1;
  const taken = new Set<string>();
  for (const t of activeTeams(u).sort((a, b) => b.prestige - a.prestige)) {
    if (!t.carId) continue;
    season.entries.push({ teamId: t.id, name: t.name, code: t.code, carId: t.carId, drivers: t.drivers.slice(0, 2), nos: [no, no + 1], colours: { ...t.colours }, pattern: t.pattern });
    no += 2;
  }
  for (const e of season.entries) for (const d of e.drivers) { const p = u.people[d]; if (!(p as any).code) (p as any).code = driverCode(p.last, taken); else taken.add((p as any).code); }
  season.driverStandings = season.entries.flatMap((e) => e.drivers).map((id) => ({ id, points: 0, wins: 0, podiums: 0, results: [], best: 99 }));
  season.teamStandings = season.entries.map((e) => ({ id: e.teamId, points: 0, wins: 0, podiums: 0, results: [], best: 99 }));
}

function worldDrift(u: Universe, rng: Rng, year: number, day: Day) {
  const w = u.world;
  // industrial capability rises, slowing as technology matures (never runs out)
  const growth = (0.0105 + w.economy * 0.003 + rng.gauss(0, 0.002)) * (w.industry < 1 ? 1 : dexp(-(w.industry - 1) * 1.6));
  w.industry = +(w.industry + Math.max(0.001, growth)).toFixed(4);
  w.economy = clamp(w.economy * 0.8 + rng.gauss(0, 0.18), -1, 1);
  w.fuelSupply = clamp(w.fuelSupply + 0.15, 0, 1);
  w.safetyAttitude = clamp(w.safetyAttitude + 0.006 + (w.industry > 0.4 ? 0.004 : 0), 0, 1);
  w.environment = clamp(w.environment + (w.industry > 0.5 ? 0.008 : 0.001), 0, 1);
  w.inflation = +(w.inflation * (1 + clamp(0.03 + w.economy * 0.02 + rng.gauss(0, 0.01), -0.02, 0.12))).toFixed(4);
  const mediaSteps: [number, Universe['world']['media']][] = [[0.18, 'radio'], [0.38, 'tv'], [0.52, 'colour-tv'], [0.82, 'digital'], [1.15, 'immersive']];
  for (const [thr, m] of mediaSteps) if (w.industry >= thr && order(w.media) < order(m)) { w.media = m; addEvent(u, { day, type: 'media-era', scope: 'world', title: `${m === 'radio' ? 'Radio' : m === 'tv' ? 'Television' : m === 'colour-tv' ? 'Colour television' : m === 'digital' ? 'Digital streaming' : 'Immersive broadcasting'} brings the championship to a wider audience`, severity: 0.4, facts: { media: m } }); w.popularity = clamp(w.popularity + 8, 0, 100); }
  if (w.emergency) {
    const ev = u.events.find((e) => e.id === w.emergency!.eventId);
    if (ev && (ev.untilDay ?? 0) <= day) { addEvent(u, { day, type: 'emergency-ends', scope: 'world', title: 'Motor racing resumes', severity: 0.7, causes: [ev.id] }); w.emergency = null; w.popularity = clamp(w.popularity + 10, 0, 100); }
  }
  w.popularity = clamp(w.popularity * 0.95 + 50 * 0.05 + w.economy * 2 + rng.gauss(0, 1.5), 5, 100);
}
function order(m: string) { return ['press', 'radio', 'tv', 'colour-tv', 'digital', 'immersive'].indexOf(m); }

// ---------------------------------------------------------------------------- testing
function testing(u: Universe, year: number, day: Day) {
  const s = u.seasons[year];
  const rng = rngFor(u, 'testing');
  u.clock.day = day;
  tickEvents(u, rngFor(u, 'events'), dayOf(year, 1, 2), day, year);
  // imperfect information: teams run different programmes and fuel loads
  const regs = u.regs.sets[s.regSetId];
  const noise = 0.012 + (regs.testingDays < 10 ? 0.01 : 0);
  s.testing = s.entries.map((e) => {
    const car = u.cars[e.carId];
    const est = carPaceIndex(car.current) * (1 + rng.gauss(0, noise)) * (1 + (u.teams[e.teamId].philosophy.risk - 0.5) * 0.004);
    return { teamId: e.teamId, estimate: +est.toFixed(4), laps: Math.round(regs.testingDays * rng.range(40, 90) * (0.5 + u.teams[e.teamId].knowledge.reliability)) };
  }).sort((a, b) => a.estimate - b.estimate);
  u.clock.phase = 'season';
}

/** A simple public lap-time proxy from a spec (lower is faster) used for testing estimates and previews. */
export function carPaceIndex(c: { powerKW: number; massKg: number; mechGrip: number; clA: number; cdA: number; brakeG: number }) {
  const pw = c.powerKW / (c.massKg + 75);
  return 100 / (dpow(pw, 0.35) * dpow(c.mechGrip, 0.9) * (1 + c.clA * 0.035) * (1 + c.brakeG * 0.03) / dpow(c.cdA, 0.05));
}

// ---------------------------------------------------------------------------- race weekend
export function beginMeeting(u: Universe, m: Meeting): { setup: WeekendSetup } | null {
  const year = m.year;
  const s = u.seasons[year];
  const rng = rngFor(u, 'season');
  const lastDay = u.clock.day;
  u.clock.day = m.day;
  tickEvents(u, rngFor(u, 'events'), lastDay, m.day, year);
  // an emergency can interrupt the season
  if (u.world.emergency) {
    for (const mm of s.meetings) if (mm.status === 'scheduled') { mm.status = 'cancelled'; mm.cancelReason = u.world.emergency.kind; mm.causeEventIds.push(u.world.emergency.eventId); }
    s.status = 'interrupted'; s.statusReason = u.world.emergency.kind;
    return null;
  }
  // fuel shortage can cancel meetings
  if (u.world.fuelSupply < 0.45 && rng.chance(0.4)) {
    m.status = 'cancelled'; m.cancelReason = 'fuel shortage';
    const ev = u.events.filter((e) => e.type === 'fuel-shortage').slice(-1)[0];
    if (ev) m.causeEventIds.push(ev.id);
    addEvent(u, { day: m.day, type: 'meeting-cancelled', scope: 'meeting', title: `${m.name} cancelled: fuel shortage`, meetingId: m.id, venues: [m.venueId], severity: 0.5, causes: ev ? [ev.id] : [] });
    return null;
  }
  // development between meetings
  for (const t of activeTeams(u)) if (rng.chance(0.35)) inSeasonUpgrade(u, t, rng, m.day, m.id);
  // injured drivers are stood down; stand-ins take the car
  for (const e of s.entries) {
    const t = u.teams[e.teamId];
    if (t.status !== 'active') continue;
    for (const d of t.drivers.slice()) {
      const p = u.people[d];
      const injured = p.injuries.some((i) => i.returnDay > m.day) || p.status === 'deceased' || p.health < 0.55;
      if (injured && !t.drivers.some((x) => u.people[x].notes.includes(`stand-in for ${d}`))) {
        const r = replacementFor(u, t, rng, year, m.day);
        r.notes.push(`stand-in for ${d}`);
        t.drivers = t.drivers.map((x) => (x === d ? r.id : x === r.id ? d : x)).filter((x, i, a) => a.indexOf(x) === i);
        t.drivers = [r.id, ...t.drivers.filter((x) => x !== r.id && x !== d)].slice(0, 2);
        (t as any).benched = [...((t as any).benched ?? []), d];
        initRookieElo(r);
        if (!s.driverStandings.some((x) => x.id === r.id)) s.driverStandings.push({ id: r.id, points: 0, wins: 0, podiums: 0, results: [], best: 99 });
      }
    }
    // recovered drivers return; stand-ins step aside
    const benched: string[] = (t as any).benched ?? [];
    for (const d of benched.slice()) {
      const p = u.people[d];
      if (p.status !== 'deceased' && !p.injuries.some((i) => i.returnDay > m.day) && p.health >= 0.55) {
        const stand = t.drivers.find((x) => u.people[x].notes.includes(`stand-in for ${d}`));
        if (stand) { const sp = u.people[stand]; t.drivers = t.drivers.map((x) => (x === stand ? d : x)); sp.teamId = undefined; sp.contract = undefined; sp.status = 'free'; sp.notes = sp.notes.filter((n) => n !== `stand-in for ${d}`); const r = sp.roles.find((x) => x.role === 'driver' && x.toDay === undefined); if (r) r.toDay = m.day; }
        (t as any).benched = benched.filter((x) => x !== d);
      } else if (p.status === 'deceased' || p.status === 'retired') (t as any).benched = benched.filter((x) => x !== d);
    }
    e.drivers = t.drivers.slice(0, 2);
  }
  const setup = buildSetup(u, m);
  if (setup.entrants.length < 6) {
    m.status = 'cancelled'; m.cancelReason = `only ${setup.entrants.length} entries`;
    addEvent(u, { day: m.day, type: 'meeting-cancelled', scope: 'meeting', title: `${m.name} cancelled: too few entries`, meetingId: m.id, severity: 0.5, facts: { entries: setup.entrants.length } });
    return null;
  }
  u.setups[m.id] = packSetup(setup);
  return { setup };
}

export function rulesSnap(u: Universe, regs: RegSet, laps: number): WeekendSetup['rules'] {
  const I = u.world.industry;
  return {
    year: regs.year, laps, maxSeconds: regs.maxMinutes * 60, safetyCar: regs.safetyCar, pitKph: regs.pitSpeedKph, refuel: regs.refuelling,
    compounds: regs.compounds.slice(), wetTyres: regs.wetTyres.slice(), mandatoryTwo: regs.mandatoryTwoCompounds, penalties: regs.penalties, blueFlags: regs.blueFlags,
    classifiedPct: regs.points.classifiedPct, redFlagRestart: regs.redFlagRestart, fuelLimitKg: regs.fuelLimitKg, teamOrders: regs.teamOrdersAllowed,
    crashStructures: regs.crashStructures, cockpitProtection: regs.cockpitProtection, medical: regs.medical, fatalities: !!(u.meta.settings as any).fatalities,
    qualiFormat: regs.qualifying, pitServiceBase: q4(2.6 + 55 * dexp(-I * 4.6)), refuelRate: q4(0.8 + 11 * clamp(I, 0, 1)), radio: I > 0.55, telemetry: q4(clamp((I - 0.5) * 1.6, 0, 1)),
  };
}

export function buildSetup(u: Universe, m: Meeting): WeekendSetup {
  const s = u.seasons[m.year];
  const regs = u.regs.sets[m.regSetId];
  const lv = u.layouts[m.layoutVersionId];
  const entrants: EntrantSetup[] = [];
  const standingPos = (id: string) => { const sorted = s.driverStandings.slice().sort((a, b) => b.points - a.points); const i = sorted.findIndex((x) => x.id === id); return i < 0 ? sorted.length + 1 : i + 1; };
  const leaderPts = Math.max(0, ...s.driverStandings.map((x) => x.points));
  const remaining = s.meetings.filter((x) => x.status === 'scheduled').length;
  const maxPts = regs.points.table[0] + regs.points.fastestLap + regs.points.pole;
  for (const e of s.entries) {
    const t = u.teams[e.teamId];
    if (!t || t.status !== 'active') continue;
    const car = u.cars[e.carId];
    e.drivers.forEach((d, k) => {
      const p = u.people[d];
      const age = ageYears(p.dob, m.day);
      const pts = s.driverStandings.find((x) => x.id === d)?.points ?? 0;
      const fit = 1 - Math.abs(p.balancePref - car.current.balance) - (p.style === 'smooth' && car.current.aeroWindow > 0.5 ? 0.2 : 0) + (p.style === 'aggressive' && car.current.powerKW > 400 ? 0.1 : 0);
      entrants.push({
        no: e.nos[k] ?? 99, driverId: d, teamId: t.id, carId: car.id, name: p.last, full: `${p.first} ${p.last}`, code: (p as any).code ?? p.last.slice(0, 3).toUpperCase(), team: t.name, teamCode: t.code,
        colour: t.colours.primary, colour2: t.colours.secondary, accent: t.colours.accent, pattern: t.pattern,
        d: {
          pace: q4(p.attrs.pace), quali: q4(p.attrs.quali), racecraft: q4(p.attrs.racecraft), defence: q4(p.attrs.defence), consistency: q4(p.attrs.consistency), aggression: q4(p.attrs.aggression),
          wet: q4(p.attrs.wet), mechSympathy: q4(p.attrs.mechSympathy), adaptability: q4(p.attrs.adaptability), pressure: q4(p.attrs.pressure), fitness: q4(p.attrs.fitness),
          form: q4(p.form), confidence: q4(p.confidence), health: q4(p.health), starts: p.experience, trackExp: p.circuitExp[m.venueId] ?? 0, age: q4(age), rookie: p.experience < 3,
          discipline: q4(p.personality.discipline * 100), temperament: q4(p.personality.temperament * 100), balancePref: q4(p.balancePref),
        },
        c: Object.fromEntries(Object.entries(car.current).map(([kk, v]) => [kk, q4(v as number)])) as any,
        vis: { ...car.visual, wing: q4(car.visual.wing) },
        crew: q4(t.crew), engineering: q4(t.engineering), strategyRisk: q4(t.philosophy.risk), forecastSkill: q4(clamp((u.world.industry - 0.3) * 1.2 + (t.tech['telemetry']?.status === 'developed' ? 0.15 : 0), 0, 1)),
        fit: q4(clamp(fit, -1, 1)), teammate: -1, rivals: [], friends: [],
        champPos: standingPos(d), champGap: leaderPts - pts, contender: leaderPts - pts <= remaining * maxPts * 0.6 && standingPos(d) <= 4 && m.round > 2, orders: 'none',
      });
    });
  }
  // cross references by entrant index
  entrants.forEach((a, i) => {
    a.teammate = entrants.findIndex((b, j) => j !== i && b.teamId === a.teamId);
    entrants.forEach((b, j) => {
      if (i === j) return;
      const riv = relBetween(u, a.driverId, b.driverId, 'rivalry');
      if (riv && riv.status === 'active' && riv.intensity > 0.15) a.rivals.push([j, q4(riv.intensity)]);
      const fr = relBetween(u, a.driverId, b.driverId, 'friendship');
      if (fr && fr.status === 'active' && fr.intensity > 0.15) a.friends.push([j, q4(fr.intensity)]);
    });
  });
  // team orders in favour of a title contender (when allowed and the gap is real)
  if (regs.teamOrdersAllowed && m.round > s.meetings.length * 0.5) {
    for (const a of entrants) {
      if (a.teammate < 0) continue;
      const b = entrants[a.teammate];
      if (a.contender && a.champPos < b.champPos && (s.driverStandings.find((x) => x.id === a.driverId)?.points ?? 0) > (s.driverStandings.find((x) => x.id === b.driverId)?.points ?? 0) + maxPts) { a.orders = 'lead'; b.orders = 'second'; }
    }
  }
  const decider = remaining <= 2 && entrants.filter((e) => e.contender).length >= 2;
  return {
    v: ENGINE_VERSION, meetingId: m.id, seed: `${u.meta.seed}::meeting:${m.id}`, year: m.year, month: monthOf(m.day), name: m.name,
    layout: { geometryId: m.geometryId, grip: q4(lv.grip), barrier: lv.barrier, safety: q4(lv.safety), pitQuality: q4(lv.pitQuality), surface: lv.surface },
    rules: rulesSnap(u, regs, m.laps), entrants, significance: m.significance, titleContext: decider ? 'decider' : m.round > s.meetings.length * 0.6 ? 'late' : '',
  };
}

// ---------------------------------------------------------------------------- results into history
export function pointsFor(regs: RegSet, row: { pos: number | null; status: string }, fastest: boolean, pole: boolean, half: boolean): number {
  let p = row.pos !== null ? regs.points.table[row.pos - 1] ?? 0 : 0;
  if (fastest && regs.points.fastestLap && row.pos !== null && row.pos <= regs.points.fastestLapMaxPos) p += regs.points.fastestLap;
  if (pole && regs.points.pole) p += regs.points.pole;
  return half ? p / 2 : p;
}

export function hashRecord(rows: { driverId: string; pos: number | null; laps: number; time: number | null }[]): string {
  let h = 2166136261;
  const str = rows.map((r) => `${r.driverId}:${r.pos}:${r.laps}:${r.time}`).join('|');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16);
}

export function finishMeeting(u: Universe, m: Meeting, setup: WeekendSetup, q: RaceState, r: RaceState) {
  const s = u.seasons[m.year];
  const regs = u.regs.sets[m.regSetId];
  const tr = getTrack(setup.layout.geometryId);
  const rng = rngFor(u, 'season');
  const day = m.day;
  // postponement: the race could not start today; one re-run the following weekend, else cancelled
  if (r.phase === 'postponed') {
    if (!m.postponedFrom) {
      const ev = addEvent(u, { day, type: 'race-postponed', scope: 'meeting', title: `${m.name} postponed: ${r.endNote.replace('postponed: ', '')}`, meetingId: m.id, venues: [m.venueId], severity: 0.5, facts: { reason: r.endNote } });
      m.postponedFrom = m.day; m.day = m.day + 7; m.causeEventIds.push(ev.id);
      // keep calendar order valid
      s.meetings.sort((a, b) => a.day - b.day || a.round - b.round);
      return;
    }
    m.status = 'cancelled'; m.cancelReason = `weather (${r.endNote.replace('postponed: ', '')})`;
    addEvent(u, { day, type: 'meeting-cancelled', scope: 'meeting', title: `${m.name} cancelled after postponement`, meetingId: m.id, severity: 0.5 });
    return;
  }
  const cls = classify(r, setup, tr);
  const qualiValid = setup.rules.qualiFormat !== 'ballot' && !q.events.some((e) => e.kind === 'qcancelled');
  const qualiRows: QualiRow[] = q.q!.gridOrder.map((k, i) => { const e = setup.entrants[q.cars[k].i]; const best = q.q!.best[k]; return { driverId: e.driverId, teamId: e.teamId, pos: i + 1, time: Number.isFinite(best) ? +best.toFixed(3) : null }; });
  const fastestK = r.fastest?.i;
  const poleDriver = qualiRows[0]?.driverId;
  const half = cls.halfPoints;
  const rows: ResultRow[] = cls.rows.map((cr) => {
    const car = r.cars[cr.i];
    const e = setup.entrants[car.i];
    const isFast = fastestK === cr.i;
    return {
      pos: cr.pos, driverId: e.driverId, teamId: e.teamId, carId: e.carId, no: e.no, grid: cr.grid, laps: cr.laps, time: cr.time, status: cr.status, reason: cr.reason, category: cr.category, where: cr.where,
      points: cls.status === 'abandoned' ? 0 : pointsFor(regs, cr, isFast, qualiValid && e.driverId === poleDriver, half),
      bestLap: cr.bestLap, fastestLap: isFast, pits: cr.pits, penalties: cr.penalties, ledLaps: cr.led, paceIndex: cr.paceIndex, cleanLaps: cr.cleanLaps,
    };
  });
  const rec: RaceRecord = {
    meetingId: m.id, year: m.year, round: m.round, name: m.name, day, venueId: m.venueId, geometryId: m.geometryId, layoutVersionId: m.layoutVersionId, regSetId: m.regSetId,
    status: cls.status, lapsScheduled: m.laps, lapsCompleted: cls.lapsCompleted, distanceKm: +(cls.lapsCompleted * tr.length / 1000).toFixed(1), durationS: Math.round(r.t),
    weather: { start: r.startWeather, wetLaps: r.wetLaps, maxRain: +r.maxRain.toFixed(1), trackTemp: Math.round(r.w.trackTemp), airTemp: Math.round(r.w.air), changeable: r.changeable },
    quali: qualiRows, results: rows, events: [...q.events.filter((e) => e.sig >= 0.5).map((e) => ({ ...e, kind: 'q:' + e.kind })), ...r.events.filter(keepEvent)],
    pole: poleDriver && qualiValid ? { driverId: poleDriver, time: qualiRows[0].time } : undefined,
    fastest: r.fastest ? { driverId: setup.entrants[r.cars[r.fastest.i].i].driverId, time: +r.fastest.t.toFixed(3), lap: r.fastest.lap } : undefined,
    safetyCars: r.scCount, redFlags: r.redCount, overtakes: r.overtakeCount, leadChanges: r.leadChanges, halfPoints: half,
    hash: hashRecord(rows), engineVersion: setup.v,
  };
  u.races[m.id] = rec;
  m.status = cls.status === 'abandoned' ? 'abandoned' : 'completed';
  if (cls.status === 'abandoned') addEvent(u, { day, type: 'race-abandoned', scope: 'meeting', title: `${m.name} abandoned`, meetingId: m.id, severity: 0.6, facts: { note: r.endNote } });
  // standings
  if (cls.status !== 'abandoned') {
    for (const row of rows) {
      let ds = s.driverStandings.find((x) => x.id === row.driverId);
      if (!ds) { ds = { id: row.driverId, points: 0, wins: 0, podiums: 0, results: [], best: 99 }; s.driverStandings.push(ds); }
      ds.points += row.points; if (row.pos === 1) ds.wins++; if (row.pos !== null && row.pos <= 3) ds.podiums++;
      ds.results[m.round - 1] = row.pos; if (row.pos !== null) ds.best = Math.min(ds.best, row.pos);
      const ts = s.teamStandings.find((x) => x.id === row.teamId);
      if (ts) { ts.points += row.points; if (row.pos === 1) ts.wins++; if (row.pos !== null && row.pos <= 3) ts.podiums++; if (row.pos !== null) ts.best = Math.min(ts.best, row.pos); }
    }
    sortStandings(s.driverStandings); sortStandings(s.teamStandings);
  }
  // ratings, people, relationships, money
  updateElo(u, rec, qualiValid);
  peopleAfterRace(u, rng, m, setup, rec, r);
  relationshipsAfterRace(u, m, setup, rec, r);
  const excitement = clamp(rec.overtakes / 25 + rec.leadChanges / 6 + (rec.weather.changeable ? 0.3 : 0), 0, 1.5);
  u.venues[m.venueId].popularity = clamp(u.venues[m.venueId].popularity + (excitement - 0.5) * 4, 5, 100);
  u.world.popularity = clamp(u.world.popularity + (excitement - 0.55) * 0.8 * m.significance, 5, 100);
  titleCheck(u, s, m, regs);
  afterRace(u, rec);
}

/** Canonical race history keeps consequential events; the complete stream is reproducible by replay. */
function keepEvent(e: { kind: string; sig: number; pos?: number }): boolean {
  switch (e.kind) {
    case 'overtake': return (e.pos ?? 99) <= 10;
    case 'mistake': case 'spin': return (e.pos ?? 99) <= 6 || e.sig >= 0.55;
    case 'posChange': case 'slowstop': case 'problem': return e.sig >= 0.4;
    case 'grid': return false;
    default: return true;
  }
}

/** Restore a stored setup with display names from stable IDs and the season's entry branding. */
export function loadSetup(u: Universe, meetingId: string): WeekendSetup | null {
  const str = u.setups[meetingId]; if (!str) return null;
  const year = u.races[meetingId]?.year ?? +meetingId.slice(1, 5);
  const s = u.seasons[year];
  return unpackSetup(str, ({ driverId, teamId }) => {
    const p = u.people[driverId]; const e = s?.entries.find((x) => x.teamId === teamId); const t = u.teams[teamId];
    return { name: p?.last ?? driverId, full: p ? `${p.first} ${p.last}` : driverId, code: (p as any)?.code ?? driverId.slice(-3), team: e?.name ?? t?.name ?? teamId, teamCode: e?.code ?? t?.code ?? teamId, colour: e?.colours.primary ?? t?.colours.primary ?? '#888', colour2: e?.colours.secondary ?? '#fff', accent: e?.colours.accent ?? '#000', pattern: e?.pattern ?? 'plain' };
  });
}

function sortStandings(rows: StandingRow[]) {
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    // countback: most wins, then most seconds, thirds...
    for (let p = 1; p <= 20; p++) { const ca = a.results.filter((x) => x === p).length, cb = b.results.filter((x) => x === p).length; if (ca !== cb) return cb - ca; }
    return 0;
  });
}

function peopleAfterRace(u: Universe, rng: Rng, m: Meeting, setup: WeekendSetup, rec: RaceRecord, r: RaceState) {
  const n = rec.results.length;
  for (const row of rec.results) {
    const p = u.people[row.driverId];
    if (!p) continue;
    if (p.experience === 0) { p.debutDay = m.day; p.debutMeetingId = m.id; addEvent(u, { day: m.day, type: 'debut', scope: 'driver', title: `${p.first} ${p.last} makes championship debut`, people: [p.id], teams: [row.teamId], meetingId: m.id, severity: 0.25, facts: { age: Math.floor(ageYears(p.dob, m.day)), pos: row.pos, grid: row.grid } }); }
    p.experience++;
    p.circuitExp[m.venueId] = (p.circuitExp[m.venueId] ?? 0) + 1;
    // performance against observable expectation: grid, team-mate, errors
    const tm = rec.results.find((x) => x.teamId === row.teamId && x.driverId !== row.driverId);
    let perf = 0;
    if (row.pos !== null && row.grid) perf += clamp((row.grid - row.pos) / Math.max(4, n / 3), -1, 1) * 0.4;
    if (tm) { const a = row.pos ?? 99, b = tm.pos ?? 99; perf += a < b ? 0.3 : a > b ? -0.3 : 0; }
    if (row.category === 'driver' || row.category === 'contact') perf -= 0.5;
    if (row.pos === 1) perf += 0.4;
    p.form = clamp(p.form * 0.65 + perf * 0.35, -1, 1);
    const resil = 0.5 + p.personality.resilience * 0.5;
    p.confidence = clamp(p.confidence + (perf > 0 ? perf * 0.06 : perf * 0.06 / resil), 0.05, 0.98);
    p.reputation = clamp(p.reputation * 0.985 + (row.pos === 1 ? 3 : row.pos !== null && row.pos <= 3 ? 1.2 : row.pos !== null && row.pos <= 6 ? 0.4 : 0) * setup.significance, 0, 100);
  }
  // injuries (proportionate; handled without spectacle)
  for (const ev of r.events) {
    if (ev.kind !== 'injury' && ev.kind !== 'fatal') continue;
    const p = ev.a ? u.people[ev.a] : undefined; if (!p) continue;
    const sev = ev.value ?? 0.3;
    const row = rec.results.find((x) => x.driverId === p.id);
    if (ev.kind === 'fatal') {
      p.status = 'deceased'; p.dod = m.day; p.health = 0;
      if (p.teamId) { const t = u.teams[p.teamId]; if (t) t.drivers = t.drivers.filter((x) => x !== p.id); }
      const fev = addEvent(u, { day: m.day, type: 'fatality', scope: 'driver', title: `${p.first} ${p.last} dies after an accident at ${m.name}`, people: [p.id], teams: row ? [row.teamId] : [], venues: [m.venueId], meetingId: m.id, severity: 1, facts: { where: ev.where, age: Math.floor(ageYears(p.dob, m.day)) } });
      u.world.safetyAttitude = clamp(u.world.safetyAttitude + 0.08, 0, 1);
      safetyReview(u, rng, m.venueId, m.day + 30, fev.id);
      continue;
    }
    const returnDay = m.day + Math.round(sev * 150);
    const iev = addEvent(u, { day: m.day, type: sev > 0.5 ? 'serious-injury' : 'injury', scope: 'driver', title: `${p.first} ${p.last} ${sev > 0.5 ? 'seriously injured' : 'injured'} at ${m.name}`, people: [p.id], teams: row ? [row.teamId] : [], venues: [m.venueId], meetingId: m.id, severity: sev, facts: { where: ev.where, weeks: Math.round((returnDay - m.day) / 7) } });
    p.injuries.push({ day: m.day, eventId: iev.id, severity: +sev.toFixed(2), returnDay, cause: `crash at ${ev.where ?? m.name}`, meetingId: m.id });
    p.health = clamp(p.health - sev * 0.8, 0.05, 1);
    p.confidence = clamp(p.confidence - sev * 0.15, 0.05, 1);
    u.world.safetyAttitude = clamp(u.world.safetyAttitude + sev * 0.02, 0, 1);
    if (sev > 0.6 && rng.chance(0.5)) safetyReview(u, rng, m.venueId, m.day + 30, iev.id);
  }
}

function relationshipsAfterRace(u: Universe, m: Meeting, setup: WeekendSetup, rec: RaceRecord, r: RaceState) {
  const id = (k?: number) => (k === undefined ? undefined : setup.entrants[r.cars[k].i].driverId);
  const passes = new Map<string, number>();
  for (const ev of r.events) {
    const a = ev.a, b = ev.b;
    if (!a || !b) continue;
    if (ev.kind === 'contact') bumpRel(u, a, b, 'rivalry', 0.12, `collision at ${ev.where ?? m.name}`, m.day, m.id);
    if (ev.kind === 'penalty') bumpRel(u, a, b, 'rivalry', 0.06, 'penalty after a clash', m.day, m.id);
    if (ev.kind === 'overtake' && (ev.pos ?? 99) <= 5) { const k = a < b ? `${a}|${b}` : `${b}|${a}`; passes.set(k, (passes.get(k) ?? 0) + 1); }
    if (ev.kind === 'contact') { const fr = relBetween(u, a, b, 'friendship'); if (fr) bumpRel(u, a, b, 'friendship', -0.1, 'collision', m.day, m.id); }
  }
  // repeated wheel-to-wheel fights for the front, not single routine passes
  for (const [k, n] of passes) if (n >= 2) { const [a, b] = k.split('|'); bumpRel(u, a, b, 'rivalry', 0.04 * n, `${n} passes for the lead places`, m.day, m.id); }
  // team-mates finishing together at the front
  for (const row of rec.results) {
    const tm = rec.results.find((x) => x.teamId === row.teamId && x.driverId > row.driverId);
    if (tm && row.pos && tm.pos && Math.abs(row.pos - tm.pos) === 1 && Math.min(row.pos, tm.pos) <= 3) bumpRel(u, row.driverId, tm.driverId, 'rivalry', 0.05, 'team-mates fighting at the front', m.day, m.id);
    // repeated mechanical failures sour driver and team
    if (row.category === 'mechanical') {
      const t = u.teams[row.teamId]; if (!t) continue;
      const recent = Object.values(u.races).filter((x) => x.year === m.year).flatMap((x) => x.results).filter((x) => x.driverId === row.driverId && x.category === 'mechanical').length;
      if (recent >= 3 && t.principalId) bumpRel(u, row.driverId, t.principalId, 'dispute', 0.15, `${recent} mechanical failures this season`, m.day, m.id);
    }
  }
  void id;
}

function titleCheck(u: Universe, s: Season, m: Meeting, regs: RegSet) {
  if (s.decidedRound) return;
  const remaining = s.meetings.filter((x) => x.status === 'scheduled').length;
  const maxPer = regs.points.table[0] + regs.points.fastestLap + regs.points.pole;
  const [a, b] = s.driverStandings;
  if (!a || a.points <= 0) return;
  if (!b || a.points - b.points > remaining * maxPer || remaining === 0) {
    if (remaining === 0 && b && a.points === b.points) return; // countback handled at season end
    s.decidedRound = m.round;
    const p = u.people[a.id];
    addEvent(u, { day: m.day, type: remaining >= 2 ? 'title-decided-early' : 'title-decided', scope: 'driver', title: `${p.first} ${p.last} clinches the ${m.year} title${remaining ? ` with ${remaining} round${remaining > 1 ? 's' : ''} to spare` : ''}`, people: [a.id], meetingId: m.id, severity: 0.9, facts: { round: m.round, remaining, margin: a.points - (b?.points ?? 0) } });
  }
}

// ---------------------------------------------------------------------------- season end
function seasonEnd(u: Universe, year: number, day: Day) {
  const s = u.seasons[year];
  const rng = rngFor(u, 'season');
  tickEvents(u, rngFor(u, 'events'), u.clock.day, day, year);
  u.clock.day = day; u.clock.phase = 'postseason';
  const held = s.meetings.filter((m) => m.status === 'completed').length;
  if (s.status === 'running') {
    if (held === 0) { s.status = 'cancelled'; s.statusReason = s.statusReason ?? 'no races held'; }
    else s.status = 'complete';
  }
  // an interrupted season only has a champion if at least half of its planned races were run
  const titleAwarded = s.status === 'complete' || (s.status === 'interrupted' && held >= s.meetings.length / 2);
  if (titleAwarded && s.driverStandings.length) {
    s.championId = s.driverStandings[0].id;
    s.teamChampionId = s.teamStandings[0]?.id;
    const p = u.people[s.championId];
    p.reputation = clamp(p.reputation + 12, 0, 100);
    addEvent(u, { day, type: 'champion', scope: 'driver', title: `${p.first} ${p.last} is ${year} champion${s.status === 'interrupted' ? ' (interrupted season)' : ''}`, people: [p.id], teams: s.teamChampionId ? [s.teamChampionId] : [], severity: 1, facts: { points: s.driverStandings[0].points, wins: s.driverStandings[0].wins, margin: s.driverStandings[0].points - (s.driverStandings[1]?.points ?? 0), interrupted: s.status === 'interrupted', held, planned: s.meetings.length } });
  } else if (s.status === 'interrupted') {
    addEvent(u, { day, type: 'title-not-awarded', scope: 'world', title: `No ${year} title: only ${held} of ${s.meetings.length} races run`, severity: 0.7 });
  }
  eloSeasonEnd(u, year, new Set(s.driverStandings.map((x) => x.id)));
  for (const t of activeTeams(u)) teamYearEnd(u, t, rng, year, day);
  resolveTeamCrises(u, rng, year, day);
  reviewRegulations(u, rng, year, day);
  evolveVenues(u, rng, year, day);
  afterSeason(u, year, day);
  s.review = s.review ?? { year, headline: '', paragraphs: [], facts: {} };
}

export { TECHS };
void fmtDate; void carRatingFor;
export type { Person, Team };
