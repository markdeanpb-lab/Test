// Teams: identity & lineage, finances (prize money, sponsors, owner backing, costs), development spending,
// staff, and the consequences of success or failure (takeover, merger, withdrawal, new entrants).
import type { Universe, Team, SponsorDeal, Day, Person } from '../types';
import { Rng } from '../rng';
import { clamp, dsqrt, dpow } from '../dmath';
import { TEAM_ROOTS, TEAM_FORMS, SPONSOR_SECTORS, NATIONS } from '../names';
import { addEvent, registerEvent, activeTeams } from './events';
import { nextId, createPerson } from './people';
import { scaleMoney } from './cars';
import { researchOptions, TECH_BY_ID } from './tech';
import { dayOf } from '../dates';

const ERA_COLOURS: [string, string][] = [
  ['#1f5130', 'British racing green'], ['#1c3f94', 'French blue'], ['#b3141b', 'Italian red'], ['#e8e8e4', 'German white'], ['#f2c230', 'Belgian yellow'],
  ['#f36f21', 'orange'], ['#6b2d5c', 'plum'], ['#101010', 'black'], ['#2a7fba', 'sky blue'], ['#7a1f1f', 'maroon'], ['#c9b458', 'gold'], ['#3d8b37', 'grass green'],
  ['#d9d9d9', 'silver'], ['#e0457b', 'pink'], ['#15898f', 'teal'], ['#5b4b8a', 'violet'], ['#8c5a2b', 'bronze'], ['#b6d7e8', 'ice blue'],
];
const PATTERNS: Team['pattern'][] = ['plain', 'stripe', 'band', 'chevron', 'quarters', 'hoops'];

export function teamName(u: Universe, rng: Rng, founderLast?: string): { name: string; short: string } {
  const taken = new Set(Object.values(u.teams).map((t) => t.name));
  const takenShort = new Set(Object.values(u.teams).filter((t) => t.status === 'active').map((t) => t.short));
  for (let i = 0; i < 50; i++) {
    const root = rng.pick(TEAM_ROOTS);
    const surname = founderLast ?? rng.pick(['Holloway', 'Pemberton', 'Delorme', 'Varela', 'Brandt', 'Ashby', 'Fairfax', 'Marchetti', 'Kessler', 'Whitmore', 'Sinclair', 'Laurent', 'Rinaldi', 'Hartmann', 'Crane', 'Latimer', 'Osborne', 'Vance', 'Talbot', 'Ferri', 'Moreau', 'Keller', 'Andrade', 'Tennant']);
    const form = rng.pick(TEAM_FORMS);
    const name = form.replace('{r}', root).replace('{s}', surname);
    if (taken.has(name)) continue;
    const short = form.includes('{r}') ? root.split(' ')[0] : surname;
    if (takenShort.has(short)) continue;
    return { name, short };
  }
  return { name: `Team ${Object.keys(u.teams).length + 1}`, short: `T${Object.keys(u.teams).length + 1}` };
}

function teamCode(u: Universe, short: string): string {
  const taken = new Set(Object.values(u.teams).filter((t) => t.status === 'active').map((t) => t.code));
  const base = short.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
  for (let i = 3; i <= base.length; i++) { const c = base.slice(0, 2) + base[i - 1]; if (!taken.has(c)) return c; }
  for (let i = 0; i < 26; i++) { const c = base.slice(0, 2) + String.fromCharCode(65 + i); if (!taken.has(c)) return c; }
  return base.slice(0, 3);
}

