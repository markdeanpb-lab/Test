// Post-race and post-season bookkeeping: derived career caches, records, stories and news.
import type { Universe, RaceRecord, Day } from '../types';
import { applyRace, applySeasonTitles } from './stats';
import { checkRaceRecords, checkSeasonRecords } from './records';
import { storiesAfterRace, storiesAfterSeason } from './stories';
import { newsAfterRace, newsAfterSeason } from './news';

export function afterRace(u: Universe, r: RaceRecord) {
  applyRace(u.careers, u.teamCareers, r);
  const teamWins: Record<string, number> = {};
  for (const [id, t] of Object.entries(u.teamCareers)) teamWins[id] = (t as any).wins;
  checkRaceRecords(u, r, u.careers, teamWins);
  storiesAfterRace(u, r);
  newsAfterRace(u, r);
}

export function afterSeason(u: Universe, year: number, day: Day) {
  applySeasonTitles(u, u.careers, u.teamCareers, year);
  const teamTitles: Record<string, number> = {};
  for (const [id, t] of Object.entries(u.teamCareers)) teamTitles[id] = (t as any).titles;
  checkSeasonRecords(u, year, u.careers, teamTitles);
  storiesAfterSeason(u, year, day);
  newsAfterSeason(u, year, day);
}
