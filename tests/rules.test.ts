import { describe, it, expect, beforeAll } from 'vitest';
import type { Universe, RaceRecord, ResultRow, Person } from '../src/sim/types';
import { updateElo, ELO } from '../src/sim/world/elo';
import { offer, initRecords } from '../src/sim/world/records';
import { rebuildCareers } from '../src/sim/world/stats';
import { newUniverse, toSeasonEnd } from './helpers';

describe('classification, points and standings', () => {
  let u: Universe;
  beforeAll(() => { u = newUniverse('rules-A'); toSeasonEnd(u, 1927); });

  it('classified positions are contiguous and ordered by laps then time', () => {
    for (const r of Object.values(u.races)) {
      const cls = r.results.filter((x) => x.pos !== null);
      cls.forEach((x, i) => expect(x.pos).toBe(i + 1));
      for (let i = 1; i < cls.length; i++) {
        const a = cls[i - 1], b = cls[i];
        if (a.status === 'finished' && b.status === 'finished') expect(a.laps > b.laps || (a.laps === b.laps && (a.time ?? 0) <= (b.time ?? Infinity))).toBe(true);
        else expect(a.laps).toBeGreaterThanOrEqual(b.laps);
      }
      // non-classified cars never score position points
      for (const x of r.results.filter((y) => y.pos === null)) expect(x.points).toBe(0);
    }
  });

  it('points follow the regulations in force at each race', () => {
    for (const r of Object.values(u.races)) {
      const regs = u.regs.sets[r.regSetId];
      for (const x of r.results) {
        if (x.pos === null || r.status === 'abandoned') continue;
        let p = regs.points.table[x.pos - 1] ?? 0;
        if (x.fastestLap && regs.points.fastestLap && x.pos <= regs.points.fastestLapMaxPos) p += regs.points.fastestLap;
        if (r.pole?.driverId === x.driverId && regs.points.pole) p += regs.points.pole;
        if (r.halfPoints) p /= 2;
        expect(x.points, `${r.name} ${r.year} P${x.pos}`).toBeCloseTo(p, 6);
      }
    }
  });

  it('standings equal the sum of race points and are sorted', () => {
    for (const s of Object.values(u.seasons)) {
      for (const row of s.driverStandings) {
        const sum = Object.values(u.races).filter((r) => r.year === s.year).reduce((a, r) => a + (r.results.find((x) => x.driverId === row.id)?.points ?? 0), 0);
        expect(row.points).toBeCloseTo(sum, 6);
      }
      for (let i = 1; i < s.driverStandings.length; i++) expect(s.driverStandings[i - 1].points).toBeGreaterThanOrEqual(s.driverStandings[i].points);
      if (s.status === 'complete') expect(s.championId).toBe(s.driverStandings[0].id);
    }
  });

  it('career statistics are a pure function of race records', () => {
    const rebuilt = rebuildCareers(u);
    expect(JSON.stringify(rebuilt.careers)).toBe(JSON.stringify(u.careers));
  });

  it('every race ends in a valid terminal state with a result for each starter', () => {
    for (const r of Object.values(u.races)) {
      expect(['finished', 'shortened', 'abandoned']).toContain(r.status);
      expect(new Set(r.results.map((x) => x.driverId)).size).toBe(r.results.length);
      for (const x of r.results) if (x.status === 'dnf') expect(x.category, `${x.reason}`).toBeTruthy();
    }
  });
});

// ------------------------------------------------------------------ ratings
function person(id: string, rating = 1500): Person {
  return { id, first: id, last: id, dob: 0, elo: { rating, rd: 80, peak: rating, peakDay: 0, peakAge: 0, races: 20, lastDay: 0, history: [], seasonEnd: {} } } as any;
}
function row(driverId: string, teamId: string, pos: number | null, status: ResultRow['status'], laps: number, category?: ResultRow['category']): ResultRow {
  return { pos, driverId, teamId, carId: `car-${teamId}`, no: 1, grid: 1, laps, time: pos ? 3000 + pos : null, status, category, points: 0, bestLap: null, fastestLap: false, pits: 0, penalties: [], ledLaps: 0, paceIndex: null, cleanLaps: 0 };
}
function race(rows: ResultRow[], lapsCompleted = 40): RaceRecord {
  return { meetingId: 'M1', year: 1950, round: 1, name: 'Test', day: 18000, venueId: 'v', geometryId: 'g', layoutVersionId: 'l', regSetId: 'r', status: 'finished', lapsScheduled: 40, lapsCompleted, distanceKm: 100, durationS: 3000, weather: {} as any, quali: [], results: rows, events: [], safetyCars: 0, redFlags: 0, overtakes: 0, leadChanges: 0, halfPoints: false, hash: '', engineVersion: '1' };
}
function field(extraFor: (id: string) => ResultRow) {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
  const u = { people: Object.fromEntries(ids.map((i) => [i, person(i)])), carElo: {} } as unknown as Universe;
  const rows = [row('B', 't2', 1, 'finished', 40), row('C', 't3', 2, 'finished', 40), row('D', 't4', 3, 'finished', 40), row('E', 't5', 4, 'finished', 40), row('F', 't6', 5, 'finished', 40), extraFor('A')];
  return { u, rows };
}

