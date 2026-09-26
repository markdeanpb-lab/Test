import { useState } from 'preact/hooks';
import type { Controller } from '../../app/controller';
import type { RegSet, Season } from '../../sim/types';
import { Swatch, ord, fmtDate } from '../common';
import { P, Tm, R } from './shared';
import { RouteMap } from './route';
import { LineChart } from '../charts';
import { getTrack } from '../../sim/track';
import { yearOf } from '../../sim/dates';

export function SeasonHome({ c }: { c: Controller }) {
  const u = c.u!;
  const cut = c.cutoff;
  const years = Object.keys(u.seasons).map(Number).filter((y) => cut === undefined || y <= yearOf(cut)).sort((a, b) => b - a);
  const y = years[0];
  return <>
    {y !== undefined ? <SeasonView c={c} year={y} /> : <p>No season yet.</p>}
    {years.length > 1 && <div class="section"><h3>Other seasons</h3><div class="pill-row">{years.slice(1, 40).map((yy) => <button class="chip link" onClick={() => c.open({ kind: 'season', year: yy })}>{yy}</button>)}{years.length > 41 && <button class="chip link" onClick={() => c.go('history')}>All seasons…</button>}</div></div>}
  </>;
}

/** Human-readable list of what changed between two rule sets. */
export function regDiff(a: RegSet | undefined, b: RegSet): string[] {
  if (!a) return ['First regulations of the championship.'];
  const out: string[] = [];
  const kw = (v: number) => `${Math.round(v * 1.341)} hp`;
  if (a.powerCapKW !== b.powerCapKW) out.push(`Power limit ${kw(a.powerCapKW)} → ${kw(b.powerCapKW)}`);
  if (a.minMassKg !== b.minMassKg) out.push(`Minimum mass ${a.minMassKg} → ${b.minMassKg} kg`);
  if (a.fuel !== b.fuel) out.push(`Fuel: ${a.fuel} → ${b.fuel}`);
  if (a.fuelLimitKg !== b.fuelLimitKg) out.push(`Fuel allowance ${a.fuelLimitKg ?? 'unlimited'} → ${b.fuelLimitKg ?? 'unlimited'}`);
  if (a.aeroCap !== b.aeroCap) out.push(b.aeroCap === 0 ? 'Wings banned' : a.aeroCap === 0 ? 'Wings permitted' : `Downforce limit ${a.aeroCap} → ${b.aeroCap}`);
  if (a.groundEffect !== b.groundEffect) out.push(b.groundEffect ? 'Ground-effect floors permitted' : 'Ground-effect floors banned');
  if (a.hybrid !== b.hybrid) out.push(b.hybrid ? 'Hybrid power units introduced' : 'Hybrid systems withdrawn');
  if (a.refuelling !== b.refuelling) out.push(b.refuelling ? 'Refuelling allowed' : 'Refuelling banned');
  if (a.safetyCar !== b.safetyCar) out.push(b.safetyCar ? 'Safety car introduced' : 'Safety car withdrawn');
  if (a.redFlagRestart !== b.redFlagRestart) out.push(b.redFlagRestart ? 'Red-flagged races may restart' : 'Red flag ends the race');
  if (a.qualifying !== b.qualifying) out.push(`Qualifying: ${a.qualifying} → ${b.qualifying}`);
  if (a.points.table.join() !== b.points.table.join()) out.push(`Points ${a.points.table.join('-')} → ${b.points.table.join('-')}`);
  if (a.points.fastestLap !== b.points.fastestLap) out.push(b.points.fastestLap ? `Fastest lap worth ${b.points.fastestLap}` : 'No fastest-lap point');
  if (a.points.dropScores !== b.points.dropScores) out.push(b.points.dropScores ? `Only best results count (drop ${b.points.dropScores})` : 'All results count');
  if (a.mandatoryTwoCompounds !== b.mandatoryTwoCompounds) out.push(b.mandatoryTwoCompounds ? 'Two dry compounds mandatory' : 'Compound rule dropped');
  if (a.compounds.join() !== b.compounds.join()) out.push(`Dry tyres: ${b.compounds.join('/')}`);
  if (a.wetTyres.join() !== b.wetTyres.join()) out.push(`Wet tyres: ${b.wetTyres.join('/') || 'none'}`);
  if (a.crashStructures !== b.crashStructures || a.cockpitProtection !== b.cockpitProtection || a.medical !== b.medical) out.push('Safety standards raised');
  if (a.pitSpeedKph !== b.pitSpeedKph) out.push(`Pit-lane limit ${b.pitSpeedKph ?? 'none'}${b.pitSpeedKph ? ' km/h' : ''}`);
  if (a.costCap !== b.costCap) out.push(b.costCap ? `Cost cap £${(b.costCap / 1000).toFixed(0)}m` : 'Cost cap removed');
  if (a.bannedTech.join() !== b.bannedTech.join()) out.push(`Banned technology: ${b.bannedTech.join(', ') || 'none'}`);
  if (a.raceKm !== b.raceKm) out.push(`Race distance ${a.raceKm} → ${b.raceKm} km`);
  if (a.penalties !== b.penalties) out.push(`Penalties: ${b.penalties}`);
  if (a.blueFlags !== b.blueFlags) out.push(b.blueFlags ? 'Blue flags enforced' : 'Blue flags dropped');
  if (a.teamOrdersAllowed !== b.teamOrdersAllowed) out.push(b.teamOrdersAllowed ? 'Team orders permitted' : 'Team orders banned');
  return out;
}

