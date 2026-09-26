// The record book. Each record keeps its current holder(s), value and the full history of when it was
// set, equalled or broken (with the previous holder and value). Awards are idempotent per occasion.
import type { Universe, RecordDef, RecordState, RaceRecord, Day } from '../types';
import type { Career } from './stats';
import { ageYears } from '../dates';
import { addEvent } from './events';

export const RECORD_DEFS: RecordDef[] = [
  { id: 'wins', label: 'Most race wins', scope: 'driver', higherIsBetter: true, unit: 'wins', group: 'Career' },
  { id: 'titles', label: 'Most championships', scope: 'driver', higherIsBetter: true, unit: 'titles', group: 'Career' },
  { id: 'poles', label: 'Most pole positions', scope: 'driver', higherIsBetter: true, unit: 'poles', group: 'Career' },
  { id: 'podiums', label: 'Most podiums', scope: 'driver', higherIsBetter: true, unit: 'podiums', group: 'Career' },
  { id: 'fastest', label: 'Most fastest laps', scope: 'driver', higherIsBetter: true, unit: 'fastest laps', group: 'Career' },
  { id: 'starts', label: 'Most starts', scope: 'driver', higherIsBetter: true, unit: 'starts', group: 'Career' },
  { id: 'winStreak', label: 'Longest winning streak', scope: 'driver', higherIsBetter: true, unit: 'consecutive wins', group: 'Career' },
  { id: 'youngestWinner', label: 'Youngest race winner', scope: 'driver', higherIsBetter: false, unit: 'years', group: 'Age' },
  { id: 'oldestWinner', label: 'Oldest race winner', scope: 'driver', higherIsBetter: true, unit: 'years', group: 'Age' },
  { id: 'youngestChampion', label: 'Youngest champion', scope: 'driver', higherIsBetter: false, unit: 'years', group: 'Age' },
  { id: 'oldestChampion', label: 'Oldest champion', scope: 'driver', higherIsBetter: true, unit: 'years', group: 'Age' },
  { id: 'seasonWins', label: 'Most wins in a season', scope: 'driver', higherIsBetter: true, unit: 'wins', group: 'Season' },
  { id: 'titleMargin', label: 'Largest title margin (share of winner\'s points)', scope: 'driver', higherIsBetter: true, unit: '%', group: 'Season' },
  { id: 'firstWinWait', label: 'Most starts before a first win', scope: 'driver', higherIsBetter: true, unit: 'starts', group: 'Career' },
  { id: 'peakElo', label: 'Highest peak rating', scope: 'driver', higherIsBetter: true, unit: 'Elo', group: 'Rating' },
  { id: 'teamWins', label: 'Most wins by an entrant', scope: 'team', higherIsBetter: true, unit: 'wins', group: 'Teams' },
  { id: 'teamTitles', label: 'Most teams\' championships (entrant)', scope: 'team', higherIsBetter: true, unit: 'titles', group: 'Teams' },
];

export function initRecords(u: Universe) {
  for (const d of RECORD_DEFS) u.records[d.id] = { def: d, current: null, history: [], awardKeys: [] };
}

function lapRecordState(u: Universe, geometryId: string, kind: 'race' | 'quali'): RecordState {
  const id = `lap:${kind}:${geometryId}`;
  if (!u.records[id]) u.records[id] = { def: { id, label: `${kind === 'race' ? 'Race' : 'Qualifying'} lap record`, scope: 'layout', higherIsBetter: false, unit: 's', group: 'Lap records', layoutId: geometryId }, current: null, history: [], awardKeys: [] };
  return u.records[id];
}

