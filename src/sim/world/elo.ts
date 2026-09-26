// Elo-style rating of demonstrated performance (see docs/ELO.md). It is computed only from recorded
// results and never feeds back into the hidden skill model.
//
// Expected score for i vs j:  E = 1 / (1 + 10^(-(Ri + Ci - Rj - Cj) / 400)), Ci = the car's rating.
// Driver update:  dRi = Ki * sum_j w_ij (S_ij - E_ij) / sum_j w_ij   (normalised: field size doesn't inflate it)
// Car ratings (one per team per season) are updated alongside from the same comparisons.
import type { Universe, RaceRecord, ResultRow, Person } from '../types';
import { clamp, dpow } from '../dmath';
import { ageYears } from '../dates';

export const ELO = {
  rookie: 1450,
  rookieRd: 180,
  minRd: 45,
  maxRd: 220,
  wTeammate: 2.0,
  wQuali: 0.3,
  mechanicalScale: 0.5, // weight on partial evidence before a mechanical retirement (x fraction completed)
  carK: 18,
  carScale: 1, // how strongly car ratings enter expectations
};

export function eloK(rd: number) { return 12 + 0.22 * rd; }
function expected(a: number, b: number) { return 1 / (1 + dpow(10, -(a - b) / 400)); }

interface Part { id: string; row: ResultRow; carKey: string; rank: number; weight: number; teammate?: string }

/** Car rating store: u.counters-like map keyed by car id (kept on the Universe records map). */
function carRatings(u: Universe): Record<string, number> { return (u.carElo ??= {}); }

export function carRatingFor(u: Universe, carId: string, teamPrevCarId?: string): number {
  const cr = carRatings(u);
  if (cr[carId] === undefined) cr[carId] = teamPrevCarId && cr[teamPrevCarId] !== undefined ? cr[teamPrevCarId] * 0.5 : 0; // new car: half the previous car's standing
  return cr[carId];
}

export function updateElo(u: Universe, rec: RaceRecord, qualiValid: boolean) {
  if (rec.status === 'abandoned') return;
  const rows = rec.results.filter((r) => r.status !== 'dns');
  const lapsTotal = Math.max(1, rec.lapsCompleted);
  const parts: Part[] = [];
  // ranks for race evidence: classified order, then non-classified by laps
  rows.forEach((row, idx) => {
    let weight = 1;
    if (row.status === 'dnf' && row.category === 'mechanical') weight = ELO.mechanicalScale * clamp(row.laps / lapsTotal, 0, 1);
    else if (row.status === 'dnf' && row.category === 'other') weight = 0.3 * clamp(row.laps / lapsTotal, 0, 1);
    else if (row.status === 'dsq') weight = 0.3;
    parts.push({ id: row.driverId, row, carKey: row.carId, rank: idx, weight });
  });
  for (const p of parts) { const tm = parts.find((q) => q.row.teamId === p.row.teamId && q.id !== p.id); if (tm) p.teammate = tm.id; }
  const cr = carRatings(u);
  const R = (id: string) => u.people[id].elo.rating;
  const C = (car: string) => (cr[car] ?? 0) * ELO.carScale;
  const deltas = new Map<string, number>();
  const carDelta = new Map<string, number>();
  for (const a of parts) {
    let num = 0, den = 0;
    for (const b of parts) {
      if (a === b) continue;
      const w = Math.min(a.weight, b.weight) * (a.teammate === b.id ? ELO.wTeammate : 1);
      if (w <= 0) continue;
      const S = a.rank < b.rank ? 1 : 0;
      const E = expected(R(a.id) + C(a.carKey), R(b.id) + C(b.carKey));
      num += w * (S - E); den += w;
    }
    // qualifying evidence (measured one-lap pace), lighter weight
    if (qualiValid) {
      const qa = rec.quali.find((q) => q.driverId === a.id);
      if (qa?.time) for (const b of parts) {
        if (a === b) continue;
        const qb = rec.quali.find((q) => q.driverId === b.id);
        if (!qb?.time) continue;
        const w = ELO.wQuali * (a.teammate === b.id ? ELO.wTeammate : 1);
        const S = qa.time < qb.time ? 1 : qa.time === qb.time ? 0.5 : 0;
        const E = expected(R(a.id) + C(a.carKey), R(b.id) + C(b.carKey));
        num += w * (S - E); den += w;
      }
    }
    if (den <= 0) continue;
    const avgDev = num / den; // normalised: a crowded field does not multiply the update
    const p = u.people[a.id];
    // evidence scale: a full race of comparisons counts 1; partial evidence (an early mechanical failure) counts
    // in proportion, so a car breaking on lap 1 says almost nothing about its driver
    deltas.set(a.id, eloK(p.elo.rd) * avgDev * clamp(den / (parts.length - 1), 0, 1));
    // the car absorbs the part of the result not explained within the team
    if (a.weight >= 0.5) carDelta.set(a.carKey, (carDelta.get(a.carKey) ?? 0) + ELO.carK * avgDev * 0.5);
  }
  for (const [id, d] of deltas) {
    const p = u.people[id];
    applyDelta(p, d, rec.day, rec.meetingId);
  }
  for (const [car, d] of carDelta) cr[car] = clamp((cr[car] ?? 0) + d, -400, 400);
}

function applyDelta(p: Person, d: number, day: number, meetingId: string) {
  const e = p.elo;
  e.rating = +(e.rating + d).toFixed(2);
  e.rd = Math.max(ELO.minRd, e.rd * 0.94);
  e.races++;
  e.lastDay = day;
  e.history.push(day, Math.round(e.rating * 10));
  // peaks only count once there is enough evidence to trust them
  if (e.races >= 10 && e.rating > e.peak) { e.peak = e.rating; e.peakDay = day; e.peakAge = +ageYears(p.dob, day).toFixed(1); e.peakMeetingId = meetingId; }
  if (e.races === 10 && e.peak < e.rating) { e.peak = e.rating; e.peakDay = day; e.peakAge = +ageYears(p.dob, day).toFixed(1); e.peakMeetingId = meetingId; }
}

/** Season end: store values; uncertainty grows for drivers who did not race. */
export function eloSeasonEnd(u: Universe, year: number, racedIds: Set<string>) {
  for (const p of Object.values(u.people)) {
    if (p.kind !== 'driver' || p.elo.races === 0) continue;
    if (racedIds.has(p.id)) p.elo.seasonEnd[year] = Math.round(p.elo.rating);
    else if (p.status !== 'retired' && p.status !== 'deceased') p.elo.rd = Math.min(ELO.maxRd, p.elo.rd + 25);
  }
}

export function initRookieElo(p: Person) { if (p.elo.races === 0) { p.elo.rating = ELO.rookie; p.elo.rd = ELO.rookieRd; p.elo.peak = ELO.rookie; } }
