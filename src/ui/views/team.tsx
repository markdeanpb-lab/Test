import type { Controller } from '../../app/controller';
import { Swatch, ord, money } from '../common';
import { known, P, Tm, Stat, yearOfDay } from './shared';
import { lineageTotals } from '../../sim/world/stats';
import { TECH_BY_ID } from '../../sim/world/tech';
import { LineChart } from '../charts';
import { fmtDate } from '../../sim/dates';

export function TeamView({ c, id, asOf }: { c: Controller; id: string; asOf?: number }) {
  const u = c.u!;
  const t = u.teams[id]; if (!t) return <p>Unknown team.</p>;
  const k = known(u, asOf);
  const tc = k.teams[id];
  const lin = u.lineages[t.lineageId];
  const lt = lineageTotals(u, t.lineageId, k.teams);
  const seasons = Object.values(u.seasons).filter((s) => s.entries.some((e) => u.teams[e.teamId]?.lineageId === t.lineageId) && (asOf === undefined || s.year <= yearOfDay(asOf))).sort((a, b) => a.year - b.year);
  const cars = Object.values(u.cars).filter((x) => x.lineageId === t.lineageId && (asOf === undefined || x.year <= yearOfDay(asOf))).sort((a, b) => b.year - a.year);
  const fav = u.favourites.teams.includes(id);
  const evs = u.events.filter((e) => e.teams.some((x) => u.teams[x]?.lineageId === t.lineageId) && e.severity >= 0.35 && (asOf === undefined || e.day <= asOf)).slice(-14).reverse();
  const cash = t.finance.filter((f) => asOf === undefined || f.year < yearOfDay(asOf)).map((f) => [f.year, f.cashEnd - f.debtEnd] as [number, number]);
  return <>
    <div class="pill-row" style={{ marginBottom: 12 }}>
      <span class="chip"><Swatch colour={t.colours.primary} colour2={t.colours.secondary} pattern={t.pattern} />{t.code}</span>
      <span class="chip">Founded {t.founded} · {t.base}</span><span class="chip">{t.ownerType}</span><span class="chip">{t.status}{t.leftYear ? ` (${t.leftYear})` : ''}</span>
      {t.successorId && <span class="chip">Became <Tm c={c} id={t.successorId} /></span>}
      <button class="btn" aria-pressed={fav} onClick={() => c.toggleFavourite('teams', id)}>{fav ? '★ Following' : '☆ Follow'}</button>
    </div>
    <div class="stats section"><Stat label="Starts (this entrant)" value={tc?.starts ?? 0} /><Stat label="Wins" value={tc?.wins ?? 0} /><Stat label="Podiums" value={tc?.podiums ?? 0} /><Stat label="Poles" value={tc?.poles ?? 0} /><Stat label="Teams' titles" value={tc?.titles ?? 0} /><Stat label="Drivers' titles" value={tc?.driverTitles ?? 0} /></div>
    <div class="section"><h3>Lineage</h3>
      <div class="small">{lin.entrants.map((e, i) => <span>{i ? ' → ' : ''}<Tm c={c} id={e.teamId} /> ({e.fromYear}–{e.toYear ?? 'now'}{e.how !== 'founded' ? `, ${e.how}` : ''})</span>)}</div>
      <div class="small" style={{ marginTop: 6 }}>Lineage totals: {lt.wins} wins, {lt.titles} teams' titles, {lt.driverTitles} drivers' titles in {lt.seasons.length} seasons.</div>
      {lin.absorbed.length > 0 && <div class="small">Absorbed: {lin.absorbed.map((a) => `${u.lineages[a.lineageId]?.entrants[0]?.name ?? a.lineageId} (${a.year})`).join(', ')}.</div>}
      <p class="small muted">Lineage totals include only this organisation's own entrants (renamed or taken over, but continuous). Teams absorbed in a merger keep their own records and are listed, not added.</p>
    </div>
    <div class="section"><h3>Seasons</h3><table class="data"><thead><tr><th>Year</th><th>Entered as</th><th>Drivers</th><th class="num">Pos</th><th class="num">Wins</th><th class="num">Pts</th></tr></thead><tbody>
      {seasons.map((s) => { const e = s.entries.find((x) => u.teams[x.teamId]?.lineageId === t.lineageId)!; const r = s.teamStandings.find((x) => x.id === e.teamId); return <tr><td><button class="link" onClick={() => c.open({ kind: 'season', year: s.year })}>{s.year}</button>{s.teamChampionId === e.teamId && ' 🏆'}</td><td class="small"><Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} />{e.name}</td><td class="small">{e.drivers.map((d, i) => <span>{i ? ', ' : ''}<P c={c} id={d} short asOf={asOf} /></span>)}</td><td class="num">{r ? ord(s.teamStandings.indexOf(r) + 1) : '—'}</td><td class="num">{r?.wins ?? 0}</td><td class="num">{r ? +r.points.toFixed(1) : 0}</td></tr>; }).reverse()}
    </tbody></table></div>
    <div class="section"><h3>Cars</h3><table class="data"><thead><tr><th>Year</th><th>Car</th><th>Concept</th><th class="num">Power</th><th class="num">Mass</th><th class="num">Downforce</th><th>Technology</th></tr></thead><tbody>
      {cars.slice(0, 30).map((x) => <tr><td>{x.year}</td><td>{x.name}<div class="small muted">{x.visual.era}</div></td><td class="small">{x.concept}{x.upgrades.length ? ` · ${x.upgrades.length} upgrades (${x.upgrades.filter((q) => q.success).length} worked)` : ''}</td><td class="num">{Math.round(x.current.powerKW * 1.341)} hp</td><td class="num">{Math.round(x.current.massKg)} kg</td><td class="num">{x.current.clA.toFixed(1)}</td><td class="small">{x.techs.map((q) => TECH_BY_ID[q]?.name).join(', ') || '—'}</td></tr>)}
    </tbody></table><p class="small muted">Specifications are the team's own figures; how they combine on track depends on the circuit, the conditions and the drivers.</p></div>
    {cash.length > 1 && <div class="section"><h3>Finances</h3><LineChart ariaLabel="Net cash at season end" series={[{ name: 'Net cash', slot: 1, points: cash }]} fmtY={(v) => `£${Math.round(v)}m`} height={170} />
      <table class="data"><thead><tr><th>Year</th><th class="num">Prize</th><th class="num">Sponsors</th><th class="num">Owner</th><th class="num">Wages</th><th class="num">Development</th><th class="num">Net</th></tr></thead><tbody>
        {t.finance.slice(-8).reverse().map((f) => <tr><td>{f.year}</td><td class="num">{money(u, f.prize)}</td><td class="num">{money(u, f.sponsor)}</td><td class="num">{money(u, f.owner)}</td><td class="num">{money(u, f.wages)}</td><td class="num">{money(u, f.development)}</td><td class="num">{money(u, f.cashEnd - f.debtEnd)}</td></tr>)}
      </tbody></table><p class="small muted">Money in £ millions at 2025 values (real terms). Sponsors now: {t.sponsors.map((s) => s.name).join(', ') || 'none'}.</p></div>}
    <div class="section"><h3>People</h3><div class="small">Team principal: <P c={c} id={t.principalId} asOf={asOf} /> · Technical director: <P c={c} id={t.techDirectorId} asOf={asOf} /></div></div>
    {evs.length > 0 && <div class="section"><h3>Recent history</h3>{evs.map((e) => <div class="small" style={{ marginBottom: 4 }}><span class="muted">{fmtDate(e.day, true)}</span> — {e.title}</div>)}</div>}
  </>;
}
