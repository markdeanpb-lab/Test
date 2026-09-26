// Story detection over recorded history. Detectors recognise developments across seasons (rivalries,
// dynasties and declines, long waits, stalled prospects, comebacks, revivals, family legacies,
// technical gambles, engineers who rebuild teams). Stories describe the simulation; they never steer it.
import type { Universe, RaceRecord, Day, StoryArc, StoryBeat, StoryState } from '../types';
import { ageYears, dayOf } from '../dates';
import { isWetRace } from './stats';
import { TECH_BY_ID } from './tech';

const P = (u: Universe, id?: string) => { const p = id ? u.people[id] : undefined; return p ? `${p.first} ${p.last}` : '—'; };
const Ln = (u: Universe, id?: string) => (id ? u.people[id]?.last ?? '' : '');
const teamName = (u: Universe, id?: string) => (id ? u.teams[id]?.name ?? id : '');
const linName = (u: Universe, lin: string) => { const l = u.lineages[lin]; const last = l?.entrants[l.entrants.length - 1]; return last?.name ?? lin; };

function upsert(u: Universe, arc: Omit<StoryArc, 'id' | 'coverage'> & { coverage?: number }) {
  const existing = Object.values(u.stories).find((s) => s.key === arc.key);
  if (existing) {
    const prevState = existing.state;
    Object.assign(existing, { ...arc, id: existing.id, coverage: existing.coverage, lastCoveredDay: existing.lastCoveredDay });
    if (prevState !== existing.state) existing.lastDay = arc.lastDay;
    return existing;
  }
  const id = `S${(u.counters.S = (u.counters.S ?? 0) + 1)}`;
  const s: StoryArc = { ...arc, id, coverage: 0 } as StoryArc;
  u.stories[id] = s;
  return s;
}

const beat = (r: RaceRecord | undefined, kind: string, summary: string, facts: Record<string, any> = {}, eventIds: string[] = []): StoryBeat => ({ day: r?.day ?? 0, year: r?.year ?? 0, meetingId: r?.meetingId, eventIds, kind, summary, facts });

function racesOf(u: Universe): RaceRecord[] { return Object.values(u.races).filter((r) => r.status !== 'abandoned').sort((a, b) => a.day - b.day || a.round - b.round); }

export function storiesAfterRace(u: Universe, r: RaceRecord) {
  // long waits end on a specific race, so check first wins immediately
  const win = r.results.find((x) => x.pos === 1);
  if (win) {
    const c = u.careers[win.driverId];
    if (c && c.wins === 1 && (c.firstWinStarts ?? 0) >= 30) longWait(u, win.driverId);
  }
}

export function storiesAfterSeason(u: Universe, year: number, _day: Day) {
  const races = racesOf(u);
  rivalries(u, year);
  titleFight(u, year, races);
  dynasties(u, year);
  stalledProspects(u, year);
  comebacks(u, year, races);
  revivals(u, year);
  teamBreakthroughs(u, year, races);
  families(u, year);
  techGambles(u, year);
  engineerReturns(u, year);
  wetMasters(u, year, races);
}