export function createTeam(u: Universe, rng: Rng, year: number, opts: { lineageId?: string; name?: string; short?: string; strength?: number; ownerType?: Team['ownerType']; base?: string } = {}): Team {
  const strength = opts.strength ?? rng.range(0.15, 0.7);
  const ownerType = opts.ownerType ?? rng.weighted(['privateer', 'works', 'patron', 'consortium'] as const, [4, year > 1950 ? 2.5 : 1.5, 2, year > 1970 ? 1.5 : 0.3]);
  const nm = opts.name ? { name: opts.name, short: opts.short ?? opts.name.split(' ')[0] } : teamName(u, rng);
  const lineageId = opts.lineageId ?? nextId(u, 'L');
  const id = nextId(u, 'T');
  const col = rng.pick(ERA_COLOURS);
  let secondary = rng.pick(ERA_COLOURS)[0]; if (secondary === col[0]) secondary = '#f4f1ea';
  const scale = scaleMoney(u);
  const t: Team = {
    id, lineageId, name: nm.name, short: nm.short, code: teamCode(u, nm.short), colours: { primary: col[0], secondary, accent: rng.pick(['#f4f1ea', '#111111', '#d4af37', '#c0c0c0']) }, pattern: rng.pick(PATTERNS),
    founded: year, base: opts.base ?? rng.pick(['St Albans', 'St Albans', 'Hatfield', 'Harpenden', 'Watford', 'Luton', 'Hertford', 'London', 'Paris', 'Milan', 'Stuttgart', 'Brussels', 'Coventry', 'Oxford', 'Northampton']),
    ownerType, status: 'active', cash: scale * (0.6 + strength * 2), debt: 0, finance: [], sponsors: [],
    ownerBacking: scale * (ownerType === 'works' ? rng.range(1.5, 3.5) : ownerType === 'patron' ? rng.range(0.8, 2) : ownerType === 'consortium' ? rng.range(0.6, 1.5) : rng.range(0.2, 0.7)),
    crew: clamp(0.35 + strength * 0.5 + rng.gauss(0, 0.08), 0.1, 0.95), engineering: clamp(0.3 + strength * 0.55 + rng.gauss(0, 0.08), 0.1, 0.95), facilities: clamp(0.25 + strength * 0.55 + rng.gauss(0, 0.08), 0.1, 0.95),
    prestige: clamp(20 + strength * 50 + rng.gauss(0, 8), 5, 95),
    philosophy: { focus: rng.pick(['power', 'aero', 'mechanical', 'reliability', 'balanced'] as const), risk: clamp(rng.gauss(0.5, 0.2), 0.05, 0.95), youth: clamp(rng.gauss(0.45, 0.2), 0, 1), stability: clamp(rng.gauss(0.5, 0.2), 0, 1) },
    knowledge: { engine: clamp(0.25 + strength * 0.5 + rng.gauss(0, 0.1), 0.05, 0.95), chassis: clamp(0.25 + strength * 0.5 + rng.gauss(0, 0.1), 0.05, 0.95), aero: clamp(0.2 + strength * 0.5 + rng.gauss(0, 0.1), 0.05, 0.95), reliability: clamp(0.25 + strength * 0.5 + rng.gauss(0, 0.1), 0.05, 0.95), efficiency: clamp(0.3 + strength * 0.4 + rng.gauss(0, 0.1), 0.05, 0.95) },
    tech: {}, drivers: [], joinedYear: year, predecessorIds: [], notes: [],
  };
  u.teams[id] = t;
  if (!u.lineages[lineageId]) u.lineages[lineageId] = { id: lineageId, founded: year, entrants: [], absorbed: [] };
  u.lineages[lineageId].entrants.push({ teamId: id, name: t.name, fromYear: year, how: opts.lineageId ? 'rename' : 'founded' });
  // leadership
  const principal = createPerson(u, rng, { kind: 'manager', year, nat: t.base === 'Paris' ? 'FRA' : t.base === 'Milan' ? 'ITA' : t.base === 'Stuttgart' ? 'GER' : t.base === 'Brussels' ? 'BEL' : 'GBR' });
  principal.status = 'active'; principal.teamId = id; principal.roles.push({ role: 'principal', teamId: id, fromDay: dayOf(year, 1, 1) });
  principal.skill = clamp((principal.skill ?? 0.5) * 0.6 + strength * 0.4, 0.1, 0.98);
  t.principalId = principal.id;
  const td = createPerson(u, rng, { kind: 'engineer', year });
  td.status = 'active'; td.teamId = id; td.roles.push({ role: 'technical-director', teamId: id, fromDay: dayOf(year, 1, 1) });
  td.skill = clamp((td.skill ?? 0.5) * 0.6 + strength * 0.4, 0.1, 0.98);
  t.techDirectorId = td.id;
  return t;
}

export function teamStrengthNow(u: Universe, t: Team): number {
  const K = t.knowledge;
  return (K.engine + K.chassis + K.aero + K.reliability) / 4;
}

// ------------------------------------------------------------------ yearly finance
export function prizeShare(pos: number, n: number): number {
  // top teams take more; everyone who races receives something
  const w = (p: number) => 1 / (p + 3);
  let tot = 0; for (let p = 1; p <= n; p++) tot += w(p);
  return w(pos) / tot;
}

export function exposure(u: Universe, t: Team, year: number): number {
  const season = u.seasons[year];
  const row = season?.teamStandings.find((r) => r.id === t.id);
  const pos = row ? season.teamStandings.indexOf(row) + 1 : 10;
  const n = season?.teamStandings.length ?? 12;
  const wins = row?.wins ?? 0;
  const star = Math.max(0, ...t.drivers.map((d) => u.people[d]?.reputation ?? 0));
  return clamp(1 - (pos - 1) / Math.max(1, n) + wins * 0.05 + star / 250 + t.prestige / 300, 0.05, 1.6);
}