function progression(u: NonNullable<Controller['u']>, s: Season, ids: string[]): [number, number][][] {
  const done = s.meetings.filter((m) => m.status === 'completed');
  return ids.map((id) => { let sum = 0; const row = s.driverStandings.find((r) => r.id === id)!; const pts: [number, number][] = [[0, 0]]; done.forEach((m, i) => { const rr = u.races[m.id]?.results.find((x) => x.driverId === id); sum += rr?.points ?? 0; pts.push([i + 1, sum]); }); void row; return pts; });
}

export function SeasonView({ c, year }: { c: Controller; year: number }) {
  const u = c.u!;
  const [tab, setTab] = useState<'standings' | 'calendar' | 'story' | 'rules'>('standings');
  const s = u.seasons[year]; if (!s) return <p>No {year} season.</p>;
  const cut = c.cutoff;
  const visible = (day: number) => cut === undefined || day <= cut;
  const regs = u.regs.sets[s.regSetId];
  const prevS = u.seasons[year - 1];
  const prevRegs = prevS ? u.regs.sets[prevS.regSetId] : undefined;
  const complete = s.status === 'complete' || s.status === 'interrupted';
  const hideOutcome = cut !== undefined && !s.meetings.every((m) => visible(m.day));
  const top = s.driverStandings.slice(0, 3).map((r) => r.id);
  const prog = progression(u, s, top);
  const news = u.news.filter((n) => yearOf(n.day) === year && visible(n.day) && n.importance >= 0.5).slice(-12).reverse();
  const entryOf = (teamId: string) => s.entries.find((e) => e.teamId === teamId);
  return <>
    <div class="pill-row" style={{ marginBottom: 12 }}>
      <span class="chip">{s.status}{s.statusReason ? ` — ${s.statusReason}` : ''}</span>
      {complete && !hideOutcome && s.championId && <span class="chip">🏆 <P c={c} id={s.championId} asOf={cut} /></span>}
      {complete && !hideOutcome && s.teamChampionId && <span class="chip">Teams: <Tm c={c} id={s.teamChampionId} year={year} asOf={cut} /></span>}
      {complete && !hideOutcome && s.decidedRound && <span class="chip">Decided in round {s.decidedRound}</span>}
    </div>
    <div class="tabs" role="tablist">{(['standings', 'calendar', 'story', 'rules'] as const).map((t) => <button role="tab" aria-selected={tab === t} class={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{{ standings: 'Standings', calendar: 'Calendar', story: 'Story of the season', rules: 'Rules & testing' }[t]}</button>)}</div>
    {tab === 'standings' && <>
      {hideOutcome && <p class="small muted">Standings as of {fmtDate(cut!)} — spoilers are hidden.</p>}
      <div class="section"><table class="data"><thead><tr><th class="num">Pos</th><th>Driver</th><th>Team</th><th class="num">Wins</th><th class="num">Pod.</th><th class="num">Pts</th></tr></thead><tbody>
        {standingsAsOf(u, s, cut).drivers.map((r, i) => { const e = s.entries.find((x) => x.drivers.includes(r.id)); return <tr><td class="num">{ord(i + 1)}</td><td><P c={c} id={r.id} asOf={cut} /></td><td class="small">{e && <Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} />}{e ? e.name : ''}</td><td class="num">{r.wins}</td><td class="num">{r.podiums}</td><td class="num">{+r.points.toFixed(1)}{r.dropped ? <span class="small muted"> ({r.dropped} dropped)</span> : ''}</td></tr>; })}
      </tbody></table></div>
      <div class="section"><h3>Teams</h3><table class="data"><thead><tr><th class="num">Pos</th><th>Team</th><th class="num">Wins</th><th class="num">Pts</th></tr></thead><tbody>
        {standingsAsOf(u, s, cut).teams.map((r, i) => { const e = entryOf(r.id); return <tr><td class="num">{ord(i + 1)}</td><td>{e && <Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} />}<Tm c={c} id={r.id} year={year} asOf={cut} /></td><td class="num">{r.wins}</td><td class="num">{+r.points.toFixed(1)}</td></tr>; })}
      </tbody></table></div>
      {!hideOutcome && prog[0]?.length > 2 && <div class="section"><h3>How the leaders scored</h3><LineChart ariaLabel={`Cumulative points of the top three in ${year}`} series={top.map((id, i) => ({ name: u.people[id].last, slot: (i + 1) as 1 | 2 | 3, points: prog[i] }))} fmtX={(x) => (x ? `R${Math.round(x)}` : 'start')} fmtY={(v) => String(Math.round(v))} height={190} />
        <p class="small muted">Cumulative points after each completed round{regs.points.dropScores ? '; totals shown before dropped scores' : ''}.</p></div>}
    </>}
    {tab === 'calendar' && <div class="section">
      {s.meetings.map((m) => { const r = u.races[m.id]; const shown = visible(m.day); const win = r && shown ? r.results.find((x) => x.pos === 1) : undefined; const tr = getTrack(m.geometryId);
        return <div class="card cal-row" style={{ marginBottom: 8, display: 'grid', gridTemplateColumns: '84px 1fr', gap: 10, alignItems: 'center' }}>
          <button class="link" onClick={() => c.open({ kind: 'layout', id: m.geometryId })} aria-label={`Circuit ${tr.g.name}`}><RouteMap id={m.geometryId} height={64} /></button>
          <div class="small">
            <div><b>R{m.round} · {m.name}</b>{m.significance > 1 && <span class="chip">prestige</span>} <span class="muted">{fmtDate(m.day)}</span></div>
            <div class="muted">{tr.g.name} · {m.laps} laps, {m.distanceKm.toFixed(0)} km · qualifying: {m.qualiFormat}</div>
            {m.calendarReason && <div class="muted">Why here: {m.calendarReason}</div>}
            {m.postponedFrom && <div class="muted">Postponed from {fmtDate(m.postponedFrom)}</div>}
            {m.status === 'cancelled' && <div>Cancelled: {m.cancelReason}</div>}
            {m.status === 'completed' && r && shown && <div>Winner: <P c={c} id={win?.driverId} asOf={cut} /> · <R c={c} id={m.id} label="Result & replay" /></div>}
            {m.status === 'scheduled' && <div class="muted">Scheduled</div>}
          </div>
        </div>; })}
    </div>}
    {tab === 'story' && <div class="section">
      {s.review && !hideOutcome ? <div class="card"><h3>{s.review.headline}</h3>{s.review.paragraphs.map((p) => <p>{p.text}</p>)}</div> : <p class="small muted">The season review is written when the season ends.</p>}
      {s.rookies.length > 0 && <p class="small">Debutants: {s.rookies.map((id, i) => <span>{i ? ', ' : ''}<P c={c} id={id} asOf={cut} /></span>)}.</p>}
      {s.retirements.length > 0 && !hideOutcome && <p class="small">Retired at season end: {s.retirements.map((id, i) => <span>{i ? ', ' : ''}<P c={c} id={id} asOf={cut} /></span>)}.</p>}
      {news.length > 0 && <><h3>Headlines</h3>{news.map((n) => <div class="card small" style={{ marginBottom: 8 }}><div class="muted">{fmtDate(n.day)}</div><b>{n.headline}</b><div>{n.body}</div></div>)}</>}
    </div>}
    {tab === 'rules' && <div class="section">
      <div class="card small"><b>{regs.label}</b>{regs.emergency && <span class="chip">emergency</span>}<div class="muted">Announced {fmtDate(regs.announcedDay)} for {regs.year}.</div>
        {regs.reasons.length > 0 && <div>Why: {regs.reasons.join('; ')}.</div>}
        <ul>{regDiff(prevRegs && prevRegs.id !== regs.id ? prevRegs : undefined, regs).map((x) => <li>{x}</li>)}</ul>
        {prevRegs && prevRegs.id === regs.id && <div class="muted">No change from {year - 1}.</div>}
      </div>
      {s.testing && s.testing.length > 0 && <><h3 style={{ marginTop: 12 }}>Pre-season testing</h3><p class="small muted">Estimated one-lap pace from testing, relative to the quickest. Testing is noisy: teams run different fuel loads and programmes.</p>
        <table class="data"><thead><tr><th class="num">#</th><th>Team</th><th class="num">Est. gap</th><th class="num">Laps</th></tr></thead><tbody>{s.testing.map((t, i) => { const e = entryOf(t.teamId); return <tr><td class="num">{i + 1}</td><td>{e && <Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} />}{e?.name}</td><td class="num">{i ? `+${((t.estimate - s.testing![0].estimate) * 100).toFixed(2)}%` : '—'}</td><td class="num">{t.laps}</td></tr>; })}</tbody></table></>}
    </div>}
  </>;
}