// ------------------------------------------------------------------ detectors
function rivalries(u: Universe, year: number) {
  for (const r of Object.values(u.rels)) {
    if (r.kind !== 'rivalry' || r.episodes.length < 4) continue;
    const peak = Math.max(...r.episodes.reduce((acc: number[], e) => { acc.push((acc[acc.length - 1] ?? 0) + e.delta); return acc; }, []));
    if (peak < 0.45) continue;
    const a = u.people[r.a], b = u.people[r.b];
    const beats: StoryBeat[] = r.episodes.filter((e) => e.delta > 0.05 || e.cause === 'reconciliation').slice(-12).map((e) => ({ day: e.day, year: Math.floor(1900 + e.day / 365.2425), meetingId: e.meetingId, eventIds: e.eventId ? [e.eventId] : [], kind: e.cause === 'reconciliation' ? 'reconciliation' : 'clash', summary: `${e.cause}${e.meetingId && u.races[e.meetingId] ? ` (${u.races[e.meetingId].name} ${u.races[e.meetingId].year})` : ''}`, facts: {} }));
    const retired = a.status === 'retired' || b.status === 'retired';
    const state: StoryState = r.status === 'reconciled' ? 'resolved' : retired ? 'resolved' : r.status === 'faded' ? 'dormant' : r.intensity > peak * 0.8 ? 'intensifying' : 'developing';
    // head-to-head from races both finished
    let aw = 0, bw = 0;
    for (const race of Object.values(u.races)) { const x = race.results.find((q) => q.driverId === a.id), y = race.results.find((q) => q.driverId === b.id); if (x?.pos && y?.pos) { if (x.pos < y.pos) aw++; else bw++; } }
    upsert(u, {
      type: 'rivalry', key: `rivalry:${r.id}`, title: `${a.last} v ${b.last}`, spoilerTitle: `${a.last} and ${b.last}`, people: [a.id, b.id], teams: [],
      startDay: r.since, lastDay: r.lastChange, state, significance: Math.min(1, 0.4 + peak * 0.5 + r.episodes.length * 0.01), beats,
      premise: `${P(u, a.id)} and ${P(u, b.id)} have clashed ${r.episodes.length} times on record since ${Math.floor(1900 + r.since / 365.2425)}. When both finished, ${a.last} led ${aw}–${bw}.`,
      uncertainty: 'The rivalry is measured from recorded clashes, battles and title fights; private feelings are not modelled beyond these episodes.',
    });
  }
}

function titleFight(u: Universe, year: number, races: RaceRecord[]) {
  const s = u.seasons[year]; if (!s?.championId || s.driverStandings.length < 2) return;
  const [a, b] = s.driverStandings;
  const margin = a.points - b.points;
  const yr = races.filter((r) => r.year === year);
  // lead changes in the standings across the season
  const cum = new Map<string, number>(); let leader = ''; let changes = 0; const turns: StoryBeat[] = []; let prevGap = 0;
  for (const r of yr) {
    for (const x of r.results) cum.set(x.driverId, (cum.get(x.driverId) ?? 0) + x.points);
    const top = [...cum.entries()].sort((p, q) => q[1] - p[1])[0][0];
    if (leader && top !== leader) { changes++; turns.push(beat(r, 'lead-change', `${Ln(u, top)} took over the championship lead at the ${r.name}`)); }
    leader = top;
    const gap = (cum.get(a.id) ?? 0) - (cum.get(b.id) ?? 0);
    if (Math.abs(gap - prevGap) >= (u.regs.sets[r.regSetId].points.table[0] * 0.8)) turns.push(beat(r, 'swing', `A ${Math.abs(gap - prevGap).toFixed(0)}-point swing at the ${r.name}${isWetRace(r) ? ' in the wet' : ''}`, { swing: Math.abs(gap - prevGap) }));
    prevGap = gap;
  }
  const close = margin <= (u.regs.sets[s.regSetId].points.table[0] * 1.2);
  if (!close && changes < 2) return;
  upsert(u, {
    type: 'title-fight', key: `title:${year}`, title: `${year}: ${Ln(u, a.id)} edges ${Ln(u, b.id)}`, spoilerTitle: `The ${year} title fight`, people: [a.id, b.id], teams: [],
    startDay: yr[0]?.day ?? dayOf(year, 4, 1), lastDay: yr[yr.length - 1]?.day ?? dayOf(year, 10, 1), state: 'resolved', significance: Math.min(1, 0.5 + (close ? 0.25 : 0) + changes * 0.06), beats: turns.slice(0, 10),
    premise: `${P(u, a.id)} and ${P(u, b.id)} fought for the ${year} championship; the lead changed ${changes} time${changes === 1 ? '' : 's'} and the final margin was ${+margin.toFixed(1)} points.`,
  });
}