/** Season-end accounts: income, costs, debt, sponsorship renewals. Returns the finance row. */
export function teamYearEnd(u: Universe, t: Team, rng: Rng, year: number, day: Day) {
  const scale = scaleMoney(u);
  const season = u.seasons[year];
  const n = season?.teamStandings.length ?? 12;
  const posIdx = season?.teamStandings.findIndex((r) => r.id === t.id) ?? -1;
  const pos = posIdx >= 0 ? posIdx + 1 : n;
  const pool = scale * 6;
  const prize = pool * prizeShare(pos, n);
  const sponsor = t.sponsors.filter((s) => s.fromYear <= year && s.untilYear >= year).reduce((a, s) => a + s.value, 0);
  const owner = t.ownerBacking * (1 + u.world.economy * 0.3);
  const wages = t.drivers.reduce((a, d) => a + (u.people[d]?.contract?.salary ?? 0), 0) + scale * (0.15 + t.engineering * 0.35 + t.crew * 0.1);
  const meetings = season?.meetings.filter((m) => m.status === 'completed').length ?? 8;
  const operations = scale * (0.25 + meetings * 0.05) * (0.8 + t.facilities * 0.4);
  const development = t.finance.length ? (t.finance[t.finance.length - 1] as any)._devPlanned ?? 0 : 0;
  const income = prize + sponsor + owner;
  const spend = wages + operations + development;
  t.cash += income - spend;
  // debt service
  if (t.cash < 0) { t.debt += -t.cash; t.cash = 0; }
  else if (t.debt > 0) { const pay = Math.min(t.debt, t.cash * 0.5); t.debt -= pay; t.cash -= pay; }
  t.debt *= 1.06;
  const row = { year, prize: r2(prize), sponsor: r2(sponsor), owner: r2(owner), other: 0, wages: r2(wages), development: r2(development), operations: r2(operations), cashEnd: r2(t.cash), debtEnd: r2(t.debt) };
  t.finance.push(row);
  // prestige follows results slowly
  t.prestige = clamp(t.prestige * 0.85 + (1 - (pos - 1) / Math.max(1, n)) * 100 * 0.15 + (season?.teamChampionId === t.id ? 6 : 0), 1, 100);
  // sponsor renewals depend on exposure and the economy
  const exp = exposure(u, t, year);
  t.sponsors = t.sponsors.filter((s) => s.untilYear > year);
  const want = 1 + (exp > 0.6 ? 1 : 0) + (u.world.media === 'tv' || u.world.media === 'colour-tv' || u.world.media === 'digital' ? 1 : 0);
  let lost: SponsorDeal | null = null;
  for (const s of t.sponsors) if (rng.chance(clamp(0.1 + (0.5 - exp) * 0.3 - u.world.economy * 0.15, 0.02, 0.6))) { lost = s; }
  if (lost) {
    t.sponsors = t.sponsors.filter((s) => s !== lost);
    const causes = u.events.filter((e) => (e.type === 'recession' && e.day > day - 700)).map((e) => e.id);
    addEvent(u, { day, type: 'sponsor-leaves', scope: 'team', title: `${lost.name} ends backing of ${t.name}`, teams: [t.id], severity: clamp(lost.value / Math.max(1, income), 0.1, 0.8), facts: { sponsor: lost.name, value: r2(lost.value), exposure: +exp.toFixed(2), economy: +u.world.economy.toFixed(2) }, causes });
  }
  while (t.sponsors.length < want && rng.chance(clamp(0.35 + exp * 0.4 + u.world.economy * 0.2, 0.05, 0.95))) {
    const [sector, names] = rng.pick(sectorsFor(u));
    const nm = rng.pick(names);
    if (t.sponsors.some((s) => s.name === nm)) break;
    const value = scale * rng.range(0.3, 1.2) * (0.5 + exp) * (1 + u.world.economy * 0.3);
    const deal: SponsorDeal = { id: nextId(u, 'S'), name: nm, sector, value: r2(value), fromYear: year + 1, untilYear: year + rng.intRange(1, 4), title: t.sponsors.length === 0 && rng.chance(0.3) };
    t.sponsors.push(deal);
    addEvent(u, { day, type: 'sponsor-signs', scope: 'team', title: `${nm} signs with ${t.name}`, teams: [t.id], severity: 0.2, facts: { sponsor: nm, sector, value: r2(value), years: deal.untilYear - deal.fromYear + 1, exposure: +exp.toFixed(2) } });
  }
  // owner backing drifts; works teams reassess after poor years
  t.ownerBacking = Math.max(0, t.ownerBacking * (1 + rng.gauss(0, 0.08) + u.world.economy * 0.05));
  return row;
}
function r2(v: number) { return Math.round(v * 100) / 100; }
function sectorsFor(u: Universe): [string, string[]][] {
  const I = u.world.industry;
  return SPONSOR_SECTORS.filter(([s]) => (s === 'technology' ? I > 0.55 : true) && (s === 'tobacco' ? I > 0.35 && u.world.safetyAttitude < 0.75 : true) && (s === 'energy' ? I > 0.8 : true));
}

