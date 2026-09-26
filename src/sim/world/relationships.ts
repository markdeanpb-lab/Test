// Relationships between people as evolving records with episodes. Intensity rises with repeated
// meaningful episodes (not single routine overtakes), fades over time, and can reconcile or end.
import type { Universe, Relationship, Day } from '../types';
import { Rng } from '../rng';
import { clamp } from '../dmath';
import { addEvent } from './events';

const key = (a: string, b: string, kind: string) => (a < b ? `${a}|${b}|${kind}` : `${b}|${a}|${kind}`);

export function relBetween(u: Universe, a: string, b: string, kind?: Relationship['kind']): Relationship | undefined {
  if (kind) return u.rels[key(a, b, kind)];
  for (const k of ['rivalry', 'dispute', 'friendship', 'mentorship'] as const) { const r = u.rels[key(a, b, k)]; if (r) return r; }
  return undefined;
}
export function relsOf(u: Universe, id: string): Relationship[] { return Object.values(u.rels).filter((r) => r.a === id || r.b === id); }

export function bumpRel(u: Universe, a: string, b: string, kind: Relationship['kind'], delta: number, cause: string, day: Day, meetingId?: string, eventId?: string): Relationship {
  const k = key(a, b, kind);
  let r = u.rels[k];
  if (!r) {
    r = { id: k, a: a < b ? a : b, b: a < b ? b : a, kind, intensity: 0, since: day, lastChange: day, status: 'active', episodes: [] };
    if (kind === 'mentorship') { r.a = a; r.b = b; }
    u.rels[k] = r;
  }
  const before = r.intensity;
  r.intensity = clamp(r.intensity + delta, 0, 1);
  r.lastChange = day;
  if (r.status !== 'active' && delta > 0) r.status = 'active';
  r.episodes.push({ day, delta: +delta.toFixed(3), cause, meetingId, eventId });
  if (r.episodes.length > 40) r.episodes.splice(0, r.episodes.length - 40);
  // crossing a threshold is itself news
  if (kind === 'rivalry' && before < 0.5 && r.intensity >= 0.5) {
    const pa = u.people[r.a], pb = u.people[r.b];
    addEvent(u, { day, type: 'rivalry-intensifies', scope: 'driver', title: `${pa.last} and ${pb.last}: a rivalry takes hold`, people: [r.a, r.b], severity: 0.5, meetingId, facts: { episodes: r.episodes.length, cause } });
  }
  return r;
}

/** Annual fading; strong rivalries may reconcile; friendships drift. */
export function yearlyRelationships(u: Universe, rng: Rng, day: Day) {
  for (const r of Object.values(u.rels)) {
    if (r.status === 'ended') continue;
    const pa = u.people[r.a], pb = u.people[r.b];
    const bothRetired = pa?.status === 'retired' && pb?.status === 'retired';
    const decay = r.kind === 'friendship' ? 0.88 : r.kind === 'mentorship' ? 0.8 : r.kind === 'dispute' ? 0.72 : 0.7;
    r.intensity *= bothRetired ? decay * 0.8 : decay;
    if ((r.kind === 'rivalry' || r.kind === 'dispute') && r.intensity > 0.35 && pa && pb && rng.chance(0.06 + 0.2 * ((pa.personality.sociability + pb.personality.sociability) / 2 - 0.4))) {
      r.status = 'reconciled';
      r.episodes.push({ day, delta: -r.intensity, cause: 'reconciliation' });
      r.intensity *= 0.3;
      addEvent(u, { day, type: 'reconciliation', scope: 'driver', title: `${pa.last} and ${pb.last} bury the hatchet`, people: [r.a, r.b], severity: 0.3, facts: { kind: r.kind, since: r.since } });
      continue;
    }
    if (r.intensity < 0.08 && r.status === 'active') r.status = 'faded';
    if (r.kind === 'mentorship' && pb && pb.experience > 60) r.status = 'ended';
    if (pa?.status === 'deceased' || pb?.status === 'deceased') r.status = 'ended';
  }
}

/** Friendships form between sociable drivers who share background, age or nationality. */
export function formFriendships(u: Universe, rng: Rng, day: Day, driverIds: string[]) {
  for (let i = 0; i < driverIds.length; i++) for (let j = i + 1; j < driverIds.length; j++) {
    const a = u.people[driverIds[i]], b = u.people[driverIds[j]];
    if (!a || !b) continue;
    const affinity = (a.nationality === b.nationality ? 0.3 : 0) + (Math.abs(a.dob - b.dob) < 365 * 3 ? 0.2 : 0) + (a.personality.sociability + b.personality.sociability) / 2 - 0.5;
    if (affinity > 0.25 && rng.chance(0.02 + affinity * 0.04)) bumpRel(u, a.id, b.id, 'friendship', 0.25, a.nationality === b.nationality ? 'compatriots in the paddock' : 'friendship in the paddock', day);
  }
}