function dynasties(u: Universe, year: number) {
  // lineage titles over a sliding window
  const titles: Record<string, number[]> = {};
  for (const s of Object.values(u.seasons)) if (s.teamChampionId) { const lin = u.teams[s.teamChampionId]?.lineageId; if (lin) (titles[lin] ??= []).push(s.year); }
  for (const [lin, ys] of Object.entries(titles)) {
    ys.sort((a, b) => a - b);
    // find runs with >=3 titles within 5 years
    for (let i = 0; i < ys.length; i++) {
      let j = i; while (j + 1 < ys.length && ys[j + 1] - ys[i] <= 5) j++;
      if (j - i + 1 < 3) continue;
      const start = ys[i], endY = ys[j];
      const after = [endY + 1, endY + 2, endY + 3].map((y) => { const s = u.seasons[y]; if (!s) return null; const idx = s.teamStandings.findIndex((r) => u.teams[r.id]?.lineageId === lin); return idx < 0 ? 99 : idx + 1; }).filter((x) => x !== null) as number[];
      const declined = after.length >= 2 && after.every((p) => p >= 3);
      const ongoing = endY >= year - 1;
      const cause = declined ? declineCause(u, lin, endY) : '';
      upsert(u, {
        type: declined ? 'dynasty-decline' : 'dynasty', key: `dynasty:${lin}:${start}`, title: declined ? `The fall of ${linName(u, lin)}` : `${linName(u, lin)}'s era`, spoilerTitle: `${linName(u, lin)} at the top`, people: [], teams: u.lineages[lin].entrants.map((e) => e.teamId),
        startDay: dayOf(start, 1, 1), lastDay: dayOf(declined ? endY + 2 : endY, 12, 1), state: ongoing ? 'intensifying' : declined ? 'resolved' : 'dormant', significance: Math.min(1, 0.55 + (j - i + 1) * 0.06 + (declined ? 0.1 : 0)),
        beats: ys.slice(i, j + 1).map((y) => ({ day: dayOf(y, 11, 1), year: y, eventIds: [], kind: 'title', summary: `${y} teams' title`, facts: {} })).concat(declined ? [{ day: dayOf(endY + 2, 11, 1), year: endY + 2, eventIds: [], kind: 'decline', summary: `Finished ${after.map((p) => (p === 99 ? 'absent' : `P${p}`)).join(', ')} in the following seasons${cause ? `; ${cause}` : ''}`, facts: {} }] : []),
        premise: `${linName(u, lin)} won ${j - i + 1} teams' titles between ${start} and ${endY}.${declined ? ` Then the results fell away${cause ? ` — ${cause}` : ''}.` : ''}`,
        uncertainty: declined ? 'Several causes can overlap; only those recorded as events are listed.' : undefined,
      });
      i = j;
    }
  }
}
function declineCause(u: Universe, lin: string, endY: number): string {
  const teamIds = new Set(u.lineages[lin].entrants.map((e) => e.teamId));
  const evs = u.events.filter((e) => e.day >= dayOf(endY, 9, 1) && e.day <= dayOf(endY + 2, 12, 31) && (e.teams.some((t) => teamIds.has(t)) || e.type === 'regs-announced'));
  const parts: string[] = [];
  const regs = evs.find((e) => e.type === 'regs-announced');
  if (regs) parts.push(`new rules (${(regs.facts.changes ?? []).map((c: any) => c.label.toLowerCase()).join(', ')})`);
  const td = evs.find((e) => e.type === 'td-poached' && e.teams[0] && teamIds.has(e.teams[0]));
  if (td) parts.push(`the loss of technical director ${P(u, td.people[0])}`);
  if (evs.some((e) => e.type === 'budget-crisis' || e.type === 'sponsor-leaves' || e.type === 'works-exit')) parts.push('financial strain');
  const ban = evs.find((e) => e.type === 'regs-announced' && (e.facts.changes ?? []).some((c: any) => /banned/.test(c.label)));
  if (ban && !regs) parts.push('a technology ban');
  return parts.join(', ');
}

function longWait(u: Universe, id: string) {
  const c = u.careers[id]; const p = u.people[id];
  const r = c.firstWin ? u.races[c.firstWin] : undefined;
  const podiumsBefore = Object.values(u.races).filter((x) => x.day < (r?.day ?? 0)).flatMap((x) => x.results.filter((y) => y.driverId === id && y.pos !== null && y.pos <= 3).map(() => x)).slice(-4);
  upsert(u, {
    type: 'long-wait', key: `longwait:${id}`, title: `${p.last}'s first win, at start ${c.firstWinStarts}`, spoilerTitle: `${p.last}'s long wait`, people: [id], teams: [],
    startDay: p.debutDay ?? 0, lastDay: r?.day ?? 0, state: 'resolved', significance: Math.min(1, 0.45 + (c.firstWinStarts ?? 0) / 200),
    beats: [...podiumsBefore.map((x) => beat(x, 'near-miss', `A podium at the ${x.name} ${x.year}`)), beat(r, 'first-win', `First win at the ${r?.name} ${r?.year}`)],
    premise: `${P(u, id)} needed ${c.firstWinStarts} starts to win a championship race.`,
  });
}

