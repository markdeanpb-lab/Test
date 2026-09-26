// Regulations. Every season's exact RegSet is stored and referenced by each meeting. Changes arise from
// recorded causes (speeds, injuries, dominance, costs, environment, spectacle, new technology) and are
// normally announced a season ahead; emergencies take effect immediately and say why.
import type { Universe, RegSet, PointsRule, Day } from '../types';
import { Rng } from '../rng';
import { clamp } from '../dmath';
import { dayOf } from '../dates';
import { TECH_BY_ID, techFeasible } from './tech';
import { addEvent } from './events';

export const POINTS_TABLES: PointsRule[] = [
  { table: [8, 6, 4, 3, 2, 1], fastestLap: 0, fastestLapMaxPos: 0, pole: 0, classifiedPct: 0.75, halfPointsBelowPct: 0.6, dropScores: 0 },
  { table: [8, 6, 4, 3, 2], fastestLap: 1, fastestLapMaxPos: 20, pole: 0, classifiedPct: 0.75, halfPointsBelowPct: 0.6, dropScores: 0 },
  { table: [9, 6, 4, 3, 2, 1], fastestLap: 0, fastestLapMaxPos: 0, pole: 0, classifiedPct: 0.9, halfPointsBelowPct: 0.75, dropScores: 0 },
  { table: [10, 6, 4, 3, 2, 1], fastestLap: 0, fastestLapMaxPos: 0, pole: 0, classifiedPct: 0.9, halfPointsBelowPct: 0.75, dropScores: 0 },
  { table: [10, 8, 6, 5, 4, 3, 2, 1], fastestLap: 0, fastestLapMaxPos: 0, pole: 0, classifiedPct: 0.9, halfPointsBelowPct: 0.75, dropScores: 0 },
  { table: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], fastestLap: 0, fastestLapMaxPos: 0, pole: 0, classifiedPct: 0.9, halfPointsBelowPct: 0.75, dropScores: 0 },
  { table: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], fastestLap: 1, fastestLapMaxPos: 10, pole: 0, classifiedPct: 0.9, halfPointsBelowPct: 0.75, dropScores: 0 },
  { table: [30, 24, 20, 17, 15, 13, 11, 9, 7, 5, 4, 3, 2, 1], fastestLap: 1, fastestLapMaxPos: 10, pole: 1, classifiedPct: 0.9, halfPointsBelowPct: 0.75, dropScores: 0 },
];

export function initialRegs(u: Universe): RegSet {
  const km = u.meta.settings.raceFormat === 'sprint' ? 50 : 100;
  return {
    id: 'REG-1926', year: u.meta.settings.startYear, label: 'Founding rules', reasons: ['The championship\'s founding regulations'], causeEventIds: [], announcedDay: dayOf(u.meta.settings.startYear - 1, 11, 1), emergency: false,
    powerCapKW: 135, fuel: 'petrol', fuelLimitKg: null, minMassKg: 700, aeroCap: 99, groundEffect: true, hybrid: false, electric: false,
    compounds: ['treaded'], wetTyres: [], mandatoryTwoCompounds: false, refuelling: true, safetyCar: false, redFlagRestart: false,
    crashStructures: 0.04, cockpitProtection: 0, medical: 0.08, pitSpeedKph: null, qualifying: 'ballot', points: POINTS_TABLES[0],
    raceKm: km, maxMinutes: 150, penalties: 'fines', blueFlags: false, costCap: null, bannedTech: [], testingDays: 20, maxEntries: 30, teamOrdersAllowed: true,
  };
}

interface Change { apply: (r: RegSet) => void; reason: string; area: string; causeIds: string[]; label: string }