// ------------------------------------------------------------------ development & staff (preseason)
export function planDevelopment(u: Universe, t: Team, rng: Rng, year: number, day: Day) {
  const scale = scaleMoney(u);
  const regs = u.regs.sets[u.regs.current];
  // budget available for development after expected commitments
  const expectedIncome = (t.finance[t.finance.length - 1]?.prize ?? scale * 0.4) + t.sponsors.filter((s) => s.fromYear <= year && s.untilYear >= year).reduce((a, s) => a + s.value, 0) + t.ownerBacking;
  const commitments = scale * (0.7 + t.engineering * 0.35) + t.drivers.reduce((a, d) => a + (u.people[d]?.contract?.salary ?? 0), 0);
  let dev = Math.max(scale * 0.05, ((t.cash - t.debt * 0.3) * 0.35 + expectedIncome - commitments - scale * (0.25 + u.meta.settings.meetings * 0.05)) * 0.85);
  if (regs.costCap !== null) dev = Math.min(dev, regs.costCap * 0.4);
  if (t.debt > expectedIncome) dev *= 0.4; // financial strain delays upgrades
  (t.finance[t.finance.length - 1] as any) && ((t.finance[t.finance.length - 1] as any)._devPlanned = r2(dev));
  if (!t.finance.length) t.finance.push({ year: year - 1, prize: 0, sponsor: 0, owner: 0, other: 0, wages: 0, development: 0, operations: 0, cashEnd: t.cash, debtEnd: t.debt, _devPlanned: r2(dev) } as any);
  // frontier moves on; everyone falls back unless they invest
  const baseDrift = 0.06 + (u.world.industry < 1.1 ? 0.02 : 0.005);
  const td = t.techDirectorId ? u.people[t.techDirectorId] : undefined;
  const staff = 0.45 * t.engineering + 0.35 * (td?.skill ?? 0.4) + 0.2 * t.facilities;
  // money has strongly diminishing returns: people, time and ideas limit what budgets can buy
  const eff = dpow(Math.max(0.01, dev / scale), 0.35) * (0.4 + staff * 0.8);
  const alloc = allocation(t);
  const K = t.knowledge as any;
  // knowledge diffusion: the field copies what works
  const best: any = {};
  for (const k of Object.keys(t.knowledge)) best[k] = Math.max(...activeTeams(u).map((x) => (x.knowledge as any)[k]));
  const champion = u.seasons[year - 1]?.teamChampionId === t.id;
  for (const k of Object.keys(t.knowledge)) {
    // the frontier is harder to hold the closer you are to it; the field copies what works
    const drift = baseDrift + (K[k] > 0.6 ? (K[k] - 0.6) * 0.3 : 0);
    const gain = eff * alloc[k] * 0.2 * dpow(Math.max(0.001, 1 - K[k]), 1.1) * rng.range(0.55, 1.45);
    const copy = 0.17 * (best[k] - K[k]);
    K[k] = clamp(K[k] - drift + gain + copy + rng.gauss(0, 0.02), 0.02, 0.99);
  }
  // occasional breakthroughs can come from anywhere (bolder teams find more of them)
  if (rng.chance(0.06 + t.philosophy.risk * 0.08)) {
    const area = rng.pick(Object.keys(t.knowledge));
    K[area] = clamp(K[area] + rng.range(0.08, 0.2), 0, 0.99);
    addEvent(u, { day, type: 'engineering-breakthrough', scope: 'team', title: `${t.name} find a breakthrough in ${area === 'efficiency' ? 'fuel efficiency' : area}`, teams: [t.id], severity: 0.35, facts: { area } });
  }
  // success breeds caution and complacency
  if (champion) { t.philosophy.risk = clamp(t.philosophy.risk - 0.05, 0.05, 0.95); t.engineering = clamp(t.engineering - 0.015, 0.05, 1); }
  else if ((u.seasons[year - 1]?.teamStandings.findIndex((r) => r.id === t.id) ?? 0) > 5) t.philosophy.risk = clamp(t.philosophy.risk + 0.04, 0.05, 0.95);
  // research programmes: at most two concurrent, uncertain outcomes
  const running = Object.entries(t.tech).filter(([, p]) => p.status === 'research');
  for (const [id, p] of running) {
    const d = TECH_BY_ID[id];
    p.progress += (eff * 0.6 + 0.2) / d.years * rng.range(0.6, 1.3);
    p.invested += scale * d.cost * 0.3;
    if (p.progress >= 1) {
      const ok = rng.chance(clamp(0.8 - d.uncertainty * 0.5 + staff * 0.25, 0.2, 0.97));
      if (ok) {
        p.status = 'developed'; p.doneYear = year; p.quality = clamp(rng.gauss(0.9 + staff * 0.2, 0.18 * d.uncertainty + 0.05), 0.4, 1.3);
        const w = u.tech[id];
        const first = w.adopters.length === 0;
        w.adopters.push(t.id);
        if (first) { w.firstTeam = t.id; w.firstDay = day; w.status = 'emerging'; }
        else if (w.adopters.length >= 4) w.status = 'common';
        const ev = addEvent(u, { day, type: first ? 'tech-breakthrough' : 'tech-adopted', scope: 'tech', title: first ? `${t.name} pioneer ${d.name.toLowerCase()}` : `${t.name} adopt ${d.name.toLowerCase()}`, teams: [t.id], techId: id, severity: first ? 0.6 : 0.25, facts: { tech: d.name, quality: +p.quality.toFixed(2), years: year - p.startedYear + 1, first } });
        w.eventIds.push(ev.id);
      } else {
        p.status = 'failed'; p.doneYear = year;
        addEvent(u, { day, type: 'tech-failed', scope: 'tech', title: `${t.name}'s ${d.name.toLowerCase()} programme fails`, teams: [t.id], techId: id, severity: 0.35, facts: { tech: d.name, invested: r2(p.invested) } });
      }
    }
  }
  const slots = 2 - Object.values(t.tech).filter((p) => p.status === 'research').length;
  if (slots > 0) {
    const opts = researchOptions(u, t);
    for (const o of opts.slice(0, slots)) {
      const d = TECH_BY_ID[o.id];
      const affordable = dev > scale * d.cost * 0.35 || rng.chance(0.15);
      if (!affordable || o.score < 0.6) continue;
      t.tech[o.id] = { status: 'research', progress: u.tech[o.id].adopters.length ? 0.35 : 0, invested: 0, startedYear: year };
    }
  }
  // facilities and people investment when cash allows
  if (t.cash > scale * 2 && rng.chance(0.4)) { t.facilities = clamp(t.facilities + rng.range(0.02, 0.08), 0, 0.98); t.cash -= scale * 0.4; }
  if (t.cash > scale * 1.5 && rng.chance(0.3)) { t.engineering = clamp(t.engineering + rng.range(0.02, 0.06), 0, 0.98); }
  if (t.debt > scale * 1.5) { t.engineering = clamp(t.engineering - 0.04, 0.05, 1); t.crew = clamp(t.crew - 0.03, 0.05, 1); }
  t.crew = clamp(t.crew + rng.gauss(0.005, 0.03) + (t.cash > scale ? 0.01 : -0.01), 0.05, 0.98);
}

