// Venues, layout versions and the calendar. Layout versions are immutable once used; changes create a new
// version with an effective date and a recorded reason. The calendar mixes layouts and records the cause
// of any exception to the "no more than two consecutive meetings on one layout" rule.
import type { Universe, Venue, LayoutVersion, Meeting, Day } from '../types';
import { Rng } from '../rng';
import { clamp } from '../dmath';
import { GEOMETRIES, getTrack } from '../track';
import { addEvent, registerEvent, activeVenues } from './events';
import { dayOf, sundayNear } from '../dates';

const VENUE_NAMES: Record<string, string> = { abbey: 'Abbey & Verulamium', verulam: 'Verulam Triangle', london: 'London Road', hatfield: 'Hatfield Road', batchwood: 'Batchwood' };
// Recurring named meetings bound to a venue. The first listed for a venue is its signature event.
export const MEETING_NAMES: { name: string; venue: string; significance: number; reverse?: boolean }[] = [
  { name: 'St Albans Grand Prix', venue: 'abbey', significance: 2 },
  { name: 'Verulam Trophy', venue: 'verulam', significance: 1.2 },
  { name: 'London Road Cup', venue: 'london', significance: 1 },
  { name: 'Hatfield Road International', venue: 'hatfield', significance: 1.2 },
  { name: 'Batchwood 100', venue: 'batchwood', significance: 1.3 },
  { name: 'Fishpool Classic', venue: 'abbey', significance: 1.3, reverse: true },
  { name: 'Clock Tower Trophy', venue: 'verulam', significance: 1 },
  { name: 'Cathedral Cup', venue: 'abbey', significance: 1.1 },
  { name: 'Station Sprint', venue: 'london', significance: 1, reverse: true },
  { name: 'Spring Trophy', venue: 'hatfield', significance: 1 },
  { name: 'Hertfordshire Grand Prix', venue: 'batchwood', significance: 1.4 },
  { name: 'Market Place Trophy', venue: 'verulam', significance: 1 },
  { name: 'Autumn Classic', venue: 'hatfield', significance: 1 },
  { name: 'Ver Valley Cup', venue: 'batchwood', significance: 1 },
];

export function surfaceGrip(surface: LayoutVersion['surface']) { return surface === 'setts' ? 0.9 : surface === 'macadam' ? 0.95 : surface === 'tarmac' ? 1 : 1.03; }

export function initVenues(u: Universe, year: number) {
  const day = dayOf(year, 1, 1);
  const ids = [...new Set(GEOMETRIES.map((g) => g.circuitId))];
  for (const id of ids) {
    const g1 = GEOMETRIES.find((g) => g.circuitId === id && g.variant === 'v1')!;
    const surface = (g1.surface1920 as LayoutVersion['surface']) ?? 'macadam';
    const lv: LayoutVersion = { id: `LV-${id}-1`, venueId: id, geometryId: g1.id, from: day, reason: 'Original layout', surface, barrier: 'kerbs', safety: 0.05, pitQuality: 0.2, grip: surfaceGrip(surface) };
    u.layouts[lv.id] = lv;
    const v: Venue = { id, name: VENUE_NAMES[id] ?? g1.name, status: 'active', popularity: 50, versionIds: [lv.id], currentVersionId: lv.id, reverseAllowed: GEOMETRIES.some((g) => g.circuitId === id && g.reverse), eventIds: [] };
    u.venues[id] = v;
  }
}

export function currentLayout(u: Universe, venueId: string): LayoutVersion { const v = u.venues[venueId]; return u.layouts[v.currentVersionId]; }

/** Create a new layout version (never mutate one that races have used). */
export function newVersion(u: Universe, venueId: string, day: Day, changes: Partial<LayoutVersion>, reason: string, eventId?: string): LayoutVersion {
  const v = u.venues[venueId];
  const cur = u.layouts[v.currentVersionId];
  cur.to = day;
  const n = v.versionIds.length + 1;
  const lv: LayoutVersion = { ...cur, ...changes, id: `LV-${venueId}-${n}`, from: day, to: undefined, reason, eventId };
  lv.grip = surfaceGrip(lv.surface);
  u.layouts[lv.id] = lv;
  v.versionIds.push(lv.id);
  v.currentVersionId = lv.id;
  return lv;
}

