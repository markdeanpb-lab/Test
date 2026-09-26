import type { Controller } from '../../app/controller';
import type { Universe } from '../../sim/types';
import { rebuildCareers, type Career, type TeamCareer } from '../../sim/world/stats';
import { yearOf, dayOf } from '../../sim/dates';

/** Careers as known on a date (spoiler-safe views); memoised per universe size and date. */
const memo = new Map<string, { careers: Record<string, Career>; teams: Record<string, TeamCareer> }>();
export function known(u: Universe, asOf?: number): { careers: Record<string, Career>; teams: Record<string, TeamCareer> } {
  if (asOf === undefined) return { careers: u.careers, teams: u.teamCareers };
  const key = `${u.meta.id}|${Object.keys(u.races).length}|${asOf}`;
  let v = memo.get(key);
  if (!v) { v = rebuildCareers(u, asOf); memo.set(key, v); if (memo.size > 20) memo.delete(memo.keys().next().value!); }
  return v;
}

export function P({ c, id, short, asOf }: { c: Controller; id?: string; short?: boolean; asOf?: number }) {
  const u = c.u!; const p = id ? u.people[id] : undefined;
  if (!p || !id) return <span>—</span>;
  return <button class="link" onClick={() => c.open({ kind: 'person', id, asOf })}>{short ? p.last : `${p.first} ${p.last}`}</button>;
}
export function Tm({ c, id, year, asOf }: { c: Controller; id?: string; year?: number; asOf?: number }) {
  const u = c.u!; if (!id) return <span>—</span>;
  const e = year ? u.seasons[year]?.entries.find((x) => x.teamId === id) : undefined;
  return <button class="link" onClick={() => c.open({ kind: 'team', id, asOf })}>{e?.name ?? u.teams[id]?.name ?? id}</button>;
}
export function R({ c, id, label }: { c: Controller; id: string; label?: string }) {
  const u = c.u!; const r = u.races[id];
  return <button class="link" onClick={() => c.open({ kind: 'race', id })}>{label ?? (r ? `${r.name} ${r.year}` : id)}</button>;
}
export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) { return <div class="stat" title={hint}><b>{value}</b><span>{label}</span></div>; }
export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : '—');
export const yearOfDay = yearOf;

/**
 * Spoiler control: choose how much of the century is revealed. Every history view then shows the world as
 * it was known at the end of the chosen year (standings, records, careers, stories), never later facts.
 */
export function TimeCursor({ c }: { c: Controller }) {
  const u = c.u!;
  const years = Object.keys(u.seasons).map(Number);
  const y0 = Math.min(...years), y1 = Math.max(...years);
  if (y1 - y0 < 2) return null;
  const on = c.cutoff !== undefined;
  const cur = on ? yearOf(c.cutoff!) : y1;
  const set = (y: number | null) => { c.cutoff = y === null ? undefined : dayOf(y, 12, 31); c.notify(true); };
  return <div class="timecursor card" role="group" aria-label="Spoiler control">
    <label><input type="checkbox" checked={on} onChange={(e) => set((e.target as HTMLInputElement).checked ? Math.max(y0, y1 - 1) : null)} /> Hide what happened after</label>
    {on && <><input type="range" min={y0} max={y1} value={cur} onInput={(e) => set(+(e.target as HTMLInputElement).value)} aria-label="Reveal history up to year" /><b>{cur}</b>
      <button class="btn" onClick={() => set(Math.min(y1, cur + 1))} disabled={cur >= y1}>Next year →</button></>}
  </div>;
}
