import { useState } from 'preact/hooks';
import type { Controller } from '../../app/controller';
import type { StoryArc, Universe } from '../../sim/types';
import { fmtDate } from '../common';
import { yearOf, dayOf } from '../../sim/dates';
import { P, Tm, R, TimeCursor } from './shared';

const TYPE_LABEL: Record<string, string> = { rivalry: 'Rivalry', 'title-fight': 'Title fight', dynasty: 'Dynasty', 'dynasty-decline': 'Decline', 'long-wait': 'The long wait', 'stalled-prospect': 'Unfulfilled promise', comeback: 'Comeback', revival: 'Revival', 'team-breakthrough': 'Breakthrough', family: 'Family', 'tech-gamble': 'Technical gamble', engineer: 'The engineer', 'wet-master': 'Rain master' };

/** A story as known on a date: only the beats up to then, and never its resolution in advance. */
export function storyAsOf(s: StoryArc, cut?: number) {
  if (cut === undefined) return { beats: s.beats, state: s.state, visible: true, complete: true };
  const beats = s.beats.filter((b) => b.day <= cut);
  return { beats, state: beats.length === s.beats.length ? s.state : 'developing', visible: s.startDay <= cut && beats.length > 0, complete: beats.length === s.beats.length };
}
/** Titles can give away endings ("X's decade of dominance"): while later beats are hidden, use the neutral title. */
export const storyTitle = (c: Controller, s: StoryArc) => (c.cutoff !== undefined && !storyAsOf(s, c.cutoff).complete ? s.spoilerTitle : s.title);

export function rankedStories(u: Universe, cut?: number) {
  const now = cut ?? u.clock.day;
  return Object.values(u.stories).map((s) => ({ s, k: storyAsOf(s, cut) })).filter((x) => x.k.visible)
    .map((x) => { const last = x.k.beats[x.k.beats.length - 1]?.day ?? x.s.startDay; const recency = Math.exp(-(now - last) / (365 * 6)); return { ...x, score: x.s.significance * (0.35 + 0.65 * recency) * (1 + Math.min(1, x.k.beats.length / 6)) }; })
    .sort((a, b) => b.score - a.score);
}

export function StoriesHome({ c }: { c: Controller }) {
  const u = c.u!;
  const [filter, setFilter] = useState<string>('all');
  const [n, setN] = useState(24);
  const all = rankedStories(u, c.cutoff);
  const types = [...new Set(all.map((x) => x.s.type))];
  const list = all.filter((x) => filter === 'all' || x.s.type === filter || (filter === 'following' && (x.s.people.some((p) => u.favourites.people.includes(p)) || x.s.teams.some((t) => u.favourites.teams.includes(t)))));
  const news = u.news.filter((x) => c.cutoff === undefined || x.day <= c.cutoff).slice(-8).reverse();
  return <>
    <TimeCursor c={c} />
    <Chapters c={c} ranked={all} />
    {news.length > 0 && <div class="section"><h3>Latest</h3>{news.slice(0, 4).map((x) => <div class="card small" style={{ marginBottom: 6 }}><span class="muted">{fmtDate(x.day)}</span> — <b>{x.headline}</b><div>{x.body}</div>{x.meetingId && u.races[x.meetingId] && <R c={c} id={x.meetingId} label="Result & replay" />}</div>)}</div>}
    <div class="pill-row section"><label class="small">Show <select value={filter} onChange={(e) => setFilter((e.target as HTMLSelectElement).value)}><option value="all">All stories</option><option value="following">People and teams I follow</option>{types.map((t) => <option value={t}>{TYPE_LABEL[t] ?? t}</option>)}</select></label></div>
    {list.length === 0 && <p class="small muted">Stories appear as history accumulates: rivalries, dynasties, long waits and comebacks are detected from the record, usually after a season or two.</p>}
    <div class="grid2">{list.slice(0, n).map(({ s, k }) => <button class="card story-card link" style={{ textAlign: 'left' }} onClick={() => c.open({ kind: 'story', id: s.id })}>
      <div class="small muted">{TYPE_LABEL[s.type] ?? s.type} · {yearOf(s.startDay)}–{k.complete && (s.state === 'resolved' || s.state === 'dormant') ? yearOf(s.lastDay) : 'now'} · {k.state}</div>
      <b>{storyTitle(c, s)}</b>
      <div class="small">{s.premise}</div>
    </button>)}</div>
    {list.length > n && <button class="btn" style={{ marginTop: 8 }} onClick={() => setN(n + 24)}>More stories</button>}
  </>;
}

