import { useMemo, useState } from 'preact/hooks';
import type { Controller } from '../../app/controller';
import type { RecordState, Universe } from '../../sim/types';
import { Swatch, fmtDate, ord } from '../common';
import { known, P, Tm, R, Stat, pct, yearOfDay, TimeCursor } from './shared';
import { RouteMap } from './route';
import { LineChart, eloPoints } from '../charts';
import { fmtVal } from '../../sim/world/records';
import { GEOMETRIES, getTrack } from '../../sim/track';
import { ELO } from '../../sim/world/elo';
import { isWetRace, type Career } from '../../sim/world/stats';
import { TECH_BY_ID } from '../../sim/world/tech';
import { regDiff } from './season';

type Tab = 'seasons' | 'records' | 'alltime' | 'circuits' | 'cars' | 'eras' | 'ratings';
const TABS: [Tab, string][] = [['seasons', 'Seasons'], ['records', 'Records'], ['alltime', 'All-time'], ['circuits', 'Circuits'], ['cars', 'Cars & tech'], ['eras', 'Eras'], ['ratings', 'How ratings work']];

export function HistoryHome({ c }: { c: Controller }) {
  const [tab, setTab] = useState<Tab>('seasons');
  return <>
    <TimeCursor c={c} />
    <div class="tabs" role="tablist">{TABS.map(([t, l]) => <button role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{l}</button>)}</div>
    {tab === 'seasons' && <SeasonsTab c={c} />}
    {tab === 'records' && <RecordsTab c={c} />}
    {tab === 'alltime' && <AllTimeTab c={c} />}
    {tab === 'circuits' && <CircuitsTab c={c} />}
    {tab === 'cars' && <CarsTab c={c} />}
    {tab === 'eras' && <ErasTab c={c} />}
    {tab === 'ratings' && <RatingsDoc />}
  </>;
}

const within = (c: Controller, day: number) => c.cutoff === undefined || day <= c.cutoff;
const seasonDone = (c: Controller, u: Universe, y: number) => { const s = u.seasons[y]; return (s.status === 'complete' || s.status === 'interrupted' || s.status === 'cancelled') && s.meetings.every((m) => within(c, m.day)); };

function SeasonsTab({ c }: { c: Controller }) {
  const u = c.u!;
  const years = Object.keys(u.seasons).map(Number).filter((y) => c.cutoff === undefined || y <= yearOfDay(c.cutoff)).sort((a, b) => b - a);
  return <table class="data"><thead><tr><th>Year</th><th>Champion</th><th>Teams' champion</th><th class="num">Races</th><th>Note</th></tr></thead><tbody>
    {years.map((y) => { const s = u.seasons[y]; const done = seasonDone(c, u, y); const e = s.entries.find((x) => x.teamId === s.teamChampionId); const held = s.meetings.filter((m) => m.status === 'completed' && within(c, m.day)).length;
      return <tr><td><button class="link" onClick={() => c.open({ kind: 'season', year: y })}>{y}</button></td><td>{done && s.championId ? <P c={c} id={s.championId} asOf={c.cutoff} /> : <span class="muted">{s.status === 'cancelled' ? '—' : 'in progress'}</span>}</td><td class="small">{done && e ? <><Swatch colour={e.colours.primary} colour2={e.colours.secondary} pattern={e.pattern} />{e.name}</> : ''}</td><td class="num">{held}</td><td class="small muted">{s.status === 'cancelled' || s.status === 'interrupted' ? s.statusReason : s.decidedRound && done ? `decided in round ${s.decidedRound} of ${s.meetings.length}` : ''}</td></tr>; })}
  </tbody></table>;
}

