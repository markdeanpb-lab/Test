// Derived career statistics. These are caches computed from immutable RaceRecords and Seasons; they can
// always be rebuilt (rebuildCareers) and optionally cut off at a date for spoiler-safe views.
import type { Universe, RaceRecord, Day } from '../types';

export interface Career {
  starts: number; wins: number; podiums: number; poles: number; fastest: number; points: number; titles: number;
  finishes: number; classified: number; sumPos: number; dnfMech: number; dnfDriver: number; dnfContact: number; dnfOther: number;
  lapsLed: number; firstStart?: string; firstWin?: string; lastStart?: string; firstWinStarts?: number; seasons: number[]; bestPos: number;
  winStreak: number; curStreak: number; wetStarts: number; wetWins: number; wetPodiums: number; wetGain: number; wetClassified: number;
  h2h: Record<string, [number, number]>; teams: string[]; frontRows: number; overtakesMade: number; penalties: number;
}
export interface TeamCareer { starts: number; wins: number; podiums: number; poles: number; titles: number; driverTitles: number; points: number; oneTwos: number; dnfMech: number; seasons: number[]; firstWin?: string }

export function emptyCareer(): Career {
  return { starts: 0, wins: 0, podiums: 0, poles: 0, fastest: 0, points: 0, titles: 0, finishes: 0, classified: 0, sumPos: 0, dnfMech: 0, dnfDriver: 0, dnfContact: 0, dnfOther: 0, lapsLed: 0, seasons: [], bestPos: 99, winStreak: 0, curStreak: 0, wetStarts: 0, wetWins: 0, wetPodiums: 0, wetGain: 0, wetClassified: 0, h2h: {}, teams: [], frontRows: 0, overtakesMade: 0, penalties: 0 };
}
export function emptyTeamCareer(): TeamCareer { return { starts: 0, wins: 0, podiums: 0, poles: 0, titles: 0, driverTitles: 0, points: 0, oneTwos: 0, dnfMech: 0, seasons: [] }; }

export function isWetRace(r: RaceRecord) { return r.weather.wetLaps >= Math.max(1, r.lapsCompleted * 0.3) || /rain|drizzle|wet/i.test(r.weather.start); }

export function applyRace(careers: Record<string, Career>, teams: Record<string, TeamCareer>, r: RaceRecord) {
  if (r.status === 'abandoned') return;
  const wet = isWetRace(r);
  const n = r.results.length;
  for (const row of r.results) {
    if (row.status === 'dns') continue;
    const c = (careers[row.driverId] ??= emptyCareer());
    c.starts++;
    c.firstStart ??= r.meetingId; c.lastStart = r.meetingId;
    if (!c.seasons.includes(r.year)) c.seasons.push(r.year);
    if (!c.teams.includes(row.teamId)) c.teams.push(row.teamId);
    c.points += row.points; c.lapsLed += row.ledLaps;
    c.penalties += row.penalties.length;
    if (row.grid !== null && row.grid <= 2) c.frontRows++;
    if (row.pos !== null) { c.classified++; c.sumPos += row.pos; c.bestPos = Math.min(c.bestPos, row.pos); }
    if (row.status === 'finished') c.finishes++;
    if (row.status === 'dnf') { if (row.category === 'mechanical') c.dnfMech++; else if (row.category === 'driver') c.dnfDriver++; else if (row.category === 'contact') c.dnfContact++; else c.dnfOther++; }
    if (row.pos === 1) { c.wins++; c.curStreak++; c.winStreak = Math.max(c.winStreak, c.curStreak); if (!c.firstWin) { c.firstWin = r.meetingId; c.firstWinStarts = c.starts; } } else c.curStreak = 0;
    if (row.pos !== null && row.pos <= 3) c.podiums++;
    if (row.fastestLap) c.fastest++;
    if (wet) { c.wetStarts++; if (row.pos === 1) c.wetWins++; if (row.pos !== null && row.pos <= 3) c.wetPodiums++; if (row.pos !== null && row.grid !== null) { c.wetGain += row.grid - row.pos; c.wetClassified++; } }
    const tm = r.results.find((x) => x.teamId === row.teamId && x.driverId !== row.driverId);
    if (tm) { const h = (c.h2h[tm.driverId] ??= [0, 0]); const a = row.pos ?? 99 + (n - (row.laps ?? 0)), b = tm.pos ?? 99 + (n - (tm.laps ?? 0)); if (a < b) h[0]++; else if (a > b) h[1]++; }
    const t = (teams[row.teamId] ??= emptyTeamCareer());
    t.points += row.points;
    if (!t.seasons.includes(r.year)) t.seasons.push(r.year);
    if (row.pos === 1) { t.wins++; t.firstWin ??= r.meetingId; }
    if (row.pos !== null && row.pos <= 3) t.podiums++;
    if (row.category === 'mechanical') t.dnfMech++;
  }
  for (const tid of new Set(r.results.map((x) => x.teamId))) { const t = (teams[tid] ??= emptyTeamCareer()); t.starts++; const mine = r.results.filter((x) => x.teamId === tid); if (mine.some((x) => x.pos === 1) && mine.some((x) => x.pos === 2)) t.oneTwos++; }
  if (r.pole) { const c = careers[r.pole.driverId]; if (c) c.poles++; const pr = r.results.find((x) => x.driverId === r.pole!.driverId); if (pr) { const t = teams[pr.teamId]; if (t) t.poles++; } }
}