/** Autumn review: decide next season's rules from what has actually happened. */
export function reviewRegulations(u: Universe, rng: Rng, year: number, day: Day) {
  const cur = u.regs.sets[u.regs.current];
  const nextYear = year + 1;
  if (u.regs.announced.some((a) => a.year === nextYear)) return; // already fixed
  const changes: Change[] = [];
  const w = u.world;
  const recent = (types: string[], years: number) => u.events.filter((e) => types.includes(e.type) && e.day > day - years * 365);
  const lastChange = Object.values(u.regs.sets).filter((r) => r.year <= year).sort((a, b) => b.year - a.year)[0];
  const stable = year - (lastChange?.year ?? 0) >= 3;

  // --- tyres follow technology
  if (cur.wetTyres.length === 0 && u.world.industry > 0.26) changes.push({ label: 'Rain tyres', area: 'tyres', reason: 'Tyre makers can now build dedicated rain tyres', causeIds: [], apply: (r) => { r.wetTyres = ['wet']; } });
  const slickAdopters = u.tech['slick-tyres']?.adopters.length ?? 0;
  if (cur.compounds.length === 1 && cur.compounds[0] === 'treaded' && slickAdopters >= 1) changes.push({ label: 'Slick era', area: 'tyres', reason: 'Slick tyres have arrived; a hard and a soft compound are homologated', causeIds: u.tech['slick-tyres'].eventIds.slice(-1), apply: (r) => { r.compounds = ['hard', 'soft']; r.wetTyres = ['wet']; } });
  if (cur.compounds.length === 2 && w.industry > 0.72 && rng.chance(0.3)) changes.push({ label: 'Three compounds', area: 'tyres', reason: 'Tyre supplier introduces a three-compound range with intermediates', causeIds: [], apply: (r) => { r.compounds = ['hard', 'medium', 'soft']; r.wetTyres = ['inter', 'wet']; } });
  if (cur.wetTyres.length === 1 && w.industry > 0.6 && rng.chance(0.35)) changes.push({ label: 'Intermediate tyres', area: 'tyres', reason: 'An intermediate tyre is added for damp conditions', causeIds: [], apply: (r) => { r.wetTyres = ['inter', 'wet']; } });

  // --- safety responds to injuries and the attitudes of the day
  const hurts = recent(['serious-injury', 'fatality'], 3);
  const causeIds = hurts.map((e) => e.id);
  if (!cur.safetyCar && w.safetyAttitude > 0.42 && w.industry > 0.45) changes.push({ label: 'Safety car', area: 'safety', reason: 'A safety car will neutralise races after serious incidents', causeIds, apply: (r) => { r.safetyCar = true; r.redFlagRestart = true; } });
  if (!cur.redFlagRestart && w.safetyAttitude > 0.3) changes.push({ label: 'Red-flag restarts', area: 'safety', reason: 'Stopped races may now be restarted', causeIds, apply: (r) => { r.redFlagRestart = true; } });
  if (cur.pitSpeedKph === null && w.safetyAttitude > 0.5 && w.industry > 0.6) changes.push({ label: 'Pit lane speed limit', area: 'safety', reason: 'Pit lane speed limit introduced to protect mechanics', causeIds, apply: (r) => { r.pitSpeedKph = 80; } });
  const safetyTarget = clamp(w.safetyAttitude * 1.05, 0, 1);
  const lastCrash = Object.values(u.regs.sets).filter((r) => r.label.includes('Crash protection')).map((r) => r.year).sort((a, b) => b - a)[0] ?? 0;
  if (year + 1 - lastCrash >= 3 && (safetyTarget - cur.crashStructures > 0.12 || (hurts.length >= 2 && safetyTarget > cur.crashStructures))) changes.push({ label: 'Crash protection', area: 'safety', reason: hurts.length ? `Stronger crash protection after ${hurts.length} serious accident${hurts.length > 1 ? 's' : ''}` : 'Crash-protection standards raised', causeIds, apply: (r) => { r.crashStructures = clamp(r.crashStructures + 0.15, 0, 1); r.medical = clamp(r.medical + 0.12, 0, 1); r.minMassKg += 10; } });
  if (cur.cockpitProtection < 0.5 && techFeasible(u, 'cockpit-protection') && w.safetyAttitude > 0.7) changes.push({ label: 'Cockpit protection', area: 'safety', reason: 'Head-protection structures become mandatory', causeIds, apply: (r) => { r.cockpitProtection = 0.9; r.minMassKg += 7; } });

  // --- speeds: if lap records have tumbled, cut power or downforce
  const speedGain = recentSpeedGain(u, year);
  if (speedGain > 0.06 && w.safetyAttitude > 0.35 && stable) {
    const aeroHeavy = Object.values(u.cars).filter((c) => c.year === year).reduce((a, c) => a + c.current.clA, 0) / Math.max(1, Object.values(u.cars).filter((c) => c.year === year).length);
    if (aeroHeavy > 2.5 && cur.aeroCap > aeroHeavy * 0.7) changes.push({ label: 'Downforce reduction', area: 'aero', reason: `Cornering speeds up ${(speedGain * 100).toFixed(0)}% in five seasons; downforce limited`, causeIds: [], apply: (r) => { r.aeroCap = +(aeroHeavy * 0.75).toFixed(2); } });
    else changes.push({ label: 'New engine formula', area: 'engine', reason: `Lap times ${(speedGain * 100).toFixed(0)}% quicker in five seasons; engine output capped`, causeIds: [], apply: (r) => { r.powerCapKW = Math.round(currentMaxPower(u, year) * 0.85); } });
  } else if (cur.powerCapKW < currentMaxPower(u, year) * 0.8 && speedGain < 0.0 && rng.chance(0.3)) {
    changes.push({ label: 'Engine limits relaxed', area: 'engine', reason: 'Racing has become slower; engine limits eased', causeIds: [], apply: (r) => { r.powerCapKW = Math.round(r.powerCapKW * 1.12); } });
  }
  // power cap must keep pace with technology or it becomes meaningless / impossible
  if (cur.powerCapKW < currentMaxPower(u, year) * 0.6) changes.push({ label: 'Engine formula update', area: 'engine', reason: 'The engine formula is updated to modern technology', causeIds: [], apply: (r) => { r.powerCapKW = Math.round(currentMaxPower(u, year) * 0.9); } });

  // --- dominance: a controversial technology behind a runaway team may be banned
  const dom = dominance(u, year);
  if (dom && dom.share >= 0.6) {
    const t = u.teams[dom.teamId];
    const suspects = Object.entries(t.tech).filter(([id, p]) => p.status === 'developed' && (TECH_BY_ID[id]?.banRisk ?? 0) > 0.3 && !cur.bannedTech.includes(id));
    if (suspects.length && rng.chance(0.55)) {
      const [id] = suspects.sort((a, b) => TECH_BY_ID[b[0]].banRisk - TECH_BY_ID[a[0]].banRisk)[0];
      const def = TECH_BY_ID[id];
      const evs = u.events.filter((e) => e.type === 'tech-breakthrough' && e.techId === id).map((e) => e.id);
      changes.push({ label: `${def.name} banned`, area: def.area, reason: `${t.name} won ${Math.round(dom.share * 100)}% of races; ${def.name.toLowerCase()} is outlawed on ${def.banRisk > 0.5 ? 'safety and cost' : 'cost'} grounds`, causeIds: evs, apply: (r) => { r.bannedTech = [...r.bannedTech, id]; if (id === 'ground-effect') r.groundEffect = false; } });
    }
  }
  // banned tech may return in modified form after a long gap
  for (const id of cur.bannedTech) {
    const w2 = u.tech[id];
    if (w2?.bannedDay && day - w2.bannedDay > 365 * 18 && rng.chance(0.2)) changes.push({ label: `${TECH_BY_ID[id].name} returns`, area: TECH_BY_ID[id].area, reason: `${TECH_BY_ID[id].name} readmitted under tighter limits after ${Math.round((day - w2.bannedDay) / 365)} years`, causeIds: [], apply: (r) => { r.bannedTech = r.bannedTech.filter((x) => x !== id); if (id === 'ground-effect') r.groundEffect = true; } });
  }

  // --- costs
  const failures = recent(['team-bankrupt', 'team-withdraws'], 4);
  if (cur.costCap === null && (failures.length >= 2 || w.economy < -0.45) && w.industry > 0.55) changes.push({ label: 'Cost cap', area: 'finance', reason: failures.length >= 2 ? `${failures.length} teams collapsed in four years; spending capped` : 'Severe economic downturn; spending capped', causeIds: failures.map((e) => e.id), apply: (r) => { r.costCap = Math.round(averageBudget(u) * 0.9); } });
  if (cur.testingDays > 6 && (failures.length >= 1 || w.economy < -0.3) && rng.chance(0.5)) changes.push({ label: 'Testing restrictions', area: 'finance', reason: 'Testing limited to control costs', causeIds: failures.map((e) => e.id), apply: (r) => { r.testingDays = Math.max(4, r.testingDays - 6); } });

  // --- environment and energy
  if (w.environment > 0.45 && cur.fuelLimitKg === null && w.industry > 0.6) changes.push({ label: 'Fuel limit', area: 'energy', reason: 'Environmental pressure: race fuel allowance limited', causeIds: [], apply: (r) => { r.fuelLimitKg = Math.round(avgFuelUse(u) * 0.9); r.refuelling = false; } });
  if (w.environment > 0.55 && !cur.hybrid && techFeasible(u, 'hybrid-unit')) changes.push({ label: 'Hybrid power units', area: 'engine', reason: 'Hybrid power units permitted to cut fuel use', causeIds: [], apply: (r) => { r.hybrid = true; r.minMassKg += 40; } });
  if (w.environment > 0.66 && cur.fuel !== 'synthetic' && cur.fuel !== 'electric' && techFeasible(u, 'synthetic-fuel')) changes.push({ label: 'Sustainable fuel', area: 'energy', reason: 'Fossil fuel replaced by synthetic fuel', causeIds: [], apply: (r) => { r.fuel = 'synthetic'; } });
  if (w.environment > 0.78 && !cur.electric && techFeasible(u, 'battery-electric')) changes.push({ label: 'Electric racing', area: 'energy', reason: 'Battery-electric cars admitted', causeIds: [], apply: (r) => { r.electric = true; r.fuelLimitKg = null; r.minMassKg += 60; } });
  if (cur.fuel === 'petrol' && w.industry > 0.5 && w.environment > 0.2 && rng.chance(0.4)) changes.push({ label: 'Unleaded fuel', area: 'energy', reason: 'Leaded fuel phased out', causeIds: [], apply: (r) => { r.fuel = 'unleaded'; } });

  // --- sporting format: spectacle, media and fairness
  const pop = w.popularity;
  const media = w.media;
  if (cur.qualifying === 'ballot' && (pop > 30 || year > 1932)) changes.push({ label: 'Timed practice', area: 'format', reason: 'Grid to be set by timed practice rather than ballot', causeIds: [], apply: (r) => { r.qualifying = 'practice'; } });
  if (cur.qualifying === 'practice' && (media === 'tv' || media === 'colour-tv') && rng.chance(0.12)) changes.push({ label: 'Single-lap qualifying', area: 'format', reason: 'Television wants every car\'s lap seen: one flying lap each', causeIds: [], apply: (r) => { r.qualifying = 'single-lap'; } });
  if ((cur.qualifying === 'practice' || cur.qualifying === 'single-lap') && (media === 'colour-tv' || media === 'digital') && w.industry > 0.8 && rng.chance(0.3)) changes.push({ label: 'Knockout qualifying', area: 'format', reason: 'Knockout qualifying introduced for broadcast drama', causeIds: [], apply: (r) => { r.qualifying = 'knockout'; } });
  const decidedEarly = recent(['title-decided-early'], 3).length;
  const pIdx = POINTS_TABLES.findIndex((p) => JSON.stringify(p.table) === JSON.stringify(cur.points.table) && p.fastestLap === cur.points.fastestLap);
  // points systems evolve slowly and only as the sport modernises (industry gates each step)
  const POINT_GATES = [0, 0.18, 0.32, 0.5, 0.7, 0.86, 0.95, 1.1];
  const lastPointsChange = Object.values(u.regs.sets).filter((r) => r.label.includes('Points system')).map((r) => r.year).sort((a, b) => b - a)[0] ?? u.meta.settings.startYear;
  if (pIdx >= 0 && pIdx < POINTS_TABLES.length - 1 && w.industry >= POINT_GATES[pIdx + 1] && year + 1 - lastPointsChange >= 8 && (decidedEarly >= 2 || (entryCount(u) > cur.points.table.length * 2.2 && rng.chance(0.25)) || rng.chance(0.05))) {
    const nxt = POINTS_TABLES[pIdx + 1];
    changes.push({ label: 'Points system', area: 'format', reason: decidedEarly >= 2 ? 'Titles settled too early; points reach further down the order' : 'Larger fields: points awarded to more finishers', causeIds: recent(['title-decided-early'], 3).map((e) => e.id), apply: (r) => { r.points = { ...nxt }; } });
  }
  if (cur.penalties === 'fines' && w.industry > 0.35 && (recent(['stewards-controversy'], 4).length > 0 || rng.chance(0.08))) changes.push({ label: 'Sporting penalties', area: 'format', reason: 'Stewards may now hand out time penalties', causeIds: recent(['stewards-controversy'], 4).map((e) => e.id), apply: (r) => { r.penalties = 'time'; } });
  if (cur.penalties === 'time' && w.industry > 0.6 && rng.chance(0.15)) changes.push({ label: 'Drive-through penalties', area: 'format', reason: 'Full penalty system including drive-throughs', causeIds: [], apply: (r) => { r.penalties = 'full'; } });
  if (!cur.blueFlags && w.industry > 0.3 && rng.chance(0.25)) changes.push({ label: 'Blue flags', area: 'format', reason: 'Lapped cars must yield to leaders', causeIds: [], apply: (r) => { r.blueFlags = true; } });
  if (cur.teamOrdersAllowed && recent(['team-orders-row'], 3).length > 0 && rng.chance(0.5)) changes.push({ label: 'Team orders banned', area: 'format', reason: 'Team orders outlawed after public controversy', causeIds: recent(['team-orders-row'], 3).map((e) => e.id), apply: (r) => { r.teamOrdersAllowed = false; } });
  if (cur.refuelling && w.industry > 0.65 && rng.chance(0.1)) changes.push({ label: 'Refuelling banned', area: 'format', reason: 'Refuelling banned on safety and cost grounds', causeIds: [], apply: (r) => { r.refuelling = false; } });
  if (!cur.mandatoryTwoCompounds && cur.compounds.length >= 2 && w.industry > 0.8 && rng.chance(0.25)) changes.push({ label: 'Two-compound rule', area: 'tyres', reason: 'Each car must use two dry compounds in a race', causeIds: [], apply: (r) => { r.mandatoryTwoCompounds = true; } });

  if (!changes.length) return;
  // keep reforms digestible: at most four headline changes per season
  const picked = changes.slice(0, 4);
  const next: RegSet = JSON.parse(JSON.stringify(cur));
  next.id = `REG-${nextYear}`;
  next.year = nextYear;
  next.label = picked.map((c) => c.label).join(', ');
  next.reasons = picked.map((c) => c.reason);
  next.causeEventIds = [...new Set(picked.flatMap((c) => c.causeIds))];
  next.announcedDay = day;
  next.emergency = false;
  for (const c of picked) c.apply(next);
  u.regs.sets[next.id] = next;
  u.regs.announced.push({ regSetId: next.id, year: nextYear, day });
  const ev = addEvent(u, { day, type: 'regs-announced', scope: 'regs', title: `${nextYear} regulations: ${next.label}`, severity: 0.5, facts: { year: nextYear, changes: picked.map((c) => ({ label: c.label, reason: c.reason, area: c.area })) }, causes: next.causeEventIds });
  next.causeEventIds = [...next.causeEventIds];
  void ev;
}

