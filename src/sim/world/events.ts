// Common event framework. Every world event is a recorded fact with entities, severity, causes (other
// events) and effects. Stochastic events are defined with prerequisites, a context-dependent annual
// rate converted to a probability for the elapsed simulated time, cooldowns and consequences.
import type { Universe, WorldEvent, Day, Team, Person, Venue } from '../types';
import { Rng } from '../rng';
import { clamp, dexp } from '../dmath';
import { fmtDate } from '../dates';

export function addEvent(u: Universe, e: { day: Day; type: string; scope: WorldEvent['scope']; title: string; severity?: number; people?: string[]; teams?: string[]; venues?: string[]; meetingId?: string; techId?: string; facts?: Record<string, any>; causes?: string[]; effects?: string[]; untilDay?: Day }): WorldEvent {
  const n = (u.counters.E ?? 0) + 1; u.counters.E = n;
  const ev: WorldEvent = {
    id: `E${String(n).padStart(6, '0')}`, day: e.day, type: e.type, scope: e.scope, title: e.title, people: e.people ?? [], teams: e.teams ?? [], venues: e.venues ?? [],
    meetingId: e.meetingId, techId: e.techId, severity: e.severity ?? 0.3, facts: e.facts ?? {}, causes: e.causes ?? [], effects: e.effects ?? [], untilDay: e.untilDay,
  };
  u.events.push(ev);
  return ev;
}

export function onCooldown(u: Universe, key: string, day: Day): boolean { return (u.cooldowns[key] ?? -1e9) > day; }
export function setCooldown(u: Universe, key: string, until: Day) { u.cooldowns[key] = until; }

/** Probability that an event with an annual rate occurs during `days` of elapsed time. */
export function pForDays(ratePerYear: number, days: number): number { return 1 - dexp(-Math.max(0, ratePerYear) * (days / 365.25)); }

export interface EventCtx { u: Universe; rng: Rng; day: Day; days: number; year: number }
interface StochasticDef<T> {
  type: string;
  entities: (ctx: EventCtx) => T[];
  key: (x: T) => string;
  prereq: (ctx: EventCtx, x: T) => boolean;
  rate: (ctx: EventCtx, x: T) => number; // per year
  cooldownDays: number;
  apply: (ctx: EventCtx, x: T) => WorldEvent | null;
}

const activeTeams = (u: Universe) => Object.values(u.teams).filter((t) => t.status === 'active');
const activeDrivers = (u: Universe) => Object.values(u.people).filter((p) => p.kind === 'driver' && p.status === 'active');
const activeVenues = (u: Universe) => Object.values(u.venues).filter((v) => v.status !== 'closed');

// Registry is filled by modules that own the consequences (finance, venues, people) to avoid cycles.
export const STOCHASTIC: StochasticDef<any>[] = [];
export function registerEvent<T>(d: StochasticDef<T>) { STOCHASTIC.push(d as StochasticDef<any>); }

/** Evaluate stochastic events for an elapsed time window. Order is fixed for determinism. */
export function tickEvents(u: Universe, rng: Rng, fromDay: Day, toDay: Day, year: number) {
  const days = toDay - fromDay;
  if (days <= 0) return;
  const ctx: EventCtx = { u, rng, day: toDay, days, year };
  for (const def of STOCHASTIC) {
    for (const x of def.entities(ctx)) {
      const key = `${def.type}:${def.key(x)}`;
      if (onCooldown(u, key, toDay)) continue;
      if (!def.prereq(ctx, x)) continue;
      if (!rng.chance(pForDays(def.rate(ctx, x), days))) continue;
      const ev = def.apply(ctx, x);
      if (ev) setCooldown(u, key, toDay + def.cooldownDays);
    }
  }
}

// ------------------------------------------------------------------ world-level events defined here
registerEvent<null>({
  type: 'recession', entities: () => [null], key: () => 'world',
  prereq: ({ u }) => u.world.economy > -0.6,
  rate: ({ u }) => 0.07 + (u.world.economy > 0.4 ? 0.06 : 0),
  cooldownDays: 365 * 5,
  apply: ({ u, rng, day }) => {
    const depth = rng.range(0.3, 0.7);
    u.world.economy = clamp(u.world.economy - depth, -1, 1);
    return addEvent(u, { day, type: 'recession', scope: 'world', title: depth > 0.55 ? 'Economic depression' : 'Economic downturn', severity: depth, facts: { depth: +depth.toFixed(2), economy: +u.world.economy.toFixed(2) }, effects: ['sponsorship harder to find', 'calendar may shrink'] });
  },
});
registerEvent<null>({
  type: 'boom', entities: () => [null], key: () => 'world',
  prereq: ({ u }) => u.world.economy < 0.7,
  rate: ({ u }) => 0.06 + (u.world.economy < -0.3 ? 0.1 : 0),
  cooldownDays: 365 * 4,
  apply: ({ u, rng, day }) => {
    const lift = rng.range(0.2, 0.5);
    u.world.economy = clamp(u.world.economy + lift, -1, 1);
    return addEvent(u, { day, type: 'boom', scope: 'world', title: 'Economic recovery', severity: lift * 0.6, facts: { lift: +lift.toFixed(2), economy: +u.world.economy.toFixed(2) }, effects: ['sponsors return'] });
  },
});
registerEvent<null>({
  type: 'fuel-shortage', entities: () => [null], key: () => 'world',
  prereq: ({ u }) => !u.world.emergency && u.world.fuelSupply > 0.6,
  rate: ({ u }) => 0.015 + (u.world.economy < -0.3 ? 0.03 : 0),
  cooldownDays: 365 * 12,
  apply: ({ u, rng, day }) => {
    u.world.fuelSupply = rng.range(0.3, 0.6);
    return addEvent(u, { day, type: 'fuel-shortage', scope: 'world', title: 'Fuel shortage', severity: 0.6, facts: { supply: +u.world.fuelSupply.toFixed(2) }, effects: ['meetings may be cancelled', 'fuel allowances may be cut'], untilDay: day + 365 });
  },
});
registerEvent<null>({
  type: 'national-emergency', entities: () => [null], key: () => 'world',
  prereq: ({ u, year }) => !u.world.emergency && year > u.meta.settings.startYear + 8,
  rate: () => 0.006,
  cooldownDays: 365 * 45,
  apply: ({ u, rng, day }) => {
    const years = rng.intRange(2, 6);
    const ev = addEvent(u, { day, type: 'national-emergency', scope: 'world', title: 'National emergency suspends motor racing', severity: 1, facts: { expectedYears: years }, effects: ['championship suspended'], untilDay: day + years * 365 });
    u.world.emergency = { kind: 'national emergency', since: day, eventId: ev.id };
    return ev;
  },
});
registerEvent<null>({
  type: 'environment-campaign', entities: () => [null], key: () => 'world',
  prereq: ({ u }) => u.world.industry > 0.45 && u.world.environment < 0.95,
  rate: ({ u }) => 0.12 + u.world.industry * 0.1,
  cooldownDays: 365 * 3,
  apply: ({ u, rng, day }) => {
    const d = rng.range(0.05, 0.15);
    u.world.environment = clamp(u.world.environment + d, 0, 1);
    return addEvent(u, { day, type: 'environment-campaign', scope: 'world', title: 'Environmental campaigners target motor racing', severity: 0.3, facts: { environment: +u.world.environment.toFixed(2) }, effects: ['pressure for fuel limits and new energy'] });
  },
});

export function describeEvent(ev: WorldEvent): string { return `${fmtDate(ev.day)} — ${ev.title}`; }
export type { Team, Person, Venue };
export { activeTeams, activeDrivers, activeVenues };
