// Journalism from structured facts. Each item chooses an angle (what happened / why it mattered / what
// changed / what it recalls) from verified facts, uses semantic cooldowns to avoid repeating meanings,
// and never invents quotes, motives or numbers. Wording variety comes from a cosmetic stream.
import type { Universe, RaceRecord, Day, NewsItem, Season } from '../types';
import { Rng } from '../rng';
import { ageYears, fmtDate } from '../dates';
import { relBetween } from './relationships';
import { isWetRace } from './stats';

const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
const P = (u: Universe, id?: string) => { const p = id ? u.people[id] : undefined; return p ? `${p.first} ${p.last}` : 'Unknown'; };
const L = (u: Universe, id?: string) => (id ? u.people[id]?.last ?? '' : '');
const T = (u: Universe, id?: string, year?: number) => { if (!id) return ''; const s = year ? u.seasons[year] : undefined; return s?.entries.find((e) => e.teamId === id)?.name ?? u.teams[id]?.name ?? id; };

function push(u: Universe, n: Omit<NewsItem, 'id'>) {
  // semantic cooldown: one item per meaning within a window
  const recent = u.news.slice(-30);
  if (recent.some((x) => x.meaning === n.meaning && n.day - x.day < 45)) return;
  const id = `N${(u.counters.N = (u.counters.N ?? 0) + 1)}`;
  u.news.push({ ...n, id });
  if (u.news.length > 4000) u.news.splice(0, u.news.length - 4000);
}

