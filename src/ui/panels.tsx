import { useState } from 'preact/hooks';
import type { Controller } from '../app/controller';
import type { Universe } from '../sim/types';
import { Swatch, pname, fmtDate, ord, flag, natName } from './common';
import { RaceResult } from './results';
import { ageOn } from '../sim/dates';

export function Panels({ c }: { c: Controller }) {
  const [person, setPerson] = useState<string | null>(null);
  const [race, setRace] = useState<string | null>(null);
  (c as any).openPerson = (id: string) => { setPerson(id); setRace(null); if (c.dest === 'live') c.go('people'); };
  (c as any).openRace = (id: string) => { setRace(id); setPerson(null); };
  const u = c.u!;
  const title = person ? pname(u, person) : race ? u.races[race]?.name + ' ' + u.races[race]?.year : { season: 'Season', people: 'People', history: 'History', stories: 'Stories', live: 'Live' }[c.dest];
  return (
    <aside class="sheet" aria-label={title}>
      <div class="sheet-head">
        {(person || race) && <button class="btn ghost" onClick={() => { setPerson(null); setRace(null); }} aria-label="Back">←</button>}
        <h2>{title}</h2>
        <button class="btn" onClick={() => c.go('live')}>Close</button>
      </div>
      <div class="sheet-body">
        {race && u.races[race] ? <RaceResult c={c} rec={u.races[race]} /> : person ? <PersonView c={c} id={person} /> :
          c.dest === 'season' ? <SeasonView c={c} /> : c.dest === 'people' ? <PeopleView c={c} /> : c.dest === 'history' ? <HistoryView c={c} /> : <StoriesView c={c} />}
      </div>
    </aside>
  );
}

function SeasonView({ c }: { c: Controller }) {
  const u = c.u!;
  const years = Object.keys(u.seasons).map(Number).sort((a, b) => b - a);
  const [year, setYear] = useState(years[0]);
  const s = u.seasons[year];
  const [tab, setTab] = useState<'drivers' | 'teams' | 'calendar'>('drivers');
  if (!s) return <p>No season.</p>;
  const entry = (tid: string) => s.entries.find((e) => e.teamId === tid);
  const open = (id: string) => (c as any).openPerson(id);
  return <>
    <div class="pill-row" style={{ marginBottom: 10 }}><label>Season <select value={year} onChange={(e) => setYear(+(e.target as HTMLSelectElement).value)}>{years.map((y) => <option value={y}>{y}</option>)}</select></label>
      <span class="chip">{s.status}{s.statusReason ? `: ${s.statusReason}` : ''}</span>{s.championId && <span class="chip">Champion: {pname(u, s.championId)}</span>}</div>
    <div class="tabs" role="tablist">{(['drivers', 'teams', 'calendar'] as const).map((t) => <button role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'drivers' ? 'Drivers' : t === 'teams' ? 'Teams' : 'Calendar'}</button>)}</div>
    {tab === 'drivers' && <table class="data"><thead><tr><th class="num">#</th><th>Driver</th><th>Team</th><th class="num">Wins</th><th class="num">Podiums</th><th class="num">Points</th></tr></thead><tbody>
      {s.driverStandings.map((r, i) => { const tid = s.entries.find((e) => e.drivers.includes(r.id))?.teamId ?? u.people[r.id]?.teamId; const e = tid ? entry(tid) : undefined; return <tr><td class="num">{i + 1}</td><td><button class="link" onClick={() => open(r.id)}>{pname(u, r.id)}</button> <span class="small">{flag(u.people[r.id]?.nationality)}</span>{u.favourites.people.includes(r.id) && ' ★'}</td><td class="small">{e && <Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} />}{e?.name ?? ''}</td><td class="num">{r.wins}</td><td class="num">{r.podiums}</td><td class="num">{+r.points.toFixed(1)}</td></tr>; })}
    </tbody></table>}
    {tab === 'teams' && <table class="data"><thead><tr><th class="num">#</th><th>Team</th><th>Car</th><th class="num">Wins</th><th class="num">Points</th></tr></thead><tbody>
      {s.teamStandings.map((r, i) => { const e = entry(r.id); const car = e ? u.cars[e.carId] : undefined; return <tr><td class="num">{i + 1}</td><td>{e && <Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} />}{e?.name}</td><td class="small">{car?.name} <span class="muted">({car?.concept})</span></td><td class="num">{r.wins}</td><td class="num">{+r.points.toFixed(1)}</td></tr>; })}
    </tbody></table>}
    {tab === 'calendar' && <table class="data"><thead><tr><th class="num">Rd</th><th>Date</th><th>Meeting</th><th>Layout</th><th>Winner</th></tr></thead><tbody>
      {s.meetings.map((m) => { const r = u.races[m.id]; const w = r?.results.find((x) => x.pos === 1); return <tr><td class="num">{m.round}</td><td class="small">{fmtDate(m.day, true)}</td><td>{r ? <button class="link" onClick={() => (c as any).openRace(m.id)}>{m.name}</button> : m.name}{m.calendarReason && <div class="small muted">{m.calendarReason}</div>}</td><td class="small">{m.geometryId}</td><td class="small">{m.status === 'completed' ? pname(u, w?.driverId) : m.status === 'scheduled' ? '' : `${m.status}${m.cancelReason ? ` (${m.cancelReason})` : ''}`}</td></tr>; })}
    </tbody></table>}
  </>;
}