/** The geometry to run for a meeting at a venue: its current version, or the reverse variant for reverse meetings. */
export function geometryFor(u: Universe, venueId: string, reverse: boolean): string {
  const lv = currentLayout(u, venueId);
  if (reverse) { const r = GEOMETRIES.find((g) => g.circuitId === venueId && g.reverse); if (r) return r.id; }
  return lv.geometryId;
}

// ------------------------------------------------------------------ calendar
export function buildCalendar(u: Universe, rng: Rng, year: number, regSetId: string): Meeting[] {
  const w = u.world;
  const regs = u.regs.sets[regSetId];
  const causes: string[] = [];
  let n = Math.round(u.meta.settings.meetings * (0.78 + w.popularity / 250 + w.economy * 0.15));
  const recession = u.events.filter((e) => e.type === 'recession' && e.day > dayOf(year - 1, 1, 1)).map((e) => e.id);
  if (recession.length) { n -= 1; causes.push(...recession); }
  const fuel = u.events.filter((e) => e.type === 'fuel-shortage' && (e.untilDay ?? 0) > dayOf(year, 3, 1)).map((e) => e.id);
  if (fuel.length || w.fuelSupply < 0.6) { n = Math.round(n * 0.6); causes.push(...fuel); }
  n = clamp(n, 4, 15);
  const venues = activeVenues(u).filter((v) => v.status === 'active' && (!v.unavailableUntil || v.unavailableUntil < year));
  if (!venues.length) return [];
  // choose named meetings: signature events first, weighted by venue popularity
  const pool = MEETING_NAMES.filter((m) => venues.some((v) => v.id === m.venue) && (!m.reverse || u.venues[m.venue].reverseAllowed));
  const chosen: typeof pool = [];
  const sig = pool.filter((m) => pool.findIndex((x) => x.venue === m.venue) === pool.indexOf(m));
  for (const m of sig) if (chosen.length < n) chosen.push(m);
  const rest = pool.filter((m) => !chosen.includes(m));
  while (chosen.length < n && rest.length) {
    const pick = rng.weighted(rest, rest.map((m) => (u.venues[m.venue].popularity / 50) * m.significance * (m.reverse ? 0.7 : 1)));
    chosen.push(pick); rest.splice(rest.indexOf(pick), 1);
  }
  while (chosen.length < n) chosen.push(rng.pick(sig)); // small venue lists: repeat signature events
  // order: spread venues, prestige event mid-to-late season, avoid >2 consecutive at one venue
  let order = rng.shuffle(chosen.slice());
  const gp = order.findIndex((m) => m.name === 'St Albans Grand Prix');
  if (gp >= 0) { const [g] = order.splice(gp, 1); order.splice(Math.min(order.length, Math.floor(order.length * rng.range(0.55, 0.85))), 0, g); }
  for (let pass = 0; pass < 20; pass++) {
    let fixed = true;
    for (let i = 2; i < order.length; i++) {
      if (order[i].venue === order[i - 1].venue && order[i].venue === order[i - 2].venue) {
        const j = order.findIndex((m, k) => k > i && m.venue !== order[i].venue);
        const jj = j >= 0 ? j : order.findIndex((m, k) => k < i - 2 && m.venue !== order[i].venue);
        if (jj >= 0) { const t = order[i]; order[i] = order[jj]; order[jj] = t; fixed = false; }
      }
    }
    if (fixed) break;
  }
  // the season opens at a signature (forward-running) event; the very first championship race is the
  // inaugural St Albans Grand Prix on the Abbey circuit
  const inaugural = !Object.keys(u.seasons).some((y) => +y < year && u.seasons[+y].meetings.some((m) => m.status === 'completed'));
  if (inaugural) { const gi = order.findIndex((m) => m.name === 'St Albans Grand Prix'); if (gi > 0) { const [g] = order.splice(gi, 1); order.unshift(g); } }
  else if (order[0]?.reverse) { const j = order.findIndex((m) => !m.reverse); if (j > 0) { const t = order[0]; order[0] = order[j]; order[j] = t; } }
  // dates between late April and mid October
  const first = dayOf(year, 4, 20), last = dayOf(year, 10, 12);
  const step = (last - first) / Math.max(1, order.length - 1);
  const meetings: Meeting[] = order.map((m, i) => {
    const approx = first + Math.round(step * i);
    const d = sundayNear(year, 1, 1) + Math.round((approx - sundayNear(year, 1, 1)) / 7) * 7;
    const geo = geometryFor(u, m.venue, !!m.reverse);
    const tr = getTrack(geo);
    const laps = Math.max(5, Math.round((regs.raceKm * 1000) / tr.length));
    return {
      id: `M${year}-${String(i + 1).padStart(2, '0')}`, year, round: i + 1, name: m.name, venueId: m.venue, geometryId: geo, layoutVersionId: u.venues[m.venue].currentVersionId,
      day: d, status: 'scheduled', regSetId, laps, distanceKm: +(laps * tr.length / 1000).toFixed(1), qualiFormat: regs.qualifying, significance: m.significance, causeEventIds: causes.slice(), calendarReason: causes.length ? 'Calendar reduced' : undefined,
    };
  });
  // record justified exceptions (only one venue available)
  if (inaugural && meetings[0]?.name === 'St Albans Grand Prix') meetings[0].calendarReason = 'Inaugural championship race';
  for (let i = 2; i < meetings.length; i++) if (meetings[i].venueId === meetings[i - 1].venueId && meetings[i].venueId === meetings[i - 2].venueId) meetings[i].calendarReason = `Third consecutive meeting at ${u.venues[meetings[i].venueId].name}: only ${venues.length} venue${venues.length > 1 ? 's' : ''} available`;
  return meetings;
}

