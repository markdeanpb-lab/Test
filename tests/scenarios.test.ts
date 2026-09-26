// Labelled demonstration: finds and prints real examples of an overtake, a pit stop, a mechanical
// retirement and a penalty in simulated races (no scripted outcomes), each with its recorded reason.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Universe, RaceRecord, RaceRecEvent } from './types-shim';
import { newUniverse, toSeasonEnd } from './helpers';
import { fmtDate } from '../src/sim/dates';

const name = (u: Universe, id?: string) => (id && u.people[id] ? `${u.people[id].first} ${u.people[id].last}` : '?');

describe('scenario examples (labelled)', () => {
  let u: Universe;
  let races: RaceRecord[];
  beforeAll(() => { u = newUniverse('scenarios'); toSeasonEnd(u, 1928); races = Object.values(u.races).sort((a, b) => a.day - b.day); });

  const find = (pred: (e: RaceRecEvent, r: RaceRecord) => boolean) => { for (const r of races) for (const e of r.events) if (pred(e, r)) return { r, e }; return null; };
  const label = (what: string, x: { r: RaceRecord; e: RaceRecEvent } | null, text: (x: { r: RaceRecord; e: RaceRecEvent }) => string) => {
    if (x) console.log(`[${what}] ${x.r.name} ${x.r.year} (${fmtDate(x.r.day)}), lap ${x.e.lap}: ${text(x)}`);
    return x;
  };

  it('contains an overtake with a recorded reason', () => {
    const x = label('OVERTAKE', find((e) => e.kind === 'overtake' && !!e.detail), ({ e }) => `${name(u, e.a)} passes ${name(u, e.b)} for P${e.pos} at ${e.where ?? '?'} — ${e.detail}`);
    expect(x).not.toBeNull();
  });

  it('contains a pit stop', () => {
    const x = label('PIT STOP', find((e) => e.kind === 'pit'), ({ e }) => { const [why, tyre, fuel, repair, wear, old] = (e.detail ?? '').split('|'); return `${name(u, e.a)} pits (reason: ${why}; ${old} tyres at ${Math.round(+wear * 100)}% wear${tyre ? ` → fresh ${tyre}` : ''}${fuel ? ', refuelled' : ''}${repair ? ', repairs' : ''}), ${e.value?.toFixed(1)} s in the pit lane`; });
    expect(x).not.toBeNull();
  });

  it('contains a mechanical retirement, classified as mechanical in the result', () => {
    let hit: { r: RaceRecord; row: RaceRecord['results'][0] } | null = null;
    for (const r of races) { const row = r.results.find((y) => y.status === 'dnf' && y.category === 'mechanical'); if (row) { hit = { r, row }; break; } }
    expect(hit).not.toBeNull();
    console.log(`[MECHANICAL DNF] ${hit!.r.name} ${hit!.r.year}: ${name(u, hit!.row.driverId)} out after ${hit!.row.laps} laps — ${hit!.row.reason}${hit!.row.where ? ` at ${hit!.row.where}` : ''}`);
  });

  it('contains a penalty with its reason', () => {
    const x = label('PENALTY', find((e) => ['penalty', 'drivethrough', 'reprimand'].includes(e.kind)), ({ e }) => `${name(u, e.a)}: ${e.kind}${e.detail ? ` — ${e.detail}` : ''}`)
      ?? (() => { for (const r of races) for (const row of r.results) if (row.penalties.length) { console.log(`[PENALTY] ${r.name} ${r.year}: ${name(u, row.driverId)} — ${row.penalties[0].kind} ${row.penalties[0].seconds}s, ${row.penalties[0].reason}`); return true; } return null; })();
    expect(x).not.toBeNull();
  });
});