function stalledProspects(u: Universe, year: number) {
  for (const p of Object.values(u.people)) {
    if (p.kind !== 'driver' || !p.debutDay) continue;
    const debutYear = Math.floor(1900 + p.debutDay / 365.2425);
    const age = ageYears(p.dob, p.debutDay);
    const c = u.careers[p.id]; if (!c) continue;
    const early = Object.entries(p.elo.seasonEnd).filter(([y]) => +y <= debutYear + 1).map(([, v]) => v);
    const promising = age < 22 && early.length && Math.max(...early) > 1540;
    if (!promising) continue;
    if (year - debutYear < 5) continue;
    if (c.wins > 0) continue;
    upsert(u, {
      type: 'stalled-prospect', key: `stalled:${p.id}`, title: `${p.last}: promise unfulfilled?`, spoilerTitle: `${p.last}'s early promise`, people: [p.id], teams: [],
      startDay: p.debutDay, lastDay: dayOf(year, 11, 1), state: p.status === 'retired' ? 'resolved' : 'unresolved', significance: 0.45 + Math.min(0.3, (Math.max(...early) - 1540) / 300),
      beats: [{ day: p.debutDay, year: debutYear, meetingId: p.debutMeetingId, eventIds: [], kind: 'debut', summary: `Debut aged ${Math.floor(age)}`, facts: {} }, { day: dayOf(year, 11, 1), year, eventIds: [], kind: 'status', summary: `${c.starts} starts, ${c.podiums} podiums, no wins`, facts: {} }],
      premise: `${P(u, p.id)} arrived aged ${Math.floor(age)} and rated highly in their first seasons, but after ${c.starts} starts has not won a race.`,
      uncertainty: 'Results depend on the cars available; a stalled career is not proof of lesser talent.',
    });
  }
}

function comebacks(u: Universe, year: number, races: RaceRecord[]) {
  for (const p of Object.values(u.people)) {
    const serious = p.injuries.filter((i) => i.severity > 0.5);
    for (const inj of serious) {
      const back = races.find((r) => r.day > inj.returnDay - 30 && r.results.some((x) => x.driverId === p.id));
      if (!back) { if (p.status === 'retired') upsert(u, { type: 'comeback', key: `comeback:${p.id}:${inj.day}`, title: `${p.last} never returns`, spoilerTitle: `${p.last}'s injury`, people: [p.id], teams: [], startDay: inj.day, lastDay: p.retiredDay ?? inj.day, state: 'resolved', significance: 0.5, beats: [{ day: inj.day, year: Math.floor(1900 + inj.day / 365.2425), meetingId: inj.meetingId, eventIds: [inj.eventId], kind: 'injury', summary: inj.cause, facts: {} }], premise: `${P(u, p.id)} was seriously injured (${inj.cause}) and did not race again.` }); continue; }
      const after = races.filter((r) => r.day >= back.day && r.results.some((x) => x.driverId === p.id));
      const bestAfter = Math.min(99, ...after.flatMap((r) => r.results.filter((x) => x.driverId === p.id && x.pos !== null).map((x) => x.pos!)));
      const success = bestAfter <= 3;
      const resolvedDay = after.find((r) => r.results.some((x) => x.driverId === p.id && x.pos !== null && x.pos <= 3))?.day;
      upsert(u, {
        type: 'comeback', key: `comeback:${p.id}:${inj.day}`, title: success ? `${p.last}'s comeback` : `${p.last} returns from injury`, spoilerTitle: `${p.last} after the accident`, people: [p.id], teams: [],
        startDay: inj.day, lastDay: resolvedDay ?? back.day, state: success ? 'resolved' : after.length > 10 ? 'resolved' : 'developing', significance: 0.5 + (success ? 0.2 : 0),
        beats: [{ day: inj.day, year: Math.floor(1900 + inj.day / 365.2425), meetingId: inj.meetingId, eventIds: [inj.eventId], kind: 'injury', summary: inj.cause, facts: { severity: inj.severity } }, beat(back, 'return', `Back racing at the ${back.name} ${back.year}`), ...(resolvedDay ? [beat(u.races[after.find((r) => r.day === resolvedDay)!.meetingId], 'podium', 'Back on the podium')] : [])],
        premise: `${P(u, p.id)} was seriously injured${inj.meetingId ? ` at the ${u.races[inj.meetingId]?.name ?? 'race'}` : ''}, missed about ${Math.round((inj.returnDay - inj.day) / 7)} weeks, and ${success ? 'later returned to the podium' : 'has yet to recapture the old form'}.`,
      });
    }
  }
}