export function StoryView({ c, id }: { c: Controller; id: string }) {
  const u = c.u!;
  const [reveal, setReveal] = useState(false);
  const s = u.stories[id]; if (!s) return <p>Unknown story.</p>;
  const k = storyAsOf(s, c.cutoff);
  const beats = reveal ? s.beats : k.beats;
  const related = Object.values(u.stories).filter((x) => x.id !== s.id && storyAsOf(x, c.cutoff).visible && (x.people.some((p) => s.people.includes(p)) || x.teams.some((t) => s.teams.includes(t)))).slice(0, 6);
  const keyRace = [...beats].reverse().find((b) => b.meetingId && u.races[b.meetingId]);
  return <>
    <div class="pill-row" style={{ marginBottom: 10 }}><span class="chip">{TYPE_LABEL[s.type] ?? s.type}</span><span class="chip">{reveal ? s.state : k.state}</span><span class="chip">significance {Math.round(s.significance * 100)}</span></div>
    <h3 style={{ marginTop: 0 }}>{reveal ? s.title : storyTitle(c, s)}</h3>
    <p>{s.premise}</p>
    {s.uncertainty && (reveal || k.complete) && <p class="small card"><b>What we don't know:</b> {s.uncertainty}</p>}
    <div class="section"><h3>How it unfolded</h3>
      <ol class="beats">{beats.map((b) => <li><div class="small muted">{fmtDate(b.day)}{b.meetingId && u.races[b.meetingId] ? <> · <R c={c} id={b.meetingId} /></> : ''}</div><div>{b.summary}</div>{Object.keys(b.facts).length > 0 && <div class="small muted">Evidence: {Object.entries(b.facts).filter(([, v]) => typeof v !== 'object').slice(0, 5).map(([kk, v]) => `${kk} ${typeof v === 'number' ? +v.toFixed(2) : v}`).join(' · ')}</div>}{b.eventIds.length > 0 && <div class="small muted">{b.eventIds.map((e) => u.events.find((x) => x.id === e)?.title).filter(Boolean).join('; ')}</div>}</li>)}</ol>
      {!k.complete && !reveal && <button class="btn" onClick={() => setReveal(true)}>Reveal what happened next (spoiler)</button>}
    </div>
    {keyRace?.meetingId && <div class="section"><button class="btn primary" onClick={() => c.open({ kind: 'race', id: keyRace.meetingId! })}>▶ Key race: {u.races[keyRace.meetingId].name} {u.races[keyRace.meetingId].year}</button></div>}
    <div class="section small"><b>People:</b> {s.people.map((p, i) => <span>{i ? ', ' : ''}<P c={c} id={p} asOf={c.cutoff} /></span>)}{s.teams.length > 0 && <> · <b>Teams:</b> {s.teams.map((t, i) => <span>{i ? ', ' : ''}<Tm c={c} id={t} asOf={c.cutoff} /></span>)}</>}</div>
    {related.length > 0 && <div class="section"><h3>Related</h3>{related.map((x) => <div><button class="link" onClick={() => c.open({ kind: 'story', id: x.id })}>{storyTitle(c, x)}</button></div>)}</div>}
    <p class="small muted">Stories are detected from recorded results and events after the fact; they describe the simulation and never steer it.</p>
  </>;
}

/**
 * Guided exploration: the century as chapters (one per decade with history), each led by its strongest
 * stories and a key race to watch. Titles stay neutral while spoilers are hidden.
 */
function Chapters({ c, ranked }: { c: Controller; ranked: ReturnType<typeof rankedStories> }) {
  const u = c.u!;
  const [open, setOpen] = useState<number | null>(null);
  const allYears = Object.keys(u.seasons).map(Number).sort((a, b) => a - b);
  const years = allYears.filter((y) => c.cutoff === undefined || y <= yearOf(c.cutoff));
  const allDecades = [...new Set(allYears.map((y) => Math.floor(y / 10) * 10))];
  if (allYears.length < 4) return null;
  const decades = [...new Set(years.map((y) => Math.floor(y / 10) * 10))];
  const chapters = decades.map((d) => {
    const inDec = ranked.filter((x) => { const y = yearOf(x.k.beats[0]?.day ?? x.s.startDay); return y >= d && y < d + 10; }).sort((a, b) => b.s.significance - a.s.significance).slice(0, 3);
    const champs = years.filter((y) => y >= d && y < d + 10).map((y) => u.seasons[y]).filter((s) => s.championId && (s.status === 'complete' || s.status === 'interrupted') && s.meetings.every((m) => c.cutoff === undefined || m.day <= c.cutoff)).map((s) => s.championId!);
    const key = inDec.flatMap((x) => x.k.beats).filter((b) => b.meetingId && u.races[b.meetingId]).sort((a, b) => (u.races[b.meetingId!].overtakes + u.races[b.meetingId!].leadChanges * 3) - (u.races[a.meetingId!].overtakes + u.races[a.meetingId!].leadChanges * 3))[0]
    const gp = Object.values(u.races).filter((r) => r.year >= d && r.year < d + 10 && (c.cutoff === undefined || r.day <= c.cutoff)).sort((a, b) => (b.leadChanges * 3 + b.overtakes) - (a.leadChanges * 3 + a.overtakes))[0];
    return { d, inDec, champs: [...new Set(champs)], keyId: key?.meetingId ?? gp?.meetingId };
  });
  const nextDec = c.cutoff !== undefined ? allDecades.find((d) => d > Math.floor(yearOf(c.cutoff!) / 10) * 10) : undefined;
  const lastYear = allYears[allYears.length - 1];
  return <div class="section"><h3>Chapters of history</h3>
    <p class="small muted">A guided route through the century: the strongest stories of each decade and a race worth watching. Replays are rebuilt from the stored setup and checked against the record.</p>
    {chapters.map((ch, i) => <div class="card chapter">
      <button class="link" aria-expanded={open === ch.d} onClick={() => setOpen(open === ch.d ? null : ch.d)} style={{ textAlign: 'left', width: '100%' }}><h3>Chapter {i + 1}: the {ch.d}s{ch.inDec[0] ? ` — ${storyTitle(c, ch.inDec[0].s)}` : ''}</h3></button>
      {open === ch.d && <>
        {ch.champs.length > 0 && <div class="small">Champions: {ch.champs.map((id, j) => <span>{j ? ', ' : ''}<P c={c} id={id} asOf={c.cutoff} /></span>)}</div>}
        {ch.inDec.map((x) => <div class="small" style={{ marginTop: 4 }}><button class="link" onClick={() => c.open({ kind: 'story', id: x.s.id })}>{storyTitle(c, x.s)}</button> — {x.s.premise}</div>)}
        {ch.keyId && <div style={{ marginTop: 8 }}><button class="btn primary" onClick={() => c.replay(ch.keyId!)}>▶ Watch {u.races[ch.keyId].name} {u.races[ch.keyId].year}</button></div>}
      </>}
    </div>)}
    {nextDec !== undefined && <button class="btn primary" onClick={() => { c.cutoff = dayOf(Math.min(lastYear, nextDec + 9), 12, 31); setOpen(nextDec); c.notify(true); }}>Reveal the next chapter: the {nextDec}s →</button>}
  </div>;
}