function allocation(t: Team): Record<string, number> {
  const base: Record<string, number> = { engine: 0.22, chassis: 0.22, aero: 0.22, reliability: 0.2, efficiency: 0.14 };
  const f = t.philosophy.focus;
  if (f === 'power') base.engine += 0.15;
  if (f === 'aero') base.aero += 0.15;
  if (f === 'mechanical') base.chassis += 0.15;
  if (f === 'reliability') base.reliability += 0.15;
  const tot = Object.values(base).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(base)) base[k] = (base[k] / tot) * 5; // mean 1
  return base;
}

/** Regulation change in an area knocks back know-how; adaptable organisations keep more of it. */
export function applyRegShock(u: Universe, areas: string[], rng: Rng) {
  for (const t of activeTeams(u)) {
    const keep = 0.35 + 0.45 * t.engineering + rng.gauss(0, 0.08);
    const K = t.knowledge as any;
    for (const a of areas) {
      const key = a === 'engine' || a === 'energy' ? 'engine' : a === 'aero' ? 'aero' : a === 'tyres' ? 'chassis' : null;
      if (!key) continue;
      K[key] = clamp(0.35 + (K[key] - 0.35) * clamp(keep, 0.1, 0.95) + rng.gauss(0, 0.05), 0.02, 0.99);
    }
  }
}

// ------------------------------------------------------------------ crises, takeovers, mergers, entrants
export function resolveTeamCrises(u: Universe, rng: Rng, year: number, day: Day) {
  const scale = scaleMoney(u);
  for (const t of activeTeams(u)) {
    const income = (t.finance[t.finance.length - 1]?.prize ?? 0) + (t.finance[t.finance.length - 1]?.sponsor ?? 0) + (t.finance[t.finance.length - 1]?.owner ?? 0);
    const distress = t.debt / Math.max(scale * 0.5, income);
    if (distress < 1.5) continue;
    const crisis = addEvent(u, { day, type: 'budget-crisis', scope: 'team', title: `${t.name} in financial trouble`, teams: [t.id], severity: clamp(distress / 3, 0.3, 1), facts: { debt: r2(t.debt), income: r2(income), distress: +distress.toFixed(2) }, causes: u.events.filter((e) => e.teams.includes(t.id) && (e.type === 'sponsor-leaves') && e.day > day - 800).map((e) => e.id).concat(u.events.filter((e) => e.type === 'recession' && e.day > day - 800).map((e) => e.id)) });
    const roll = rng.next();
    if (t.ownerType === 'works' && roll < 0.35 && u.world.economy > -0.3) {
      t.cash += t.debt; t.debt = 0; t.ownerBacking *= 0.8;
      addEvent(u, { day, type: 'owner-bailout', scope: 'team', title: `Parent company rescues ${t.name}`, teams: [t.id], severity: 0.4, causes: [crisis.id] });
    } else if (roll < 0.45 && distress < 3) {
      // lenders and backers give the team another season
      t.debt *= 0.6; t.ownerBacking *= 1.1;
      addEvent(u, { day, type: 'refinanced', scope: 'team', title: `${t.name} restructure their debts`, teams: [t.id], severity: 0.3, causes: [crisis.id] });
    } else if (roll < 0.75 && distress < 4) {
      takeover(u, t, rng, year, day, crisis.id);
    } else if (roll < 0.85) {
      const partner = activeTeams(u).filter((x) => x.id !== t.id && x.debt > 0).sort((a, b) => b.debt - a.debt)[0];
      if (partner) merge(u, partner, t, rng, year, day, crisis.id);
      else withdraw(u, t, year, day, 'team-bankrupt', crisis.id);
    } else {
      withdraw(u, t, year, day, distress > 3 ? 'team-bankrupt' : 'team-withdraws', crisis.id);
    }
  }
}