function revivals(u: Universe, year: number) {
  const s = u.seasons[year]; if (!s) return;
  for (const row of s.driverStandings.slice(0, 5)) {
    const p = u.people[row.id]; const age = ageYears(p.dob, dayOf(year, 7, 1));
    if (age < 33) continue;
    const prevYears = [1, 2, 3].map((k) => u.seasons[year - k]?.driverStandings.findIndex((r) => r.id === p.id)).filter((x) => x !== undefined) as number[];
    if (prevYears.length < 2 || !prevYears.every((i) => i < 0 || i >= 7)) continue;
    const pos = s.driverStandings.indexOf(row) + 1;
    const newTeam = s.entries.find((e) => e.drivers.includes(p.id));
    upsert(u, {
      type: 'revival', key: `revival:${p.id}:${year}`, title: `${p.last}'s late revival`, spoilerTitle: `${p.last} at ${Math.floor(age)}`, people: [p.id], teams: newTeam ? [newTeam.teamId] : [],
      startDay: dayOf(year - 3, 1, 1), lastDay: dayOf(year, 11, 1), state: 'resolved', significance: 0.5 + (pos === 1 ? 0.3 : 0.1),
      beats: [{ day: dayOf(year, 11, 1), year, eventIds: [], kind: 'season', summary: `${pos === 1 ? 'Champion' : `${pos}th in the championship`} at ${Math.floor(age)}, after finishing ${prevYears.map((i) => (i < 0 ? 'absent' : `P${i + 1}`)).join(', ')} in the previous seasons`, facts: { pos } }],
      premise: `At ${Math.floor(age)}, ${P(u, p.id)} finished ${pos === 1 ? 'as champion' : `${pos}${pos === 2 ? 'nd' : pos === 3 ? 'rd' : 'th'}`} with ${newTeam ? newTeam.name : 'their team'} after several seasons outside the top six.`,
      uncertainty: 'Recorded causes may include a better car, a new team or regained confidence; the story lists only what the records show.',
    });
  }
}

function teamBreakthroughs(u: Universe, year: number, races: RaceRecord[]) {
  const firstWin = new Map<string, RaceRecord>(); const starts = new Map<string, number>();
  for (const r of races) {
    const lins = new Set(r.results.map((x) => u.teams[x.teamId]?.lineageId));
    for (const l of lins) if (l && !firstWin.has(l)) starts.set(l, (starts.get(l) ?? 0) + 1);
    const w = r.results.find((x) => x.pos === 1); if (!w) continue;
    const l = u.teams[w.teamId]?.lineageId; if (l && !firstWin.has(l)) firstWin.set(l, r);
  }
  for (const [lin, r] of firstWin) {
    const n = starts.get(lin) ?? 0;
    if (n < 25 || r.year !== year) continue;
    const w = r.results.find((x) => x.pos === 1)!;
    upsert(u, { type: 'team-breakthrough', key: `teamfirst:${lin}`, title: `${linName(u, lin)} win at last`, spoilerTitle: `${linName(u, lin)}'s long road`, people: [w.driverId], teams: [w.teamId], startDay: dayOf(u.lineages[lin].founded, 1, 1), lastDay: r.day, state: 'resolved', significance: Math.min(1, 0.5 + n / 200), beats: [beat(r, 'first-win', `${P(u, w.driverId)} wins the ${r.name} ${r.year}`)], premise: `${linName(u, lin)} took ${n} races to score a first win.` });
  }
}