/** Offer a candidate value for a record; returns 'broken' | 'equalled' | 'set' | null. */
export function offer(u: Universe, id: string, holder: string, value: number, day: Day, year: number, occasion: string, meetingId?: string, note?: string): 'broken' | 'equalled' | 'set' | null {
  const st = u.records[id]; if (!st) return null;
  const key = `${occasion}|${holder}`;
  if (st.awardKeys.includes(key)) return null; // idempotent: never awarded twice for the same occasion
  const better = (a: number, b: number) => (st.def.higherIsBetter ? a > b + 1e-9 : a < b - 1e-9);
  const cur = st.current;
  let kind: 'broken' | 'equalled' | 'set' | null = null;
  if (!cur) kind = 'set';
  else if (better(value, cur.value)) kind = 'broken';
  else if (Math.abs(value - cur.value) < 1e-9 && !cur.holderIds.includes(holder)) kind = 'equalled';
  if (!kind) return null;
  st.awardKeys.push(key);
  if (st.awardKeys.length > 60) st.awardKeys.splice(0, st.awardKeys.length - 60);
  const prevHolders = cur ? cur.holderIds.slice() : [];
  const prevValue = cur ? cur.value : null;
  if (kind === 'equalled') cur!.holderIds.push(holder);
  else st.current = { holderIds: [holder], value, day, meetingId, year, note };
  // cumulative records (wins, starts...) move one step at a time; only log breaks that change the holder
  const cumulative = ['wins', 'titles', 'poles', 'podiums', 'fastest', 'starts', 'teamWins', 'teamTitles'].includes(st.def.id);
  const sameHolder = kind === 'broken' && prevHolders.length === 1 && prevHolders[0] === holder;
  if (cumulative && sameHolder) { const last = st.history[st.history.length - 1]; if (last && last.newHolders[0] === holder) { last.newValue = value; last.day = day; last.meetingId = meetingId; return kind; } }
  st.history.push({ day, meetingId, year, newHolders: kind === 'equalled' ? st.current!.holderIds.slice() : [holder], newValue: value, prevHolders, prevValue, kind });
  return kind;
}

/** Check records after a race. `careers` must already include this race. */
export function checkRaceRecords(u: Universe, r: RaceRecord, careers: Record<string, Career>, teamWins: Record<string, number>) {
  if (r.status === 'abandoned') return;
  const occ = r.meetingId;
  // 'record' is only news once the championship has enough history and the value is meaningful
  const MIN: Record<string, number> = { wins: 8, podiums: 20, starts: 80, poles: 6, fastest: 6, winStreak: 4, teamWins: 10, firstWinWait: 25 };
  const matured = r.year >= u.meta.settings.startYear + 4;
  const holdersBefore: Record<string, string[]> = {};
  for (const id of Object.keys(u.records)) holdersBefore[id] = u.records[id].current?.holderIds.slice() ?? [];
  const announce = (id: string, holder: string, kind: string | null, value: number) => {
    if (!kind || kind === 'set' || !matured) return;
    if (MIN[id] !== undefined && value < MIN[id]) return;
    if (holdersBefore[id]?.includes(holder)) return; // extending or sharing a record one already holds is not news
    if (kind === 'equalled' && ['wins', 'podiums', 'starts', 'poles', 'fastest', 'teamWins'].includes(id)) return;
    const st = u.records[id]; const p = u.people[holder] ?? u.teams[holder] as any;
    const name = p?.first ? `${p.first} ${p.last}` : p?.name ?? holder;
    const prev = st.history[st.history.length - 1];
    addEvent(u, { day: r.day, type: 'record', scope: st.def.scope === 'team' ? 'team' : 'driver', title: `${name} ${kind === 'equalled' ? 'equals' : 'sets a new'} record: ${st.def.label.toLowerCase()} (${fmtVal(st.def, value)})`, people: u.people[holder] ? [holder] : [], teams: u.teams[holder] ? [holder] : [], meetingId: r.meetingId, severity: 0.7, facts: { record: id, value, kind, prevHolders: prev?.prevHolders ?? [], prevValue: prev?.prevValue ?? null } });
  };
  // meaningful minimum sample before cumulative records are "records"
  for (const row of r.results) {
    const c = careers[row.driverId]; if (!c) continue;
    const p = u.people[row.driverId];
    for (const id of ['wins', 'podiums', 'starts', 'poles', 'fastest', 'winStreak'] as const) {
      const v = id === 'winStreak' ? c.winStreak : (c as any)[id];
      if (v < (id === 'starts' ? 10 : 2)) continue;
      announce(id, row.driverId, offer(u, id, row.driverId, v, r.day, r.year, `${occ}:${id}:${v}`, r.meetingId), v);
    }
    if (row.pos === 1) {
      const age = +ageYears(p.dob, r.day).toFixed(2);
      announce('youngestWinner', row.driverId, offer(u, 'youngestWinner', row.driverId, age, r.day, r.year, occ, r.meetingId), age);
      announce('oldestWinner', row.driverId, offer(u, 'oldestWinner', row.driverId, age, r.day, r.year, occ, r.meetingId), age);
      if (c.wins === 1 && c.firstWinStarts) announce('firstWinWait', row.driverId, offer(u, 'firstWinWait', row.driverId, c.firstWinStarts, r.day, r.year, occ, r.meetingId), c.firstWinStarts);
      const tw = teamWins[row.teamId] ?? 0;
      if (tw >= 2) announce('teamWins', row.teamId, offer(u, 'teamWins', row.teamId, tw, r.day, r.year, `${occ}:tw:${tw}`, r.meetingId), tw);
    }
    const pe = p.elo;
    if (pe.races >= 20) offer(u, 'peakElo', row.driverId, Math.round(pe.peak), r.day, r.year, `${occ}:elo`, r.meetingId);
  }
  // lap records are per layout geometry and session type (never compared across layouts)
  if (r.fastest) { const st = lapRecordState(u, r.geometryId, 'race'); offer(u, st.def.id, r.fastest.driverId, r.fastest.time, r.day, r.year, occ, r.meetingId, `lap ${r.fastest.lap}`); }
  const q = r.quali.find((x) => x.time !== null);
  if (q?.time) { const st = lapRecordState(u, r.geometryId, 'quali'); offer(u, st.def.id, q.driverId, q.time, r.day, r.year, occ + ':q', r.meetingId); }
}