export function applySeasonTitles(u: Universe, careers: Record<string, Career>, teams: Record<string, TeamCareer>, year: number) {
  const s = u.seasons[year];
  if (s?.championId) { (careers[s.championId] ??= emptyCareer()).titles++; const e = s.entries.find((x) => x.drivers.includes(s.championId!)); if (e) (teams[e.teamId] ??= emptyTeamCareer()).driverTitles++; }
  if (s?.teamChampionId) (teams[s.teamChampionId] ??= emptyTeamCareer()).titles++;
}

/** Rebuild from history; with `until` a spoiler-safe view as known on that day. */
export function rebuildCareers(u: Universe, until?: Day): { careers: Record<string, Career>; teams: Record<string, TeamCareer> } {
  const careers: Record<string, Career> = {}, teams: Record<string, TeamCareer> = {};
  const races = Object.values(u.races).filter((r) => until === undefined || r.day <= until).sort((a, b) => a.day - b.day || a.round - b.round);
  let lastYear = -1;
  for (const r of races) {
    if (lastYear !== -1 && r.year !== lastYear) applySeasonTitles(u, careers, teams, lastYear);
    applyRace(careers, teams, r);
    lastYear = r.year;
  }
  if (lastYear !== -1) {
    const s = u.seasons[lastYear];
    const endKnown = until === undefined || (s && s.status !== 'running' && s.status !== 'planned' && until >= seasonEndDay(lastYear));
    if (endKnown) applySeasonTitles(u, careers, teams, lastYear);
  }
  return { careers, teams };
}
function seasonEndDay(year: number) { const base = (year - 1900) * 365.2425; return Math.floor(base + 318); }

/** Lineage totals: only a lineage's own entrants (absorbed lineages stay separate and are listed). */
export function lineageTotals(u: Universe, lineageId: string, teams: Record<string, TeamCareer>) {
  const lin = u.lineages[lineageId];
  const tot = emptyTeamCareer();
  for (const e of lin?.entrants ?? []) { const t = teams[e.teamId]; if (!t) continue; tot.starts += t.starts; tot.wins += t.wins; tot.podiums += t.podiums; tot.poles += t.poles; tot.titles += t.titles; tot.driverTitles += t.driverTitles; tot.points += t.points; tot.oneTwos += t.oneTwos; tot.dnfMech += t.dnfMech; for (const y of t.seasons) if (!tot.seasons.includes(y)) tot.seasons.push(y); }
  return tot;
}