/** A record as it stood on a date: the last change on or before it. */
function recordAsOf(st: RecordState, cut?: number) {
  if (cut === undefined) return { cur: st.current ? { holders: st.current.holderIds, value: st.current.value, day: st.current.day, meetingId: st.current.meetingId } : null, hist: st.history };
  const hist = st.history.filter((h) => h.day <= cut);
  const last = hist[hist.length - 1];
  return { cur: last ? { holders: last.newHolders, value: last.newValue, day: last.day, meetingId: last.meetingId } : null, hist };
}
function Holders({ c, ids, scope }: { c: Controller; ids: string[]; scope: string }) {
  return <>{ids.map((id, i) => <span>{i ? ' & ' : ''}{scope === 'team' ? <Tm c={c} id={id} asOf={c.cutoff} /> : <P c={c} id={id} asOf={c.cutoff} />}</span>)}</>;
}

function RecordsTab({ c }: { c: Controller }) {
  const u = c.u!;
  const [open, setOpen] = useState<string | null>(null);
  const recs = Object.values(u.records).filter((r) => r.def.scope !== 'layout');
  const groups = [...new Set(recs.map((r) => r.def.group))];
  const laps = Object.values(u.records).filter((r) => r.def.scope === 'layout' && r.def.id.startsWith('lap:race:'));
  return <>
    {groups.map((g) => <div class="section"><h3>{g}</h3>
      {recs.filter((r) => r.def.group === g).map((r) => { const { cur, hist } = recordAsOf(r, c.cutoff); const isOpen = open === r.def.id;
        return <div class="card small" style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><b>{r.def.label}</b><span>{cur ? <><Holders c={c} ids={cur.holders} scope={r.def.scope} /> — {fmtVal(r.def, cur.value)}</> : <span class="muted">not yet set</span>}</span></div>
          {cur?.meetingId && <div class="muted">Since <R c={c} id={cur.meetingId} /></div>}
          {hist.length > 1 && <button class="link small" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.def.id)}>{isOpen ? 'Hide' : 'Show'} the {hist.length} holders over time</button>}
          {isOpen && <ol class="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{hist.slice().reverse().map((h) => <li>{h.year}: <Holders c={c} ids={h.newHolders} scope={r.def.scope} /> {h.kind} it with {fmtVal(r.def, h.newValue)}{h.prevHolders.length ? <> (previously <Holders c={c} ids={h.prevHolders} scope={r.def.scope} />{h.prevValue !== null ? `, ${fmtVal(r.def, h.prevValue)}` : ''})</> : ''}{h.meetingId ? <> — <R c={c} id={h.meetingId} /></> : ''}</li>)}</ol>}
        </div>; })}
    </div>)}
    <div class="section"><h3>Lap records by layout</h3><p class="small muted">Each layout version keeps its own lap record; when a circuit is changed, the old record is closed and a new one starts.</p>
      <table class="data"><thead><tr><th>Layout</th><th>Race lap record</th><th>Holder</th><th>Set</th></tr></thead><tbody>
        {laps.map((r) => { const { cur } = recordAsOf(r, c.cutoff); if (!cur) return null; const g = GEOMETRIES.find((x) => x.id === r.def.layoutId); return <tr><td><button class="link" onClick={() => c.open({ kind: 'layout', id: r.def.layoutId! })}>{g?.name ?? r.def.layoutId}</button></td><td class="num">{fmtVal(r.def, cur.value)}</td><td><Holders c={c} ids={cur.holders} scope="driver" /></td><td class="small">{cur.meetingId ? <R c={c} id={cur.meetingId} /> : ''}</td></tr>; })}
      </tbody></table></div>
  </>;
}

// ------------------------------------------------------------------ all-time leaderboard with an exposed, editorial "greatness" index
interface Weights { titles: number; wins: number; podiums: number; poles: number; peak: number; teammates: number }
const DEFAULT_W: Weights = { titles: 12, wins: 2.5, podiums: 0.6, poles: 0.5, peak: 0.4, teammates: 20 };
const W_LABEL: Record<keyof Weights, string> = { titles: 'per title', wins: 'per win', podiums: 'per podium', poles: 'per pole', peak: 'per 10 peak-rating points above 1500', teammates: 'for beating team-mates (share above 50%, scaled by sample)' };