export function checkSeasonRecords(u: Universe, year: number, careers: Record<string, Career>, teamTitles: Record<string, number>) {
  const s = u.seasons[year]; if (!s?.championId) return;
  const occ = `S${year}`;
  const champ = u.people[s.championId];
  const day = Math.max(...s.meetings.map((m) => m.day));
  const age = +ageYears(champ.dob, day).toFixed(2);
  offer(u, 'youngestChampion', champ.id, age, day, year, occ);
  offer(u, 'oldestChampion', champ.id, age, day, year, occ);
  const c = careers[champ.id]; if (c) offer(u, 'titles', champ.id, c.titles, day, year, `${occ}:t:${c.titles}`);
  const top = s.driverStandings[0], second = s.driverStandings[1];
  if (top && second && top.points > 0) offer(u, 'titleMargin', champ.id, Math.round(((top.points - second.points) / top.points) * 1000) / 10, day, year, occ);
  const most = s.driverStandings.slice().sort((a, b) => b.wins - a.wins)[0];
  if (most && most.wins > 0) offer(u, 'seasonWins', most.id, most.wins, day, year, occ);
  if (s.teamChampionId) { const n = teamTitles[s.teamChampionId] ?? 0; if (n) offer(u, 'teamTitles', s.teamChampionId, n, day, year, `${occ}:tt:${n}`); }
}

export function fmtVal(d: RecordDef, v: number) {
  if (d.unit === 's') { const m = Math.floor(v / 60); const s = v - m * 60; return m ? `${m}:${s.toFixed(3).padStart(6, '0')}` : `${s.toFixed(3)}s`; }
  if (d.unit === 'years') return `${Math.floor(v)} years ${Math.round((v % 1) * 365)} days`;
  if (d.unit === '%') return `${v}%`;
  return `${v} ${d.unit}`;
}
