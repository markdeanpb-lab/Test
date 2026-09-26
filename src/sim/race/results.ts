// Race classification: finishers by laps then total time (+ unserved time penalties); non-finishers by
// distance covered. Classified only with enough of the winner's laps (era rule). Measured pace evidence
// (median clean lap) is recorded separately for the rating system.
import type { RaceState } from './engine';
import type { WeekendSetup } from './setup';
import type { Track } from '../track';

export interface ClassRow {
  i: number;
  pos: number | null;
  status: 'finished' | 'dnf' | 'dsq' | 'nc' | 'dns';
  laps: number;
  time: number | null;
  reason?: string;
  category?: 'mechanical' | 'driver' | 'contact' | 'other';
  where?: string;
  grid: number;
  bestLap: number | null;
  pits: number;
  penalties: { kind: string; seconds: number; reason: string }[];
  led: number;
  paceIndex: number | null;
  cleanLaps: number;
  overtakes: number;
}

const median = (a: number[]) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };

export function classify(st: RaceState, setup: WeekendSetup, tr: Track): { rows: ClassRow[]; lapsCompleted: number; status: 'finished' | 'shortened' | 'abandoned'; halfPoints: boolean } {
  const cars = st.cars;
  const maxLaps = Math.max(0, ...cars.map((c) => c.lap));
  const status = st.status === 'abandoned' || st.phase === 'abandoned' ? 'abandoned' : st.status === 'shortened' || maxLaps < st.laps ? 'shortened' : 'finished';
  const penTime = (k: number) => cars[k].pen.filter((p) => p.kind === 'time' && !p.served).reduce((a, p) => a + p.seconds, 0);
  const endedByRed = st.redOrder !== null || cars.every((c) => c.finT === null);
  const idx = cars.map((_, k) => k);
  const total = (k: number) => (cars[k].finT !== null ? cars[k].finT! : st.t) + penTime(k);
  idx.sort((a, b) => {
    const A = cars[a], B = cars[b];
    const la = A.ret ? A.ret.lap - 1 : A.lap, lb = B.ret ? B.ret.lap - 1 : B.lap;
    if (!endedByRed && (A.finT !== null) !== (B.finT !== null) && la === lb) return A.finT !== null ? -1 : 1;
    if (la !== lb) return lb - la;
    if (A.finT !== null && B.finT !== null) return total(a) - total(b);
    const da = A.ret ? A.ret.lap * 1e6 + A.ret.s : A.dist, db = B.ret ? B.ret.lap * 1e6 + B.ret.s : B.dist;
    if (!A.ret && !B.ret) return B.dist - A.dist;
    return db - da;
  });
  // field pace reference from clean laps
  const meds = cars.map((c) => (c.cleanTimes.length >= 3 ? median(c.cleanTimes) : NaN));
  const fieldMed = median(meds.filter((m) => !Number.isNaN(m)));
  const winnerLaps = Math.max(...cars.map((c) => (c.ret ? c.ret.lap - 1 : c.lap)));
  let pos = 1;
  const rows: ClassRow[] = idx.map((k) => {
    const c = cars[k];
    const laps = Math.max(0, c.ret ? c.ret.lap - 1 : c.lap);
    const classified = status !== 'abandoned' && laps >= Math.floor(winnerLaps * setup.rules.classifiedPct) && laps > 0;
    const finished = !c.ret && (c.finT !== null || endedByRed);
    let st2: ClassRow['status'] = finished ? 'finished' : c.ret ? 'dnf' : 'nc';
    if (c.dnsReason) st2 = 'dns';
    if (!classified && st2 === 'finished') st2 = 'nc';
    const unservedDt = c.pen.some((p) => p.kind === 'drive-through' && !p.served);
    if (unservedDt && finished) st2 = 'dsq';
    const row: ClassRow = {
      i: k, pos: classified && st2 !== 'dsq' ? pos++ : null, status: st2, laps,
      time: c.finT !== null ? +(total(k)).toFixed(3) : null,
      grid: c.grid, bestLap: Number.isFinite(c.best) ? +c.best.toFixed(3) : null, pits: c.pits,
      penalties: c.pen.map((p) => ({ kind: p.kind, seconds: p.seconds, reason: p.reason })), led: c.led,
      paceIndex: Number.isNaN(meds[k]) || Number.isNaN(fieldMed) ? null : +(meds[k] - fieldMed).toFixed(3),
      cleanLaps: c.cleanTimes.length, overtakes: c.overtakes,
    };
    if (c.ret) { row.reason = c.ret.reason; row.category = c.ret.cat; row.where = c.ret.where; }
    if (unservedDt && finished) row.reason = 'unserved drive-through penalty';
    return row;
  });
  const halfPoints = status === 'shortened' && winnerLaps < st.laps * 0.75;
  void tr;
  return { rows, lapsCompleted: winnerLaps, status, halfPoints };
}
