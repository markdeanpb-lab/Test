import type { Controller } from '../../app/controller';
import { flag, natName, fmtDate, ord, Swatch } from '../common';
import { known, P, Tm, R, Stat, pct, yearOfDay } from './shared';
import { LineChart, eloPoints } from '../charts';
import { ageOn } from '../../sim/dates';
import { relsOf } from '../../sim/world/relationships';

export function PersonView({ c, id, asOf }: { c: Controller; id: string; asOf?: number }) {
  const u = c.u!;
  const p = u.people[id];
  if (!p) return <p>Unknown person.</p>;
  const k = known(u, asOf);
  const car = k.careers[id];
  const today = asOf ?? u.clock.day;
  const fav = u.favourites.people.includes(id);
  const seasons = Object.values(u.seasons).filter((s) => (asOf === undefined || s.year <= yearOfDay(asOf)) && s.driverStandings.some((r) => r.id === id)).sort((a, b) => a.year - b.year);
  const titles = seasons.filter((s) => s.championId === id && (asOf === undefined || s.year < yearOfDay(asOf) || s.status === 'complete'));
  const pts = eloPoints(p.elo.history, asOf);
  const rels = relsOf(u, id).filter((r) => r.intensity > 0.12 || r.episodes.length >= 3).filter((r) => asOf === undefined || r.since <= asOf).sort((a, b) => b.intensity - a.intensity).slice(0, 8);
  const tmIds = car ? Object.keys(car.h2h) : [];
  const wins = Object.values(u.races).filter((r) => (asOf === undefined || r.day <= asOf) && r.results.some((x) => x.driverId === id && x.pos === 1)).sort((a, b) => a.day - b.day);
  const peakKnown = (() => { let best = { r: 0, day: 0 }; for (let i = 0; i < p.elo.history.length; i += 2) { if (asOf !== undefined && p.elo.history[i] > asOf) break; if (i / 2 >= 9 && p.elo.history[i + 1] / 10 > best.r) best = { r: p.elo.history[i + 1] / 10, day: p.elo.history[i] }; } return best; })();
  const current = pts.length ? pts[pts.length - 1][1] : p.elo.rating;
  const dnf = car ? car.dnfMech + car.dnfDriver + car.dnfContact + car.dnfOther : 0;
  const status = asOf !== undefined ? (p.debutDay && p.debutDay <= asOf ? (p.retiredDay && p.retiredDay <= asOf ? 'retired' : 'racing') : 'not yet racing') : p.status;
  return <>
    {asOf !== undefined && <p class="chip" style={{ marginBottom: 10 }}>As known on {fmtDate(asOf)} — later events hidden</p>}
    <div class="pill-row" style={{ marginBottom: 12 }}>
      <span class="chip">{flag(p.nationality)} {natName(p.nationality)}</span>
      <span class="chip">Born {fmtDate(p.dob)}, {p.hometown}{p.dod && (asOf === undefined || p.dod <= asOf) ? ` · died ${fmtDate(p.dod)}` : ` · age ${ageOn(p.dob, today)}`}</span>
      <span class="chip">{status}</span>
      {p.teamId && asOf === undefined && <span class="chip">Drives for <Tm c={c} id={p.teamId} /></span>}
      <button class="btn" aria-pressed={fav} onClick={() => c.toggleFavourite('people', id)}>{fav ? '★ Following' : '☆ Follow'}</button>
    </div>
    <div class="stats section">
      <Stat label="Starts" value={car?.starts ?? 0} /><Stat label="Wins" value={car?.wins ?? 0} /><Stat label="Podiums" value={car?.podiums ?? 0} /><Stat label="Poles" value={car?.poles ?? 0} />
      <Stat label="Titles" value={titles.length} /><Stat label="Win rate" value={pct(car?.wins ?? 0, car?.starts ?? 0)} hint="Wins ÷ starts" /><Stat label="Points" value={+(car?.points ?? 0).toFixed(1)} />
    </div>
    <div class="section"><h3>Rating</h3>
      <div class="stats" style={{ marginBottom: 8 }}>
        <Stat label={`Current (±${Math.round(p.elo.rd)})`} value={Math.round(current)} hint="Elo-style rating of demonstrated performance; ± is its uncertainty" />
        <Stat label={peakKnown.day ? `Peak, ${fmtDate(peakKnown.day, true)} (age ${ageOn(p.dob, peakKnown.day)})` : 'Peak'} value={peakKnown.r ? Math.round(peakKnown.r) : '—'} />
        <Stat label="Reputation" value={Math.round(p.reputation)} hint="Public standing (results, titles, prestige) — distinct from rating and from actual skill" />
      </div>
      <LineChart ariaLabel={`Rating trajectory of ${p.first} ${p.last}`} series={[{ name: p.last, slot: 1, points: pts, marks: titles.map((s) => ({ x: s.year + 0.8, label: `${s.year} champion` })) }]} fmtX={(x) => String(Math.floor(x))} />
      <p class="small muted">Dots mark championships. The rating measures results against opposition and machinery; it is not the hidden skill that generates performance. See History → Records → "How ratings work".</p>
    </div>
    {seasons.length > 0 && <div class="section"><h3>Season by season</h3><table class="data"><thead><tr><th>Year</th><th>Team</th><th class="num">Pos</th><th class="num">Pts</th><th class="num">Wins</th><th class="num">Podiums</th><th class="num">Rating</th></tr></thead><tbody>
      {seasons.map((s) => { const r = s.driverStandings.find((x) => x.id === id)!; const e = s.entries.find((x) => x.drivers.includes(id)) ?? s.entries.find((x) => Object.values(u.races).some((rr) => rr.year === s.year && rr.results.some((q) => q.driverId === id && q.teamId === x.teamId))); return <tr><td><button class="link" onClick={() => c.open({ kind: 'season', year: s.year })}>{s.year}</button>{s.championId === id && ' 🏆'}</td><td class="small">{e && <Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} />}{e ? <Tm c={c} id={e.teamId} year={s.year} /> : '—'}</td><td class="num">{ord(s.driverStandings.indexOf(r) + 1)}</td><td class="num">{+r.points.toFixed(1)}</td><td class="num">{r.wins}</td><td class="num">{r.podiums}</td><td class="num">{p.elo.seasonEnd[s.year] ?? ''}</td></tr>; })}
    </tbody></table></div>}
    {car && <div class="section"><h3>Record</h3><div class="grid2">
      <div class="card small"><b>Finishing</b><div>Classified {car.classified} of {car.starts} starts ({pct(car.classified, car.starts)}); average classified position {car.classified ? (car.sumPos / car.classified).toFixed(1) : '—'}.</div><div>Retirements: {car.dnfMech} mechanical, {car.dnfDriver} driver error, {car.dnfContact} collisions, {car.dnfOther} other{dnf ? '' : ''}.</div></div>
      <div class="card small"><b>In the wet</b><div>{car.wetStarts ? <>{car.wetStarts} wet races (sample), {car.wetWins} wins, {car.wetPodiums} podiums; average gain from grid {car.wetClassified ? (car.wetGain / car.wetClassified).toFixed(1) : '—'} places over {car.wetClassified} classified finishes.</> : 'No wet races yet.'}</div></div>
      <div class="card small"><b>Against team-mates</b>{tmIds.length ? tmIds.map((t) => <div><P c={c} id={t} asOf={asOf} />: {car.h2h[t][0]}–{car.h2h[t][1]} <button class="link small" onClick={() => c.open({ kind: 'compare', a: id, b: t })}>compare</button></div>) : <div>—</div>}<div class="muted">Races where one finished ahead of the other in the same team.</div></div>
      <div class="card small"><b>Firsts</b><div>Debut: {p.debutMeetingId ? <R c={c} id={p.debutMeetingId} /> : '—'}{p.debutDay ? ` aged ${ageOn(p.dob, p.debutDay)}` : ''}.</div><div>First win: {car.firstWin ? <R c={c} id={car.firstWin} /> : '—'}{car.firstWinStarts ? ` (start ${car.firstWinStarts})` : ''}.</div></div>
    </div></div>}
    {wins.length > 0 && <div class="section"><h3>Wins</h3><div class="pill-row">{wins.slice(0, 40).map((r) => <span class="chip"><R c={c} id={r.meetingId} /></span>)}{wins.length > 40 && <span class="chip">+{wins.length - 40} more</span>}</div></div>}
    {rels.length > 0 && <div class="section"><h3>Relationships</h3>{rels.map((r) => { const other = r.a === id ? r.b : r.a; const eps = r.episodes.filter((e) => asOf === undefined || e.day <= asOf); return <div class="small" style={{ marginBottom: 6 }}><b>{r.kind === 'mentorship' ? (r.a === id ? 'Mentor to' : 'Mentored by') : r.kind[0].toUpperCase() + r.kind.slice(1)}</b> with <P c={c} id={other} asOf={asOf} /> — intensity {Math.round(r.intensity * 100)}%, {r.status}, {eps.length} recorded episode{eps.length === 1 ? '' : 's'}{eps.length ? `; latest: ${eps[eps.length - 1].cause}` : ''}.</div>; })}</div>}
    {(p.family.parents.length > 0 || p.family.children.length > 0) && <div class="section"><h3>Family</h3>{p.family.parents.map((x) => <div>Child of <P c={c} id={x} asOf={asOf} /></div>)}{p.family.children.filter((x) => asOf === undefined || (u.people[x].debutDay ?? Infinity) <= asOf).map((x) => <div>Parent of <P c={c} id={x} asOf={asOf} /></div>)}<p class="small muted">Family links are recorded facts; ability is not inherited in this simulation, only opportunity and attention.</p></div>}
    {p.injuries.length > 0 && <div class="section"><h3>Injuries</h3>{p.injuries.filter((i) => asOf === undefined || i.day <= asOf).map((i) => <div class="small">{fmtDate(i.day)} — {i.cause}{i.meetingId ? <> (<R c={c} id={i.meetingId} />)</> : ''}; out until about {fmtDate(i.returnDay, true)}.</div>)}</div>}
    <div class="section"><h3>Roles</h3>{p.roles.filter((r) => asOf === undefined || r.fromDay <= asOf).map((r) => <div class="small">{fmtDate(r.fromDay, true)}{r.toDay && (asOf === undefined || r.toDay <= asOf) ? `–${fmtDate(r.toDay, true)}` : ' onwards'}: {r.role.replace('-', ' ')}{r.teamId ? <> at <Tm c={c} id={r.teamId} /></> : ''}</div>)}<p class="small muted">Background: {p.background}. Driving style: {p.style}.{p.retireReason && (asOf === undefined || (p.retiredDay ?? 0) <= asOf) ? ` Retired: ${p.retireReason}.` : ''}</p></div>
  </>;
}