function families(u: Universe, year: number) {
  for (const child of Object.values(u.people)) {
    if (child.kind !== 'driver' || !child.family.parents.length || !child.debutDay) continue;
    const par = u.people[child.family.parents[0]]; if (!par) continue;
    const cc = u.careers[child.id], pc = u.careers[par.id];
    if (!cc || !pc) continue;
    const compare = `${par.last} senior: ${pc.starts} starts, ${pc.wins} wins, ${pc.titles} titles. ${child.first}: ${cc.starts} starts, ${cc.wins} wins, ${cc.titles} titles so far.`;
    upsert(u, {
      type: 'family', key: `family:${child.id}`, title: `The ${child.last}s: ${par.first} and ${child.first}`, spoilerTitle: `A second ${child.last}`, people: [par.id, child.id], teams: [],
      startDay: par.debutDay ?? par.dob, lastDay: dayOf(year, 11, 1), state: child.status === 'retired' ? 'resolved' : 'developing', significance: Math.min(1, 0.5 + (pc.titles + cc.titles) * 0.08 + (pc.wins + cc.wins) * 0.005),
      beats: [{ day: par.debutDay ?? par.dob, year: Math.floor(1900 + (par.debutDay ?? par.dob) / 365.2425), meetingId: par.debutMeetingId, eventIds: [], kind: 'parent-debut', summary: `${P(u, par.id)} debuts`, facts: {} }, { day: child.debutDay, year: Math.floor(1900 + child.debutDay / 365.2425), meetingId: child.debutMeetingId, eventIds: [], kind: 'child-debut', summary: `${P(u, child.id)} debuts`, facts: {} }],
      premise: `${P(u, child.id)} is the child of ${P(u, par.id)}. ${compare}`,
      uncertainty: 'A family name brings opportunity and attention; it does not bring ability, which is independent here.',
    });
  }
}

function techGambles(u: Universe, year: number) {
  for (const w of Object.values(u.tech)) {
    if (!w.firstTeam || !w.firstDay) continue;
    const t = u.teams[w.firstTeam]; const d = TECH_BY_ID[w.id];
    const y0 = Math.floor(1900 + w.firstDay / 365.2425);
    if (year < y0 + 1) continue;
    const pos = [y0 + 1, y0 + 2].map((y) => { const s = u.seasons[y]; const i = s?.teamStandings.findIndex((r) => u.teams[r.id]?.lineageId === t.lineageId) ?? -1; return i < 0 ? null : i + 1; });
    const before = (() => { const s = u.seasons[y0]; const i = s?.teamStandings.findIndex((r) => u.teams[r.id]?.lineageId === t.lineageId) ?? -1; return i < 0 ? null : i + 1; })();
    const best = Math.min(...pos.filter((x) => x !== null) as number[]);
    if (!(best <= 2) && !w.bannedDay) continue;
    const banned = w.bannedDay || u.regs.sets[u.regs.current].bannedTech.includes(w.id);
    upsert(u, {
      type: 'tech-gamble', key: `tech:${w.id}`, title: `${t.name} and ${d.name.toLowerCase()}${banned ? ' — until the ban' : ''}`, spoilerTitle: `${t.name}'s ${d.name.toLowerCase()} gamble`, people: [], teams: [t.id],
      startDay: w.firstDay, lastDay: dayOf(year, 11, 1), state: banned ? 'resolved' : 'developing', significance: 0.45 + (best === 1 ? 0.25 : 0.1) + (banned ? 0.1 : 0),
      beats: [{ day: w.firstDay, year: y0, eventIds: w.eventIds.slice(0, 1), kind: 'pioneer', summary: `${t.name} first to race ${d.name.toLowerCase()}`, facts: {} }, { day: dayOf(y0 + 1, 11, 1), year: y0 + 1, eventIds: [], kind: 'result', summary: `Teams' championship: P${before ?? '?'} before, best P${best} after`, facts: {} }],
      premise: `${t.name} pioneered ${d.name.toLowerCase()} (${d.description.toLowerCase()}) and went from P${before ?? '?'} to P${best} in the teams' standings${w.adopters.length > 1 ? `; ${w.adopters.length - 1} rival${w.adopters.length > 2 ? 's' : ''} followed` : ''}.`,
      uncertainty: 'Other changes happened at the same time; the technology is one recorded factor among several.',
    });
  }
}