/** Race report: angle chosen by what was most significant about this particular race. */
export function raceReport(u: Universe, r: RaceRecord): { headline: string; body: string[]; angle: string; refs: string[] } {
  const rng = new Rng(`cosmetic:report:${r.meetingId}`);
  const win = r.results.find((x) => x.pos === 1);
  const second = r.results.find((x) => x.pos === 2);
  const s = u.seasons[r.year];
  const refs = [r.meetingId];
  if (!win) return { headline: `${r.name} abandoned`, body: [`The ${r.year} ${r.name} was abandoned before a result could be declared.`], angle: 'abandoned', refs };
  const w = u.people[win.driverId];
  const careerBefore = careerAt(u, win.driverId, r);
  const firstWin = careerBefore.wins === 0;
  const startsBefore = careerBefore.starts;
  const age = ageYears(w.dob, r.day);
  const margin = second?.time && win.time ? second.time - win.time : null;
  const wet = isWetRace(r);
  const fromBack = (win.grid ?? 1) >= 8;
  const teamDrought = teamWinlessRaces(u, win.teamId, r);
  const leadChanges = r.leadChanges;
  const mechLeader = r.events.find((e) => e.kind === 'retire' && (e.pos ?? 99) === 1 && (e.detail ?? '').startsWith('mechanical'));
  const riv = second ? relBetween(u, win.driverId, second.driverId, 'rivalry') : undefined;
  const titleNow = s?.driverStandings[0]?.id;
  // choose the angle: the single most significant verified fact
  const angles: [number, string][] = [
    [firstWin ? (startsBefore >= 30 ? 1 : 0.8) : 0, 'first-win'],
    [teamDrought >= 25 ? 0.75 : 0, 'team-drought'],
    [mechLeader ? 0.7 : 0, 'leader-failure'],
    [wet ? 0.6 : 0, 'wet'],
    [fromBack ? 0.55 + (win.grid ?? 0) / 60 : 0, 'from-back'],
    [margin !== null && margin < 1 ? 0.6 : 0, 'photo-finish'],
    [riv && riv.intensity > 0.4 ? 0.6 : 0, 'rivalry'],
    [leadChanges >= 5 ? 0.5 : 0, 'lead-battle'],
    [0.3, 'straight'],
  ];
  angles.sort((a, b) => b[0] - a[0]);
  const angle = angles[0][1];
  const team = T(u, win.teamId, r.year);
  const venue = r.name;
  let headline = '';
  const body: string[] = [];
  switch (angle) {
    case 'first-win': headline = rng.pick([`${w.last} breaks through at the ${venue}`, `First win for ${P(u, win.driverId)}`, `${w.last}'s day at last`]); body.push(`${P(u, win.driverId)} won the ${venue} for ${team} — a first championship victory${startsBefore >= 10 ? ` at the ${ord(startsBefore + 1)} attempt` : ''}${age < 23 ? `, aged ${Math.floor(age)}` : ''}.`); break;
    case 'team-drought': headline = `${team} win again after ${teamDrought} races`; body.push(`${P(u, win.driverId)} ended a run of ${teamDrought} races without a win for ${team}.`); break;
    case 'leader-failure': { const lead = u.people[mechLeader!.a!]; const why = (mechLeader!.detail ?? '').split('|')[1]; headline = `${lead?.last ?? 'Leader'}'s ${why} hands ${w.last} the ${venue}`; body.push(`${lead ? P(u, lead.id) : 'The leader'} was leading when ${why} struck on lap ${mechLeader!.lap}${mechLeader!.where ? ` at ${mechLeader!.where}` : ''}; ${P(u, win.driverId)} inherited the win.`); break; }
    case 'wet': headline = rng.pick([`${w.last} masters the rain at the ${venue}`, `${w.last} wins a wet ${venue}`]); body.push(`In ${r.weather.start.toLowerCase()} conditions${r.weather.changeable ? ' that kept changing' : ''}, ${P(u, win.driverId)} won for ${team} from ${ord(win.grid ?? 0)} on the grid.`); break;
    case 'from-back': headline = `${w.last} wins from ${ord(win.grid!)} on the grid`; body.push(`${P(u, win.driverId)} came through from ${ord(win.grid!)} on the grid to win the ${venue} for ${team}.`); break;
    case 'photo-finish': headline = `${w.last} holds off ${L(u, second?.driverId)} by ${margin!.toFixed(1)}s`; body.push(`Just ${margin!.toFixed(1)} seconds separated ${P(u, win.driverId)} and ${P(u, second?.driverId)} at the line.`); break;
    case 'rivalry': headline = `${w.last} beats ${L(u, second?.driverId)} again`; body.push(`${P(u, win.driverId)} won the ${venue} ahead of ${P(u, second?.driverId)}, their rivalry now running through ${riv!.episodes.length} recorded episodes.`); refs.push(`rel:${riv!.id}`); break;
    case 'lead-battle': headline = `${w.last} wins after ${leadChanges} lead changes`; body.push(`The lead changed hands ${leadChanges} times before ${P(u, win.driverId)} prevailed for ${team}.`); break;
    default: headline = rng.pick([`${w.last} wins the ${venue}`, `${venue}: victory for ${w.last}`, `${team}'s ${w.last} takes the ${venue}`]); body.push(`${P(u, win.driverId)} won the ${venue} for ${team}${win.grid === 1 ? ' from pole position' : ''}.`);
  }
  // supporting facts, most useful first
  if (second && angle !== 'photo-finish' && angle !== 'rivalry') body.push(`${P(u, second.driverId)} finished second${margin !== null ? `, ${margin.toFixed(1)}s behind` : ''}.`);
  const notable = r.results.filter((x) => x.status === 'dnf' && (x.grid ?? 99) <= 5);
  if (notable.length) body.push(`${notable.map((x) => `${L(u, x.driverId)} (${x.reason})`).join(', ')} ${notable.length > 1 ? 'were' : 'was'} among the retirements.`);
  if (r.safetyCars || r.redFlags) body.push(`${r.safetyCars ? `${r.safetyCars} safety car period${r.safetyCars > 1 ? 's' : ''}` : ''}${r.safetyCars && r.redFlags ? ' and ' : ''}${r.redFlags ? 'a red flag' : ''} interrupted the race.`);
  if (titleNow && s) { const lead = s.driverStandings[0], sec2 = s.driverStandings[1]; if (lead && sec2) body.push(`${L(u, lead.id)} ${lead.id === win.driverId ? 'extends' : 'leads'} the championship with ${+lead.points.toFixed(1)} points to ${L(u, sec2.id)}'s ${+sec2.points.toFixed(1)}.`); }
  return { headline, body, angle, refs };
}