function peakAsOf(u: Universe, id: string, cut?: number) {
  const h = u.people[id].elo.history; let best = 0;
  for (let i = 0; i < h.length; i += 2) { if (cut !== undefined && h[i] > cut) break; if (i / 2 >= 9) best = Math.max(best, h[i + 1] / 10); }
  return best;
}
function teammateShare(car: Career) { let w = 0, n = 0; for (const [a, b] of Object.values(car.h2h)) { w += a; n += a + b; } return { share: n ? w / n : 0.5, n }; }
function greatness(car: Career, peak: number, w: Weights) {
  const tm = teammateShare(car);
  const parts = { titles: w.titles * car.titles, wins: w.wins * car.wins, podiums: w.podiums * car.podiums, poles: w.poles * car.poles, peak: w.peak * Math.max(0, (peak - 1500) / 10), teammates: w.teammates * (tm.share - 0.5) * Math.min(1, tm.n / 40) };
  return { total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

function AllTimeTab({ c }: { c: Controller }) {
  const u = c.u!;
  const [metric, setMetric] = useState<'greatness' | 'wins' | 'titles' | 'podiums' | 'poles' | 'starts' | 'winRate' | 'peak' | 'wet'>('greatness');
  const [era, setEra] = useState<string>('all');
  const [minStarts, setMinStarts] = useState(20);
  const [w, setW] = useState<Weights>(DEFAULT_W);
  const [showW, setShowW] = useState(false);
  const k = known(u, c.cutoff);
  const decades = [...new Set(Object.keys(u.seasons).map((y) => Math.floor(+y / 10) * 10))].sort();
  const rows = useMemo(() => Object.entries(k.careers).filter(([id, car]) => car.starts > 0 && u.people[id]).map(([id, car]) => {
    const peak = peakAsOf(u, id, c.cutoff);
    const mid = car.seasons.length ? car.seasons[Math.floor(car.seasons.length / 2)] : 0;
    return { id, car, peak, mid, g: greatness(car, peak, w) };
  }), [k, w, c.cutoff]);
  const filt = rows.filter((r) => era === 'all' || Math.floor(r.mid / 10) * 10 === +era).filter((r) => !['winRate', 'peak', 'wet'].includes(metric) || r.car.starts >= minStarts);
  const val = (r: typeof rows[0]): number => metric === 'greatness' ? r.g.total : metric === 'winRate' ? r.car.wins / r.car.starts : metric === 'peak' ? r.peak : metric === 'wet' ? (r.car.wetClassified >= 5 ? r.car.wetGain / r.car.wetClassified : -99) : (r.car as any)[metric];
  const sorted = filt.slice().sort((a, b) => val(b) - val(a)).slice(0, 40);
  const fmt = (r: typeof rows[0]) => metric === 'greatness' ? r.g.total.toFixed(1) : metric === 'winRate' ? pct(r.car.wins, r.car.starts) : metric === 'peak' ? Math.round(r.peak) : metric === 'wet' ? (val(r) > -99 ? `${val(r) >= 0 ? '+' : ''}${val(r).toFixed(2)}` : '—') : val(r);
  return <>
    <div class="pill-row section" style={{ alignItems: 'end' }}>
      <label class="small">Rank by <select value={metric} onChange={(e) => setMetric((e.target as HTMLSelectElement).value as any)}>
        <option value="greatness">Greatness index (editorial)</option><option value="wins">Wins</option><option value="titles">Titles</option><option value="podiums">Podiums</option><option value="poles">Poles</option><option value="starts">Starts</option><option value="winRate">Win rate</option><option value="peak">Peak rating</option><option value="wet">Places gained in the wet</option></select></label>
      <label class="small">Era <select value={era} onChange={(e) => setEra((e.target as HTMLSelectElement).value)}><option value="all">All eras</option>{decades.map((d) => <option value={d}>{d}s</option>)}</select></label>
      {['winRate', 'peak', 'wet'].includes(metric) && <label class="small">Min. starts <input type="number" min={1} max={300} value={minStarts} onInput={(e) => setMinStarts(+(e.target as HTMLInputElement).value || 1)} style={{ width: 64 }} /></label>}
      {metric === 'greatness' && <button class="btn" aria-expanded={showW} onClick={() => setShowW(!showW)}>Weights</button>}
    </div>
    {metric === 'greatness' && <p class="small muted">The greatness index is an editorial opinion, not a fact: a weighted sum you can change. It rewards achievement and peak demonstrated rating, and adds a team-mate term because team-mates share equipment. It cannot fully separate driver from car, and eras with more races inflate counting stats.</p>}
    {metric === 'greatness' && showW && <div class="card small section">{(Object.keys(DEFAULT_W) as (keyof Weights)[]).map((key) => <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}><input type="number" step="0.1" value={w[key]} onInput={(e) => setW({ ...w, [key]: +(e.target as HTMLInputElement).value || 0 })} style={{ width: 64 }} /> {W_LABEL[key]}</label>)}<button class="btn" onClick={() => setW(DEFAULT_W)}>Reset</button></div>}
    {era !== 'all' && <p class="small muted">Drivers whose career midpoint falls in the {era}s; totals are for their whole career.</p>}
    <table class="data"><thead><tr><th class="num">#</th><th>Driver</th><th>Years</th><th class="num">Starts</th><th class="num">Wins</th><th class="num">Titles</th><th class="num">{TAB_METRIC[metric]}</th></tr></thead><tbody>
      {sorted.map((r, i) => <tr title={metric === 'greatness' ? Object.entries(r.g.parts).map(([a, b]) => `${a}: ${b.toFixed(1)}`).join(' · ') : undefined}><td class="num">{i + 1}</td><td><P c={c} id={r.id} asOf={c.cutoff} /></td><td class="small">{r.car.seasons[0]}–{r.car.seasons[r.car.seasons.length - 1]}</td><td class="num">{r.car.starts}</td><td class="num">{r.car.wins}</td><td class="num">{r.car.titles}</td><td class="num"><b>{fmt(r)}</b></td></tr>)}
    </tbody></table>
    {metric === 'wet' && <p class="small muted">Average places gained from the grid in wet races, for drivers with at least five classified wet finishes. Small samples are noisy.</p>}
    <CompareLauncher c={c} />
  </>;
}
const TAB_METRIC: Record<string, string> = { greatness: 'Index', wins: 'Wins', titles: 'Titles', podiums: 'Podiums', poles: 'Poles', starts: 'Starts', winRate: 'Win rate', peak: 'Peak', wet: 'Wet gain' };

function CompareLauncher({ c }: { c: Controller }) {
  const u = c.u!;
  const k = known(u, c.cutoff);
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const opts = Object.entries(k.careers).filter(([id, car]) => car.starts >= 5 && u.people[id]).sort((x, y) => y[1].wins - x[1].wins || y[1].starts - x[1].starts).slice(0, 150);
  return <div class="section card small"><b>Compare two drivers</b>
    <div class="pill-row" style={{ marginTop: 6 }}>
      <select value={a} onChange={(e) => setA((e.target as HTMLSelectElement).value)} aria-label="First driver"><option value="">Choose…</option>{opts.map(([id]) => <option value={id}>{u.people[id].first} {u.people[id].last}</option>)}</select>
      <select value={b} onChange={(e) => setB((e.target as HTMLSelectElement).value)} aria-label="Second driver"><option value="">Choose…</option>{opts.map(([id]) => <option value={id}>{u.people[id].first} {u.people[id].last}</option>)}</select>
      <button class="btn primary" disabled={!a || !b || a === b} onClick={() => c.open({ kind: 'compare', a, b })}>Compare</button>
    </div></div>;
}

export function CompareView({ c, a, b }: { c: Controller; a: string; b: string }) {
  const u = c.u!;
  const k = known(u, c.cutoff);
  const pa = u.people[a], pb = u.people[b];
  const ca = k.careers[a], cb = k.careers[b];
  if (!pa || !pb || !ca || !cb) return <p>Nothing to compare yet.</p>;
  const shared = ca.h2h[b];
  const racedTogether = Object.values(u.races).filter((r) => within(c, r.day) && r.results.some((x) => x.driverId === a) && r.results.some((x) => x.driverId === b));
  let aheadA = 0, aheadB = 0;
  for (const r of racedTogether) { const ia = r.results.findIndex((x) => x.driverId === a), ib = r.results.findIndex((x) => x.driverId === b); if (ia < ib) aheadA++; else aheadB++; }
  const overlap = ca.seasons.some((y) => cb.seasons.includes(y));
  const rows: [string, (x: Career, id: string) => string | number][] = [
    ['Seasons', (x) => `${x.seasons[0]}–${x.seasons[x.seasons.length - 1]}`], ['Starts', (x) => x.starts], ['Wins', (x) => x.wins], ['Win rate', (x) => pct(x.wins, x.starts)], ['Titles', (x) => x.titles], ['Podiums', (x) => x.podiums], ['Poles', (x) => x.poles],
    ['Peak rating', (_x, id) => Math.round(peakAsOf(u, id, c.cutoff)) || '—'], ['Mechanical retirements', (x) => x.dnfMech], ['Driver-error retirements', (x) => x.dnfDriver], ['Wet races / wins', (x) => `${x.wetStarts} / ${x.wetWins}`],
    ['Beat team-mates', (x) => { const t = teammateShare(x); return t.n ? `${Math.round(t.share * 100)}% of ${t.n}` : '—'; }],
  ];
  const age = (id: string) => (x: number) => x - (1900 + u.people[id].dob / 365.2425);
  const ser = (id: string) => eloPoints(u.people[id].elo.history, c.cutoff).map(([x, y]) => [age(id)(x), y] as [number, number]);
  return <>
    <table class="data"><thead><tr><th></th><th><P c={c} id={a} asOf={c.cutoff} /></th><th><P c={c} id={b} asOf={c.cutoff} /></th></tr></thead><tbody>
      {rows.map(([l, f]) => <tr><td class="small">{l}</td><td class="num">{f(ca, a)}</td><td class="num">{f(cb, b)}</td></tr>)}
    </tbody></table>
    {racedTogether.length > 0 && <p class="small" style={{ marginTop: 10 }}>In {racedTogether.length} races together, {pa.last} finished ahead {aheadA} times and {pb.last} {aheadB} times{shared ? `; as team-mates ${shared[0]}–${shared[1]}` : ''}.</p>}
    <div class="section"><h3>Rating by age</h3><LineChart ariaLabel={`Rating by age: ${pa.last} and ${pb.last}`} series={[{ name: pa.last, slot: 1, points: ser(a) }, { name: pb.last, slot: 2, points: ser(b) }]} fmtX={(x) => `${Math.floor(x)}`} height={200} /><p class="small muted">X axis is age in years.</p></div>
    {!overlap && <p class="small card">Caution: these careers did not overlap. Ratings measure performance against contemporaries, and cars, race lengths, reliability and the number of races per season all changed between eras, so counting stats and ratings are not directly comparable.</p>}
  </>;
}

// ------------------------------------------------------------------ circuits
function CircuitsTab({ c }: { c: Controller }) {
  const u = c.u!;
  const byGeom: Record<string, number> = {};
  for (const r of Object.values(u.races)) if (within(c, r.day)) byGeom[r.geometryId] = (byGeom[r.geometryId] ?? 0) + 1;
  return <>{Object.values(u.venues).map((v) => { const vers = v.versionIds.map((id) => u.layouts[id]).filter((l) => within(c, l.from));
    return <div class="card section"><div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}><h3 style={{ margin: 0 }}>{v.name}</h3><span class="chip">{v.status}{v.statusReason ? ` — ${v.statusReason}` : ''}</span></div>
      <div class="grid2" style={{ marginTop: 6 }}>{[...new Set(vers.map((l) => l.geometryId))].concat(GEOMETRIES.filter((g) => g.reverse && vers.some((l) => getTrack(l.geometryId).g.circuitId === g.circuitId) && byGeom[g.id]).map((g) => g.id)).filter((x, i, arr) => arr.indexOf(x) === i).map((gid) => <button class="card link" style={{ textAlign: 'left' }} onClick={() => c.open({ kind: 'layout', id: gid })}><RouteMap id={gid} height={90} /><div class="small"><b>{getTrack(gid).g.name}</b> · {(getTrack(gid).length / 1000).toFixed(2)} km · {byGeom[gid] ?? 0} races</div></button>)}</div>
      <ol class="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>{vers.map((l) => <li>{fmtDate(l.from, true)}: {getTrack(l.geometryId).g.label} — {l.reason}; {l.surface}, {l.barrier} barriers, safety {Math.round(l.safety * 100)}%</li>)}</ol>
    </div>; })}</>;
}