function PeopleView({ c }: { c: Controller }) {
  const u = c.u!;
  const s = u.seasons[u.clock.year];
  const drivers = s ? s.entries.flatMap((e) => e.drivers.map((d) => ({ d, e }))) : [];
  const open = (id: string) => (c as any).openPerson(id);
  return <>
    <div class="section"><h3>Current drivers</h3>
      <table class="data"><thead><tr><th>Driver</th><th>Team</th><th class="num">Age</th><th class="num">Starts</th><th class="num">Wins</th><th class="num">Rating</th></tr></thead><tbody>
        {drivers.map(({ d, e }) => { const p = u.people[d]; const car = u.careers[d]; return <tr><td><button class="link" onClick={() => open(d)}>{p.first} {p.last}</button> <span class="small">{flag(p.nationality)}</span></td><td class="small"><Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} />{e.name}</td><td class="num">{ageOn(p.dob, u.clock.day)}</td><td class="num">{car?.starts ?? 0}</td><td class="num">{car?.wins ?? 0}</td><td class="num">{Math.round(p.elo.rating)}</td></tr>; })}
      </tbody></table></div>
  </>;
}

function PersonView({ c, id }: { c: Controller; id: string }) {
  const u = c.u!;
  const p = u.people[id];
  const car = u.careers[id] ?? {};
  const fav = u.favourites.people.includes(id);
  return <>
    <div class="pill-row" style={{ marginBottom: 10 }}><span class="chip">{flag(p.nationality)} {natName(p.nationality)}</span><span class="chip">born {fmtDate(p.dob)} in {p.hometown}</span><span class="chip">{p.status}</span><button class="btn" aria-pressed={fav} onClick={() => c.toggleFavourite('people', id)}>{fav ? '★ Following' : '☆ Follow'}</button></div>
    <div class="stats section">
      {[['Starts', car.starts ?? 0], ['Wins', car.wins ?? 0], ['Podiums', car.podiums ?? 0], ['Poles', car.poles ?? 0], ['Titles', car.titles ?? 0], ['Rating', Math.round(p.elo.rating)], ['Peak', Math.round(p.elo.peak)]].map(([l, v]) => <div class="stat"><b>{v}</b><span>{l}</span></div>)}
    </div>
    <p class="muted small">Background: {p.background}. Style: {p.style}. {p.notes.join('; ')}</p>
  </>;
}

function HistoryView({ c }: { c: Controller }) {
  const u = c.u!;
  const years = Object.keys(u.seasons).map(Number).sort((a, b) => a - b);
  return <>
    <div class="section"><h3>Champions</h3><table class="data"><thead><tr><th>Year</th><th>Champion</th><th>Teams' champion</th></tr></thead><tbody>
      {years.map((y) => { const s = u.seasons[y]; return <tr><td class="num">{y}</td><td>{s.championId ? <button class="link" onClick={() => (c as any).openPerson(s.championId)}>{pname(u, s.championId)}</button> : <span class="muted">{s.status === 'cancelled' ? 'No championship' : s.status === 'interrupted' ? 'Not awarded (interrupted)' : '—'}</span>}</td><td>{s.teamChampionId ? s.entries.find((e) => e.teamId === s.teamChampionId)?.name : ''}</td></tr>; })}
    </tbody></table></div>
  </>;
}

function StoriesView({ c }: { c: Controller }) {
  const u = c.u!;
  const arcs = Object.values(u.stories).sort((a, b) => b.significance - a.significance);
  return arcs.length ? <div class="grid2">{arcs.slice(0, 20).map((a) => <div class="story-card"><h4>{c.prefs.spoilers ? a.spoilerTitle : a.title}</h4><p class="small muted">{a.premise}</p></div>)}</div> : <p class="muted">Stories emerge as history accumulates. Watch a few seasons — rivalries, droughts and comebacks will appear here with their evidence.</p>;
}

export type { Universe };
export { ord };