function engineerReturns(u: Universe, year: number) {
  for (const p of Object.values(u.people)) {
    const spells = p.roles.filter((r) => r.role === 'technical-director' && r.teamId);
    if (spells.length < 2) continue;
    for (let i = 0; i < spells.length; i++) {
      const sp = spells[i]; const lin = u.teams[sp.teamId!]?.lineageId; if (!lin) continue;
      const titlesDuring = Object.values(u.seasons).filter((s) => s.teamChampionId && u.teams[s.teamChampionId]?.lineageId === lin && s.year >= Math.floor(1900 + sp.fromDay / 365.2425) && s.year <= Math.floor(1900 + (sp.toDay ?? dayOf(year, 12, 31)) / 365.2425)).map((s) => s.year);
      if (!titlesDuring.length || i === 0) continue;
      const prev = spells.slice(0, i).find((q) => u.teams[q.teamId!]?.lineageId !== lin);
      if (!prev) continue;
      const prevLin = u.teams[prev.teamId!]?.lineageId;
      const prevTitles = Object.values(u.seasons).filter((s) => s.teamChampionId && u.teams[s.teamChampionId]?.lineageId === prevLin).length;
      upsert(u, {
        type: 'engineer', key: `engineer:${p.id}:${lin}`, title: `${p.last} rebuilds ${linName(u, lin)}`, spoilerTitle: `${p.last}'s new challenge`, people: [p.id], teams: [sp.teamId!],
        startDay: sp.fromDay, lastDay: dayOf(titlesDuring[titlesDuring.length - 1], 11, 1), state: 'resolved', significance: 0.6 + Math.min(0.3, titlesDuring.length * 0.08),
        beats: [{ day: prev.fromDay, year: Math.floor(1900 + prev.fromDay / 365.2425), eventIds: [], kind: 'earlier', summary: `Technical director at ${teamName(u, prev.teamId)}`, facts: {} }, { day: sp.fromDay, year: Math.floor(1900 + sp.fromDay / 365.2425), eventIds: [], kind: 'move', summary: `Joins ${teamName(u, sp.teamId)}`, facts: {} }, ...titlesDuring.map((y) => ({ day: dayOf(y, 11, 1), year: y, eventIds: [], kind: 'title', summary: `${y} teams' title`, facts: {} }))],
        premise: `${P(u, p.id)}, previously at ${teamName(u, prev.teamId)}${prevTitles ? ` (a title-winning organisation)` : ''}, joined ${teamName(u, sp.teamId)} and oversaw ${titlesDuring.length} teams' title${titlesDuring.length > 1 ? 's' : ''} (${titlesDuring.join(', ')}).`,
        uncertainty: 'The technical director is one of many people in a team; the record shows the timing, not the whole cause.',
      });
    }
  }
}

function wetMasters(u: Universe, year: number, races: RaceRecord[]) {
  if (year % 5 !== 0) return;
  const stats = new Map<string, { n: number; wins: number; gain: number }>();
  for (const r of races) { if (!isWetRace(r)) continue; for (const x of r.results) { const s = stats.get(x.driverId) ?? { n: 0, wins: 0, gain: 0 }; s.n++; if (x.pos === 1) s.wins++; if (x.pos && x.grid) s.gain += x.grid - x.pos; stats.set(x.driverId, s); } }
  const best = [...stats.entries()].filter(([, s]) => s.n >= 8).sort((a, b) => b[1].gain / b[1].n - a[1].gain / a[1].n)[0];
  if (!best || best[1].gain / best[1].n < 2) return;
  const [id, s] = best;
  upsert(u, { type: 'wet-master', key: `wet:${id}`, title: `${Ln(u, id)}, master of the rain`, spoilerTitle: `${Ln(u, id)} in the wet`, people: [id], teams: [], startDay: u.people[id].debutDay ?? 0, lastDay: dayOf(year, 11, 1), state: u.people[id].status === 'retired' ? 'resolved' : 'developing', significance: 0.45 + Math.min(0.3, s.wins * 0.05), beats: [], premise: `In ${s.n} wet races ${P(u, id)} gained an average of ${(s.gain / s.n).toFixed(1)} places from the grid and won ${s.wins}.`, uncertainty: `Sample of ${s.n} wet races; average gains depend on grid position.` });
}

export { P };