export function LayoutView({ c, id }: { c: Controller; id: string }) {
  const u = c.u!;
  const tr = getTrack(id); const g = tr.g;
  const siblings = GEOMETRIES.filter((x) => x.circuitId === g.circuitId && x.id !== id);
  const [cmp, setCmp] = useState<string>('');
  const races = Object.values(u.races).filter((r) => r.geometryId === id && within(c, r.day)).sort((a, b) => b.day - a.day);
  const winners: Record<string, number> = {}; for (const r of races) { const w = r.results.find((x) => x.pos === 1); if (w) winners[w.driverId] = (winners[w.driverId] ?? 0) + 1; }
  const topW = Object.entries(winners).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const lr = u.records[`lap:race:${id}`]; const lrNow = lr ? recordAsOf(lr, c.cutoff) : null;
  const wet = races.filter(isWetRace).length;
  const m = g.metrics;
  return <>
    <RouteMap id={id} compare={cmp || undefined} height={220} />
    {cmp && <p class="small"><span style={{ color: 'var(--series-1)' }}>━</span> {g.name} &nbsp; <span style={{ color: 'var(--series-2)' }}>╍</span> {getTrack(cmp).g.name}</p>}
    {siblings.length > 0 && <label class="small">Compare with <select value={cmp} onChange={(e) => setCmp((e.target as HTMLSelectElement).value)}><option value="">—</option>{siblings.map((s) => <option value={s.id}>{s.name}</option>)}</select></label>}
    <p>{g.character} {g.note}</p>
    <div class="stats section"><Stat label="Length" value={`${(m.lengthM / 1000).toFixed(2)} km`} /><Stat label="Corners" value={m.corners} /><Stat label="Narrowest" value={`${m.minWidth.toFixed(1)} m`} /><Stat label="Longest straight" value={`${Math.round(m.longestStraightM)} m`} /><Stat label="Steepest" value={`${m.maxGradePct.toFixed(1)}%`} /><Stat label="Races held" value={races.length} /></div>
    <div class="section small"><b>Streets:</b> {[...new Set(g.streets.map((s) => s.name).filter(Boolean))].join(' → ')}.{g.landmarks.length ? <> <b>Landmarks:</b> {g.landmarks.join(', ')}.</> : ''}</div>
    <div class="section small"><b>Corners:</b> {g.corners.map((k) => k.name).join(', ')}.</div>
    {g.fictionalModifications.length > 0 && <div class="section small muted"><b>Fictional changes to the real streets:</b> {g.fictionalModifications.join('; ')}. Pit lane: {g.pit.fictional}</div>}
    {lrNow?.cur && <div class="section small"><b>Race lap record:</b> {fmtVal(lr!.def, lrNow.cur.value)} — <Holders c={c} ids={lrNow.cur.holders} scope="driver" />{lrNow.cur.meetingId ? <>, <R c={c} id={lrNow.cur.meetingId} /></> : ''}</div>}
    {topW.length > 0 && <div class="section small"><b>Most wins here:</b> {topW.map(([pid, n], i) => <span>{i ? ', ' : ''}<P c={c} id={pid} asOf={c.cutoff} /> ({n})</span>)}. {wet} of {races.length} races were wet.</div>}
    {races.length > 0 && <div class="section"><h3>Races on this layout</h3><div class="pill-row">{races.slice(0, 60).map((r) => <span class="chip"><R c={c} id={r.meetingId} label={`${r.year} ${r.name}`} /></span>)}</div></div>}
    <div class="section small"><b>Validation:</b> {g.validation.filter((v) => v.ok).length}/{g.validation.length} checks passed.<ul>{g.validation.map((v) => <li>{v.ok ? '✓' : '✗'} {v.name}: {v.detail}</li>)}</ul></div>
  </>;
}