function successorTeam(u: Universe, old: Team, rng: Rng, year: number, name: { name: string; short: string }, how: 'rename' | 'takeover' | 'merger'): Team {
  const t = createTeam(u, rng, year + 1, { lineageId: old.lineageId, name: name.name, short: name.short, strength: 0.3 });
  // the organisation carries over: people, know-how, facilities, tech
  Object.assign(t, { knowledge: { ...old.knowledge }, tech: JSON.parse(JSON.stringify(old.tech)), facilities: old.facilities, engineering: old.engineering * 0.95, crew: old.crew, prestige: old.prestige * 0.8, philosophy: { ...old.philosophy }, drivers: old.drivers.slice(), base: old.base, colours: how === 'rename' ? old.colours : t.colours });
  // replace the auto-created leadership with the old one where it exists
  if (old.techDirectorId) { const auto = t.techDirectorId; if (auto) delete u.people[auto]; t.techDirectorId = old.techDirectorId; const td = u.people[old.techDirectorId]; if (td) td.teamId = t.id; }
  if (how === 'rename' && old.principalId) { const auto = t.principalId; if (auto) delete u.people[auto]; t.principalId = old.principalId; const pr = u.people[old.principalId]; if (pr) pr.teamId = t.id; }
  for (const d of t.drivers) { const p = u.people[d]; if (p) { p.teamId = t.id; if (p.contract) p.contract.teamId = t.id; } }
  old.status = how === 'merger' ? 'merged' : 'renamed';
  old.leftYear = year; old.successorId = t.id; old.drivers = [];
  t.predecessorIds.push(old.id);
  const lin = u.lineages[old.lineageId];
  const prev = lin.entrants.find((e) => e.teamId === old.id); if (prev) prev.toYear = year;
  const cur = lin.entrants.find((e) => e.teamId === t.id); if (cur) cur.how = how === 'merger' ? 'merger' : how === 'takeover' ? 'takeover' : 'rename';
  return t;
}

export function takeover(u: Universe, t: Team, rng: Rng, year: number, day: Day, causeId: string) {
  const buyer = rng.pick(['consortium', 'works', 'patron'] as const);
  const nm = teamName(u, rng);
  const nt = successorTeam(u, t, rng, year, nm, 'takeover');
  nt.ownerType = buyer; nt.cash = scaleMoney(u) * rng.range(0.8, 2); nt.debt = 0; nt.ownerBacking = scaleMoney(u) * (buyer === 'works' ? rng.range(1.5, 3) : rng.range(0.6, 1.6));
  addEvent(u, { day, type: 'takeover', scope: 'team', title: `${t.name} bought out; becomes ${nt.name}`, teams: [t.id, nt.id], severity: 0.6, facts: { from: t.name, to: nt.name, owner: buyer }, causes: [causeId] });
}

export function merge(u: Universe, survivor: Team, absorbed: Team, rng: Rng, year: number, day: Day, causeId: string) {
  const nm = { name: `${survivor.short}-${absorbed.short}`, short: survivor.short };
  const nt = successorTeam(u, survivor, rng, year, nm, 'merger');
  // absorb the better know-how and facilities of the partner
  for (const k of Object.keys(nt.knowledge)) (nt.knowledge as any)[k] = Math.max((nt.knowledge as any)[k], (absorbed.knowledge as any)[k] * 0.9);
  nt.facilities = Math.max(nt.facilities, absorbed.facilities);
  nt.debt = (survivor.debt + absorbed.debt) * 0.5; nt.cash = survivor.cash + absorbed.cash;
  absorbed.status = 'merged'; absorbed.leftYear = year; absorbed.successorId = nt.id;
  for (const d of absorbed.drivers) { const p = u.people[d]; if (p) { p.teamId = undefined; p.contract = undefined; p.status = 'free'; } }
  absorbed.drivers = [];
  const lin = u.lineages[nt.lineageId];
  lin.absorbed.push({ lineageId: absorbed.lineageId, year, eventId: causeId });
  const al = u.lineages[absorbed.lineageId]; if (al) { al.endedYear = year; al.endReason = `merged into ${nt.name}`; const e = al.entrants.find((x) => x.teamId === absorbed.id); if (e) e.toYear = year; }
  addEvent(u, { day, type: 'merger', scope: 'team', title: `${survivor.name} and ${absorbed.name} merge as ${nt.name}`, teams: [survivor.id, absorbed.id, nt.id], severity: 0.7, facts: { survivor: survivor.name, absorbed: absorbed.name, name: nt.name }, causes: [causeId] });
}

export function withdraw(u: Universe, t: Team, year: number, day: Day, type: 'team-bankrupt' | 'team-withdraws', causeId?: string) {
  t.status = type === 'team-bankrupt' ? 'bankrupt' : 'withdrawn';
  t.leftYear = year;
  for (const d of t.drivers) { const p = u.people[d]; if (p) { p.teamId = undefined; p.contract = undefined; p.status = 'free'; } }
  t.drivers = [];
  const lin = u.lineages[t.lineageId]; if (lin) { lin.endedYear = year; lin.endReason = type === 'team-bankrupt' ? 'bankruptcy' : 'withdrawal'; const e = lin.entrants.find((x) => x.teamId === t.id); if (e) e.toYear = year; }
  for (const pid of [t.principalId, t.techDirectorId]) { const p = pid ? u.people[pid] : undefined; if (p) { p.teamId = undefined; p.status = 'free'; const r = p.roles.find((x) => x.toDay === undefined); if (r) r.toDay = day; } }
  addEvent(u, { day, type, scope: 'team', title: type === 'team-bankrupt' ? `${t.name} collapses` : `${t.name} withdraws from the championship`, teams: [t.id], severity: 0.8, facts: { years: year - t.founded + 1, debt: r2(t.debt) }, causes: causeId ? [causeId] : [] });
}

