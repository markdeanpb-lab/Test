// When a background simulation stops. Shared by the worker and the main-thread fallback so both stop at
// exactly the same task.
import type { Universe } from '../sim/types';
import { nextTask } from '../sim/world/season';

export type Until = { kind: 'seasonEnd'; year: number } | { kind: 'year'; year: number } | { kind: 'nextMeeting' };

export function reached(u: Universe, until: Until): boolean {
  const t = nextTask(u);
  if (until.kind === 'nextMeeting') return t.kind === 'meeting';
  if (until.kind === 'seasonEnd') return t.year > until.year || (t.year === until.year && t.kind === 'newyear' && !!u.seasons[until.year]?.review);
  return t.year >= until.year && t.kind === 'newyear';
}