/** Circuit infrastructure evolves with safety attitudes and money (annual, autumn). */
export function evolveVenues(u: Universe, rng: Rng, year: number, day: Day) {
  const w = u.world;
  for (const v of Object.values(u.venues)) {
    if (v.status === 'closed') { if (rng.chance(0.08 + w.popularity / 1000)) { v.status = 'active'; v.statusReason = undefined; addEvent(u, { day, type: 'venue-returns', scope: 'venue', title: `${v.name} returns to the calendar`, venues: [v.id], severity: 0.4 }); } continue; }
    if (v.status === 'unavailable' && (v.unavailableUntil ?? 0) <= year) { v.status = 'active'; v.statusReason = undefined; }
    const lv = currentLayout(u, v.id);
    // surfaces
    if (lv.surface === 'setts' && w.industry > 0.08 && rng.chance(0.25)) { const ev = addEvent(u, { day, type: 'resurfacing', scope: 'venue', title: `${v.name} resurfaced with tarred macadam`, venues: [v.id], severity: 0.2 }); newVersion(u, v.id, day, { surface: 'macadam' }, 'Resurfaced (macadam)', ev.id); }
    else if (lv.surface === 'macadam' && w.industry > 0.22 && rng.chance(0.2)) { const ev = addEvent(u, { day, type: 'resurfacing', scope: 'venue', title: `${v.name} resurfaced in asphalt`, venues: [v.id], severity: 0.2 }); newVersion(u, v.id, day, { surface: 'tarmac' }, 'Resurfaced (asphalt)', ev.id); }
    else if (lv.surface === 'tarmac' && w.industry > 0.75 && rng.chance(0.12)) { const ev = addEvent(u, { day, type: 'resurfacing', scope: 'venue', title: `${v.name} gets a high-grip racing surface`, venues: [v.id], severity: 0.2 }); newVersion(u, v.id, day, { surface: 'modern' }, 'High-grip resurfacing', ev.id); }
    // barriers & safety follow society's safety attitude
    const lv2 = currentLayout(u, v.id);
    const want = w.safetyAttitude;
    if (lv2.safety < want - 0.15 && rng.chance(0.35)) {
      const barrier: LayoutVersion['barrier'] = want > 0.75 ? 'energy' : want > 0.5 ? 'concrete' : want > 0.25 ? 'armco' : 'bales';
      const ev = addEvent(u, { day, type: 'barrier-upgrade', scope: 'venue', title: `${v.name}: ${barrier === 'bales' ? 'straw bales at corners' : barrier === 'armco' ? 'steel guard rails installed' : barrier === 'concrete' ? 'concrete walls and debris fencing' : 'energy-absorbing barriers'}`, venues: [v.id], severity: 0.25 });
      newVersion(u, v.id, day, { barrier, safety: clamp(lv2.safety + 0.15, 0, 1) }, 'Safety upgrade', ev.id);
    }
    if (lv2.pitQuality < 0.2 + w.industry * 0.7 && u.world.economy > -0.2 && rng.chance(0.15)) {
      const ev = addEvent(u, { day, type: 'pit-upgrade', scope: 'venue', title: `New pit garages at ${v.name}`, venues: [v.id], severity: 0.2 });
      newVersion(u, v.id, day, { pitQuality: clamp(lv2.pitQuality + 0.2, 0, 1) }, 'Improved pit facilities', ev.id);
    }
    // popularity drifts with the races held there
    v.popularity = clamp(v.popularity * 0.92 + 50 * 0.08 + rng.gauss(0, 2), 5, 100);
  }
}