function careerAt(u: Universe, id: string, r: RaceRecord) { const c = u.careers[id]; if (!c) return { wins: 0, starts: 0 }; const win = r.results.find((x) => x.driverId === id)?.pos === 1 ? 1 : 0; return { wins: c.wins - win, starts: c.starts - 1 }; }
function teamWinlessRaces(u: Universe, teamId: string, r: RaceRecord): number {
  const lin = u.teams[teamId]?.lineageId;
  const races = Object.values(u.races).filter((x) => x.day < r.day && x.status !== 'abandoned').sort((a, b) => b.day - a.day);
  let n = 0;
  for (const x of races) { if (x.results.some((y) => y.pos === 1 && u.teams[y.teamId]?.lineageId === lin)) return n; if (x.results.some((y) => u.teams[y.teamId]?.lineageId === lin)) n++; }
  return n >= 10 ? n : 0;
}

export function newsAfterRace(u: Universe, r: RaceRecord) {
  const rep = raceReport(u, r);
  const win = r.results.find((x) => x.pos === 1);
  push(u, { day: r.day, kind: 'report', headline: rep.headline, body: rep.body.join(' '), refs: rep.refs, meetingId: r.meetingId, people: win ? [win.driverId] : [], teams: win ? [win.teamId] : [], importance: 0.5 + (rep.angle === 'first-win' ? 0.3 : 0), meaning: `report:${r.meetingId}` });
  // consequential world events of the last weeks become short news items
  const evs = u.events.filter((e) => e.day > r.day - 60 && e.day <= r.day && e.severity >= 0.45 && !['record', 'debut'].includes(e.type));
  for (const e of evs) push(u, { day: e.day, kind: e.type, headline: e.title, body: describeEvent(u, e), refs: [e.id], people: e.people, teams: e.teams, importance: e.severity, meaning: `${e.type}:${e.people[0] ?? e.teams[0] ?? e.venues[0] ?? ''}` });
  for (const e of u.events.filter((x) => x.type === 'record' && x.meetingId === r.meetingId)) push(u, { day: e.day, kind: 'record', headline: e.title, body: recordBody(u, e), refs: [e.id], people: e.people, teams: e.teams, importance: 0.7, meaning: `record:${e.facts.record}:${e.people[0] ?? e.teams[0]}` });
}

function recordBody(u: Universe, e: any) {
  const prev = (e.facts.prevHolders ?? []).map((id: string) => P(u, id) === 'Unknown' ? u.teams[id]?.name ?? id : P(u, id));
  return prev.length ? `The previous mark (${e.facts.prevValue}) belonged to ${prev.join(' and ')}.` : 'A new mark in the championship record book.';
}

export function describeEvent(u: Universe, e: any): string {
  const f = e.facts ?? {};
  switch (e.type) {
    case 'regs-announced': return (f.changes ?? []).map((c: any) => `${c.label}: ${c.reason}.`).join(' ');
    case 'driver-retires': return `${P(u, e.people[0])} retires aged ${f.age} after ${f.starts} starts (${f.reason}).`;
    case 'driver-transfer': case 'driver-signing': case 'driver-debut-signing': return f.rookie ? `A ${f.age}-year-old from ${f.background}.` : `${P(u, e.people[0])}, ${f.age}, joins on a contract worth about £${f.salary}m a year.`;
    case 'tech-breakthrough': return `The first team to race ${String(f.tech).toLowerCase()}${f.years > 1 ? ` after ${f.years} years of development` : ''}.`;
    case 'budget-crisis': return `Debts of about £${f.debt}m against income of £${f.income}m.`;
    case 'sponsor-leaves': return `${f.sponsor} withdrew support worth about £${f.value}m a year.`;
    case 'injury': case 'serious-injury': return `Expected to miss about ${f.weeks} weeks.`;
    default: return e.title;
  }
}