/** Keep the field healthy: new entrants arrive when the grid is thin and the sport is attractive. */
export function recruitTeams(u: Universe, rng: Rng, year: number, day: Day) {
  const target = u.meta.settings.teams;
  const active = activeTeams(u).length;
  const regs = u.regs.sets[u.regs.current];
  const cap = Math.floor(regs.maxEntries / 2);
  let need = Math.min(target - active, cap - active);
  const appeal = 0.3 + u.world.popularity / 150 + u.world.economy * 0.25;
  let tries = 0;
  while ((need > 0 || (active < cap && rng.chance(appeal * 0.08))) && tries < 4) {
    tries++;
    if (need <= 0 && !rng.chance(0.5)) break;
    if (need > 0 && !rng.chance(clamp(appeal + 0.35, 0.3, 0.95))) { need--; continue; }
    const strength = rng.range(0.1, 0.55) + (rng.chance(0.15) ? 0.25 : 0);
    const t = createTeam(u, rng, year, { strength });
    // newcomers start behind the frontier in know-how but may bring money
    for (const k of Object.keys(t.knowledge)) (t.knowledge as any)[k] = clamp((t.knowledge as any)[k] * 0.8, 0.05, 0.9);
    addEvent(u, { day, type: 'team-enters', scope: 'team', title: `${t.name} enters the championship`, teams: [t.id], severity: 0.4, facts: { owner: t.ownerType, base: t.base } });
    need--;
  }
}

export function ownerNationality(t: Team): string { return NATIONS.GBR ? 'GBR' : 'GBR'; }

// ------------------------------------------------------------------ staff movement (technical directors, principals)
export function staffMarket(u: Universe, rng: Rng, year: number, day: Day) {
  const teams = activeTeams(u);
  // successful teams' technical directors attract offers from rich teams
  const rich = teams.slice().sort((a, b) => b.cash - a.cash);
  for (const t of teams) {
    const td = t.techDirectorId ? u.people[t.techDirectorId] : undefined;
    if (!td) { hireTD(u, t, rng, year, day); continue; }
    const age = (day - td.dob) / 365.25;
    if (age > 66 || (age > 60 && rng.chance(0.3))) { td.status = 'retired'; const r = td.roles.find((x) => x.toDay === undefined); if (r) r.toDay = day; t.techDirectorId = undefined; addEvent(u, { day, type: 'td-retires', scope: 'team', title: `${td.first} ${td.last} retires as ${t.name} technical director`, teams: [t.id], people: [td.id], severity: 0.3 }); hireTD(u, t, rng, year, day); continue; }
    const suitor = rich.find((x) => x.id !== t.id && x.cash > t.cash * 1.5 && (x.techDirectorId ? (u.people[x.techDirectorId]?.skill ?? 0) < (td.skill ?? 0) - 0.08 : true));
    if (suitor && rng.chance(0.12 + (td.skill ?? 0.5) * 0.1 - t.philosophy.stability * 0.08)) {
      const prevTd = suitor.techDirectorId ? u.people[suitor.techDirectorId] : undefined;
      if (prevTd) { prevTd.teamId = undefined; prevTd.status = 'free'; const r = prevTd.roles.find((x) => x.toDay === undefined); if (r) r.toDay = day; }
      const r0 = td.roles.find((x) => x.toDay === undefined); if (r0) r0.toDay = day;
      td.teamId = suitor.id; td.roles.push({ role: 'technical-director', teamId: suitor.id, fromDay: day });
      suitor.techDirectorId = td.id; t.techDirectorId = undefined;
      // know-how walks out of the door
      t.knowledge.aero = clamp(t.knowledge.aero - 0.04, 0.02, 1); t.knowledge.chassis = clamp(t.knowledge.chassis - 0.03, 0.02, 1);
      addEvent(u, { day, type: 'td-poached', scope: 'team', title: `${suitor.name} poach ${td.first} ${td.last} from ${t.name}`, teams: [t.id, suitor.id], people: [td.id], severity: 0.45, facts: { skill: +(td.skill ?? 0).toFixed(2) } });
      hireTD(u, t, rng, year, day);
    }
  }
  // principals of struggling teams may be replaced (former drivers sometimes step in)
  for (const t of teams) {
    const pr = t.principalId ? u.people[t.principalId] : undefined;
    const season = u.seasons[year];
    const pos = season ? season.teamStandings.findIndex((r) => r.id === t.id) + 1 : 6;
    const poor = pos > teams.length * 0.6 && t.prestige < 40;
    if (pr && !(poor && rng.chance(0.25))) continue;
    if (pr) { pr.teamId = undefined; pr.status = 'free'; const r = pr.roles.find((x) => x.toDay === undefined); if (r) r.toDay = day; }
    const exDrivers = Object.values(u.people).filter((p) => p.kind === 'driver' && p.status === 'retired' && !p.teamId && (day - p.dob) / 365.25 < 64 && p.reputation > 35);
    let np: Person;
    if (exDrivers.length && rng.chance(0.3)) {
      np = rng.weighted(exDrivers, exDrivers.map((p) => p.reputation));
      np.skill = clamp(0.3 + (np.personality.discipline + np.attrs.pressure / 100 + np.personality.sociability) / 4 + rng.gauss(0, 0.08), 0.1, 0.95);
      np.status = 'active';
    } else {
      np = createPerson(u, rng, { kind: 'manager', year });
      np.status = 'active';
    }
    np.teamId = t.id; np.roles.push({ role: 'principal', teamId: t.id, fromDay: day }); t.principalId = np.id;
    if (pr) addEvent(u, { day, type: 'principal-change', scope: 'team', title: `${np.first} ${np.last} replaces ${pr.first} ${pr.last} at ${t.name}`, teams: [t.id], people: [np.id, pr.id], severity: 0.35, facts: { formerDriver: np.kind === 'driver' } });
  }
}

