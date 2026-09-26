// Shared fixtures for the test suite: deterministic universes advanced with the real season code.
import type { Universe, Meeting } from '../src/sim/types';
import { createUniverse, advance } from '../src/sim/universe';
import { nextTask } from '../src/sim/world/season';

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Canonical fingerprint of a universe's simulated content (meta holds wall-clock ids and timestamps). */
export function fingerprint(u: Universe): string {
  const { meta, ...rest } = u;
  void meta;
  let h = 2166136261;
  const s = JSON.stringify(rest);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `${h.toString(16)}:${s.length}`;
}

/** Advance until the next task is the given meeting (0-based index) of the current season. */
export function toMeeting(u: Universe, idx: number) {
  advance(u, (t) => t.kind === 'meeting' && t.idx === idx);
}
export function nextMeeting(u: Universe): Meeting | null {
  const t = nextTask(u);
  return t.kind === 'meeting' ? u.seasons[t.year].meetings[t.idx!] : null;
}
/** Run to the end of `year` (its season-end task included). */
export function toSeasonEnd(u: Universe, year: number) {
  advance(u, (t) => t.year > year);
}
export function newUniverse(seed = 'test-seed') { return createUniverse(seed); }