/** Apply the rules for a new season (announced set or carry over the current one). */
export function applyRegsForYear(u: Universe, year: number) {
  const ann = u.regs.announced.find((a) => a.year === year);
  if (ann) { u.regs.current = ann.regSetId; return true; }
  const cur = u.regs.sets[u.regs.current];
  if (cur.year !== year) {
    const copy: RegSet = JSON.parse(JSON.stringify(cur));
    copy.id = `REG-${year}`; copy.year = year; copy.label = 'Unchanged'; copy.reasons = ['No changes']; copy.causeEventIds = []; copy.emergency = false;
    u.regs.sets[copy.id] = copy;
    u.regs.current = copy.id;
  }
  return false;
}

/** Mid-season emergency rules (e.g. fuel shortage, safety). Recorded with explicit cause. */
export function emergencyRule(u: Universe, day: Day, year: number, label: string, reason: string, causeId: string, apply: (r: RegSet) => void) {
  const cur = u.regs.sets[u.regs.current];
  const next: RegSet = JSON.parse(JSON.stringify(cur));
  let n = 1; while (u.regs.sets[`REG-${year}-E${n}`]) n++;
  next.id = `REG-${year}-E${n}`; next.label = label; next.reasons = [reason]; next.causeEventIds = [causeId]; next.emergency = true; next.announcedDay = day; next.year = year;
  apply(next);
  u.regs.sets[next.id] = next;
  u.regs.current = next.id;
  // later meetings this season use the new set
  const season = u.seasons[year];
  if (season) for (const m of season.meetings) if (m.status === 'scheduled' && m.day > day) m.regSetId = next.id;
  addEvent(u, { day, type: 'regs-emergency', scope: 'regs', title: label, severity: 0.6, facts: { reason }, causes: [causeId] });
}