// ------------------------------------------------------------------ cars & technology
function CarsTab({ c }: { c: Controller }) {
  const u = c.u!;
  const cutY = c.cutoff === undefined ? 9999 : yearOfDay(c.cutoff);
  const done = Object.keys(u.seasons).map(Number).filter((y) => y < cutY || (y === cutY && seasonDone(c, u, y)));
  const cars: { id: string; year: number; wins: number; races: number }[] = [];
  for (const y of done) { const s = u.seasons[y]; const n = s.meetings.filter((m) => m.status === 'completed').length; for (const e of s.entries) { const t = s.teamStandings.find((r) => r.id === e.teamId); cars.push({ id: e.carId, year: y, wins: t?.wins ?? 0, races: n }); } }
  const best = cars.filter((x) => x.races >= 4).sort((a, b) => b.wins / b.races - a.wins / a.races || (u.carElo[b.id] ?? 0) - (u.carElo[a.id] ?? 0)).slice(0, 20);
  const techs = Object.values(u.tech).filter((t) => t.firstDay !== undefined && within(c, t.firstDay!)).sort((a, b) => a.firstDay! - b.firstDay!);
  return <>
    <div class="section"><h3>The most dominant cars</h3><table class="data"><thead><tr><th>Car</th><th>Team</th><th class="num">Won</th><th class="num">Car rating</th></tr></thead><tbody>
      {best.map((x) => { const car = u.cars[x.id]; return <tr><td>{car?.name ?? x.id} <span class="small muted">({x.year})</span></td><td><Tm c={c} id={car?.teamId} year={x.year} asOf={c.cutoff} /></td><td class="num">{x.wins}/{x.races}</td><td class="num">{u.carElo[x.id] !== undefined ? Math.round(u.carElo[x.id]) : '—'}</td></tr>; })}
    </tbody></table><p class="small muted">Car rating is the part of results the rating system attributes to the machine rather than the drivers (0 = average for its season).</p></div>
    <div class="section"><h3>Technology firsts</h3><table class="data"><thead><tr><th>Technology</th><th>First raced</th><th>Pioneer</th><th>Status</th></tr></thead><tbody>
      {techs.map((t) => <tr><td>{TECH_BY_ID[t.id]?.name}<div class="small muted">{TECH_BY_ID[t.id]?.description}</div></td><td>{fmtDate(t.firstDay!, true)}</td><td><Tm c={c} id={t.firstTeam} asOf={c.cutoff} /></td><td class="small">{t.bannedDay && within(c, t.bannedDay) ? `banned ${fmtDate(t.bannedDay, true)}` : t.status}</td></tr>)}
    </tbody></table></div>
  </>;
}