/** A serious accident can trigger a safety review that alters a corner (new geometry version). */
export function safetyReview(u: Universe, rng: Rng, venueId: string, day: Day, causeId: string) {
  const v = u.venues[venueId]; if (!v) return;
  const lv = currentLayout(u, venueId);
  const v2 = GEOMETRIES.find((g) => g.circuitId === venueId && g.variant === 'v2');
  if (v2 && lv.geometryId !== v2.id && rng.chance(0.55)) {
    const ev = addEvent(u, { day, type: 'safety-review', scope: 'venue', title: `Safety review: ${v2.label.toLowerCase()} added at ${v.name}`, venues: [venueId], severity: 0.5, causes: [causeId], facts: { geometry: v2.id, modification: v2.fictionalModifications[0] } });
    newVersion(u, venueId, day, { geometryId: v2.id, safety: clamp(lv.safety + 0.1, 0, 1) }, v2.fictionalModifications[0] ?? 'Safety modification', ev.id);
  } else {
    const ev = addEvent(u, { day, type: 'safety-review', scope: 'venue', title: `Safety review at ${v.name}: run-off and barriers improved`, venues: [venueId], severity: 0.4, causes: [causeId] });
    newVersion(u, venueId, day, { safety: clamp(lv.safety + 0.15, 0, 1), barrier: lv.barrier === 'kerbs' ? 'bales' : lv.barrier === 'bales' ? 'armco' : lv.barrier }, 'Safety review', ev.id);
  }
}

registerEvent({
  type: 'road-works', entities: ({ u }) => activeVenues(u).filter((v) => v.status === 'active'), key: (v: Venue) => v.id,
  prereq: ({ u }, v: Venue) => activeVenues(u).filter((x) => x.status === 'active').length > 2,
  rate: () => 0.035, cooldownDays: 365 * 8,
  apply: ({ u, rng, day, year }, v: Venue) => {
    const street = rng.pick(getTrack(currentLayout(u, v.id).geometryId).g.streets.filter((s) => s.name).map((s) => s.name));
    v.status = 'unavailable'; v.unavailableUntil = year + 1; v.statusReason = `road works on ${street}`;
    return addEvent(u, { day, type: 'road-works', scope: 'venue', title: `Road works on ${street} take ${v.name} off next year's calendar`, venues: [v.id], severity: 0.4, facts: { street, until: year + 1 } });
  },
});
registerEvent({
  type: 'residents-objection', entities: ({ u }) => activeVenues(u).filter((v) => v.status === 'active'), key: (v: Venue) => v.id,
  prereq: ({ u }, v: Venue) => v.popularity < 55 && activeVenues(u).filter((x) => x.status === 'active').length > 3,
  rate: ({ u }) => 0.02 + u.world.environment * 0.04, cooldownDays: 365 * 10,
  apply: ({ u, rng, day, year }, v: Venue) => {
    const years = rng.intRange(2, 8);
    v.status = 'closed'; v.statusReason = 'residents\' objections'; v.unavailableUntil = year + years;
    return addEvent(u, { day, type: 'venue-closed', scope: 'venue', title: `Residents' objections close ${v.name}`, venues: [v.id], severity: 0.55, facts: { popularity: Math.round(v.popularity), environment: +u.world.environment.toFixed(2) } });
  },
});