function recentSpeedGain(u: Universe, year: number): number {
  // compare average winning lap pace on the same geometries five seasons apart (like-for-like layouts only)
  const byGeo = new Map<string, { y: number; t: number }[]>();
  for (const r of Object.values(u.races)) {
    if (r.year < year - 6 || !r.fastest) continue;
    const arr = byGeo.get(r.geometryId) ?? []; arr.push({ y: r.year, t: r.fastest.time }); byGeo.set(r.geometryId, arr);
  }
  const gains: number[] = [];
  for (const arr of byGeo.values()) {
    const old = arr.filter((a) => a.y <= year - 4), neu = arr.filter((a) => a.y >= year - 1);
    if (!old.length || !neu.length) continue;
    const o = Math.min(...old.map((a) => a.t)), n = Math.min(...neu.map((a) => a.t));
    gains.push(o / n - 1);
  }
  if (!gains.length) return 0;
  return gains.reduce((a, b) => a + b, 0) / gains.length;
}
function currentMaxPower(u: Universe, year: number) { const cars = Object.values(u.cars).filter((c) => c.year === year); return cars.length ? Math.max(...cars.map((c) => c.spec.powerKW)) : 200; }
function averageBudget(u: Universe) { const ts = Object.values(u.teams).filter((t) => t.status === 'active'); return ts.reduce((a, t) => a + (t.finance[t.finance.length - 1]?.development ?? 0) + (t.finance[t.finance.length - 1]?.operations ?? 0), 0) / Math.max(1, ts.length); }
function avgFuelUse(u: Universe) { const reg = u.regs.sets[u.regs.current]; const cars = Object.values(u.cars).filter((c) => c.year === u.clock.year); const f = cars.length ? cars.reduce((a, c) => a + c.current.fuelPerKm, 0) / cars.length : 0.4; return f * reg.raceKm; }
function entryCount(u: Universe) { return Object.values(u.teams).filter((t) => t.status === 'active').length * 2; }
export function dominance(u: Universe, year: number): { teamId: string; share: number } | null {
  const counts = new Map<string, number>();
  let total = 0;
  for (const r of Object.values(u.races)) {
    if (r.year < year - 1 || r.year > year) continue;
    const win = r.results.find((x) => x.pos === 1); if (!win) continue;
    total++; counts.set(win.teamId, (counts.get(win.teamId) ?? 0) + 1);
  }
  if (total < 6) return null;
  const [teamId, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  return teamId ? { teamId, share: n / total } : null;
}