// ------------------------------------------------------------------ eras
function ErasTab({ c }: { c: Controller }) {
  const u = c.u!;
  const cutY = c.cutoff === undefined ? 9999 : yearOfDay(c.cutoff);
  const years = Object.keys(u.seasons).map(Number).filter((y) => y <= cutY);
  const decades = [...new Set(years.map((y) => Math.floor(y / 10) * 10))].sort((a, b) => a - b);
  return <>{decades.map((d) => {
    const ys = years.filter((y) => y >= d && y < d + 10 && seasonDone(c, u, y));
    const champs: Record<string, number> = {}; const teams: Record<string, number> = {};
    for (const y of ys) { const s = u.seasons[y]; if (s.championId) champs[s.championId] = (champs[s.championId] ?? 0) + 1; if (s.teamChampionId) { const lin = u.teams[s.teamChampionId]?.lineageId ?? s.teamChampionId; teams[lin] = (teams[lin] ?? 0) + 1; } }
    const regs = [...new Set(years.filter((y) => y >= d && y < d + 10).map((y) => u.seasons[y].regSetId))].map((id) => u.regs.sets[id]);
    const changes = regs.map((r, i) => ({ r, diff: i ? regDiff(regs[i - 1], r) : [] })).filter((x) => x.diff.length);
    const events = u.events.filter((e) => e.severity >= 0.7 && e.scope === 'world' && yearOfDay(e.day) >= d && yearOfDay(e.day) < d + 10 && within(c, e.day));
    return <div class="card section"><h3 style={{ marginTop: 0 }}>The {d}s</h3>
      <div class="small">{Object.keys(champs).length ? <>Champions: {Object.entries(champs).sort((a, b) => b[1] - a[1]).map(([id, n], i) => <span>{i ? ', ' : ''}<P c={c} id={id} asOf={c.cutoff} />{n > 1 ? ` ×${n}` : ''}</span>)}.</> : 'No completed seasons.'}</div>
      {Object.keys(teams).length > 0 && <div class="small">Title-winning teams: {Object.entries(teams).sort((a, b) => b[1] - a[1]).map(([lin, n], i) => { const e = u.lineages[lin]?.entrants; const last = e?.[e.length - 1]; return <span>{i ? ', ' : ''}{last ? <Tm c={c} id={last.teamId} asOf={c.cutoff} /> : lin}{n > 1 ? ` ×${n}` : ''}</span>; })}.</div>}
      {changes.length > 0 && <div class="small">Rule changes: {changes.map((x) => `${x.r.year} — ${x.diff.slice(0, 3).join(', ')}`).join('; ')}.</div>}
      {events.length > 0 && <div class="small">The wider world: {events.map((e) => e.title).join('; ')}.</div>}
    </div>; })}</>;
}