/** Season review: champion's path, decisive races, technical shifts, debutants, declines, open questions. */
export function seasonReview(u: Universe, year: number): Season['review'] {
  const s = u.seasons[year];
  const paras: { text: string; refs: string[] }[] = [];
  const races = s.meetings.map((m) => u.races[m.id]).filter(Boolean) as RaceRecord[];
  if (s.status === 'cancelled') return { year, headline: `No championship in ${year}`, paragraphs: [{ text: `The ${year} season did not take place (${s.statusReason ?? 'cancelled'}).`, refs: [] }], facts: {} };
  const champ = s.championId ? u.people[s.championId] : undefined;
  const top = s.driverStandings[0], second = s.driverStandings[1];
  const headline = champ ? (s.status === 'interrupted' ? `${champ.last} champion of an interrupted ${year}` : `${champ.first} ${champ.last} is ${year} champion`) : `${year}: no title awarded`;
  if (s.status === 'interrupted') paras.push({ text: `Only ${races.length} of ${s.meetings.length} planned races were run before the season was interrupted (${s.statusReason}).${champ ? ' The title was awarded because at least half the calendar was completed.' : ' No title was awarded.'}`, refs: [] });
  if (champ && top) {
    // decisive race: biggest swing in the gap between the top two
    let prevGap = 0, swing = 0, decisive: RaceRecord | null = null, cum = new Map<string, number>();
    for (const r of races) { for (const x of r.results) cum.set(x.driverId, (cum.get(x.driverId) ?? 0) + x.points); const g = (cum.get(top.id) ?? 0) - (cum.get(second?.id ?? '') ?? 0); if (Math.abs(g - prevGap) > swing) { swing = Math.abs(g - prevGap); decisive = r; } prevGap = g; }
    const margin = top.points - (second?.points ?? 0);
    paras.push({ text: `${P(u, champ.id)} (${T(u, s.entries.find((e) => e.drivers.includes(champ.id))?.teamId, year)}) took the title with ${+top.points.toFixed(1)} points and ${top.wins} win${top.wins === 1 ? '' : 's'}, ${margin > 0 ? `${+margin.toFixed(1)} ahead of ${P(u, second?.id)}` : `level on points with ${P(u, second?.id)} and ahead on countback`}${s.decidedRound ? `; it was settled at round ${s.decidedRound} of ${races.length}` : ''}.`, refs: [champ.id] });
    if (decisive && swing > 0) { const w = decisive.results.find((x) => x.pos === 1); paras.push({ text: `The biggest swing came at the ${decisive.name} (round ${decisive.round}), where the gap between the top two moved by ${+swing.toFixed(1)} points${w ? ` as ${L(u, w.driverId)} won` : ''}${isWetRace(decisive) ? ' in the wet' : ''}.`, refs: [decisive.meetingId] }); }
  }
  // teams and technology
  const tc = s.teamChampionId ? T(u, s.teamChampionId, year) : null;
  const techs = u.events.filter((e) => e.type === 'tech-breakthrough' && e.day >= u.seasons[year].meetings[0]?.day - 120 && e.day <= (races[races.length - 1]?.day ?? 0));
  if (tc) paras.push({ text: `${tc} won the teams' championship${techs.length ? `; ${techs.map((e) => e.title.toLowerCase()).join('; ')}` : ''}.`, refs: techs.map((e) => e.id) });
  // debutants and declines
  const rookies = s.rookies.map((id) => ({ id, pts: s.driverStandings.find((x) => x.id === id)?.points ?? 0 })).sort((a, b) => b.pts - a.pts);
  if (rookies[0] && rookies[0].pts > 0) paras.push({ text: `Best of the newcomers was ${P(u, rookies[0].id)} with ${+rookies[0].pts.toFixed(1)} points.`, refs: [rookies[0].id] });
  const prev = u.seasons[year - 1];
  if (prev?.championId && prev.championId !== s.championId) { const pos = s.driverStandings.findIndex((x) => x.id === prev.championId); if (pos >= 3) paras.push({ text: `Defending champion ${P(u, prev.championId)} finished only ${ord(pos + 1)}.`, refs: [prev.championId] }); else if (pos < 0) paras.push({ text: `Defending champion ${P(u, prev.championId)} did not race this season.`, refs: [prev.championId] }); }
  const ann = u.regs.announced.find((a) => a.year === year + 1);
  if (ann) paras.push({ text: `Next year brings new rules: ${u.regs.sets[ann.regSetId].reasons.join('; ').toLowerCase()}.`, refs: [ann.regSetId] });
  return { year, headline, paragraphs: paras, facts: { champion: s.championId, teamChampion: s.teamChampionId, races: races.length } };
}

export function newsAfterSeason(u: Universe, year: number, day: Day) {
  const rev = seasonReview(u, year);
  u.seasons[year].review = rev;
  push(u, { day, kind: 'review', headline: rev!.headline, body: rev!.paragraphs.map((p) => p.text).join(' '), refs: rev!.paragraphs.flatMap((p) => p.refs), people: u.seasons[year].championId ? [u.seasons[year].championId!] : [], teams: [], importance: 0.9, meaning: `review:${year}` });
}
export { fmtDate };
