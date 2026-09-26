import { useEffect, useState } from 'preact/hooks';
import type { Controller } from '../app/controller';
import type { Universe, Person, Team } from '../sim/types';
import { NATIONS } from '../sim/names';
import { fmtDate, ageOn } from '../sim/dates';

export function useCtrl(c: Controller) {
  const [, set] = useState(0);
  useEffect(() => c.subscribe(() => set((v) => v + 1)), [c]);
  return c;
}

export const ord = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
export const pname = (u: Universe, id?: string) => { const p = id ? u.people[id] : undefined; return p ? `${p.first} ${p.last}` : '—'; };
export const flag = (nat: string) => NATIONS[nat]?.flag ?? '';
export const natName = (nat: string) => NATIONS[nat]?.adj ?? nat;
export function fmtTime(s: number | null | undefined): string {
  if (s === null || s === undefined || !Number.isFinite(s)) return '—';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s - h * 3600 - m * 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}` : `${m}:${sec.toFixed(3).padStart(6, '0')}`;
}
export function fmtLap(s: number | null | undefined) { if (s === null || s === undefined || !Number.isFinite(s)) return '—'; const m = Math.floor(s / 60); const r = s - m * 60; return m ? `${m}:${r.toFixed(3).padStart(6, '0')}` : r.toFixed(3); }
export function money(u: Universe, v: number) { return `£${v >= 10 ? v.toFixed(0) : v.toFixed(1)}m`; }
export const teamOf = (u: Universe, id?: string): Team | undefined => (id ? u.teams[id] : undefined);

export function Swatch({ colour, pattern, colour2 }: { colour: string; pattern?: string; colour2?: string }) {
  // colour plus a pattern mark so teams are distinguishable without relying on hue
  const mark = pattern === 'stripe' ? <rect x="5" y="0" width="2" height="12" fill={colour2} /> : pattern === 'band' ? <rect x="0" y="5" width="12" height="2" fill={colour2} /> : pattern === 'hoops' ? <><rect x="0" y="3" width="12" height="1.5" fill={colour2} /><rect x="0" y="7.5" width="12" height="1.5" fill={colour2} /></> : pattern === 'chevron' ? <path d="M1 9 L6 4 L11 9" stroke={colour2} stroke-width="1.6" fill="none" /> : pattern === 'quarters' ? <><rect x="6" y="0" width="6" height="6" fill={colour2} /><rect x="0" y="6" width="6" height="6" fill={colour2} /></> : null;
  return <svg class="swatch" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" fill={colour} />{mark}</svg>;
}

export function PersonLink({ u, id, onOpen, short }: { u: Universe; id: string; onOpen: (id: string) => void; short?: boolean }) {
  const p = u.people[id];
  if (!p) return <span>—</span>;
  return <button class="link" onClick={() => onOpen(id)}>{short ? p.last : `${p.first} ${p.last}`}</button>;
}

export function ageStr(p: Person, day: number) { return `${ageOn(p.dob, day)}`; }
export { fmtDate };
