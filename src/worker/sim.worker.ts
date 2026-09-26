// Background simulation: the same engine and world code, without rendering. Progress messages reflect
// real work (tasks completed); cancellation takes effect at the next safe checkpoint (between tasks).
import type { Universe } from '../sim/types';
import { nextTask, runTask } from '../sim/world/season';

let cancel = false;

export type Until = { kind: 'seasonEnd'; year: number } | { kind: 'year'; year: number } | { kind: 'nextMeeting' };
export type WorkerIn = { type: 'run'; universe: Universe; until: Until } | { type: 'cancel' };
export type WorkerOut = { type: 'progress'; year: number; round: number; rounds: number; label: string; done: number; total: number } | { type: 'done'; universe: Universe; cancelled: boolean; ms: number } | { type: 'error'; message: string };

function stop(u: Universe, until: Until): boolean {
  const t = nextTask(u);
  if (until.kind === 'nextMeeting') return t.kind === 'meeting';
  if (until.kind === 'seasonEnd') return t.year > until.year || (t.year === until.year && t.kind === 'newyear' && !!u.seasons[until.year]?.review);
  return t.year >= until.year && t.kind === 'newyear';
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type === 'cancel') { cancel = true; return; }
  if (msg.type !== 'run') return;
  cancel = false;
  const u = msg.universe;
  const t0 = performance.now();
  const startYear = u.clock.year;
  const endYear = msg.until.kind === 'nextMeeting' ? startYear : msg.until.year;
  const totalYears = Math.max(1, endYear - startYear + 1);
  try {
    let n = 0;
    while (!stop(u, msg.until)) {
      const t = nextTask(u);
      runTask(u, t);
      n++;
      if (cancel) break;
      if (t.kind === 'meeting' || t.kind === 'seasonEnd') {
        const s = u.seasons[t.year];
        const done = (t.year - startYear) + (s ? s.meetings.filter((m) => m.status !== 'scheduled').length / Math.max(1, s.meetings.length) : 0);
        (self as any).postMessage({ type: 'progress', year: t.year, round: t.idx !== undefined ? t.idx + 1 : 0, rounds: s?.meetings.length ?? 0, label: t.kind === 'meeting' ? s?.meetings[t.idx!]?.name ?? '' : `${t.year} season review`, done, total: totalYears } as WorkerOut);
      }
      if (n > 200000) break;
    }
    (self as any).postMessage({ type: 'done', universe: u, cancelled: cancel, ms: performance.now() - t0 } as WorkerOut);
  } catch (err: any) {
    (self as any).postMessage({ type: 'error', message: String(err?.stack ?? err) } as WorkerOut);
  }
};