function hireTD(u: Universe, t: Team, rng: Rng, year: number, day: Day) {
  // free engineers, plus former drivers with an engineering bent (same identity, new role)
  const free = Object.values(u.people).filter((p) => ((p.kind === 'engineer' && p.status === 'free') || (p.kind === 'driver' && p.status === 'retired' && p.notes.includes('available as engineer') && !p.teamId)) && (day - p.dob) / 365.25 < 64);
  let td: Person;
  const affordable = free.filter((p) => (p.skill ?? 0) < 0.4 + t.cash / (scaleMoney(u) * 4) + t.prestige / 200);
  if (affordable.length && rng.chance(0.7)) td = affordable.sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0))[0];
  else { td = createPerson(u, rng, { kind: 'engineer', year }); td.skill = clamp((td.skill ?? 0.5) * 0.8 + t.engineering * 0.2, 0.1, 0.95); }
  td.status = 'active'; td.teamId = t.id; td.roles.push({ role: 'technical-director', teamId: t.id, fromDay: day }); t.techDirectorId = td.id;
  // a strong new technical director lifts the organisation over time
  t.engineering = clamp(t.engineering + ((td.skill ?? 0.5) - t.engineering) * 0.15, 0.05, 0.98);
}

// ------------------------------------------------------------------ stochastic team events
registerEvent<Team>({
  type: 'works-exit', entities: ({ u }) => activeTeams(u).filter((t) => t.ownerType === 'works'), key: (t) => t.id,
  prereq: ({ year }, t) => year - t.joinedYear >= 4,
  rate: ({ u, year }, t) => 0.03 + (year - t.joinedYear) * 0.002 + (u.world.economy < -0.2 ? 0.06 : 0),
  cooldownDays: 365 * 5,
  apply: ({ u, rng, day, year }, t) => {
    const ev = addEvent(u, { day, type: 'works-exit', scope: 'team', title: `${t.name}'s parent company pulls its backing`, teams: [t.id], severity: 0.6, facts: { years: year - t.joinedYear, economy: +u.world.economy.toFixed(2) }, causes: u.events.filter((e) => e.type === 'recession' && e.day > day - 700).map((e) => e.id) });
    // the organisation carries on as a privateer with far less money; any sale happens at season end
    t.ownerType = 'privateer'; t.ownerBacking *= 0.25; t.facilities = clamp(t.facilities - 0.05, 0.05, 1);
    void rng; void year;
    return ev;
  },
});
registerEvent<Team>({
  type: 'factory-fire', entities: ({ u }) => activeTeams(u), key: (t) => t.id,
  prereq: () => true, rate: () => 0.004, cooldownDays: 365 * 20,
  apply: ({ u, rng, day }, t) => { t.facilities = clamp(t.facilities - rng.range(0.1, 0.25), 0.05, 1); t.cash -= scaleMoney(u) * 0.3; return addEvent(u, { day, type: 'factory-fire', scope: 'team', title: `Fire damages ${t.name}'s workshop`, teams: [t.id], severity: 0.5 }); },
});
registerEvent<Team>({
  type: 'reliability-crisis', entities: ({ u }) => activeTeams(u), key: (t) => t.id,
  prereq: ({ u, day }, t) => countRecentMech(u, t.id, day) >= 6,
  rate: () => 1, cooldownDays: 365 * 2,
  apply: ({ u, rng, day }, t) => {
    t.knowledge.reliability = clamp(t.knowledge.reliability + rng.range(0.03, 0.08), 0, 0.99);
    const car = t.carId ? u.cars[t.carId] : undefined; if (car) car.current.reliability = Math.max(0.25, +(car.current.reliability * 0.9).toFixed(4));
    return addEvent(u, { day, type: 'reliability-crisis', scope: 'team', title: `${t.name} launch reliability drive after repeated failures`, teams: [t.id], severity: 0.4, facts: { failures: countRecentMech(u, t.id, day) } });
  },
});
function countRecentMech(u: Universe, teamId: string, day: Day) {
  let n = 0;
  for (const r of Object.values(u.races)) { if (r.day < day - 120) continue; for (const x of r.results) if (x.teamId === teamId && x.category === 'mechanical') n++; }
  return n;
}