describe('Elo rating treatment', () => {
  it('a mechanical failure on lap 1 costs far less than a driver error on lap 1', () => {
    const mech = field((id) => row(id, 't1', null, 'dnf', 1, 'mechanical'));
    updateElo(mech.u, race(mech.rows), false);
    const err = field((id) => row(id, 't1', null, 'dnf', 1, 'driver'));
    updateElo(err.u, race(err.rows), false);
    const dMech = mech.u.people.A.elo.rating - 1500, dErr = err.u.people.A.elo.rating - 1500;
    expect(dErr).toBeLessThan(-5);
    expect(Math.abs(dMech)).toBeLessThan(Math.abs(dErr) * 0.1);
  });

  it('a late mechanical failure counts as more (but still partial) evidence', () => {
    const early = field((id) => row(id, 't1', null, 'dnf', 2, 'mechanical')); updateElo(early.u, race(early.rows), false);
    const late = field((id) => row(id, 't1', null, 'dnf', 38, 'mechanical')); updateElo(late.u, race(late.rows), false);
    const full = field((id) => row(id, 't1', null, 'dnf', 38, 'driver')); updateElo(full.u, race(full.rows), false);
    const d = (x: { u: Universe }) => Math.abs(x.u.people.A.elo.rating - 1500);
    expect(d(late)).toBeGreaterThan(d(early));
    expect(d(late)).toBeLessThan(d(full));
    expect(ELO.mechanicalScale).toBeLessThan(1);
  });

  it('team-mate comparisons outweigh comparisons with other teams', () => {
    const run = (order: [string, string][]) => { const u = { people: { A: person('A'), B: person('B'), C: person('C') }, carElo: {} } as unknown as Universe; updateElo(u, race(order.map(([id, t], i) => row(id, t, i + 1, 'finished', 40))), false); return u.people.B.elo.rating - 1500; };
    // B loses to team-mate A but beats C of another team: net negative only because the team-mate counts double
    expect(run([['A', 't1'], ['B', 't1'], ['C', 't2']])).toBeLessThan(0);
    // B beats team-mate A but loses to C: net positive
    expect(run([['C', 't2'], ['B', 't1'], ['A', 't1']])).toBeGreaterThan(0);
    expect(ELO.wTeammate).toBeGreaterThan(1);
  });

  it('ratings never feed back into the hidden skill model', () => {
    const f = field((id) => row(id, 't1', 6, 'finished', 40));
    const attrsBefore = JSON.stringify(Object.values(f.u.people).map((p) => (p as any).attrs));
    updateElo(f.u, race(f.rows), false);
    expect(JSON.stringify(Object.values(f.u.people).map((p) => (p as any).attrs))).toBe(attrsBefore);
  });
});

describe('records', () => {
  it('are awarded once per occasion and keep previous holders', () => {
    const u = { records: {}, people: {}, teams: {}, events: [], counters: {} } as unknown as Universe;
    initRecords(u);
    expect(offer(u, 'seasonWins', 'A', 5, 100, 1950, 'S1950')).toBe('set');
    expect(offer(u, 'seasonWins', 'A', 5, 100, 1950, 'S1950')).toBeNull(); // same occasion again
    expect(offer(u, 'seasonWins', 'B', 7, 465, 1951, 'S1951')).toBe('broken');
    expect(offer(u, 'seasonWins', 'C', 7, 830, 1952, 'S1952')).toBe('equalled');
    const st = u.records.seasonWins;
    expect(st.history).toHaveLength(3);
    expect(st.history[1].prevHolders).toEqual(['A']);
    expect(st.history[1].prevValue).toBe(5);
    expect(st.current!.holderIds).toEqual(['B', 'C']);
  });
});