function RatingsDoc() {
  return <div class="card small">
    <h3 style={{ marginTop: 0 }}>How ratings work</h3>
    <p>Every driver carries an Elo-style rating of <b>demonstrated performance</b>. It is computed only from recorded results and never feeds back into the hidden skill model that drives the simulation, so a rating can be wrong about a driver, especially early in a career.</p>
    <ul>
      <li>After each race, every pair of starters is compared: finishing ahead scores 1, behind 0. Expected scores use the rating gap plus a <b>car rating</b> for each car, so beating a faster car counts for more.</li>
      <li>Team-mate comparisons weigh <b>{ELO.wTeammate}×</b> as much, because team-mates share equipment. Qualifying order adds lighter evidence ({ELO.wQuali}×).</li>
      <li>A <b>mechanical retirement</b> is treated as limited evidence: the comparison weight is {ELO.mechanicalScale} × the share of the race completed. Driver errors and collisions count in full.</li>
      <li>Updates are averaged over the field, so a big grid does not inflate swings. The step size shrinks as evidence builds (K = 12 + 0.22 × uncertainty).</li>
      <li>Rookies start at {ELO.rookie} with high uncertainty (±{ELO.rookieRd}). Uncertainty grows again during absences.</li>
      <li>Peak ratings count only after ten rated races, so an early lucky run does not set a peak.</li>
      <li>The car rating absorbs what results say about the machine, so a dominant car does not simply inflate its drivers.</li>
    </ul>
    <p>Ratings compare drivers with the people they raced against. They are not reliable across eras whose drivers never met.</p>
  </div>;
}

void ord;
