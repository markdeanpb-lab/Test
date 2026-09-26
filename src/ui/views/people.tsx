import { useState } from 'preact/hooks';
import type { Controller } from '../../app/controller';
import { Swatch, flag } from '../common';
import { P, Tm } from './shared';
import { ageOn, yearOf } from '../../sim/dates';

export function PeopleHome({ c }: { c: Controller }) {
  const u = c.u!;
  const [q, setQ] = useState('');
  const s = u.seasons[u.clock.year] ?? u.seasons[u.clock.year - 1];
  const drivers = s ? s.entries.flatMap((e) => e.drivers.map((d) => ({ d, e }))) : [];
  const favP = u.favourites.people, favT = u.favourites.teams;
  const matches = q.trim().length >= 2 ? Object.values(u.people).filter((p) => `${p.first} ${p.last}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30) : [];
  const teamMatches = q.trim().length >= 2 ? Object.values(u.teams).filter((t) => t.name.toLowerCase().includes(q.toLowerCase())).slice(0, 10) : [];
  return <>
    <div class="section"><label class="small">Find anyone, past or present <input type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Name…" style={{ width: '100%', height: 40, borderRadius: 8, border: '1px solid var(--line)', padding: '0 10px', background: 'var(--panel)', color: 'var(--ink)' }} /></label>
      {(matches.length > 0 || teamMatches.length > 0) && <div class="card" style={{ marginTop: 8 }}>{matches.map((p) => <div class="small"><P c={c} id={p.id} /> <span class="muted">— {p.kind}, {p.status}, born {yearOf(p.dob)}</span></div>)}{teamMatches.map((t) => <div class="small"><Tm c={c} id={t.id} /> <span class="muted">— team, {t.status}</span></div>)}</div>}
    </div>
    {(favP.length > 0 || favT.length > 0) && <div class="section"><h3>Following</h3><div class="pill-row">{favP.map((id) => <span class="chip">★ <P c={c} id={id} /></span>)}{favT.map((id) => <span class="chip">★ <Tm c={c} id={id} /></span>)}</div></div>}
    <div class="section"><h3>{s?.year} drivers</h3>
      <table class="data"><thead><tr><th class="num">No</th><th>Driver</th><th>Team</th><th class="num">Age</th><th class="num">Starts</th><th class="num">Wins</th><th class="num">Titles</th><th class="num">Rating</th></tr></thead><tbody>
        {drivers.map(({ d, e }, i) => { const p = u.people[d]; const car = u.careers[d]; return <tr><td class="num">{e.nos[e.drivers.indexOf(d)]}</td><td><P c={c} id={d} /> <span class="small">{flag(p.nationality)}</span>{favP.includes(d) && ' ★'}{(car?.starts ?? 0) === 0 && <span class="chip">rookie</span>}</td><td class="small"><Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} /><Tm c={c} id={e.teamId} year={s!.year} /></td><td class="num">{ageOn(p.dob, u.clock.day)}</td><td class="num">{car?.starts ?? 0}</td><td class="num">{car?.wins ?? 0}</td><td class="num">{car?.titles ?? 0}</td><td class="num">{Math.round(p.elo.rating)}</td></tr>; void i; })}
      </tbody></table></div>
    <div class="section"><h3>Teams</h3><div class="grid2">{s?.entries.map((e) => { const t = u.teams[e.teamId]; return <div class="card"><div><Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} /><Tm c={c} id={e.teamId} year={s.year} /></div><div class="small muted">{t.ownerType}, founded {t.founded}, {t.base} · car {u.cars[e.carId]?.name}</div></div>; })}</div></div>
  </>;
}