/** Standings reconstructed from race records up to a cut-off day (spoiler-safe); the stored table otherwise. */
export function standingsAsOf(u: NonNullable<Controller['u']>, s: Season, cut?: number) {
  if (cut === undefined || s.meetings.every((m) => m.day <= cut)) return { drivers: s.driverStandings, teams: s.teamStandings };
  const d: Record<string, { id: string; points: number; wins: number; podiums: number; dropped?: number }> = {}, t: Record<string, { id: string; points: number; wins: number; podiums: number }> = {};
  for (const m of s.meetings) { const r = u.races[m.id]; if (!r || m.day > cut) continue; for (const x of r.results) { const a = (d[x.driverId] ??= { id: x.driverId, points: 0, wins: 0, podiums: 0 }); a.points += x.points; if (x.pos === 1) a.wins++; if (x.pos && x.pos <= 3) a.podiums++; const b = (t[x.teamId] ??= { id: x.teamId, points: 0, wins: 0, podiums: 0 }); b.points += x.points; if (x.pos === 1) b.wins++; if (x.pos && x.pos <= 3) b.podiums++; } }
  const srt = <T extends { points: number; wins: number }>(o: Record<string, T>) => Object.values(o).sort((a, b) => b.points - a.points || b.wins - a.wins);
  return { drivers: srt(d), teams: srt(t) };
}
